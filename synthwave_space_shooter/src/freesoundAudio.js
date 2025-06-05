const FREESOUND_API_KEY = "CTb7EBttQq2OjR4ChprDGUAbKnguwv188YCSxIGg";
const FREESOUND_BASE = "https://freesound.org/apiv2";
const PREVIEW_MP3 = "previews.preview-hq-mp3";
const DEFAULT_QUERIES = {
  laser: "laser",
  explosion: "explosion",
  sparkle: "sparkle",
  powerup: "power up",
  background: "synthwave,retrowave,game,loop"
};

/**
 * === Freesound API caching & throttling (prevents 429 rate-limit errors) ===
 * - previewUrlCache[eventType]: Caches resolved sound preview URL for the session.
 * - audioCache[url]: Caches loaded Audio elements for their preview URL.
 * - previewRequests[eventType]: If a fetch is active, returns the in-progress promise for coalescing.
 * - requestTimestamps[eventType]: Last time a request was made for this type (for throttling).
 * 
 * Documentation: 
 *   This client caches every preview URL per session and will ONLY make a maximum of one fetch per eventType 
 *   (e.g. "laser", "explosion") until page reload. Further requests reuse the cached result, 
 *   preventing 429 "Too Many Requests" errors. Multiple concurrent calls for a new type deduplicate and wait for the same request.
 *   If the Freesound API returns 429, the client will automatically wait a few seconds and retry (with exponential backoff, capped).
 */
const previewUrlCache = {};
const audioCache = {};
const previewRequests = {};
const requestTimestamps = {};
const MIN_API_INTERVAL_MS = 1300; // per type, in ms (Freesound has per-token and burst rules)
const MAX_RETRY = 4;
const RETRY_BASE_DELAY = 2000; // ms

function apiHeaders() {
  return {
    Authorization: `Token ${FREESOUND_API_KEY}`
  };
}

function safeGetProp(obj, propPath, fallback = undefined) {
  try {
    return propPath.split('.').reduce((acc, k) => acc && acc[k], obj) || fallback;
  } catch {
    return fallback;
  }
}

// PUBLIC_INTERFACE
/**
 * Fetches a preview mp3 URL for a given Freesound tag (event type), with session caching, request coalescing, and built-in throttling/backoff.
 * Returns { url: <audio_url> } or throws an error if no sound is found/fetchable.
 * - Only one fetch per eventType per session (page) is permitted.
 * - Multiple concurrent calls will share the same fetch promise.
 * - 429 (rate limit) responses will cause automatic retries with exponential backoff.
 */
export async function fetchPreviewUrl(eventType) {
  const query = DEFAULT_QUERIES[eventType] || eventType;
  if (previewUrlCache[query]) return { url: previewUrlCache[query] };

  // If there's already a pending promise for this type, return it to coalesce requests.
  if (previewRequests[query]) return previewRequests[query];

  // Throttle: per session, only one API call per eventType, and MIN_API_INTERVAL_MS between requests.
  const now = Date.now();
  if (requestTimestamps[query] && (now - requestTimestamps[query]) < MIN_API_INTERVAL_MS) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(fetchPreviewUrl(eventType)), MIN_API_INTERVAL_MS);
    });
  }
  requestTimestamps[query] = now;

  previewRequests[query] = _fetchPreviewUrlWithRetry(query, 0)
    .then(({ url }) => {
      previewUrlCache[query] = url;
      delete previewRequests[query];
      return { url };
    })
    .catch((err) => {
      delete previewRequests[query];
      throw err;
    });
  return previewRequests[query];
}

