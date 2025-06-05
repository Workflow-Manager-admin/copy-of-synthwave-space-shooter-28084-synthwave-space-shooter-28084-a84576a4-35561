// Freesound API Integration (Laser & Explosion ONLY)
// Ensures ONLY one laser and one explosion sound can play at any given time,
// stopping (pausing/resetting) any previous playback when triggered again.

const FREESOUND_API_KEY = "CTb7EBttQq2OjR4ChprDGUAbKnguwv188YCSxIGg";
const FREESOUND_BASE = "https://freesound.org/apiv2";
const DEFAULT_QUERIES = {
  laser: "laser",
  explosion: "explosion",
};

// ---- In-memory session caches ----
const previewUrlCache = {};         // { eventType: url }
const audioCache = {};              // { url: Audio }
const previewRequests = {};         // { eventType: in-flight Promise }
const apiThrottle = {};             // { eventType: lastRequestTimestamp }
const MIN_API_INTERVAL_MS = 1200;   // per sound kind
const MAX_RETRY = 4;
const RETRY_BASE = 1800;            // ms exponential backoff

// Maintain one reference per active sound type (gracefully stop previous)
const eventAudioRef = {
  laser: null,
  explosion: null
};

/**
 * INTERNAL: Drill safely into object paths (r.previews.preview-hq-mp3, etc)
 */
function safeGetProp(obj, propPath, fallback) {
  try {
    return propPath.split('.').reduce((o, k) => o && o[k], obj) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * PUBLIC_INTERFACE
 * Fetch (and cache) a preview mp3 URL for a given sound type.
 * @param {'laser' | 'explosion'} kind
 * @returns {Promise<{url: string}>}
 */
export async function fetchPreviewUrl(kind) {
  kind = kind === "laser" || kind === "explosion" ? kind : null;
  if (!kind) throw new Error("Only 'laser' and 'explosion' supported");
  const query = DEFAULT_QUERIES[kind];

  if (previewUrlCache[query]) return { url: previewUrlCache[query] };
  if (previewRequests[query]) return previewRequests[query];

  // Simple debounce/throttle per type
  const now = Date.now();
  if (
    apiThrottle[query] &&
    now - apiThrottle[query] < MIN_API_INTERVAL_MS
  ) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(fetchPreviewUrl(kind)), MIN_API_INTERVAL_MS - (now - apiThrottle[query]));
    });
  }
  apiThrottle[query] = now;

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

// INTERNAL: Fetch mp3 preview for query, retrying on 429/network issues.
async function _fetchPreviewUrlWithRetry(query, retry) {
  let data, url = null;
  try {
    const resp = await fetch(
      `${FREESOUND_BASE}/search/text/?query=${encodeURIComponent(query)}&fields=id,name,previews,duration,license,username&filter=duration:[0.5 TO 30]&page_size=8`,
      { headers: { Authorization: `Token ${FREESOUND_API_KEY}` } }
    );

    if (resp.status === 429) {
      if (retry >= MAX_RETRY)
        throw new Error("Too many Freesound requests (rate limit)");
      const retryAfter = Number(resp.headers.get("Retry-After")) * 1000
        || Math.min(RETRY_BASE * 2 ** retry, 12000);
      await new Promise(res => setTimeout(res, retryAfter));
      return _fetchPreviewUrlWithRetry(query, retry + 1);
    }
    data = await resp.json();
    const results = Array.isArray(data.results) ? data.results : [];
    for (const r of results) {
      if (safeGetProp(r, "previews.preview-hq-mp3")) {
        url = r.previews["preview-hq-mp3"];
      } else if (safeGetProp(r, "previews.preview-lq-mp3")) {
        url = r.previews["preview-lq-mp3"];
      }
      if (url) break;
    }
  } catch (e) {
    if (retry < MAX_RETRY) {
      const delay = Math.min(RETRY_BASE * 2 ** retry, 12000);
      await new Promise(res => setTimeout(res, delay));
      return _fetchPreviewUrlWithRetry(query, retry + 1);
    }
    throw new Error(`Sound fetch error: ${e?.message ?? e}`);
  }
  if (!url) throw new Error("No suitable sound found for: " + query);
  return { url };
}

/**
 * PUBLIC_INTERFACE
 * Play laser or explosion Freesound audio. Only one of each type can play at once—
 * Playing a "laser" will stop any actively playing laser, likewise for explosion.
 * If retriggered, previous of the same type is paused/stopped/reset before new plays.
 *
 * @param {'laser'|'explosion'} kind
 * @param {Object} opts ({ onLoading, onLoaded, onError, volume: number 0–1 })
 */
export async function playFreesoundAudio(kind, { onLoading, onLoaded, onError, volume = 1.0 } = {}) {
  if (onLoading) onLoading();
  let url, audio;
  try {
    ({ url } = await fetchPreviewUrl(kind));
    // Stop and reset previous
    if (eventAudioRef[kind]) {
      try {
        eventAudioRef[kind].pause();
        eventAudioRef[kind].currentTime = 0;
      } catch {}
      eventAudioRef[kind] = null;
    }
    if (audioCache[url]) {
      audio = audioCache[url].cloneNode();
    } else {
      audio = new Audio(url);
      audioCache[url] = audio;
    }
    audio.volume = Math.max(0, Math.min(volume, 1.0));
    audio.currentTime = 0;
    eventAudioRef[kind] = audio;
    audio.onended = () => {
      if (eventAudioRef[kind] === audio) eventAudioRef[kind] = null;
    };

    // Only trigger once loaded (ensuring crisp start)
    return await new Promise((resolve, reject) => {
      audio.oncanplaythrough = () => {
        if (onLoaded) onLoaded(audio);
        audio.play().catch(err => { onError && onError(err); });
        resolve({ status: "played", url });
      };
      audio.onerror = (err) => {
        onError && onError(err);
        reject({ status: "error", error: err, url });
      };
      if (audio.readyState >= 3) {
        if (onLoaded) onLoaded(audio);
        audio.play().catch(err => { onError && onError(err); });
        resolve({ status: "played", url });
      }
    });
  } catch (err) {
    onError && onError(err);
    return { status: "error", error: err };
  }
}

/**
 * PUBLIC_INTERFACE
 * Preload and cache a Freesound audio for a particular kind (laser/explosion).
 * No playback is triggered.
 */
export function preloadFreesoundAudio(kind) {
  if (kind !== "laser" && kind !== "explosion") return;
  fetchPreviewUrl(kind).then(({ url }) => {
    if (!audioCache[url]) {
      const audio = new Audio(url);
      audioCache[url] = audio;
      audio.preload = "auto";
      audio.load();
    }
  }).catch(() => {});
}

/*
Sound module intentionally supports ONLY 'laser' and 'explosion'.
All powerup, background, sparkle, etc. code is REMOVED.
Any attempt to play a sound of another type will throw.
The single-reference per type ensures (arcade style) rapid retrigger *cuts* the last sound with zero overlap, ensuring crisp audio.
*/
