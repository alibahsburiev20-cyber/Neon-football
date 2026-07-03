// ============================================================
// progression.js — профиль игрока между матчами: уровень/опыт,
// DATA SHARDS (мягкая валюта), OC-КРЕДИТЫ (премиум-валюта под
// будущее пополнение через TON Connect / GRAM), прокачка статов,
// достижения, ежедневный бонус.
// ============================================================

const Progression = (() => {

  const STORAGE_KEY = 'ncfc_profile_v1';
  const STAT_KEYS = ['speed', 'shot', 'accel', 'dash'];
  const STAT_MAX = 5;
  const STAT_LABEL = { speed: 'СКОРОСТЬ', shot: 'СИЛА УДАРА', accel: 'РАЗГОН', dash: 'ДЭШ' };

  const ACHIEVEMENTS = [
    { id: 'first_goal',      name: 'ПЕРВЫЙ ГОЛ',        desc: 'Забей свой первый гол',              reward: 60,  check: (p) => p.careerTotals.goals >= 1 },
    { id: 'ten_goals',       name: 'СНАЙПЕР',           desc: '10 голов за карьеру',                 reward: 120, check: (p) => p.careerTotals.goals >= 10 },
    { id: 'fifty_goals',     name: 'МАШИНА ГОЛОВ',      desc: '50 голов за карьеру',                 reward: 300, check: (p) => p.careerTotals.goals >= 50 },
    { id: 'first_win',       name: 'ПЕРВАЯ ПОБЕДА',     desc: 'Выиграй свой первый матч',            reward: 60,  check: (p) => p.careerTotals.wins >= 1 },
    { id: 'overdrive_25',    name: 'ПЕРЕГРУЗКА',        desc: '25 овердрайв-ударов за карьеру',      reward: 150, check: (p) => p.careerTotals.overdriveShots >= 25 },
    { id: 'league_legend',   name: 'ЛЕГЕНДА ЛИГИ',      desc: 'Пройди лигу целиком',                 reward: 250, check: (p) => p.careerTotals.leaguesCompleted >= 1 },
  ];

  function defaultProfile() {
    return {
      level: 1,
      xp: 0,
      shards: 150,
      premium: 0,
      stats: { speed: 1, shot: 1, accel: 1, dash: 1 },
      unlockedSkins: ['home_default', 'away_default'],
      equippedSkin: 'home_default',
      achievements: {},
      careerTotals: { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, overdriveShots: 0, leaguesCompleted: 0, bestComboEver: 0 },
      lastDailyClaim: null,
      dailyStreak: 0
    };
  }

  function getProfile() {
    const p = Utils.storage.get(STORAGE_KEY, null);
    if (!p) return defaultProfile();
    // мягкая миграция на случай неполного объекта из старой версии
    const d = defaultProfile();
    return {
      ...d, ...p,
      stats: { ...d.stats, ...(p.stats || {}) },
      careerTotals: { ...d.careerTotals, ...(p.careerTotals || {}) },
      achievements: { ...(p.achievements || {}) },
      unlockedSkins: p.unlockedSkins && p.unlockedSkins.length ? p.unlockedSkins : d.unlockedSkins
    };
  }

  function saveProfile(p) {
    Utils.storage.set(STORAGE_KEY, p);
  }

  function xpForLevel(level) {
    return 100 + (level - 1) * 40;
  }

  function addXP(profile, amount) {
    profile.xp += amount;
    let leveledUp = false;
    const unlockedSkins = [];
    while (profile.xp >= xpForLevel(profile.level)) {
      profile.xp -= xpForLevel(profile.level);
      profile.level += 1;
      leveledUp = true;
      const skinsAtLevel = Skins.getLevelUnlocks(profile.level);
      for (const sid of skinsAtLevel) {
        if (profile.unlockedSkins.indexOf(sid) === -1) {
          profile.unlockedSkins.push(sid);
          unlockedSkins.push(sid);
        }
      }
    }
    return { leveledUp, newLevel: profile.level, unlockedSkins };
  }

  function addShards(profile, amount) {
    profile.shards = Math.max(0, profile.shards + amount);
  }

  function addPremium(profile, amount) {
    profile.premium = Math.max(0, profile.premium + amount);
  }

  function spendShardsOnProfile(profile, amount) {
    if (profile.shards < amount) return false;
    profile.shards -= amount;
    return true;
  }

  function spendPremiumOnProfile(profile, amount) {
    if (profile.premium < amount) return false;
    profile.premium -= amount;
    return true;
  }

  // Обёртки над «текущим» сохранённым профилем — удобны для вызова
  // из UI без ручной load/save возни.
  function spendShards(amount) {
    const p = getProfile();
    if (!spendShardsOnProfile(p, amount)) return false;
    saveProfile(p);
    return true;
  }

  function spendPremium(amount) {
    const p = getProfile();
    if (!spendPremiumOnProfile(p, amount)) return false;
    saveProfile(p);
    return true;
  }

  function getStatLevel(key) {
    const p = getProfile();
    return p.stats[key] || 1;
  }

  function getStatUpgradeCost(currentLevel) {
    return 80 + currentLevel * 70;
  }

  function upgradeStat(key) {
    if (STAT_KEYS.indexOf(key) === -1) return { success: false, reason: 'badKey' };
    const p = getProfile();
    const lvl = p.stats[key] || 1;
    if (lvl >= STAT_MAX) return { success: false, reason: 'maxed' };
    const cost = getStatUpgradeCost(lvl);
    if (!spendShardsOnProfile(p, cost)) return { success: false, reason: 'notEnoughShards', cost };
    p.stats[key] = lvl + 1;
    saveProfile(p);
    return { success: true, newLevel: p.stats[key], cost };
  }

  // Множители, применяемые к игроку пользователя в матче на основе прокачки.
  function computeStatMultipliers() {
    const p = getProfile();
    const s = p.stats;
    return {
      speedMult: 1 + (s.speed - 1) * 0.035,
      accelMult: 1 + (s.accel - 1) * 0.05,
      shotMult: 1 + (s.shot - 1) * 0.045,
      dashCooldownMult: 1 - (s.dash - 1) * 0.05
    };
  }

  function checkAchievements(profile, matchCtx) {
    const unlocked = [];
    // одноразовое достижение за серию в конкретном матче (не кумулятивное)
    if (matchCtx && matchCtx.bestCombo > profile.careerTotals.bestComboEver) {
      profile.careerTotals.bestComboEver = matchCtx.bestCombo;
    }
    for (const a of ACHIEVEMENTS) {
      if (profile.achievements[a.id]) continue;
      if (a.check(profile)) {
        profile.achievements[a.id] = true;
        addShards(profile, a.reward);
        unlocked.push(a);
      }
    }
    return unlocked;
  }

  // Итог одного матча: считает XP/шарды, апдейтит карьерную статистику,
  // достижения, уровень. Вызывается один раз в конце матча.
  function recordMatchResult({ result, homeGoals, overdriveShotsUsed, bestCombo, leagueCompleted }) {
    const p = getProfile();

    let xp = 40, shards = 30;
    if (result === 'win') { xp += 50; shards += 40; p.careerTotals.wins += 1; }
    else if (result === 'draw') { xp += 20; shards += 15; p.careerTotals.draws += 1; }
    else { xp += 10; shards += 5; p.careerTotals.losses += 1; }

    xp += homeGoals * 15;
    shards += homeGoals * 10;
    xp += overdriveShotsUsed * 10;
    shards += overdriveShotsUsed * 8;
    xp += Math.max(0, bestCombo - 2) * 2;

    p.careerTotals.matches += 1;
    p.careerTotals.goals += homeGoals;
    p.careerTotals.overdriveShots += overdriveShotsUsed;
    if (leagueCompleted) p.careerTotals.leaguesCompleted += 1;

    const levelResult = addXP(p, xp);
    addShards(p, shards);

    const newAchievements = checkAchievements(p, { bestCombo });

    saveProfile(p);

    return {
      xpGained: xp, shardsGained: shards,
      leveledUp: levelResult.leveledUp, newLevel: levelResult.newLevel,
      unlockedSkins: levelResult.unlockedSkins,
      newAchievements
    };
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function claimDailyBonus() {
    const p = getProfile();
    const today = todayKey();
    if (p.lastDailyClaim === today) {
      return { claimed: false, alreadyClaimedToday: true, streak: p.dailyStreak };
    }
    p.dailyStreak = (p.lastDailyClaim === yesterdayKey()) ? p.dailyStreak + 1 : 1;
    const amount = 30 + Math.min(p.dailyStreak, 7) * 10;
    addShards(p, amount);
    p.lastDailyClaim = today;
    saveProfile(p);
    return { claimed: true, amount, streak: p.dailyStreak };
  }

  function canClaimDailyBonus() {
    const p = getProfile();
    return p.lastDailyClaim !== todayKey();
  }

  return {
    STAT_KEYS, STAT_MAX, STAT_LABEL, ACHIEVEMENTS,
    getProfile, saveProfile, defaultProfile,
    xpForLevel, addXP, addShards, addPremium,
    spendShards, spendPremium,
    getStatLevel, getStatUpgradeCost, upgradeStat, computeStatMultipliers,
    recordMatchResult, claimDailyBonus, canClaimDailyBonus
  };
})();
