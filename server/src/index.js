// ============================================================
// NEON CIRCUIT FC — Tournament Worker
// Простой REST-бэкенд еженедельного турнира на Cloudflare Workers + D1.
// Эндпоинты:
//   POST /api/submit       { playerId, name, score, period } -> { rank, top }
//   GET  /api/leaderboard?period=2026-W27 -> { top: [...] }
//   GET  /api/health       -> { ok: true }
//
// Период (period) присылает клиент, но сервер всегда пересчитывает
// "официальный" текущий период сам и использует его для /submit,
// чтобы клиент не мог просто прислать произвольную неделю.
// ============================================================

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// ISO-8601 неделя вида "2026-W27", посчитанная на сервере (источник истины).
function currentPeriod() {
  const d = new Date();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const MAX_PLAUSIBLE_SCORE = 100000; // защита от совсем абсурдных значений
const SUBMIT_RATE_LIMIT_PER_DAY = 200; // грубый анти-спам лимит на игрока

async function ensureSchema(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    period TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_scores_period_score ON scores (period, score DESC)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_scores_player_period ON scores (player_id, period)`);
}

async function handleSubmit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'bad_json' }, 400);
  }

  const playerId = String(body.playerId || '').slice(0, 64);
  const name = String(body.name || 'ANON').slice(0, 16).replace(/[<>]/g, '');
  const score = Math.floor(Number(body.score));

  if (!playerId) return json({ error: 'missing_playerId' }, 400);
  if (!Number.isFinite(score) || score < 0 || score > MAX_PLAUSIBLE_SCORE) {
    return json({ error: 'invalid_score' }, 400);
  }

  const period = currentPeriod(); // сервер сам решает, какая сейчас неделя
  const db = env.DB;
  await ensureSchema(db);

  // грубый анти-спам: не более N сабмитов в текущем периоде на игрока
  const countRow = await db.prepare(
    'SELECT COUNT(*) as c FROM scores WHERE player_id = ? AND period = ?'
  ).bind(playerId, period).first();
  if (countRow && countRow.c >= SUBMIT_RATE_LIMIT_PER_DAY) {
    return json({ error: 'rate_limited' }, 429);
  }

  // держим в таблице только лучший результат каждого игрока за период —
  // иначе в топ-50 один и тот же игрок мог бы занимать несколько строк
  const existing = await db.prepare(
    'SELECT score FROM scores WHERE player_id = ? AND period = ?'
  ).bind(playerId, period).first();

  if (!existing || score > existing.score) {
    await db.prepare('DELETE FROM scores WHERE player_id = ? AND period = ?').bind(playerId, period).run();
    await db.prepare(
      'INSERT INTO scores (player_id, name, score, period, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(playerId, name, score, period, Date.now()).run();
  }

  const bestScore = existing && existing.score > score ? existing.score : score;

  const top = await db.prepare(
    `SELECT name, score, player_id as playerId FROM scores
     WHERE period = ? ORDER BY score DESC LIMIT 50`
  ).bind(period).all();

  const rankRow = await db.prepare(
    `SELECT COUNT(*) + 1 as rank FROM scores WHERE period = ? AND score > ?`
  ).bind(period, bestScore).first();

  return json({ rank: rankRow ? rankRow.rank : null, top: top.results, period, bestScore });
}

async function handleLeaderboard(request, env) {
  const url = new URL(request.url);
  const period = url.searchParams.get('period') || currentPeriod();
  const db = env.DB;
  await ensureSchema(db);

  const top = await db.prepare(
    `SELECT name, score, player_id as playerId FROM scores
     WHERE period = ? ORDER BY score DESC LIMIT 50`
  ).bind(period).all();

  return json({ top: top.results, period });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/health') {
        return json({ ok: true, period: currentPeriod() });
      }
      if (url.pathname === '/api/submit' && request.method === 'POST') {
        return await handleSubmit(request, env);
      }
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        return await handleLeaderboard(request, env);
      }
      return json({ error: 'not_found' }, 404);
    } catch (err) {
      return json({ error: 'server_error', message: String(err && err.message || err) }, 500);
    }
  },
};
