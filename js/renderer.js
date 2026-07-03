// ============================================================
// renderer.js — отрисовка всей игровой сцены: камера/масштаб,
// поле, игроки, мяч, частицы, экранные эффекты (shake, flash).
// ============================================================

const Renderer = (() => {

  let camShakeTime = 0;
  let camShakeMag = 0;
  let camShakeEnabled = true;

  function setShakeEnabled(v) { camShakeEnabled = v; }

  function triggerShake(mag, dur) {
    if (!camShakeEnabled) return;
    camShakeMag = Math.max(camShakeMag, mag);
    camShakeTime = Math.max(camShakeTime, dur);
  }

  function updateShake(dt) {
    if (camShakeTime > 0) {
      camShakeTime -= dt;
    } else {
      camShakeMag = 0;
    }
  }

  function getShakeOffset() {
    if (camShakeTime <= 0) return { x: 0, y: 0 };
    const t = camShakeTime;
    return {
      x: (Math.random() * 2 - 1) * camShakeMag * Math.min(t * 4, 1),
      y: (Math.random() * 2 - 1) * camShakeMag * Math.min(t * 4, 1)
    };
  }

  function computeViewport(screenW, screenH) {
    const worldW = Field.WORLD.width;
    const worldH = Field.WORLD.height;
    const padding = 0.92;
    const scale = Math.min(screenW / worldW, screenH / worldH) * padding;
    const offsetX = (screenW - worldW * scale) / 2;
    const offsetY = (screenH - worldH * scale) / 2;
    return { scale, offsetX, offsetY };
  }

  function drawPlayer(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);

    const col = Skins.resolveColor(p.skinId || 'home_default', performance.now());

    ctx.beginPath();
    ctx.ellipse(0, p.radius * 0.75, p.radius * 0.95, p.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();

    const bob = Math.sin(performance.now() / 90 + p.animPhase) * (p.speed > 20 ? 1.5 : 0.3);

    if (p.isDashing) {
      ctx.shadowColor = col;
      ctx.shadowBlur = 22;
    } else {
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
    }

    ctx.beginPath();
    ctx.arc(0, bob * -0.3, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.stunTimer > 0 ? 'rgba(120,130,140,0.9)' : (p.team === 'home' ? '#0E2630' : '#2A0E16');
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = p.stunTimer > 0 ? '#566270' : col;
    ctx.stroke();

    ctx.shadowBlur = 0;

    ctx.beginPath();
    const nx = Math.cos(p.facing) * p.radius * 1.15;
    const ny = Math.sin(p.facing) * p.radius * 1.15;
    ctx.moveTo(nx * 0.5, ny * 0.5);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (p.hasBall) {
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();

    if (p.role === 'gk') {
      ctx.save();
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'center';
      ctx.fillText('GK', p.x, p.y - p.radius - 8);
      ctx.restore();
    }

    if (p.isUser) {
      ctx.save();
      ctx.translate(p.x, p.y - p.radius - 16);
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 8);
      ctx.closePath();
      ctx.fillStyle = '#00F0FF';
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBall(ctx, ball) {
    ctx.save();
    ctx.translate(ball.x, ball.y);

    ctx.beginPath();
    ctx.ellipse(0, ball.radius * 0.7, ball.radius * 0.9, ball.radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();

    const overdrive = ball.overdriveActive;
    ctx.shadowColor = overdrive ? '#FFC857' : '#E8F4F8';
    ctx.shadowBlur = overdrive ? 24 : 6;

    ctx.rotate(ball.spinAngle);
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = overdrive ? '#FFE8AE' : '#EDF6FA';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = overdrive ? '#FFC857' : '#9FC4D2';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, ball.radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = overdrive ? '#FF8A00' : '#1B2B3A';
    ctx.fill();

    ctx.restore();
  }

  function drawScene(ctx, viewport, gameState) {
    const { scale, offsetX, offsetY } = viewport;
    const shake = getShakeOffset();

    ctx.save();
    ctx.translate(offsetX + shake.x, offsetY + shake.y);
    ctx.scale(scale, scale);

    Field.drawField(ctx, viewport);

    Particles.draw(ctx);

    const drawables = [...gameState.players];
    drawables.sort((a, b) => a.y - b.y);

    for (const p of drawables) {
      if (p.y < gameState.ball.y - 4) drawPlayer(ctx, p);
    }
    drawBall(ctx, gameState.ball);
    for (const p of drawables) {
      if (p.y >= gameState.ball.y - 4) drawPlayer(ctx, p);
    }

    ctx.restore();
  }

  return {
    computeViewport, drawScene,
    triggerShake, updateShake, setShakeEnabled
  };
})();
