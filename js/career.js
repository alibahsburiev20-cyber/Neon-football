// ============================================================
// career.js — режим "лига": 3 отдельные лестницы (БРОНЗА/СЕРЕБРО/
// ЗОЛОТО) по 5 соперников возрастающей сложности каждая. Прогресс
// хранится отдельно по каждой лестнице. Название лиги, показываемое
// в HUD и меню, можно переименовать (косметика).
// ============================================================

const Career = (() => {

  const CIRCUITS = {
    bronze: {
      id: 'bronze', tierLabel: 'БРОНЗА',
      opponents: [
        { name: 'BYTE FC',      difficulty: 'easy',   duration: 120 },
        { name: 'PIXEL UNITED', difficulty: 'easy',   duration: 150 },
        { name: 'GRID RANGERS', difficulty: 'normal',  duration: 150 },
        { name: 'VOLT CARTEL',  difficulty: 'normal',  duration: 180 },
        { name: 'CORE.EXE',     difficulty: 'hard',    duration: 180 },
      ]
    },
    silver: {
      id: 'silver', tierLabel: 'СЕРЕБРО',
      opponents: [
        { name: 'NULLBYTE',      difficulty: 'easy',   duration: 150 },
        { name: 'ECHO ARRAY',    difficulty: 'normal', duration: 150 },
        { name: 'PRISM GUARD',   difficulty: 'normal', duration: 180 },
        { name: 'FERRO WOLVES',  difficulty: 'hard',   duration: 180 },
        { name: 'MAINFRAME X',   difficulty: 'hard',   duration: 210 },
      ]
    },
    gold: {
      id: 'gold', tierLabel: 'ЗОЛОТО',
      opponents: [
        { name: 'BLACKOUT',          difficulty: 'normal', duration: 180 },
        { name: 'RAILGUN FC',        difficulty: 'hard',   duration: 180 },
        { name: 'ZENITH.SYS',        difficulty: 'hard',   duration: 210 },
        { name: 'APEX PROTOCOL',     difficulty: 'hard',   duration: 210 },
        { name: 'OVERCLOCK.EXE — ФИНАЛ', difficulty: 'hard', duration: 240 },
      ]
    }
  };

  const CIRCUIT_ORDER = ['bronze', 'silver', 'gold'];
  const CIRCUIT_KEY = 'ncfc_circuit';
  const LEAGUE_NAME_KEY = 'ncfc_league_name';
  const DEFAULT_LEAGUE_NAME = 'ЛИГА ОВЕРКЛОКА';
  const MAX_NAME_LEN = 24;

  function getCircuitList() {
    return CIRCUIT_ORDER.map(id => CIRCUITS[id]);
  }

  function getSelectedCircuitId() {
    const id = Utils.storage.get(CIRCUIT_KEY, 'bronze');
    return CIRCUITS[id] ? id : 'bronze';
  }

  function setSelectedCircuitId(id) {
    if (CIRCUITS[id]) Utils.storage.set(CIRCUIT_KEY, id);
  }

  function getLeagueName() {
    return Utils.storage.get(LEAGUE_NAME_KEY, DEFAULT_LEAGUE_NAME);
  }

  function setLeagueName(name) {
    const clean = (name || '').trim().slice(0, MAX_NAME_LEN);
    Utils.storage.set(LEAGUE_NAME_KEY, clean.length ? clean : DEFAULT_LEAGUE_NAME);
  }

  function progressKey(circuitId) { return `ncfc_career_progress_${circuitId}`; }
  function streakKey(circuitId) { return `ncfc_best_streak_${circuitId}`; }

  function getProgress(circuitId) {
    return Utils.storage.get(progressKey(circuitId), { stage: 0 });
  }

  function setProgress(circuitId, stage) {
    Utils.storage.set(progressKey(circuitId), { stage });
  }

  function resetProgress(circuitId) {
    setProgress(circuitId || getSelectedCircuitId(), 0);
  }

  function getCurrentOpponent(circuitId) {
    const cid = circuitId || getSelectedCircuitId();
    const circuit = CIRCUITS[cid];
    const p = getProgress(cid);
    const idx = Utils.clamp(p.stage, 0, circuit.opponents.length - 1);
    return { ...circuit.opponents[idx], stageIndex: idx, totalStages: circuit.opponents.length, circuitId: cid, tierLabel: circuit.tierLabel };
  }

  function advance(circuitId) {
    const cid = circuitId || getSelectedCircuitId();
    const circuit = CIRCUITS[cid];
    const p = getProgress(cid);
    const next = p.stage + 1;
    if (next >= circuit.opponents.length) {
      const best = Utils.storage.get(streakKey(cid), 0);
      Utils.storage.set(streakKey(cid), Math.max(best, circuit.opponents.length));
      setProgress(cid, 0);
      return { leagueCompleted: true, circuitId: cid };
    }
    setProgress(cid, next);
    const best = Utils.storage.get(streakKey(cid), 0);
    Utils.storage.set(streakKey(cid), Math.max(best, next));
    return { leagueCompleted: false, nextStage: next, circuitId: cid };
  }

  function getBestStreak(circuitId) {
    return Utils.storage.get(streakKey(circuitId || getSelectedCircuitId()), 0);
  }

  return {
    CIRCUITS, CIRCUIT_ORDER, getCircuitList,
    getSelectedCircuitId, setSelectedCircuitId,
    getLeagueName, setLeagueName, DEFAULT_LEAGUE_NAME,
    getProgress, setProgress, resetProgress,
    getCurrentOpponent, advance, getBestStreak
  };
})();
