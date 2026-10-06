# Beat the Clock — Vercel + Supabase

## What changed
- Mobile mode: tap a task, then tap a time slot. Drag & drop is still available on desktop.
- Responsive phone layout with larger touch targets and a compact game header.
- The in-game **Reset Game** button was removed, so the timer cannot be restarted during a run.
- Global leaderboard stored in Supabase and served through `/api/scores` on Vercel.
- The Supabase service-role key stays only on the server and is never exposed in `script.js`.

## 1. Create the free Supabase database
1. Create a Supabase project.
2. Open **SQL Editor**.
3. Paste and run `SUPABASE_SETUP.sql`.
4. Open **Project Settings -> API** and copy:
   - Project URL
   - `service_role` secret key

Do NOT put the service-role key in `script.js`, `index.html`, GitHub, or any public file.

## 2. Configure Vercel
In your Vercel project open **Settings -> Environment Variables** and add:

- `SUPABASE_URL` = your Supabase Project URL
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service-role secret

Enable them for Production (and Preview if you want preview deployments to use the database).

## 3. Deploy
Upload/push the entire project, including the `api/` folder, to the Git repository connected to Vercel, then redeploy.

There is no build command and no framework required. Vercel serves `index.html` and automatically exposes `api/scores.mjs` as `/api/scores`.

## 4. Test
Open your Vercel site on a phone:
1. Start a game.
2. Tap a task card.
3. Tap the desired time in the schedule.
4. Finish the game.
5. The score should be stored and the global leaderboard should show all stored results (up to 1000 entries in this version).

If the leaderboard says it is not connected, check the two Vercel environment variables and redeploy.

## Security note
The database secret is protected server-side. However, this is still a browser game, so a determined user could imitate requests. For a classroom/demo leaderboard this setup is appropriate; a competition-grade anti-cheat system would need server-side game-state validation as well.


## Mobile schedule scrolling fix
On touch screens, the schedule can now be scrolled vertically even while a task is selected.
A swipe only scrolls the schedule; it does not place the selected task. After scrolling, simply tap the desired time slot to place it.
