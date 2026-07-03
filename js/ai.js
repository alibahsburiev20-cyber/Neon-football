// ============================================================
// ai.js — поведение компьютерных игроков (включая вратарей).
// Простая ролевая модель: striker / mid / defender / gk.
// Достаточно "читаемая" чтобы игрок мог обыгрывать, но не тупая.
// ============================================================

const AI = (() => {

  const DIFFICULTY_PRESETS = {
    easy:   { reaction: 0.35, speedMult: 0.85, aggression: 0.55, kickAccuracy: 0.6 },
    normal: { reaction: 0.18, speedMult: 1.0,  aggression: 0.75, kickAccuracy: 0.78 },
    hard:   { reaction: 0.08, speedMult: 1.12, aggression: 0.95, kickAccuracy: 0.92 }
  };

  function getPreset(difficulty) {
    return DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.normal;
  }

  // Возвращает { moveX, moveY, wantKick, wantPower, wantDash, wantOverdrive }
  function decide(player, ctx) {
    const { ball, allPlayers, bounds, goals, dt, preset, teamHasBall } = ctx;

    player.ai.decisionTimer -= dt;

    const myGoal = player.team === 'home' ? goals.left : goals.right;
    const oppGoal = player.team === 'home' ? goals.right : goals.left;
    const attackDir = player.team === 'home' ? 1 : -1;

    if (player.role === 'gk') {
      return gkDecide(player, ball, myGoal, bounds, preset);
    }

    const distToBall = Utils.dist(player.x, player.y, ball.x, ball.y);
    const iAmClosestTeammate = isClosestOnTeam(player, allPlayers, ball);

    let targetX, targetY;
    let wantKick = false, wantPower = false, wantDash = false, wantOverdrive = false;

    if (player.hasBall) {
      // У меня мяч: веду к воротам соперника, бью если близко или под давлением
      const distToGoal = Utils.dist(player.x, player.y, oppGoal.x, (oppGoal.y0 + oppGoal.y1) / 2);
      const nearestOpp = nearestOpponent(player, allPlayers);
      const underPressure = nearestOpp && Utils.dist(player.x, player.y, nearestOpp.x, nearestOpp.y) < 55;

      targetX = oppGoal.x + attackDir * -40;
      targetY = (oppGoal.y0 + oppGoal.y1) / 2 + Utils.rand(-40, 40);

      if (distToGoal < 320 && Math.random() < 0.006 + preset.aggression * 0.006) {
        wantKick = true;
        wantPower = distToGoal > 150;
      } else if (underPressure && Math.random() < 0.012) {
        wantKick = true;
        wantPower = false;
      } else if (underPressure) {
        wantDash = Math.random() < 0.02;
      }

      // редкий овердрайв-удар если близко к воротам и есть заряд
      if (player.team !== 'home' && ctx.awayOverclockReady && distToGoal < 260 && Math.random() < 0.03) {
        wantOverdrive = true;
      }
    } else if (teamHasBall) {
      // моя команда владеет, но не я: занимаю позицию поддержки
      const supportOffsetX = attackDir * Utils.rand(60, 140);
      targetX = ball.x + supportOffsetX;
      targetY = player.ai.homeY + (ball.y - player.ai.homeY) * 0.4;
    } else {
      // соперник владеет (или мяч свободен)
      if (iAmClosestTeammate && distToBall < 260) {
        // прессинг — иду отбирать
        targetX = ball.x;
        targetY = ball.y;
        if (distToBall < 70 && Math.random() < preset.aggression * 0.02) {
          wantDash = true;
        }
      } else {
        // держу позицию, чуть смещаясь к мячу по Y
        targetX = player.ai.homeX + (ball.x - player.ai.homeX) * 0.18;
        targetY = player.ai.homeY + (ball.y - player.ai.homeY) * 0.35;
      }
    }

    targetX = Utils.clamp(targetX, bounds.left + 20, bounds.right - 20);
    targetY = Utils.clamp(targetY, bounds.top + 20, bounds.bottom - 20);

    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const dLen = Utils.vecLen(dx, dy);
    let moveX = 0, moveY = 0;
    if (dLen > 4) {
      moveX = dx / dLen;
      moveY = dy / dLen;
    }

    return { moveX, moveY, wantKick, wantPower, wantDash, wantOverdrive };
  }

  function gkDecide(player, ball, myGoal, bounds, preset) {
    const goalCx = myGoal.x;
    const goalCy = (myGoal.y0 + myGoal.y1) / 2;
    const ballNearGoal = Utils.dist(ball.x, ball.y, goalCx, goalCy) < 280;

    let targetX, targetY;

    if (ballNearGoal) {
      targetX = Utils.lerp(goalCx, ball.x, 0.32);
      targetY = Utils.clamp(ball.y, goalCy - 95 + 10, goalCy + 95 - 10);
    } else {
      targetX = goalCx + (myGoal.dir < 0 ? 26 : -26);
      targetY = Utils.lerp(player.y, goalCy, 0.08) + (ball.y - goalCy) * 0.12;
    }

    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const dLen = Utils.vecLen(dx, dy);
    let moveX = 0, moveY = 0;
    if (dLen > 3) { moveX = dx / dLen; moveY = dy / dLen; }

    let wantKick = false, wantPower = false;
    if (player.hasBall) {
      wantKick = true;
      wantPower = true;
    }

    return { moveX, moveY, wantKick, wantPower, wantDash: false, wantOverdrive: false };
  }

  function isClosestOnTeam(player, allPlayers, ball) {
    const teammates = allPlayers.filter(p => p.team === player.team && p.role !== 'gk');
    let best = null, bestD = Infinity;
    for (const t of teammates) {
      const d = Utils.dist(t.x, t.y, ball.x, ball.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best === player;
  }

  function nearestOpponent(player, allPlayers) {
    let best = null, bestD = Infinity;
    for (const o of allPlayers) {
      if (o.team === player.team) continue;
      const d = Utils.dist(o.x, o.y, player.x, player.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  return { getPreset, decide };
})();