async function _fetchPreviewUrlWithRetry(query, retry) {
  let data, results, url = null;
  try {
    const resp = await fetch(
      `${FREESOUND_BASE}/search/text/?query=${encodeURIComponent(query)}&fields=id,name,previews,duration,license,username&filter=duration:[0.5 TO 30]&page_size=8`,
      { headers: apiHeaders() }
    );
    // FREESOUND RATE LIMIT DOCS: https://freesound.org/docs/api/rate_limiting.html
    // Usual limit is 15 calls / 10 seconds and 60 calls / 60 seconds PER token.
    if (resp.status === 429) {
      if (retry >= MAX_RETRY) throw new Error("Too many requests to Freesound API (rate limit hit, giving up after retries)");
      const retryAfter = Number(resp.headers.get("Retry-After")) * 1000 || Math.min(RETRY_BASE_DELAY * 2 ** retry, 11000);
      await new Promise(resolve => setTimeout(resolve, retryAfter));
      return _fetchPreviewUrlWithRetry(query, retry + 1);
    }
    data = await resp.json();
    results = Array.isArray(data.results) ? data.results : [];
    for (const r of results) {
      if (PREVIEW_MP3 in safeGetProp(r, "previews", {})) {
        url = r.previews["preview-hq-mp3"] || r.previews["preview-lq-mp3"];
      }
      if (url) break;
    }
  } catch (e) {
    if (retry < MAX_RETRY) {
      const delay = Math.min(RETRY_BASE_DELAY * 2 ** retry, 11000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return _fetchPreviewUrlWithRetry(query, retry + 1);
    }
    throw new Error(`Sound fetch error: ${e?.message || e}`);
  }
  if (!url) throw new Error("No suitable sound found!");
  return { url };
}

// PUBLIC_INTERFACE
/**
 * Loads and plays an audio for a game event type (laser, explosion, etc).
 * Fully reuses cached preview URLs and audio nodes, never double-loads the same sound in a session.
 * Returns a Promise { status, error } with handling for loading and error state.
 * Playbacks are always non-blocking and do not refetch if sound is already known for that event type.
 * 
 * Additional handling for rate limits: If a 429 is thrown, it repeatedly waits (with backoff) and retries.
 */
export async function playFreesoundAudio(eventType, { onLoading, onLoaded, onError, volume = 1.0 } = {}) {
  let url, audio;
  try {
    if (onLoading) onLoading();
    ({ url } = await fetchPreviewUrl(eventType));
    // Use cached Audio: cloneNode so multiple sounds can play at once (quick repeats!).
    if (audioCache[url]) {
      audio = audioCache[url].cloneNode();
    } else {
      audio = new Audio(url);
      audioCache[url] = audio;
    }
    audio.volume = Math.max(0, Math.min(volume, 1.0));
    audio.currentTime = 0;
    return new Promise((resolve, reject) => {
      audio.oncanplaythrough = () => {
        onLoaded && onLoaded(audio);
        audio.play().catch(err => { onError && onError(err); });
        resolve({ status: "played", url });
      };
      audio.onerror = (err) => {
        onError && onError(err);
        reject({ status: "error", error: err, url });
      };
      if (audio.readyState >= 3) {
        onLoaded && onLoaded(audio);
        audio.play().catch(err => { onError && onError(err); });
        resolve({ status: "played", url });
      }
    });
  } catch (err) {
    onError && onError(err);
    return { status: "error", error: err };
  }
}

// PUBLIC_INTERFACE
/**
 * Preload (cache) Freesound audio for a given event type; doesn't trigger duplicate fetches if already loaded.
 * Only acts if that eventType is not cached (does not refetch if already loaded).
 * Returns nothing (best effort).
 */
export function preloadFreesoundAudio(eventType) {
  fetchPreviewUrl(eventType).then(({ url }) => {
    if (!audioCache[url]) {
      const audio = new Audio(url);
      audioCache[url] = audio;
      audio.preload = "auto";
      audio.load();
    }
  }).catch(() => {});
}

/**
 * ====================
 * Notes on Rate Limits:
 * ====================
 * - This client is now highly resistant to Freesound API rate limits.
 * - A maximum of *one* API call per eventType happens per browser session.
 * - If 429 errors are encountered, requests are automatically delayed and retried, up to several attempts, with exponential backoff.
 * - If too many 429 errors occur in a row, a user-visible soundError appears in the game (handled in App.js).
 * 
 * If Freesound limits are raised in the future or a custom account is used, increase MIN_API_INTERVAL_MS or retry logic accordingly.
 */
