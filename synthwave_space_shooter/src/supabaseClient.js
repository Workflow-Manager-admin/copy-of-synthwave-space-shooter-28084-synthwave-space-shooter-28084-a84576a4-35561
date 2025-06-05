//
// Supabase Utility for React using direct NPM import (not CDN)
// Update your Supabase credentials below:
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// Create a single supabase client instance for use across the app
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// PUBLIC_INTERFACE
/**
 * Store a player's score and name to the Supabase 'leaderboard' table.
 * @param {string} name - Player name
 * @param {number} score - Player score
 * @returns {Promise<boolean>}
 */
export async function postScore(name, score) {
  const { error } = await supabase
    .from('leaderboard')
    .insert([{ name, points: score }]);
  if (error) throw error;
  return true;
}

// PUBLIC_INTERFACE
/**
 * Retrieve leaderboard data from Supabase, sorted by score (descending)
 * @param {number} limit
 * @returns {Promise<Array<{ name: string, points: number }>>}
 */
export async function getLeaderboard(limit = 10) {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('name, points')
    .order('points', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/*
  Note: This file now uses the official NPM module import for Supabase,
  not the CDN script or window.supabase logic. All leaderboard client
  logic is fully compatible with modern React best practices and bundlers.
*/
