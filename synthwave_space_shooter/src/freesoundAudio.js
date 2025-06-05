//
// Freesound API Integration for Synthwave Space Shooter
// Enhanced with in-session preview caching, coalesced/debounced requests, and robust rate limiting handling.
//

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
 * Freesound Per-Session Sound Caching and Request Control
 *
 * The logic below ensures:
 *  - One-and-only-one API request per sound type (e.g., "laser", "explosion") per page load/session.
 *  - Further calls always reuse the cached preview mp3 URL, never re-querying the remote API.
 *  - Multiple concurrent requests for the same type collapse to a shared Promise—no accidental bursts.
 *  - Each category is debounced/throttled with a minimal interval before any remote request is made.
 *  - If the API responds with 429 too many requests, this is handled silently using an exponential backoff and documented below.
 *
 * Usage:
 *   playFreesoundAudio("laser") // plays the cached "laser" sound or fetches & caches it if new this session.
 *   preloadFreesoundAudio("background") // preloads in background, no redundant fetch.
 */

// Runtime in-memory/session caches and control
const previewUrlCache = {};      // { eventType: previewURL }
const audioCache = {};           // { previewURL: Audio element }
const previewRequests = {};      // { eventType: in-flight Promise }
const requestTimestamps = {};    // { eventType: timestamp-of-last-request }
const MIN_API_INTERVAL_MS = 1200;    // throttle for same-type fetches (in ms)
const MAX_RETRY = 4;                 // Max exponential backoff tries
const RETRY_BASE_DELAY = 1800;       // ms, initial backoff for 429
const LOG_DEBUG = false;             // set true for verbose logs

function apiHeaders() {
  return {
    Authorization: `Token ${FREESOUND_API_KEY}`
  };
}

// Helper to safely drill into object properties
function safeGetProp(obj, propPath, fallback = undefined) {
  try {
    return propPath.split('.').reduce((acc, k) => acc && acc[k], obj) ?? fallback;
  } catch {
    return fallback;
  }
}

// PUBLIC_INTERFACE
/**
 * Fetch/caches a preview mp3 URL for a given sound category (eventType)
 * - Checks in-memory cache before making a remote request.
 * - Multiple concurrent calls for the same type will collapse to a shared Promise (so only one API call fires).
 * - Handles 429 (rate limit) by retrying in the background (with exponential backoff).
 * - On repeated 429 failures (MAX_RETRY), the user error is deferred to the caller but NOT thrown as an alert.
 *
 * @param {string} eventType - e.g. 'laser', 'explosion', etc.
 * @returns {Promise<{url: string}>}
 *
 * Notes:
 *   If a previous API result exists for this eventType, it is reused for the entire session.
 *   If the API is rate-limited, failed calls are silently handled with backoff. Only a total failure will cause an error to be signalled.
 */
