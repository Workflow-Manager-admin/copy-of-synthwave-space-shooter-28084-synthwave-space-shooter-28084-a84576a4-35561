//
// Supabase Utility for React when using CDN script injection
//
// To use: Ensure the following is present in your index.html, after the root div:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js"></script>
//
// Since this React app does not manage index.html directly, a workaround is to
// programmatically inject the CDN <script> if window.supabase is not yet available.
// The methods below wait for window.supabase to be loaded before interacting.
//
// Replace SUPABASE_URL and SUPABASE_ANON_KEY with your actual project settings.
//

const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// PUBLIC_INTERFACE
export async function initSupabase() {
  /**
   * Dynamically injects the Supabase CDN script and initializes the
   * Supabase client on window.supabase if it isn't already loaded.
   * Returns the client instance or throws if failed.
   */
  if (window.supabaseClient) return window.supabaseClient;

  // Already loaded via CDN (index.html or via previous call)
  if (window.supabase && window.supabase.createClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.supabaseClient;
  }

  // Inject CDN script and await loading
  if (!document.getElementById('supabase-cdn')) {
    const script = document.createElement('script');
    script.id = 'supabase-cdn';
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js";
    script.async = true;
    document.body.appendChild(script);
  }

  // Wait for window.supabase to become available
  await new Promise((resolve, reject) => {
    let elapsed = 0;
    const check = () => {
      if (window.supabase && window.supabase.createClient) {
        resolve();
      } else if (elapsed > 4000) {
        reject(new Error("Supabase CDN failed to load"));
      } else {
        elapsed += 60;
        setTimeout(check, 60);
      }
    };
    check();
  });

  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return window.supabaseClient;
}

/**
 * PUBLIC_INTERFACE
 * Store a player's score and name to the Supabase 'leaderboard' table.
 * @param {string} name - Player name
 * @param {number} score - Player score
 */
export async function postScore(name, score) {
  const supabase = await initSupabase();
  return supabase
    .from('leaderboard')
    .insert([{ name, points: score }])
    .then(({ error }) => {
      if (error) throw error;
      return true;
    });
}

/**
 * PUBLIC_INTERFACE
 * Retrieve leaderboard data from Supabase, sorted by score.
 * @returns {Array} Array of leaderboard entries: { name, points }
 */
export async function getLeaderboard(limit = 10) {
  const supabase = await initSupabase();
  const { data, error } = await supabase
    .from('leaderboard')
    .select('name, points')
    .order('points', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/*
  Note: This file is designed as a workaround for using Supabase via CDN in React,
  since most tutorials use npm (@supabase/supabase-js) with imports.
  Instead, you interact with window.supabase and handle async loading of the script.
*/
