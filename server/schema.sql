-- Схема применяется автоматически воркером при первом запросе (CREATE TABLE
-- IF NOT EXISTS), но её же можно накатить руками заранее:
--   wrangler d1 execute neon-circuit-fc-db --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  period TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_period_score ON scores (period, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_player_period ON scores (player_id, period);
