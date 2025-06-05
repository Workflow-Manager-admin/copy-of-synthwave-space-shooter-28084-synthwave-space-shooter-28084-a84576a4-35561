# synthwave-space-shooter-28084-a84576a4

## Supabase Integration (via NPM) for Leaderboard

This project uses Supabase to store and retrieve player names and scores for the leaderboard.  
**Supabase is integrated via the official NPM package `@supabase/supabase-js`, not CDN.**

### How to set up Supabase with this React project

1. **Install the Supabase JS client:**

   Run this in the `synthwave_space_shooter` folder:
   ```sh
   npm install @supabase/supabase-js
   ```

2. **Configure your Supabase credentials:**

   Create a Supabase project at [https://supabase.com](https://supabase.com).  
   Obtain your Project URL and Anon API Key, and update them in `src/supabaseClient.js`:
   ```js
   // src/supabaseClient.js
   const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
   const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
   ```

3. **Import and use in the code:**

   The Supabase client is created using the NPM package and imported directly:
   ```js
   import { createClient } from '@supabase/supabase-js';

   // Already set up in src/supabaseClient.js as 'supabase'
   ```

   You should use the provided functions for all leaderboard operations:
   - `postScore(name, score)` &mdash; Store a player's name and score.
   - `getTopScores(limit)` &mdash; Retrieve an array of leaderboard entries (sorted high to low).
   - Both are exported by `src/supabaseClient.js`.

4. **Correct Table Naming (IMPORTANT):**

   - The table in Supabase **must** be named exactly `Scores` (capital "S").
   - Columns:
     - `player_name` (text/string)
     - `score` (integer)

   ⚠️ If your table is called `scores` (all lowercase), Supabase will return a 404 error (table not found)!  
   Table names in Supabase are case-sensitive. Double-check in the web UI that your table is `Scores`.

5. **Usage Example:**
   ```js
   import { postScore, getTopScores } from "./src/supabaseClient";

   // Posting a score
   await postScore("PlayerName", 4250);

   // Fetching top 10 scores
   const leaderboard = await getTopScores(10);
   // leaderboard is [{ name: "PlayerName", points: 4250 }, ...]
   ```

6. **Troubleshooting (404 errors):**

   - If you see errors like `Table not found: scores`, ensure your Supabase table is named `Scores` (with a capital S).
   - Changing the table name, or mismatches in capitalization, will result in failures to read or write the leaderboard.
   - You can rename the table in the Supabase web interface if needed.

7. **Security Best Practices:**

   For production, configure Supabase **Row Level Security (RLS)** rules to protect your leaderboard data.  
   Make sure only allowed operations are permitted (see Supabase docs for more information).

For further details, see `src/supabaseClient.js`.