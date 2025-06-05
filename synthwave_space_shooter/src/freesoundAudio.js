// Synthwave Space Shooter - Freesound Audio Manager (Laser & Explosion Only)
//
// Implements a sound manager pattern: only one "laser" and only one "explosion"
// sound can play at a time. If retriggered, the previous sound of that kind is 
// stopped (paused/reset) and the new one is started. 
// This ensures crisp immediate retrigger and arcade-style cut-off.
//
// Usage:
//    import { playFreesoundAudio, preloadFreesoundAudio } from './freesoundAudio';
//    playFreesoundAudio('laser', { volume: 0.5, ...callbacks });
//

const FREESOUND_API_KEY = "CTb7EBttQq2OjR4ChprDGUAbKnguwv188YCSxIGg";
const FREESOUND_BASE = "https://freesound.org/apiv2";
const EFFECT_QUERY = {
  laser: "laser",
};
const MIN_API_INTERVAL_MS = 1200; // per sound kind
const MAX_RETRY = 4;
const RETRY_BASE = 1800; // ms for exponential backoff

// Keeps the preview mp3 URL for each event type
const previewUrlCache = {}; // { kind: url }
const previewRequests = {}; // { kind: in-flight Promise }
const lastQueryTimestamps = {}; // Throttle API: { kind: lastRequestTime }

// Caches loaded (not playing) Audio elements by url, so we can .cloneNode() for new playbacks
const audioCache = {}; // { url: HTMLAudioElement }

// Main sound manager: reference to currently playing laser Audio object only
const activeAudio = {
  laser: null,
};

// --- INTERNAL: Drill safely into nested props
function safeGetProp(obj, path, fallback) {
  try {
    return path.split('.').reduce((o, k) => o && o[k], obj) ?? fallback;
  } catch {
    return fallback;
  }
}

// --- INTERNAL: Fetch and cache valid Freesound preview mp3 URL for kind
async function fetchPreviewUrl(kind) {
  if (![ "laser", "explosion" ].includes(kind)) throw new Error('Invalid kind for freesound: ' + kind);
  const query = EFFECT_QUERY[kind];
  if (previewUrlCache[query]) return { url: previewUrlCache[query] };
  if (previewRequests[query]) return previewRequests[query];

  // Throttle per type
  const now = Date.now();
  if (lastQueryTimestamps[query] && now - lastQueryTimestamps[query] < MIN_API_INTERVAL_MS) {
    // Wait remaining interval and retry
    const wait = MIN_API_INTERVAL_MS - (now - lastQueryTimestamps[query]);
    return new Promise(res => setTimeout(() => res(fetchPreviewUrl(kind)), wait));
  }
  lastQueryTimestamps[query] = now;

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

// --- INTERNAL: Freesound API search, with retry/throttle for 429s/network
async function _fetchPreviewUrlWithRetry(query, retry) {
  let data, url = null;
  try {
    const resp = await fetch(
      `${FREESOUND_BASE}/search/text/?query=${encodeURIComponent(query)}&fields=previews,duration&filter=duration:[0.5 TO 28]&page_size=7`,
      { headers: { Authorization: `Token ${FREESOUND_API_KEY}` } }
    );
    if (resp.status === 429) {
      if (retry >= MAX_RETRY) throw new Error('Too many Freesound requests (rate limit)');
      const retryAfter = Number(resp.headers.get("Retry-After")) * 1000
        || Math.min(RETRY_BASE * 2 ** retry, 12000);
      await new Promise(res => setTimeout(res, retryAfter));
      return _fetchPreviewUrlWithRetry(query, retry + 1);
    }
    data = await resp.json();
    const results = Array.isArray(data.results) ? data.results : [];
    for (const r of results) {
      url = safeGetProp(r, "previews.preview-hq-mp3") || safeGetProp(r, "previews.preview-lq-mp3");
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

// PUBLIC_INTERFACE
/**
 * Play a laser or explosion sound from Freesound (one-per-kind only).
 * Retriggering "cuts" the previous, only one of each effect can play at once.
 * @param {'laser'|'explosion'} kind
 * @param {Object} opts - { onLoading, onLoaded, onError, volume }
 *  volume: 0-1
 */
export async function playFreesoundAudio(kind, { onLoading, onLoaded, onError, volume = 1.0 } = {}) {
  if (onLoading) onLoading();
  try {
    const { url } = await fetchPreviewUrl(kind);

    // Stop previous of this kind
    if (activeAudio[kind]) {
      try {
        activeAudio[kind].pause();
        activeAudio[kind].currentTime = 0;
      } catch {}
      activeAudio[kind] = null;
    }
    // Always use a fresh Audio node for lowest-latency play, from cache if available (.cloneNode)
    let audio;
    if (audioCache[url]) {
      audio = audioCache[url].cloneNode();
    } else {
      audio = new Audio(url);
      audioCache[url] = audio;
    }
    audio.volume = Math.max(0, Math.min(volume, 1.0));
    audio.currentTime = 0;

    // Save reference as active
    activeAudio[kind] = audio;
    audio.onended = () => {
      if (activeAudio[kind] === audio) activeAudio[kind] = null;
    };

    // Only call onLoaded after it can play
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

// PUBLIC_INTERFACE
/**
 * Preload (but do not play) a 'laser' or 'explosion' effect from Freesound.
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
 * The single-reference-per-type activeAudio object ensures arcade-style crisp
 * retriggering. At most one "laser" and one "explosion" can play simultaneously.
 * All other effect types are unsupported by design.
 */
