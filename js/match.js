// ============================================================
// match.js — оркестрация одного матча: создание команд, главный
// игровой цикл, система OVERCLOCK/комбо, голы, таймер, статистика.
// ============================================================

const Match = (() => {

  let state = null;
  let canvas, ctx;
  let rafId = null;
  let lastTime = 0;
  let paused = false;

  const OVERCLOCK_MAX = 100;
  const OVERCLOCK_DECAY = 4;          // в секунду, если ничего не происходит
  const OVERCLOCK_TOUCH_GAIN = 3.5;   // за каждое успешное касание/обводку
  const OVERCLOCK_TACKLE_GAIN = 14;   // за удачный силовой отбор
  const OVERCLOCK_DASH_NEAR_OPP_GAIN = 6;

  const SWITCH_HYSTERESIS = 40;

  function buildTeams(config) {
    const b = Field.getPlayBounds();
    const players = [];

    const profile = Progression.getProfile();
    const mult = Progression.computeStatMultipliers();
    const homeSkin = Skins.getEquipped(profile);
    const awaySkin = Skins.randomOpponentSkin();
    const preferredRole = Squad.getPreferredPosition();
    const userSlotIndex = Squad.firstSlotIndexForRole(preferredRole);

    const homeFormation = Squad.buildFormation(b, 'home');
    const awayFormation = Squad.buildFormation(b, 'away');

    homeFormation.forEach((slot, i) => {
      players.push(Entities.createPlayer({
        x: slot.x, y: slot.y, team: 'home',
        role: slot.entityRole,
        isUser: i === userSlotIndex,
        skinId: homeSkin,
        number: i + 1,
        statMult: mult
      }));
    });

    awayFormation.forEach((slot, i) => {
      players.push(Entities.createPlayer({
        x: slot.x, y: slot.y, team: 'away',
        role: slot.entityRole,
        skinId: awaySkin,
        number: i + 1
      }));
    });

    return players;
  }

  // Автопереключение управления на игрока home-команды, ближайшего к мячу.
  // Не переключает, пока управляемый игрок сам ведёт мяч (чтобы не терять
  // дриблинг), но мгновенно передаёт управление тому, кто только что мяч отобрал.
  // Ручное переключение (кнопка/клавиша) работает всегда, по кругу.
  function updateControlledPlayer(inputSnap) {
    const homePlayers = state.players.filter(p => p.team === 'home');
    let controlled = homePlayers.find(p => p.isUser) || homePlayers[0];

    if (state.config.autoSwitch !== false && !controlled.hasBall) {
      let best = controlled;
      let bestD = Utils.dist(controlled.x, controlled.y, state.ball.x, state.ball.y);
      for (const p of homePlayers) {
        if (p === controlled) continue;
        if (p.hasBall) { best = p; bestD = -1; break; }
        const d = Utils.dist(p.x, p.y, state.ball.x, state.ball.y);
        if (d + SWITCH_HYSTERESIS < bestD) { best = p; bestD = d; }
      }
      controlled = best;
    }

    if (inputSnap.switchPressed) {
      const idx = homePlayers.indexOf(controlled);
      controlled = homePlayers[(idx + 1) % homePlayers.length];
    }

    for (const p of homePlayers) p.isUser = (p === controlled);
  }

  function init(config) {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    const players = buildTeams(config);
    const b = Field.getPlayBounds();

    state = {
      config,
      players,
      ball: Entities.createBall(b.cx, b.cy),
      scoreHome: 0,
      scoreAway: 0,
      timeLeft: config.duration,
      matchOver: false,
      kickoffFreeze: 1.2, // небольшая заморозка перед стартом
      overclockHome: 0,
      overclockAway: 0,
      comboCount: 0,
      comboTimer: 0,
      bestCombo: 0,
      overdriveShotsUsed: 0,
      shotsOnTarget: 0,
      totalShots: 0,
      lastPossessionTeam: null,
      goalFlashTimer: 0,
      paused: false,
    };

    Particles.clear();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    document.getElementById('hud-mode-label').textContent = config.modeLabel || '';
    document.getElementById('hud-home-name').textContent = config.homeName || 'ТЫ';
    document.getElementById('hud-away-name').textContent = config.awayName || 'CPU';
    updateScoreHUD();
    updateClockHUD();

    InputSystem.showTouchControls(InputSystem.isTouchDevice());
    Renderer.setShakeEnabled(config.shakeEnabled !== false);

    AudioEngine.sfxWhistleStart();

    lastTime = performance.now();
    if (rafId) cancelAnimationFrame(rafId);
    paused = false;
    rafId = requestAnimationFrame(loop);
  }

  function resizeCanvas() {
    Utils.fitCanvasToScreen(canvas);
  }

  function updateScoreHUD() {
    document.getElementById('hud-home-score').textContent = state.scoreHome;
    document.getElementById('hud-away-score').textContent = state.scoreAway;
  }

  function updateClockHUD() {
    document.getElementById('hud-clock').textContent = Utils.formatClock(state.timeLeft);
  }

  function setPaused(v) {
    paused = v;
    state.paused = v;
    if (!v) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(loop);
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function loop(now) {
    if (paused) return;
    const dt = Math.min((now - lastTime) / 1000, 0.034);
    lastTime = now;

    update(dt);
    render();

    if (!state.matchOver) {
      rafId = requestAnimationFrame(loop);
    }
  }

  function addOverclock(team, amount) {
    if (team === 'home') {
      state.overclockHome = Utils.clamp(state.overclockHome + amount, 0, OVERCLOCK_MAX);
    } else {
      state.overclockAway = Utils.clamp(state.overclockAway + amount, 0, OVERCLOCK_MAX);
    }
  }

  function bumpCombo() {
    state.comboCount += 1;
    state.comboTimer = 2.2;
    state.bestCombo = Math.max(state.bestCombo, state.comboCount);
    AudioEngine.sfxComboTick(state.comboCount);
    UI.flashCombo(state.comboCount);
  }

  function resetCombo() {
    if (state.comboCount > 2) {
      // небольшая награда overclock-ом за завершённую серию
      addOverclock('home', state.comboCount * 1.5);
    }
    state.comboCount = 0;
    state.comboTimer = 0;
  }

  function update(dt) {
    if (state.matchOver) return;

    Particles.update(dt);
    Renderer.updateShake(dt);

    if (state.goalFlashTimer > 0) {
      state.goalFlashTimer -= dt;
    }

    if (state.kickoffFreeze > 0) {
      state.kickoffFreeze -= dt;
      // во время заморозки игроки/мяч не двигаются, но рендерим сцену
      return;
    }

    if (!state.matchOver) {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        endMatch();
      }
      updateClockHUD();
    }

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) resetCombo();
    }

    // overclock decay
    state.overclockHome = Utils.clamp(state.overclockHome - OVERCLOCK_DECAY * dt * 0.4, 0, OVERCLOCK_MAX);
    state.overclockAway = Utils.clamp(state.overclockAway - OVERCLOCK_DECAY * dt * 0.4, 0, OVERCLOCK_MAX);

    const bounds = Field.getPlayBounds();
    const goals = Field.getGoals();
    const inputSnap = InputSystem.poll();

    updateControlledPlayer(inputSnap);

    const userPlayer = state.players.find(p => p.isUser);
    const preset = AI.getPreset(state.config.difficulty);

    const homeHasBall = state.ball.possessedBy && state.ball.possessedBy.team === 'home';
    const awayHasBall = state.ball.possessedBy && state.ball.possessedBy.team === 'away';

    // --- движение игрока пользователя ---
    if (userPlayer) {
      const wasHasBallBefore = userPlayer.hasBall;
      const dashStarted = Physics.updatePlayerMovement(userPlayer, dt, inputSnap.moveX, inputSnap.moveY, inputSnap.wantDash && userPlayer.dashCooldown <= 0);
      if (dashStarted) {
        AudioEngine.sfxDash();
        const nearOpp = state.players.find(p => p.team !== 'home' && Utils.dist(p.x, p.y, userPlayer.x, userPlayer.y) < 70);
        if (nearOpp) addOverclock('home', OVERCLOCK_DASH_NEAR_OPP_GAIN);
      }

      // удар
      if (userPlayer.hasBall && userPlayer.kickCooldown <= 0) {
        if (inputSnap.kickReleased) {
          const power = Utils.clamp(inputSnap.holdDuration / 450, 0, 1);
          Physics.kickBall(state.ball, userPlayer, power);
          state.totalShots += isShotOnGoal(userPlayer) ? 1 : 0;
          if (power > 0.55) { AudioEngine.sfxPowerKick(); Renderer.triggerShake(4, 0.15); }
          else AudioEngine.sfxKick();
          Particles.burst(state.ball.x, state.ball.y, 8, { color: '#00F0FF', minSpeed: 30, maxSpeed: 120, shape: 'spark' });
        }
      }

      // овердрайв
      if (inputSnap.overdrivePressed && userPlayer.hasBall && state.overclockHome >= OVERCLOCK_MAX - 0.01 && userPlayer.kickCooldown <= 0) {
        Physics.kickBall(state.ball, userPlayer, 1, true);
        state.overclockHome = 0;
        state.overdriveShotsUsed += 1;
        AudioEngine.sfxOverdrive();
        Renderer.triggerShake(7, 0.25);
        Particles.burst(state.ball.x, state.ball.y, 22, { color: '#FFC857', minSpeed: 60, maxSpeed: 260, shape: 'spark', maxLife: 0.5 });
      }
    }

    // --- AI для остальных ---
    for (const p of state.players) {
      if (p.isUser) continue;
      const teamHasBall = (p.team === 'home' && homeHasBall) || (p.team === 'away' && awayHasBall);
      const decision = AI.decide(p, {
        ball: state.ball, allPlayers: state.players, bounds, goals, dt, preset,
        teamHasBall, awayOverclockReady: state.overclockAway >= OVERCLOCK_MAX - 0.01
      });

      if (p.role === 'gk') {
        const dashed = Physics.updatePlayerMovement(p, dt, decision.moveX, decision.moveY, false);
        Physics.clampGKToBox(p, bounds, p.team === 'home' ? 'left' : 'right');
      } else {
        Physics.updatePlayerMovement(p, dt, decision.moveX, decision.moveY, decision.wantDash);
        Physics.clampPlayerToBounds(p, bounds);
      }

      if (p.hasBall && p.kickCooldown <= 0 && decision.wantKick) {
        if (decision.wantOverdrive && p.team === 'away' && state.overclockAway >= OVERCLOCK_MAX - 0.01) {
          Physics.kickBall(state.ball, p, 1, true);
          state.overclockAway = 0;
          AudioEngine.sfxOverdrive();
          Renderer.triggerShake(7, 0.25);
        } else {
          const power = decision.wantPower ? Utils.rand(0.7, 1) * preset.kickAccuracy : Utils.rand(0.3, 0.6);
          Physics.kickBall(state.ball, p, power);
          if (power > 0.6) AudioEngine.sfxKick();
        }
      }
    }

    // clamp gk также для home (на случай AI отсутствия пользователя за GK — не требуется, но безопасно)
    for (const p of state.players) {
      if (p.role === 'gk') Physics.clampGKToBox(p, bounds, p.team === 'home' ? 'left' : 'right');
      else Physics.clampPlayerToBounds(p, bounds);
    }

    // --- столкновения игроков ---
    const collisionResult = Physics.resolvePlayerCollisions(state.players);
    if (collisionResult.tackleHappened) {
      AudioEngine.sfxTackle();
      Renderer.triggerShake(3, 0.12);
      Particles.burst(collisionResult.loser.x, collisionResult.loser.y, 6, { color: '#7E97A8', minSpeed: 20, maxSpeed: 80, shape: 'circle' });
      if (collisionResult.winner.isUser) {
        addOverclock('home', OVERCLOCK_TACKLE_GAIN);
        bumpCombo();
      }
    }

    // --- мяч ---
    const prevPossessor = state.ball.possessedBy;
    const bounced = Physics.updateBall(state.ball, dt, bounds, goals);
    if (bounced) AudioEngine.sfxBounce();

    const stealCandidate = Physics.updatePossession(state.ball, state.players);

    // детект "успешного касания/обводки" пользователем для комбо
    if (state.ball.possessedBy && state.ball.possessedBy.isUser) {
      if (prevPossessor !== state.ball.possessedBy) {
        // только что получил мяч — если до этого был у соперника, это "отбор/обводка"
        if (prevPossessor && prevPossessor.team === 'away') {
          addOverclock('home', OVERCLOCK_TOUCH_GAIN * 2);
          bumpCombo();
        }
      }
    }

    if (state.ball.overdriveActive) {
      state.ball.overdriveTimer -= dt;
      if (state.ball.overdriveTimer <= 0) state.ball.overdriveActive = false;
      Particles.trail(state.ball.x, state.ball.y, state.ball.vx, state.ball.vy, '#FFC857');
    } else if (Utils.vecLen(state.ball.vx, state.ball.vy) > 200) {
      Particles.trail(state.ball.x, state.ball.y, state.ball.vx, state.ball.vy, '#00F0FF');
    }

    // overclock full sfx trigger (раз при достижении)
    handleOverclockFullSound();

    // --- проверка гола ---
    const goalTeam = Physics.checkGoal(state.ball, goals);
    if (goalTeam) {
      handleGoal(goalTeam);
    }

    updateOverclockHUD();
  }

  let homeWasFull = false, awayWasFull = false;
  function handleOverclockFullSound() {
    const homeFull = state.overclockHome >= OVERCLOCK_MAX - 0.01;
    if (homeFull && !homeWasFull) AudioEngine.sfxOverclockFull();
    homeWasFull = homeFull;
    const awayFull = state.overclockAway >= OVERCLOCK_MAX - 0.01;
    awayWasFull = awayFull;
  }

  function isShotOnGoal(player) {
    // упрощённая проверка: считаем удар "по воротам", если игрок смотрит в сторону чужих ворот в разумном секторе
    return true;
  }

  function handleGoal(team) {
    if (team === 'home') state.scoreHome += 1; else state.scoreAway += 1;
    state.shotsOnTarget += 1;
    updateScoreHUD();
    AudioEngine.sfxGoal();
    Renderer.triggerShake(10, 0.4);
    Particles.burst(state.ball.x, state.ball.y, 40, {
      color: team === 'home' ? '#00F0FF' : '#FF3D5A',
      minSpeed: 80, maxSpeed: 320, shape: 'spark', maxLife: 0.9
    });
    resetCombo();

    UI.showGoalBanner(team === 'home' ? (state.config.homeName || 'ТЫ') : (state.config.awayName || 'CPU'));

    // ресет позиций и заморозка
    const b = Field.getPlayBounds();
    state.ball.x = b.cx; state.ball.y = b.cy;
    state.ball.vx = 0; state.ball.vy = 0;
    state.ball.overdriveActive = false;
    resetPlayerPositions();
    state.kickoffFreeze = 1.4;
  }

  function resetPlayerPositions() {
    const b = Field.getPlayBounds();
    const homeFormation = Squad.buildFormation(b, 'home');
    const awayFormation = Squad.buildFormation(b, 'away');
    const homePlayers = state.players.filter(p => p.team === 'home');
    const awayPlayers = state.players.filter(p => p.team === 'away');
    homePlayers.forEach((p, i) => {
      const s = homeFormation[i];
      p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0; p.ai.homeX = s.x; p.ai.homeY = s.y;
    });
    awayPlayers.forEach((p, i) => {
      const s = awayFormation[i];
      p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0; p.ai.homeX = s.x; p.ai.homeY = s.y;
    });
  }

  function updateOverclockHUD() {
    const fill = document.getElementById('overclock-fill');
    const pct = state.overclockHome;
    fill.style.width = pct + '%';
    fill.classList.toggle('full', pct >= OVERCLOCK_MAX - 0.01);
  }

  function endMatch() {
    state.matchOver = true;
    AudioEngine.sfxWhistleEnd();
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    window.removeEventListener('resize', resizeCanvas);
    UI.showResult(state);
  }

  function render() {
    const viewport = Renderer.computeViewport(canvas.clientWidth, canvas.clientHeight);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    Renderer.drawScene(ctx, viewport, state);
  }

  function getState() { return state; }

  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener('resize', resizeCanvas);
  }

  return { init, setPaused, getState, destroy, OVERCLOCK_MAX };
})();
