// ============================================================
// physics.js — движение игроков и мяча, столкновения, владение мячом,
// дэш, удары, проверка гола. Это сердце "ощущения" игры.
// ============================================================

const Physics = (() => {

  const POSSESSION_RADIUS = 26;     // дистанция, на которой игрок "ведёт" мяч
  const STEAL_RADIUS = 30;          // дистанция для отбора у владеющего мячом
  const DASH_SPEED_MULT = 2.05;
  const DASH_DURATION = 0.18;
  const DASH_COOLDOWN = 0.85;
  const KICK_COOLDOWN = 0.28;

  function updatePlayerMovement(p, dt, moveX, moveY, wantDash) {
    // moveX/moveY — нормализованный вектор направления ввода (-1..1)
    const inputLen = Utils.vecLen(moveX, moveY);

    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      if (p.dashTimer <= 0) p.isDashing = false;
    }
    if (p.dashCooldown > 0) p.dashCooldown -= dt;
    if (p.stunTimer > 0) p.stunTimer -= dt;
    if (p.kickCooldown > 0) p.kickCooldown -= dt;

    if (wantDash && p.dashCooldown <= 0 && inputLen > 0.1 && p.stunTimer <= 0) {
      p.isDashing = true;
      p.dashTimer = DASH_DURATION;
      p.dashCooldown = p.dashCooldownBase || DASH_COOLDOWN;
      return true; // сигнал что дэш начался (для звука/частиц)
    }

    if (p.stunTimer > 0) {
      // во время стана — затухающее скольжение, ввод не действует
      p.vx *= 0.9;
      p.vy *= 0.9;
    } else {
      const speedMult = p.isDashing ? DASH_SPEED_MULT : 1;
      const targetVx = moveX * p.maxSpeed * speedMult;
      const targetVy = moveY * p.maxSpeed * speedMult;
      const accelFactor = Utils.clamp(p.accel * dt / p.maxSpeed, 0, 1);
      p.vx = Utils.lerp(p.vx, targetVx, inputLen > 0.05 ? accelFactor : accelFactor * 0.6);
      p.vy = Utils.lerp(p.vy, targetVy, inputLen > 0.05 ? accelFactor : accelFactor * 0.6);
      if (inputLen < 0.05) {
        p.vx *= p.friction;
        p.vy *= p.friction;
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (inputLen > 0.1) {
      p.facing = Math.atan2(moveY, moveX);
    }

    p.speed = Utils.vecLen(p.vx, p.vy);
    return false;
  }

  function clampPlayerToBounds(p, bounds) {
    p.x = Utils.clamp(p.x, bounds.left + p.radius, bounds.right - p.radius);
    p.y = Utils.clamp(p.y, bounds.top + p.radius, bounds.bottom - p.radius);
  }

  function clampGKToBox(p, bounds, goalSide) {
    const boxW = Field.WORLD.penaltyBoxW + 20;
    if (goalSide === 'left') {
      p.x = Utils.clamp(p.x, bounds.left + p.radius, bounds.left + boxW);
    } else {
      p.x = Utils.clamp(p.x, bounds.right - boxW, bounds.right - p.radius);
    }
    p.y = Utils.clamp(p.y, bounds.cy - Field.WORLD.penaltyBoxH / 2 - 10, bounds.cy + Field.WORLD.penaltyBoxH / 2 + 10);
  }

  // Столкновение игрок-игрок (мягкое разталкивание, без урона)
  function resolvePlayerCollisions(players) {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i], b = players[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = a.radius + b.radius;
        if (d > 0 && d < minD) {
          const overlap = (minD - d) / 2;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          // если один дэшит в другого с разницей скоростей — лёгкий стан и отбор импульса
          const relSpeed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
          if ((a.isDashing || b.isDashing) && relSpeed > 180) {
            const faster = a.isDashing ? a : b;
            const slower = a.isDashing ? b : a;
            if (faster !== slower) {
              slower.stunTimer = Math.max(slower.stunTimer, 0.35);
              slower.vx += (slower === b ? nx : -nx) * 120;
              slower.vy += (slower === b ? ny : -ny) * 120;
              return { tackleHappened: true, winner: faster, loser: slower };
            }
          }
        }
      }
    }
    return { tackleHappened: false };
  }

  function updateBall(ball, dt, bounds, goals) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.vx *= Math.pow(ball.friction, dt * 60);
    ball.vy *= Math.pow(ball.friction, dt * 60);
    ball.spinAngle += Utils.vecLen(ball.vx, ball.vy) * dt * 0.02;

    if (Math.abs(ball.vx) < 1) ball.vx = 0;
    if (Math.abs(ball.vy) < 1) ball.vy = 0;

    let bounced = false;

    // верх/низ — всегда отбой (если не в зоне ворот по X для верх/низ это неважно)
    if (ball.y - ball.radius < bounds.top) {
      ball.y = bounds.top + ball.radius;
      ball.vy *= -0.72;
      bounced = true;
    } else if (ball.y + ball.radius > bounds.bottom) {
      ball.y = bounds.bottom - ball.radius;
      ball.vy *= -0.72;
      bounced = true;
    }

    // лево/право — отбой, КРОМЕ зоны ворот (там может улететь в сетку = гол)
    const inGoalYRange = ball.y > goals.left.y0 + ball.radius && ball.y < goals.left.y1 - ball.radius;

    if (ball.x - ball.radius < bounds.left) {
      if (inGoalYRange && ball.x > goals.left.x - goals.left.depth) {
        // внутри ворот — даём улететь до задней стенки, гол фиксируется снаружи
      } else {
        ball.x = bounds.left + ball.radius;
        ball.vx *= -0.72;
        bounced = true;
      }
    } else if (ball.x + ball.radius > bounds.right) {
      if (inGoalYRange && ball.x < goals.right.x + goals.right.depth) {
        // внутри ворот
      } else {
        ball.x = bounds.right - ball.radius;
        ball.vx *= -0.72;
        bounced = true;
      }
    }

    return bounced;
  }

  function checkGoal(ball, goals) {
    if (ball.x < goals.left.x - goals.left.depth * 0.6 &&
        ball.y > goals.left.y0 && ball.y < goals.left.y1) {
      return 'away'; // мяч залетел в левые ворота -> очко команде away
    }
    if (ball.x > goals.right.x + goals.right.depth * 0.6 &&
        ball.y > goals.right.y0 && ball.y < goals.right.y1) {
      return 'home';
    }
    return null;
  }

  // Ведение мяча: если игрок близко и быстрее мяча относительно него — мяч "приклеивается" мягко
  function updatePossession(ball, players) {
    let closestDist = Infinity;
    let closestPlayer = null;
    for (const p of players) {
      if (p.stunTimer > 0) continue;
      const d = Utils.dist(p.x, p.y, ball.x, ball.y);
      if (d < closestDist) { closestDist = d; closestPlayer = p; }
    }

    for (const p of players) p.hasBall = false;

    if (closestPlayer && closestDist < POSSESSION_RADIUS) {
      ball.possessedBy = closestPlayer;
      closestPlayer.hasBall = true;

      // мягкое притяжение мяча к точке перед игроком (dribble feel)
      const aheadX = closestPlayer.x + Math.cos(closestPlayer.facing) * 22;
      const aheadY = closestPlayer.y + Math.sin(closestPlayer.facing) * 22;
      const pull = 0.16;
      ball.vx = Utils.lerp(ball.vx, (aheadX - ball.x) * 9, pull);
      ball.vy = Utils.lerp(ball.vy, (aheadY - ball.y) * 9, pull);
    } else {
      ball.possessedBy = null;
    }

    return closestPlayer && closestDist < STEAL_RADIUS ? closestPlayer : null;
  }

  function kickBall(ball, player, power, overdrive = false) {
    const dirX = Math.cos(player.facing);
    const dirY = Math.sin(player.facing);
    const speed = (overdrive ? 980 : Utils.lerp(380, 760, power)) * (player.shotMult || 1);
    ball.vx = dirX * speed + player.vx * 0.25;
    ball.vy = dirY * speed + player.vy * 0.25;
    ball.lastTouchTeam = player.team;
    ball.lastTouchIsUser = !!player.isUser;
    ball.possessedBy = null;
    if (overdrive) {
      ball.overdriveActive = true;
      ball.overdriveTimer = 1.4;
    }
    player.kickCooldown = KICK_COOLDOWN;
  }

  return {
    POSSESSION_RADIUS, STEAL_RADIUS,
    updatePlayerMovement, clampPlayerToBounds, clampGKToBox,
    resolvePlayerCollisions, updateBall, checkGoal, updatePossession, kickBall
  };
})();