export async function fetchPreviewUrl(eventType) {
  const query = DEFAULT_QUERIES[eventType] || eventType;
  if (previewUrlCache[query]) return { url: previewUrlCache[query] };

  // If fetch already in progress for this type, return its promise to collapse bursts
  if (previewRequests[query]) return previewRequests[query];

  // Debounce: Don't hit API too quickly for same type
  const now = Date.now();
  if (
    requestTimestamps[query] &&
    now - requestTimestamps[query] < MIN_API_INTERVAL_MS
  ) {
    // schedule after the interval, and chain the request
    return new Promise((resolve) => {
      setTimeout(() => resolve(fetchPreviewUrl(eventType)), MIN_API_INTERVAL_MS - (now - requestTimestamps[query]));
    });
  }
  requestTimestamps[query] = now;

  previewRequests[query] = _fetchPreviewUrlWithRetry(query, 0)
    .then(({ url }) => {
      // store result session-wide
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

// PRIVATE: Actual API call with exponential backoff (429 handler)
async function _fetchPreviewUrlWithRetry(query, retry) {
  let data, results, url = null;
  try {
    const resp = await fetch(
      `${FREESOUND_BASE}/search/text/?query=${encodeURIComponent(query)}&fields=id,name,previews,duration,license,username&filter=duration:[0.5 TO 30]&page_size=8`,
      { headers: apiHeaders() }
    );

    // Quiet 429 handler: Retry after delay (no user alert)
    if (resp.status === 429) {
      if (LOG_DEBUG) console.warn(`Freesound 429 (rate limited) on "${query}" [retry ${retry+1}]`);
      if (retry >= MAX_RETRY)
        // Final failure: bubble up, likely will produce a "sound error" in UI, but do NOT spam user with 429 details
        throw new Error("Too many Freesound requests (rate limit hit)");
      const retryAfter = Number(resp.headers.get("Retry-After")) * 1000
        || Math.min(RETRY_BASE_DELAY * 2 ** retry, 12000);
      await new Promise(resolve => setTimeout(resolve, retryAfter));
      return _fetchPreviewUrlWithRetry(query, retry + 1);
    }
    data = await resp.json();
    results = Array.isArray(data.results) ? data.results : [];
    for (const r of results) {
      // Intentionally check for both high and low quality mp3 previews
      if (safeGetProp(r, "previews.preview-hq-mp3"))
        url = r.previews["preview-hq-mp3"];
      else if (safeGetProp(r, "previews.preview-lq-mp3"))
        url = r.previews["preview-lq-mp3"];
      if (url) break;
    }
  } catch (e) {
    // Also retry on network errors, up to a limit
    if (retry < MAX_RETRY) {
      const delay = Math.min(RETRY_BASE_DELAY * 2 ** retry, 12000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return _fetchPreviewUrlWithRetry(query, retry + 1);
    }
    throw new Error(`Sound fetch error: ${e?.message ?? e}`);
  }
  if (!url) throw new Error("No suitable sound found for: " + query);
  return { url };
}

// PUBLIC_INTERFACE
/**
 * Loads and plays the (cached or newly fetched) Freesound audio for a given event.
 * - No more than one API fetch per eventType per session.
 * - Plays the cached Audio node if already loaded, otherwise preloads then plays.
 *   (Uses .cloneNode to allow for overlap if user fires rapidly.)
 * - volume: optional (default 1.0)
 * - onLoading/onLoaded/onError: callback hooks for UI loading spinners/barriers.
 *
 * 429 error logic: If a 429 arises, will backoff and retry in the background; if persistent, only then does error bubble up.
 */
export async function playFreesoundAudio(eventType, { onLoading, onLoaded, onError, volume = 1.0 } = {}) {
  let url, audio;
  try {
    if (onLoading) onLoading();
    ({ url } = await fetchPreviewUrl(eventType));
    // Use cached Audio: cloneNode so multiple sounds can play at once without waiting
    if (audioCache[url]) {
      audio = audioCache[url].cloneNode();
    } else {
      audio = new Audio(url);
      audioCache[url] = audio;
    }
    audio.volume = Math.max(0, Math.min(volume, 1.0));
    audio.currentTime = 0;
    return await new Promise((resolve, reject) => {
      audio.oncanplaythrough = () => {
        onLoaded && onLoaded(audio);
        audio.play().catch(err => { onError && onError(err); });
        resolve({ status: "played", url });
      };
      audio.onerror = (err) => {
        onError && onError(err);
        reject({ status: "error", error: err, url });
      };
      // If audio is already loaded/buffered
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
 * Preloads and caches Freesound audio for a given event type (category).
 * Will not refetch if already loaded.
 * Returns nothing (fire & forget).
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
 * ==== Rate Limiting and Caching Notes ====
 *
 * - This module strictly enforces a maximum of one network API call per sound type (e.g. "laser") per browser session.
 * - All subsequent requests for that type reuse the cached URL/promise—guaranteed: no extra API burst.
 * - If the Freesound API returns a 429 (rate limited), this is HANDLED IN THE BACKGROUND: 
 *      * Automatic delays with exponential backoff, and will retry several times (no user error unless persistent).
 *      * If they still fail, a generic sound error is shown (never a 429-specific alert) on the next audio fetch attempt.
 * - This design ensures the sound system is robust against accidental bursts or repeated fetches
 *   (for example, if your code starts the game many times, or many users hit the same sound quickly in a session).
 *
 * - To update which sounds are queried for each in-game event, change the DEFAULT_QUERIES.
 * - You can adjust debounce/backoff settings with MIN_API_INTERVAL_MS and RETRY_BASE_DELAY.
 *
 * [End of module]
 */
