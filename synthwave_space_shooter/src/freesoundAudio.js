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
// Simple in-memory sound cache
const previewUrlCache = {};
const audioCache = {};

function apiHeaders() {
  return {
    Authorization: `Token ${FREESOUND_API_KEY}`
  };
}
function safeGetProp(obj, propPath, fallback = undefined) {
  try {
    return propPath.split('.').reduce((acc, k) => acc[k], obj) || fallback;
  } catch {
    return fallback;
  }
}

// PUBLIC_INTERFACE
/**
 * Fetches a preview mp3 URL for a given Freesound tag (event type), with caching and fallback.
 * Returns { url: <audio_url> } or throws an error if no sound is found.
 */
export async function fetchPreviewUrl(eventType) {
  // Use default query for event, fallback to eventType literal.
  const query = DEFAULT_QUERIES[eventType] || eventType;
  if (previewUrlCache[query]) return { url: previewUrlCache[query] };

  // Try 1st page, then fallback by relaxing filters if empty
  let results, url = null, data;
  try {
    const resp = await fetch(
      `${FREESOUND_BASE}/search/text/?query=${encodeURIComponent(query)}&fields=id,name,previews,duration,license,username&filter=duration:[0.5 TO 30]&page_size=8`,
      { headers: apiHeaders() }
    );
    data = await resp.json();
    results = Array.isArray(data.results) ? data.results : [];
    for (const r of results) {
      // For background, prefer looping/long ones; for others, short
      if (PREVIEW_MP3 in safeGetProp(r, "previews", {})) {
        url = r.previews["preview-hq-mp3"] || r.previews["preview-lq-mp3"];
      }
      if (url) break;
    }
  } catch (e) {
    throw new Error(`Sound fetch error: ${e?.message || e}`);
  }

  if (!url) throw new Error("No suitable sound found!");
  previewUrlCache[query] = url;
  return { url };
}

// PUBLIC_INTERFACE
/**
 * Loads and plays an audio for a game event type (laser, explosion, etc).
 * Returns a { status, error } with handling for loading and error state.
 */
export async function playFreesoundAudio(eventType, { onLoading, onLoaded, onError, volume = 1.0 } = {}) {
  let url, audio;
  try {
    if (onLoading) onLoading();
    // Get preview audio URL, cache
    ({ url } = await fetchPreviewUrl(eventType));
    if (audioCache[url]) {
      audio = audioCache[url].cloneNode();
    } else {
      audio = new Audio(url);
      audioCache[url] = audio;
    }
    audio.volume = Math.max(0, Math.min(volume, 1.0));
    audio.currentTime = 0;
    // Attach events for loading/playing UX
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
      // If already loaded (cached), play immediately
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
 * Preload audio for a given event type (returns quickly, best-effort).
 */
export function preloadFreesoundAudio(eventType) {
  fetchPreviewUrl(eventType).then(({ url }) => {
    if (!audioCache[url]) {
      const audio = new Audio(url);
      audioCache[url] = audio;
      // Just attempt to load in background
      audio.preload = "auto";
      audio.load();
    }
  }).catch(() => {});
}
