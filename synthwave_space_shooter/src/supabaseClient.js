//
// Supabase Utility for React using direct NPM import (not CDN)
// Update your Supabase credentials below:
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://tohyglycuoelcxayfdpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvaHlnbHljdW9lbGN4YXlmZHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkxMTA0OTIsImV4cCI6MjA2NDY4NjQ5Mn0.Aw6tHQ74yMarduOP7Kdk7OOV9GljbceWGk4OEAVw6LA";

// Create a single supabase client instance for use across the app
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * PUBLIC_INTERFACE
 * Store a player's score and name to the Supabase 'scores' table.
 * @param {string} name - Player name
 * @param {number} score - Player score
 * @returns {Promise<boolean>}
 */
export async function postScore(name, score) {
  // Insert into 'scores' table with columns 'player_name' and 'score'
  const { error } = await supabase
    .from('scores')
    .insert([{ player_name: name, score }]);
  if (error) throw error;
  return true;
}

/**
 * PUBLIC_INTERFACE
 * Retrieve leaderboard data from Supabase 'scores' table, sorted by score (descending)
 * @param {number} limit
 * @returns {Promise<Array<{ name: string, points: number }>>}
 */
export async function getLeaderboard(limit = 10) {
  const { data, error } = await supabase
    .from('scores')
    .select('player_name, score')
    .order('score', { ascending: false })
    .limit(limit);
  if (error) throw error;
  // Convert to expected { name, points } format
  return (data || []).map(row => ({
    name: row.player_name,
    points: row.score
  }));
}

/**
 * PUBLIC_INTERFACE
 * Fetch the top N scores (descending) from Supabase 'scores' table.
 * This is the new required API for leaderboard display.
 * @param {number} limit - Maximum number of records to fetch (default 10)
 * @returns {Promise<Array<{ name: string, points: number }>>}
 */
export async function getTopScores(limit = 10) {
  const { data, error } = await supabase
    .from('scores')
    .select('player_name, score')
    .order('score', { ascending: false })
    .limit(limit);
  if (error) throw error;
  // Convert to expected { name, points } format
  return (data || []).map(row => ({
    name: row.player_name,
    points: row.score
  }));
}

/*
  Note: This file now uses the official NPM module import for Supabase,
  not the CDN script or window.supabase logic. All leaderboard client
  logic is fully compatible with modern React best practices and bundlers.
*/
