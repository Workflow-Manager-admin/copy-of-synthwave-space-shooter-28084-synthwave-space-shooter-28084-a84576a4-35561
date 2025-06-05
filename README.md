# synthwave-space-shooter-28084-a84576a4

## Supabase Integration (via CDN) for Leaderboard

This project uses Supabase to store and retrieve player name/score for the leaderboard.  
**Supabase is integrated via CDN rather than NPM.**

### How to set up Supabase with the React template

1. **CDN Script**:  
   Ensure this script tag is present _after_ the root div in your `index.html`:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js"></script>
   ```

   Create a Supabase project (https://supabase.com), obtain your Project URL
   and Anon API Key, and update them in `src/supabaseClient.js`:
   ```js
   const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
   const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
   ```

2. **No npm install required** for `@supabase/supabase-js`.

3. **React Workaround**:  
   Since React doesn't expose `index.html` directly for editing in some setups,
   `src/supabaseClient.js` will attempt to dynamically inject the CDN script
   if not present and will safely handle waiting for the script to load.

4. **Table Structure**:  
   You must create a Supabase table called `leaderboard` with columns:
   - `name` (text/string)
   - `points` (integer)

5. **Usage in Code**:  
   Use the functions `postScore(name, score)` and `getLeaderboard(limit)` from `supabaseClient.js`.

6. **Security**:  
   For production, consider Supabase Row Level Security rules to protect your data.

For details, see `src/supabaseClient.js`.