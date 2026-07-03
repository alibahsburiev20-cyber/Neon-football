// ============================================================
// particles.js — лёгкая система частиц для искр, следов, конфетти.
// Простой пул объектов, без классов ради скорости.
// ============================================================

const Particles = (() => {
  let pool = [];
  const MAX_PARTICLES = 400;

  function spawn(opts) {
    if (pool.length >= MAX_PARTICLES) pool.shift();
    pool.push({
      x: opts.x, y: opts.y,
      vx: opts.vx || 0, vy: opts.vy || 0,
      life: opts.life || 0.6,
      maxLife: opts.life || 0.6,
      size: opts.size || 3,
      color: opts.color || '#00F0FF',
      gravity: opts.gravity || 0,
      friction: opts.friction !== undefined ? opts.friction : 0.96,
      shape: opts.shape || 'circle', // circle | spark | square
      fade: opts.fade !== undefined ? opts.fade : true
    });
  }

  function burst(x, y, count, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = Utils.rand(opts.minSpeed || 40, opts.maxSpeed || 220);
      spawn({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: Utils.rand(opts.minLife || 0.25, opts.maxLife || 0.7),
        size: Utils.rand(opts.minSize || 1.5, opts.maxSize || 4),
        color: opts.color || '#00F0FF',
        gravity: opts.gravity !== undefined ? opts.gravity : 0,
        friction: opts.friction !== undefined ? opts.friction : 0.94,
        shape: opts.shape || 'spark'
      });
    }
  }

  function trail(x, y, vx, vy, color) {
    spawn({
      x, y,
      vx: -vx * 0.15 + Utils.rand(-20, 20),
      vy: -vy * 0.15 + Utils.rand(-20, 20),
      life: Utils.rand(0.15, 0.32),
      size: Utils.rand(1.5, 3.2),
      color,
      friction: 0.9,
      shape: 'circle'
    });
  }

  function update(dt) {
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) { pool.splice(i, 1); continue; }
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function draw(ctx) {
    for (const p of pool) {
      const t = p.life / p.maxLife;
      const alpha = p.fade ? Utils.clamp(t, 0, 1) : 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t + 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'spark') {
        const len = p.size * 3;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.6, p.size * 0.5 * t);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      } else if (p.shape === 'square') {
        const s = p.size * t * 2;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  function clear() { pool = []; }
  function count() { return pool.length; }

  return { spawn, burst, trail, update, draw, clear, count };
})();
