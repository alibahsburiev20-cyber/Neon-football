// ============================================================
// ui.js — управление экранами, настройками, баннерами, результатом,
// составом/позицией, выбором лиги, профилем и турниром.
// Связывает DOM-интерфейс с модулями Match / Career / Progression /
// Skins / Squad / Tournament / Shop / HUDLayout.
// ============================================================

const UI = (() => {

  let settings = {
    volume: 70,
    difficulty: 'normal',
    shake: 'on',
    duration: '180',
    autoSwitch: 'on'
  };

  let currentMode = null; // 'quick' | 'career' | 'training' | 'tournament'
  let comboHideTimeout = null;
  let toastQueue = [];
  let toastBusy = false;
  let pendingCircuitId = null;

  function loadSettings() {
    settings = Utils.storage.get('ncfc_settings', settings);
    document.getElementById('set-volume').value = settings.volume;
    setSegActive('set-difficulty', settings.difficulty);
    setSegActive('set-shake', settings.shake);
    setSegActive('set-duration', settings.duration);
    setSegActive('set-autoswitch', settings.autoSwitch);
    AudioEngine.setVolume(settings.volume / 100);

    document.getElementById('set-player-name').value = Tournament.getPlayerName();
    document.getElementById('set-tournament-url').value = Tournament.getBackendUrl();
    updateTournamentHint();
  }

  function saveSettings() {
    Utils.storage.set('ncfc_settings', settings);
  }

  function updateTournamentHint() {
    document.getElementById('tournament-status-hint').textContent = Tournament.isOnline()
      ? 'Сейчас: онлайн-режим (' + Tournament.getBackendUrl() + ')'
      : 'Сейчас: локальный офлайн-режим (задеплой Worker, см. /server)';
  }

  function setSegActive(groupId, val) {
    const group = document.getElementById(groupId);
    group.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === String(val));
    });
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function showOverlay(id) {
    document.getElementById(id).classList.add('active');
  }

  function hideOverlay(id) {
    document.getElementById(id).classList.remove('active');
  }

  function updateBestStreakDisplay() {
    document.getElementById('best-streak-val').textContent = Career.getBestStreak();
  }

  function updateCareerCardTitle() {
    document.getElementById('card-career-title').textContent = Career.getLeagueName();
  }

  function flashCombo(count) {
    const el = document.getElementById('hud-combo');
    document.getElementById('combo-count').textContent = count;
    el.classList.add('show');
    clearTimeout(comboHideTimeout);
    comboHideTimeout = setTimeout(() => el.classList.remove('show'), 1400);
  }

  function showGoalBanner(scorerName) {
    const banner = document.getElementById('goal-banner');
    document.getElementById('goal-banner-sub').textContent = scorerName.toUpperCase();
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 1500);
  }

  // ---- Toast (очередь, чтобы уведомления не перекрывали друг друга) ----
  function toast(message) {
    toastQueue.push(message);
    if (!toastBusy) processToastQueue();
  }

  function processToastQueue() {
    if (toastQueue.length === 0) { toastBusy = false; return; }
    toastBusy = true;
    const el = document.getElementById('toast');
    el.textContent = toastQueue.shift();
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(processToastQueue, 220);
    }, 2200);
  }

  // ---- SQUAD (позиция + скин) ----
  function renderPositionGrid() {
    const grid = document.getElementById('position-grid');
    grid.innerHTML = '';
    const current = Squad.getPreferredPosition();
    for (const choice of Squad.POSITION_CHOICES) {
      const btn = document.createElement('button');
      btn.className = 'position-btn' + (choice.role === current ? ' active' : '');
      btn.textContent = choice.label;
      btn.addEventListener('click', () => {
        Squad.setPreferredPosition(choice.role);
        renderPositionGrid();
        AudioEngine.sfxMenuConfirm();
      });
      grid.appendChild(btn);
    }
  }

  function renderSquadSkinPreview() {
    const profile = Progression.getProfile();
    const skin = Skins.byId(Skins.getEquipped(profile));
    document.getElementById('squad-skin-name').textContent = skin.name;
    const swatch = document.getElementById('squad-skin-swatch');
    swatch.style.background = skin.prism
      ? 'linear-gradient(90deg, #ff3d5a, #ffc857, #39ff8a, #00f0ff, #b23dff)'
      : skin.color;
  }

  // ---- LEAGUE SELECT ----
  function renderCircuitList() {
    pendingCircuitId = Career.getSelectedCircuitId();
    const wrap = document.getElementById('circuit-list');
    wrap.innerHTML = '';
    for (const circuit of Career.getCircuitList()) {
      const progress = Career.getProgress(circuit.id);
      const best = Career.getBestStreak(circuit.id);
      const card = document.createElement('button');
      card.className = 'circuit-card' + (circuit.id === pendingCircuitId ? ' active' : '');
      card.innerHTML = `
        <div class="circuit-name">${circuit.tierLabel}</div>
        <div class="circuit-progress">ЭТАП ${progress.stage + 1}/${circuit.opponents.length} · ЛУЧШАЯ СЕРИЯ ${best}</div>
      `;
      card.addEventListener('click', () => {
        pendingCircuitId = circuit.id;
        renderCircuitList();
        AudioEngine.sfxMenuConfirm();
      });
      wrap.appendChild(card);
    }
    document.getElementById('set-league-name').value = Career.getLeagueName();
  }

  // ---- PROFILE ----
  function renderProfile() {
    const p = Progression.getProfile();
    document.getElementById('profile-level').textContent = p.level;
    const need = Progression.xpForLevel(p.level);
    document.getElementById('profile-xp-fill').style.width = Utils.clamp((p.xp / need) * 100, 0, 100) + '%';
    document.getElementById('profile-xp-text').textContent = `${p.xp} / ${need} XP`;

    const totals = document.getElementById('profile-totals');
    const t = p.careerTotals;
    totals.innerHTML = `
      <div class="profile-stat"><span>${t.matches}</span>МАТЧЕЙ</div>
      <div class="profile-stat"><span>${t.wins}</span>ПОБЕД</div>
      <div class="profile-stat"><span>${t.goals}</span>ГОЛОВ</div>
      <div class="profile-stat"><span>${t.overdriveShots}</span>OVERCLOCK-УДАРОВ</div>
    `;

    const list = document.getElementById('achievements-list');
    list.innerHTML = '';
    for (const a of Progression.ACHIEVEMENTS) {
      const done = !!p.achievements[a.id];
      const row = document.createElement('div');
      row.className = 'achievement-row' + (done ? ' done' : '');
      row.innerHTML = `
        <div class="achievement-name">${done ? '✓ ' : ''}${a.name}</div>
        <div class="achievement-desc">${a.desc} · +${a.reward} ⬡</div>
      `;
      list.appendChild(row);
    }
  }

  // ---- MATCH START ----
  function startMatch(mode) {
    currentMode = mode;
    AudioEngine.ensureCtx();

    let config = {
      duration: parseInt(settings.duration, 10),
      difficulty: settings.difficulty,
      shakeEnabled: settings.shake === 'on',
      autoSwitch: settings.autoSwitch !== 'off',
      homeName: 'ТЫ',
      awayName: 'CPU',
      modeLabel: ''
    };

    if (mode === 'quick') {
      config.modeLabel = 'БЫСТРЫЙ МАТЧ';
      config.awayName = 'CPU';
    } else if (mode === 'training') {
      config.modeLabel = 'ТРЕНИРОВКА';
      config.duration = 999999;
      config.difficulty = 'easy';
      config.awayName = 'МАНЕКЕН';
    } else if (mode === 'career') {
      const opp = Career.getCurrentOpponent();
      config.modeLabel = `${Career.getLeagueName()} · ${opp.tierLabel} ${opp.stageIndex + 1}/${opp.totalStages}`;
      config.awayName = opp.name;
      config.difficulty = opp.difficulty;
      config.duration = opp.duration;
    } else if (mode === 'tournament') {
      config.modeLabel = 'ОНЛАЙН ТУРНИР';
      config.awayName = 'TOURNAMENT.NODE';
      config.difficulty = 'hard';
      config.duration = 150;
    }

    showScreen('screen-game');
    Match.init(config);
  }

  function showResult(state) {
    const headline = document.getElementById('result-headline');
    const scoreEl = document.getElementById('result-score');
    const note = document.getElementById('result-league-note');
    const levelupEl = document.getElementById('result-levelup');
    const tournamentEl = document.getElementById('result-tournament');
    levelupEl.textContent = '';
    tournamentEl.textContent = '';

    let resultType = 'draw';
    if (state.scoreHome > state.scoreAway) resultType = 'win';
    else if (state.scoreHome < state.scoreAway) resultType = 'lose';

    headline.textContent = resultType === 'win' ? 'ПОБЕДА' : resultType === 'lose' ? 'ПОРАЖЕНИЕ' : 'НИЧЬЯ';
    headline.className = 'result-headline' + (resultType === 'lose' ? ' lose' : resultType === 'draw' ? ' draw' : '');
    scoreEl.textContent = `${state.scoreHome} : ${state.scoreAway}`;

    document.getElementById('stat-bestcombo').textContent = state.bestCombo;
    document.getElementById('stat-overclocks').textContent = state.overdriveShotsUsed;
    document.getElementById('stat-shots').textContent = state.totalShots;

    note.textContent = '';
    const nextBtn = document.getElementById('btn-result-next');
    let leagueCompleted = false;

    if (currentMode === 'career') {
      if (resultType === 'win') {
        const advanceResult = Career.advance();
        leagueCompleted = advanceResult.leagueCompleted;
        if (advanceResult.leagueCompleted) {
          note.textContent = `${Career.getLeagueName()} ПРОЙДЕНА ПОЛНОСТЬЮ! Начни заново с первого соперника.`;
        } else {
          const nextOpp = Career.getCurrentOpponent();
          note.textContent = `Следующий соперник: ${nextOpp.name}`;
        }
        nextBtn.textContent = 'ДАЛЬШЕ';
        nextBtn.dataset.action = 'continue-career';
      } else {
        Career.resetProgress();
        note.textContent = `${Career.getLeagueName()} начинается заново с первого соперника.`;
        nextBtn.textContent = 'НАЧАТЬ ЛИГУ СНОВА';
        nextBtn.dataset.action = 'restart-career';
      }
      updateBestStreakDisplay();
    } else if (currentMode === 'tournament') {
      nextBtn.textContent = 'ЕЩЁ РАЗ';
      nextBtn.dataset.action = 'replay';
      const score = Tournament.computeScore(state);
      tournamentEl.textContent = `ОЧКИ: ${score} · отправка результата…`;
      Tournament.submitScore(score).then(res => {
        tournamentEl.textContent = `ОЧКИ: ${score} · МЕСТО В РЕЙТИНГЕ: ${res.rank}` + (res.local ? ' (локально)' : '');
      });
    } else {
      nextBtn.textContent = 'ИГРАТЬ СНОВА';
      nextBtn.dataset.action = 'replay';
    }

    // Прогрессия: XP/шарды за матч (тренировка не считается)
    if (currentMode !== 'training') {
      const rewards = Progression.recordMatchResult({
        result: resultType === 'win' ? 'win' : resultType === 'draw' ? 'draw' : 'loss',
        homeGoals: state.scoreHome,
        overdriveShotsUsed: state.overdriveShotsUsed,
        bestCombo: state.bestCombo,
        leagueCompleted
      });
      document.getElementById('reward-xp').textContent = rewards.xpGained;
      document.getElementById('reward-shards').textContent = rewards.shardsGained;
      const bits = [];
      if (rewards.leveledUp) bits.push(`НОВЫЙ УРОВЕНЬ: ${rewards.newLevel}`);
      if (rewards.unlockedSkins.length) bits.push('РАЗБЛОКИРОВАН СКИН: ' + rewards.unlockedSkins.map(id => Skins.byId(id).name).join(', '));
      if (rewards.newAchievements.length) bits.push('ДОСТИЖЕНИЕ: ' + rewards.newAchievements.map(a => a.name).join(', '));
      levelupEl.textContent = bits.join(' · ');
    } else {
      document.getElementById('reward-xp').textContent = '0';
      document.getElementById('reward-shards').textContent = '0';
    }

    showOverlay('screen-result');
  }

  function bindEvents() {
    // Menu cards
    document.getElementById('card-quick').addEventListener('click', () => { AudioEngine.sfxMenuConfirm(); startMatch('quick'); });
    document.getElementById('card-training').addEventListener('click', () => { AudioEngine.sfxMenuConfirm(); startMatch('training'); });
    document.getElementById('card-tournament').addEventListener('click', () => { AudioEngine.sfxMenuConfirm(); startMatch('tournament'); });
    document.getElementById('card-career').addEventListener('click', () => {
      AudioEngine.sfxMenuConfirm();
      renderCircuitList();
      showOverlay('screen-league-select');
    });

    document.querySelectorAll('.menu-card').forEach(c => {
      c.addEventListener('mouseenter', () => AudioEngine.sfxMenuHover());
    });

    // League select
    document.getElementById('btn-league-close').addEventListener('click', () => hideOverlay('screen-league-select'));
    document.getElementById('set-league-name').addEventListener('change', (e) => {
      Career.setLeagueName(e.target.value);
      e.target.value = Career.getLeagueName();
      updateCareerCardTitle();
    });
    document.getElementById('btn-league-start').addEventListener('click', () => {
      Career.setSelectedCircuitId(pendingCircuitId || Career.getSelectedCircuitId());
      hideOverlay('screen-league-select');
      startMatch('career');
    });

    // Squad
    document.getElementById('btn-squad').addEventListener('click', () => {
      renderPositionGrid();
      renderSquadSkinPreview();
      showOverlay('screen-squad');
    });
    document.getElementById('btn-squad-close').addEventListener('click', () => hideOverlay('screen-squad'));
    document.getElementById('btn-squad-open-shop').addEventListener('click', () => {
      hideOverlay('screen-squad');
      Shop.open();
    });

    // Shop / Profile entry points from menu
    document.getElementById('btn-shop-open').addEventListener('click', () => Shop.open());
    document.getElementById('btn-profile').addEventListener('click', () => { renderProfile(); showOverlay('screen-profile'); });
    document.getElementById('btn-profile-close').addEventListener('click', () => hideOverlay('screen-profile'));

    // Settings
    document.getElementById('btn-settings').addEventListener('click', () => showOverlay('screen-settings'));
    document.getElementById('btn-settings-close').addEventListener('click', () => { saveSettings(); hideOverlay('screen-settings'); });

    document.getElementById('set-volume').addEventListener('input', (e) => {
      settings.volume = parseInt(e.target.value, 10);
      AudioEngine.setVolume(settings.volume / 100);
    });

    document.getElementById('set-difficulty').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      settings.difficulty = btn.dataset.val;
      setSegActive('set-difficulty', settings.difficulty);
    });
    document.getElementById('set-shake').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      settings.shake = btn.dataset.val;
      setSegActive('set-shake', settings.shake);
      Renderer.setShakeEnabled(settings.shake === 'on');
    });
    document.getElementById('set-duration').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      settings.duration = btn.dataset.val;
      setSegActive('set-duration', settings.duration);
    });
    document.getElementById('set-autoswitch').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      settings.autoSwitch = btn.dataset.val;
      setSegActive('set-autoswitch', settings.autoSwitch);
    });
    document.getElementById('set-player-name').addEventListener('change', (e) => {
      Tournament.setPlayerName(e.target.value);
      e.target.value = Tournament.getPlayerName();
    });
    document.getElementById('set-tournament-url').addEventListener('change', (e) => {
      Tournament.setBackendUrl(e.target.value);
      updateTournamentHint();
    });

    document.getElementById('btn-open-hud-editor').addEventListener('click', () => {
      saveSettings();
      hideOverlay('screen-settings');
      HUDLayout.openEditor();
    });
    document.getElementById('btn-hud-mirror').addEventListener('click', () => {
      HUDLayout.editorSetMirrored(!document.body.classList.contains('controls-mirrored'));
    });
    document.getElementById('btn-hud-reset').addEventListener('click', () => HUDLayout.editorReset());
    document.getElementById('btn-hud-done').addEventListener('click', () => HUDLayout.closeEditor(true));

    // How to play
    document.getElementById('btn-howto').addEventListener('click', () => showOverlay('screen-howto'));
    document.getElementById('btn-howto-close').addEventListener('click', () => hideOverlay('screen-howto'));

    // Pause
    document.getElementById('btn-pause').addEventListener('click', () => {
      Match.setPaused(true);
      showOverlay('screen-pause');
    });
    document.getElementById('btn-resume').addEventListener('click', () => {
      hideOverlay('screen-pause');
      Match.setPaused(false);
    });
    document.getElementById('btn-restart').addEventListener('click', () => {
      hideOverlay('screen-pause');
      Match.destroy();
      startMatch(currentMode);
    });
    document.getElementById('btn-quit-menu').addEventListener('click', () => {
      hideOverlay('screen-pause');
      Match.destroy();
      goToMenu();
    });

    // Result
    document.getElementById('btn-result-next').addEventListener('click', (e) => {
      hideOverlay('screen-result');
      const action = e.target.dataset.action;
      Match.destroy();
      if (action === 'continue-career' || action === 'restart-career') {
        startMatch('career');
      } else {
        startMatch(currentMode);
      }
    });
    document.getElementById('btn-result-menu').addEventListener('click', () => {
      hideOverlay('screen-result');
      Match.destroy();
      goToMenu();
    });
  }

  function goToMenu() {
    showScreen('screen-menu');
    updateBestStreakDisplay();
    updateCareerCardTitle();
    MenuBackground.start();
  }

  function init() {
    loadSettings();
    bindEvents();
    updateBestStreakDisplay();
    updateCareerCardTitle();
  }

  return { init, showScreen, showOverlay, hideOverlay, showResult, flashCombo, showGoalBanner, goToMenu, startMatch, toast };
})();
