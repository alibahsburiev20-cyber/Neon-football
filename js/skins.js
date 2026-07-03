// ============================================================
// skins.js — каталог скинов игроков, разблокировки, разрешение
// цвета для рендера (включая анимированный "призматический" скин).
// ============================================================

const Skins = (() => {

  // unlock.type: 'free' | 'level' | 'shards' | 'premium'
  const CATALOG = [
    { id: 'home_default',    name: 'СИНИЙ ПРОТОКОЛ',  color: '#00F0FF', tier: 'starter',   unlock: { type: 'free' } },
    { id: 'away_default',    name: 'КРАСНЫЙ СИГНАЛ',  color: '#FF3D5A', tier: 'starter',   unlock: { type: 'free' } },
    { id: 'volt_lime',       name: 'VOLT LIME',       color: '#B6FF3D', tier: 'common',    unlock: { type: 'level', level: 2 } },
    { id: 'plasma_violet',   name: 'PLASMA VIOLET',   color: '#B23DFF', tier: 'common',    unlock: { type: 'shards', cost: 400 } },
    { id: 'ice_white',       name: 'ICE WHITE',       color: '#E8F4F8', tier: 'common',    unlock: { type: 'shards', cost: 350 } },
    { id: 'solar_gold',      name: 'SOLAR GOLD',      color: '#FFC857', tier: 'rare',      unlock: { type: 'shards', cost: 900 } },
    { id: 'crimson_pulse',   name: 'CRIMSON PULSE',   color: '#FF2D6A', tier: 'rare',      unlock: { type: 'level', level: 5 } },
    { id: 'toxic_green',     name: 'TOXIC GREEN',     color: '#39FF8A', tier: 'rare',      unlock: { type: 'shards', cost: 1100 } },
    { id: 'circuit_chrome',  name: 'CIRCUIT CHROME',  color: '#8FE8FF', tier: 'epic',      unlock: { type: 'shards', cost: 2200 } },
    { id: 'nightshade',      name: 'NIGHTSHADE',      color: '#8B6BFF', tier: 'epic',      unlock: { type: 'level', level: 8 } },
    { id: 'overclock_prism', name: 'OVERCLOCK PRISM', color: '#FFFFFF', tier: 'legendary', unlock: { type: 'premium', cost: 150 }, prism: true },
  ];

  const TIER_LABEL = {
    starter: 'СТАРТОВЫЙ', common: 'ОБЫЧНЫЙ', rare: 'РЕДКИЙ', epic: 'ЭПИЧЕСКИЙ', legendary: 'ЛЕГЕНДАРНЫЙ'
  };
  const TIER_COLOR = {
    starter: '#7E97A8', common: '#7EC8FF', rare: '#B23DFF', epic: '#FFC857', legendary: '#FF3D5A'
  };

  const OPPONENT_POOL = ['away_default', 'volt_lime', 'plasma_violet', 'crimson_pulse', 'toxic_green', 'ice_white'];

  function byId(id) {
    return CATALOG.find(s => s.id === id) || CATALOG[0];
  }

  function getCatalog() { return CATALOG; }

  function getLevelUnlocks(level) {
    return CATALOG.filter(s => s.unlock.type === 'level' && s.unlock.level === level).map(s => s.id);
  }

  function isUnlocked(id, profile) {
    const s = byId(id);
    if (s.unlock.type === 'free') return true;
    return !!(profile.unlockedSkins && profile.unlockedSkins.indexOf(id) !== -1);
  }

  function purchase(id, profile) {
    const s = byId(id);
    if (isUnlocked(id, profile)) return { success: false, reason: 'already' };
    if (s.unlock.type === 'level') return { success: false, reason: 'needsLevel', level: s.unlock.level };
    if (s.unlock.type === 'shards') {
      if (!Progression.spendShards(s.unlock.cost)) return { success: false, reason: 'notEnoughShards', cost: s.unlock.cost };
    } else if (s.unlock.type === 'premium') {
      if (!Progression.spendPremium(s.unlock.cost)) return { success: false, reason: 'notEnoughPremium', cost: s.unlock.cost };
    } else {
      return { success: false, reason: 'free' };
    }
    profile.unlockedSkins.push(id);
    Progression.saveProfile(profile);
    return { success: true };
  }

  function equip(id, profile) {
    if (!isUnlocked(id, profile)) return false;
    profile.equippedSkin = id;
    Progression.saveProfile(profile);
    return true;
  }

  function getEquipped(profile) {
    return profile.equippedSkin || 'home_default';
  }

  // Разрешение реального CSS-цвета для рендера в конкретный момент времени.
  function resolveColor(id, tNowMs) {
    const s = byId(id);
    if (s.prism) {
      const hue = (tNowMs / 18) % 360;
      return `hsl(${hue.toFixed(0)}, 92%, 62%)`;
    }
    return s.color;
  }

  function randomOpponentSkin() {
    return Utils.choice(OPPONENT_POOL);
  }

  return {
    getCatalog, byId, getLevelUnlocks, isUnlocked, purchase, equip, getEquipped,
    resolveColor, randomOpponentSkin, TIER_LABEL, TIER_COLOR
  };
})();
