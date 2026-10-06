const MAX_NAME = 24;
const fields = 'id,player_name,score,deadlines,prioritization,planning,adaptability,created_at';

function env() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  // Prefer the new Supabase secret key name, but keep compatibility with the old variable name.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY');
  return { url, key };
}

function dbHeaders(key, extra = {}) {
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    ...extra,
  };
  // Legacy service_role keys are JWTs. New sb_secret_* keys are NOT JWTs and
  // must not be sent as Authorization: Bearer.
  if (!key.startsWith('sb_secret_') && !key.startsWith('sb_publishable_')) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function validInt(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

const json = (data, status = 200, extraHeaders = {}) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', ...extraHeaders },
});

export default {
  async fetch(request) {
    try {
      const { url, key } = env();

      if (request.method === 'GET') {
        const endpoint = `${url}/rest/v1/scores?select=${fields}&order=score.desc,created_at.asc&limit=1000`;
        const r = await fetch(endpoint, { headers: dbHeaders(key) });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          console.error('Supabase GET failed', r.status, data);
          return json({ error: data?.message || data?.error || `Supabase GET failed (${r.status})` }, r.status);
        }
        return json(data);
      }

      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const player_name = String(body.player_name || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
        const score = Number(body.score);
        const deadlines = Number(body.deadlines);
        const prioritization = Number(body.prioritization);
        const planning = Number(body.planning);
        const adaptability = Number(body.adaptability);

        if (player_name.length < 1 || !validInt(score, 0, 100)) {
          return json({ error: 'Invalid player name or score' }, 400);
        }
        for (const part of [deadlines, prioritization, planning, adaptability]) {
          if (!validInt(part, 0, 25)) return json({ error: 'Invalid score details' }, 400);
        }
        if (deadlines + prioritization + planning + adaptability !== score) {
          return json({ error: 'Score details do not match total score' }, 400);
        }

        const endpoint = `${url}/rest/v1/scores`;
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: dbHeaders(key, { Prefer: 'return=representation' }),
          body: JSON.stringify({ player_name, score, deadlines, prioritization, planning, adaptability }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          console.error('Supabase POST failed', r.status, data);
          return json({ error: data?.message || data?.error || `Supabase POST failed (${r.status})` }, r.status);
        }
        return json(data[0] || { ok: true }, 201);
      }

      return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' });
    } catch (err) {
      console.error('Leaderboard API error:', err);
      return json({ error: err?.message || 'Leaderboard service unavailable' }, 500);
    }
  },
};
