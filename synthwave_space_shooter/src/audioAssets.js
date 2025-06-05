//
// Local audio asset loader for synthwave-space-shooter
//
// Provide a consistent interface for loading and playing local static assets
// for all sound effects to replace previous Freesound API usage.

const SOUNDS = {
  // Ensure these files exist in synthwave_space_shooter/public/audio/
  // If you provide your own files, they should be named: laser.ogg, explosion.ogg
  // Example CC0 alternatives: https://kenney.nl/assets/interface-sounds
  laser: process.env.PUBLIC_URL + "/audio/laser.ogg",
  explosion: process.env.PUBLIC_URL + "/audio/explosion.ogg"
};

// We'll keep a cache of HTMLAudioElement objects to allow multiple quick playbacks.
const cachedAudio = {};

/**
 * PUBLIC_INTERFACE
 * Play a named sound asset, optionally with custom volume and overlapping.
 * If allowOverlap is false, any currently playing sound of that type is stopped first.
 * 
 * @param {"laser"|"explosion"} soundType - Which effect to play
 * @param {Object} opts - { volume: number (0-1), allowOverlap: boolean }
 */
export function playLocalSound(soundType, opts) {
  const { volume = 1.0, allowOverlap = false, onLoaded, onError } = opts || {};
  const url = SOUNDS[soundType];
  if (!url) {
    if (onError) onError(new Error("Sound not found: " + soundType));
    return;
  }
  // For overlap, create a brand new Audio instance
  let audio;
  if (allowOverlap) {
    audio = new window.Audio(url);
  } else {
    if (!cachedAudio[soundType]) cachedAudio[soundType] = new window.Audio(url);
    audio = cachedAudio[soundType];
    // Pause and rewind if needed
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {}
  }
  audio.volume = Math.max(0, Math.min(volume, 1.0));
  if (onLoaded) audio.oncanplaythrough = () => onLoaded(audio);
  if (onError) audio.onerror = onError;
  audio.play().catch((err) => {
    if (onError) onError(err);
  });
}
