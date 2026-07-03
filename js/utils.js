// ============================================================
// utils.js — общие вспомогательные функции
// ============================================================

const Utils = (() => {

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function distSq(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    return dx * dx + dy * dy;
  }

  function angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function choice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function vecLen(x, y) {
    return Math.hypot(x, y);
  }

  function vecNorm(x, y) {
    const len = vecLen(x, y);
    if (len < 0.0001) return { x: 0, y: 0 };
    return { x: x / len, y: y / len };
  }

  function formatClock(seconds) {
    if (seconds >= 99999) return '∞';
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }

  // simple seeded-ish ease functions
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  // local storage wrapper with safe fallback
  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        if (v === null) return fallback;
        return JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* ignore */ }
    }
  };

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // Resize a canvas to device pixel ratio crisply
  function fitCanvasToScreen(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: w, height: h, dpr };
  }

  return {
    clamp, lerp, dist, distSq, angle, rand, randInt, choice,
    vecLen, vecNorm, formatClock, easeOutCubic, easeInOutSine,
    storage, rectsOverlap, fitCanvasToScreen
  };
})();
