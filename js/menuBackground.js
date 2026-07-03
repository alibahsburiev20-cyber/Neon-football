// ============================================================
// menuBackground.js — фоновая анимация на экране меню:
// медленно "дышащая" плата с пробегающими импульсами по трассам,
// как индикация работающей системы перед матчем.
// ============================================================

const MenuBackground = (() => {
  let canvas, ctx, raf = null;
  let pulses = [];
  let nodes = [];

  function buildNodes(w, h) {
    nodes = [];
    const cols = Math.ceil(w / 90) + 1;
    const rows = Math.ceil(h / 90) + 1;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        nodes.push({ x: i * 90 + (j % 2) * 30, y: j * 90 });
      }
    }
  }

  function spawnPulse() {
    if (nodes.length < 2) return;
    const a = Utils.choice(nodes);
    const candidates = nodes.filter(n => Utils.dist(n.x, n.y, a.x, a.y) < 130 && n !== a);
    if (!candidates.length) return;
    const b = Utils.choice(candidates);
    pulses.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, t: 0, speed: Utils.rand(0.5, 0.9) });
  }

  function init() {
    canvas = document.getElementById('menu-bg-canvas');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const { width, height } = Utils.fitCanvasToScreen(canvas);
    buildNodes(width, height);
  }

  let lastTime = performance.now();
  function loop() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (Math.random() < 0.06) spawnPulse();

    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // статичные линии-трассы (тонкие)
    ctx.strokeStyle = 'rgba(27, 43, 58, 0.5)';
    ctx.lineWidth = 1;
    for (const n of nodes) {
      const near = nodes.filter(o => o !== n && Utils.dist(o.x, o.y, n.x, n.y) < 95);
      for (const o of near) {
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(o.x, o.y);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(27, 43, 58, 0.7)';
    for (const n of nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // бегущие импульсы
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += dt * p.speed;
      if (p.t >= 1) { pulses.splice(i, 1); continue; }
      const x = Utils.lerp(p.x1, p.x2, p.t);
      const y = Utils.lerp(p.y1, p.y2, p.t);
      ctx.save();
      ctx.shadowColor = '#00F0FF';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(0, 240, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (!canvas) init();
    if (raf) cancelAnimationFrame(raf);
    lastTime = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  return { start, stop };
})();
