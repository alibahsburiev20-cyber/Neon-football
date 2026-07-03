// ============================================================
// tournament.js — клиент еженедельного онлайн-турнира.
// Общается с Cloudflare Worker (см. /server в поставке) по простому
// REST-контракту. Пока URL сервера не настроен — работает в локальном
// офлайн-режиме (таблица лидеров только на этом устройстве), чтобы
// экран турнира не был "мёртвым" до деплоя бэкенда.
// ============================================================

const Tournament = (() => {

  const BACKEND_KEY = 'ncfc_tournament_backend';
  const PLAYER_ID_KEY = 'ncfc_player_id';
  const PLAYER_NAME_KEY = 'ncfc_player_name';
  const LOCAL_BOARD_PREFIX = 'ncfc_local_leaderboard_';

  function getBackendUrl() {
    return Utils.storage.get(BACKEND_KEY, '');
  }

  function setBackendUrl(url) {
    Utils.storage.set(BACKEND_KEY, (url || '').trim().replace(/\/$/, ''));
  }

  function isOnline() {
    return !!getBackendUrl();
  }

  function getPlayerId() {
    let id = Utils.storage.get(PLAYER_ID_KEY, null);
    if (!id) {
      id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : ('p-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
      Utils.storage.set(PLAYER_ID_KEY, id);
    }
    return id;
  }

  function getPlayerName() {
    return Utils.storage.get(PLAYER_NAME_KEY, null) || ('ИГРОК-' + getPlayerId().slice(0, 4).toUpperCase());
  }

  function setPlayerName(name) {
    const clean = (name || '').trim().slice(0, 16);
    if (clean) Utils.storage.set(PLAYER_NAME_KEY, clean);
  }

  function currentPeriod() {
    const d = new Date();
    const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  function computeScore(state) {
    return state.scoreHome * 100 + state.bestCombo * 10 + state.overdriveShotsUsed * 15;
  }

  // ---- локальный офлайн-фолбэк ----
  function localKey(period) { return LOCAL_BOARD_PREFIX + period; }

  function localSubmit(score, period) {
    const board = Utils.storage.get(localKey(period), []);
    board.push({ playerId: getPlayerId(), name: getPlayerName(), score, ts: Date.now() });
    board.sort((a, b) => b.score - a.score);
    const top = board.slice(0, 50);
    Utils.storage.set(localKey(period), top);
    const rank = top.findIndex(e => e.playerId === getPlayerId() && e.score === score) + 1;
    return { rank: rank || top.length, top, local: true };
  }

  function localLeaderboard(period) {
    return Utils.storage.get(localKey(period), []);
  }

  // ---- онлайн-режим (Cloudflare Worker) ----
  async function submitScore(score) {
    const period = currentPeriod();
    if (!isOnline()) return localSubmit(score, period);
    try {
      const res = await fetch(`${getBackendUrl()}/api/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: getPlayerId(), name: getPlayerName(), score, period })
      });
      if (!res.ok) throw new Error('bad status ' + res.status);
      const data = await res.json();
      return { rank: data.rank, top: data.top, local: false };
    } catch (e) {
      console.warn('Tournament: сервер недоступен, используется локальный фолбэк', e);
      return localSubmit(score, period);
    }
  }

  async function getLeaderboard() {
    const period = currentPeriod();
    if (!isOnline()) return { top: localLeaderboard(period), local: true, period };
    try {
      const res = await fetch(`${getBackendUrl()}/api/leaderboard?period=${encodeURIComponent(period)}`);
      if (!res.ok) throw new Error('bad status ' + res.status);
      const data = await res.json();
      return { top: data.top || [], local: false, period };
    } catch (e) {
      console.warn('Tournament: сервер недоступен, используется локальный фолбэк', e);
      return { top: localLeaderboard(period), local: true, period };
    }
  }

  return {
    getBackendUrl, setBackendUrl, isOnline,
    getPlayerId, getPlayerName, setPlayerName,
    currentPeriod, computeScore,
    submitScore, getLeaderboard
  };
})();
