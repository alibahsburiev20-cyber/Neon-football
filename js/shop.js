// ============================================================
// shop.js — экран МАГАЗИН: скины, прокачка статов, валюта.
// Работает поверх Progression (валюты/статы) и Skins (каталог).
// ============================================================

const Shop = (() => {

  let activeTab = 'skins';

  function init() {
    document.querySelectorAll('#screen-shop .shop-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });
    document.getElementById('btn-shop-close').addEventListener('click', () => {
      UI.hideOverlay('screen-shop');
    });
    document.getElementById('btn-claim-daily').addEventListener('click', () => {
      const res = Progression.claimDailyBonus();
      renderCurrencyTab();
      if (res.claimed) {
        UI.toast(`ЕЖЕДНЕВНЫЙ БОНУС +${res.amount} SHARDS (серия ${res.streak} дн.)`);
      }
    });
    document.getElementById('btn-topup-premium').addEventListener('click', () => {
      UI.toast('Пополнение OC-КРЕДИТОВ через GRAM появится в ближайшем обновлении.');
    });
  }

  function open() {
    UI.showOverlay('screen-shop');
    render();
  }

  function render() {
    document.querySelectorAll('#screen-shop .shop-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
    });
    document.querySelectorAll('#screen-shop .shop-panel').forEach(p => {
      p.classList.toggle('active', p.id === `shop-panel-${activeTab}`);
    });
    if (activeTab === 'skins') renderSkinsTab();
    else if (activeTab === 'stats') renderStatsTab();
    else renderCurrencyTab();
    renderBalances();
  }

  function renderBalances() {
    const p = Progression.getProfile();
    document.querySelectorAll('.shop-balance-shards').forEach(el => el.textContent = p.shards);
    document.querySelectorAll('.shop-balance-premium').forEach(el => el.textContent = p.premium);
    document.querySelectorAll('.shop-balance-level').forEach(el => el.textContent = p.level);
  }

  function renderSkinsTab() {
    const profile = Progression.getProfile();
    const grid = document.getElementById('shop-skins-grid');
    grid.innerHTML = '';
    for (const skin of Skins.getCatalog()) {
      const unlocked = Skins.isUnlocked(skin.id, profile);
      const equipped = profile.equippedSkin === skin.id;
      const card = document.createElement('div');
      card.className = 'skin-card' + (unlocked ? '' : ' locked') + (equipped ? ' equipped' : '');

      const swatch = document.createElement('div');
      swatch.className = 'skin-swatch';
      swatch.style.background = skin.prism
        ? 'linear-gradient(90deg, #ff3d5a, #ffc857, #39ff8a, #00f0ff, #b23dff)'
        : skin.color;
      card.appendChild(swatch);

      const name = document.createElement('div');
      name.className = 'skin-name';
      name.textContent = skin.name;
      card.appendChild(name);

      const tier = document.createElement('div');
      tier.className = 'skin-tier';
      tier.textContent = Skins.TIER_LABEL[skin.tier];
      tier.style.color = Skins.TIER_COLOR[skin.tier];
      card.appendChild(tier);

      const action = document.createElement('button');
      action.className = 'skin-action-btn';
      if (equipped) {
        action.textContent = 'НАДЕТО';
        action.disabled = true;
      } else if (unlocked) {
        action.textContent = 'НАДЕТЬ';
        action.addEventListener('click', () => { Skins.equip(skin.id, profile); render(); });
      } else if (skin.unlock.type === 'level') {
        action.textContent = `УР. ${skin.unlock.level}`;
        action.disabled = true;
      } else if (skin.unlock.type === 'shards') {
        action.textContent = `${skin.unlock.cost} ⬡`;
        action.addEventListener('click', () => {
          const res = Skins.purchase(skin.id, profile);
          if (res.success) { UI.toast(`СКИН РАЗБЛОКИРОВАН: ${skin.name}`); render(); }
          else if (res.reason === 'notEnoughShards') UI.toast('НЕДОСТАТОЧНО SHARDS');
        });
      } else if (skin.unlock.type === 'premium') {
        action.textContent = `${skin.unlock.cost} ◆`;
        action.addEventListener('click', () => {
          const res = Skins.purchase(skin.id, profile);
          if (res.success) { UI.toast(`СКИН РАЗБЛОКИРОВАН: ${skin.name}`); render(); }
          else if (res.reason === 'notEnoughPremium') UI.toast('НЕДОСТАТОЧНО OC-КРЕДИТОВ — пополните в разделе ВАЛЮТА');
        });
      }
      card.appendChild(action);
      grid.appendChild(card);
    }
  }

  function renderStatsTab() {
    const profile = Progression.getProfile();
    const wrap = document.getElementById('shop-stats-list');
    wrap.innerHTML = '';
    for (const key of Progression.STAT_KEYS) {
      const lvl = profile.stats[key] || 1;
      const row = document.createElement('div');
      row.className = 'stat-row';

      const label = document.createElement('div');
      label.className = 'stat-row-label';
      label.textContent = Progression.STAT_LABEL[key];
      row.appendChild(label);

      const dots = document.createElement('div');
      dots.className = 'stat-dots';
      for (let i = 1; i <= Progression.STAT_MAX; i++) {
        const dot = document.createElement('span');
        dot.className = 'stat-dot' + (i <= lvl ? ' filled' : '');
        dots.appendChild(dot);
      }
      row.appendChild(dots);

      const btn = document.createElement('button');
      btn.className = 'stat-upgrade-btn';
      if (lvl >= Progression.STAT_MAX) {
        btn.textContent = 'МАКС.';
        btn.disabled = true;
      } else {
        const cost = Progression.getStatUpgradeCost(lvl);
        btn.textContent = `${cost} ⬡`;
        btn.addEventListener('click', () => {
          const res = Progression.upgradeStat(key);
          if (res.success) { UI.toast(`${Progression.STAT_LABEL[key]} → УР. ${res.newLevel}`); render(); }
          else if (res.reason === 'notEnoughShards') UI.toast('НЕДОСТАТОЧНО SHARDS');
        });
      }
      row.appendChild(btn);
      wrap.appendChild(row);
    }
  }

  function renderCurrencyTab() {
    const p = Progression.getProfile();
    document.getElementById('shop-daily-status').textContent = Progression.canClaimDailyBonus()
      ? `Доступен ежедневный бонус (серия: ${p.dailyStreak} дн.)`
      : `Уже получено сегодня (серия: ${p.dailyStreak} дн.)`;
    document.getElementById('btn-claim-daily').disabled = !Progression.canClaimDailyBonus();
  }

  return { init, open, render };
})();
