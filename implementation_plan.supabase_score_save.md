1. Analyze existing game-over logic in App.js and current usages of Supabase client/saving logic.
2. Validate that the player's name and score are inserted to Supabase 'scores' table using supabase.from('scores').insert([{ player_name, score }]) at game end, not just after input blur.
3. If not present or logic is insufficient (e.g., only on blur or user interaction), refactor so the insertion is reliably triggered at game-over.
4. Refactor all logic to consistently use the postScore(name, score) API provided in supabaseClient.js on game-over.
5. Remove any use of bare window.supabase in favor of the shared client from supabaseClient.js for maintainability.
6. Update App.js in both the handleGameOver and input onBlur to only trigger leaderboard insertion once, and in a standards-compliant way (using postScore API).
7. Test code for proper score submission after game-over, confirming supabase 'scores' table is updated as expected (manual/visual test).

Assumptions:
- The Supabase postScore API in supabaseClient.js is the only point at which remote DB insertion should occur.
- The game-over screen should never rely solely on onBlur of input for score submission.
- The leaderboard logic should continue to function as local fallback if remote (Supabase) insertion fails.
