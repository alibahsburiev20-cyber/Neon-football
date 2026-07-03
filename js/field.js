// ============================================================
// field.js — геометрия и рендер поля.
// Сигнатурная идея: поле = печатная плата. Разметка — светящиеся
// трассы, ворота — разъёмы/порты, центр — процессорный чип.
// ============================================================

const Field = (() => {

  // Логическое поле в "мировых" координатах (независимо от экрана).
  // Ширина (по X) — длина поля, высота (по Y) — ширина поля.
  // Расширено под составы 6х6 (было 1400x820 под 4х4).
  const WORLD = {
    width: 1780,
    height: 1000,
    margin: 60,        // отступ от края мира до линии поля
    goalWidth: 210,     // высота ворот (по Y)
    goalDepth: 34,       // глубина ворот (по X)
    centerCircleR: 120,
    penaltyBoxW: 190,
    penaltyBoxH: 430,
    goalBoxW: 70,
    goalBoxH: 220
  };

  function getPlayBounds() {
    return {
      left: WORLD.margin,
      right: WORLD.width - WORLD.margin,
      top: WORLD.margin,
      bottom: WORLD.height - WORLD.margin,
      cx: WORLD.width / 2,
      cy: WORLD.height / 2
    };
  }

  function getGoals() {
    const b = getPlayBounds();
    const gY0 = b.cy - WORLD.goalWidth / 2;
    const gY1 = b.cy + WORLD.goalWidth / 2;
    return {
      left: { x: b.left, y0: gY0, y1: gY1, depth: WORLD.goalDepth, dir: -1 },
      right: { x: b.right, y0: gY0, y1: gY1, depth: WORLD.goalDepth, dir: 1 }
    };
  }

  // Предгенерированные декоративные "трассы платы" в зоне за пределами поля,
  // чтобы фон не выглядел пустым. Генерируются один раз.
  let decorativeTraces = null;
  function getDecorativeTraces() {
    if (decorativeTraces) return decorativeTraces;
    decorativeTraces = [];
    const rng = (seed => () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    })(1337);

    for (let i = 0; i < 26; i++) {
      const startX = rng() * WORLD.width;
      const startY = rng() < 0.5 ? rng() * WORLD.margin : WORLD.height - rng() * WORLD.margin;
      const segs = [];
      let x = startX, y = startY;
      const segCount = 2 + Math.floor(rng() * 3);
      for (let s = 0; s < segCount; s++) {
        const horizontal = rng() < 0.5;
        const len = 30 + rng() * 90;
        const nx = horizontal ? x + (rng() < 0.5 ? len : -len) : x;
        const ny = horizontal ? y : y + (rng() < 0.5 ? len : -len);
        segs.push({ x1: x, y1: y, x2: nx, y2: ny });
        x = nx; y = ny;
      }
      decorativeTraces.push({ segs, pad: rng() < 0.3 });
    }
    return decorativeTraces;
  }

  function drawField(ctx, viewport) {
    const b = getPlayBounds();
    const goals = getGoals();

    // --- базовая плата (фон всего мира) ---
    ctx.fillStyle = '#070D14';
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    // decorative traces outside play area
    ctx.strokeStyle = 'rgba(40, 66, 88, 0.35)';
    ctx.lineWidth = 1.4;
    for (const tr of getDecorativeTraces()) {
      ctx.beginPath();
      for (const seg of tr.segs) {
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
      }
      ctx.stroke();
      if (tr.pad) {
        const last = tr.segs[tr.segs.length - 1];
        ctx.fillStyle = 'rgba(40, 66, 88, 0.45)';
        ctx.beginPath();
        ctx.arc(last.x2, last.y2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- игровая зона: плата чуть светлее ---
    const pad = 10;
    const grad = ctx.createLinearGradient(0, b.top - pad, 0, b.bottom + pad);
    grad.addColorStop(0, '#0C1A28');
    grad.addColorStop(0.5, '#0A1622');
    grad.addColorStop(1, '#0C1A28');
    ctx.fillStyle = grad;
    ctx.fillRect(b.left - pad, b.top - pad, (b.right - b.left) + pad * 2, (b.bottom - b.top) + pad * 2);

    // микро-сетка платы внутри поля (компонентная сетка)
    ctx.strokeStyle = 'rgba(27, 43, 58, 0.55)';
    ctx.lineWidth = 1;
    const grid = 40;
    for (let gx = b.left; gx <= b.right; gx += grid) {
      ctx.beginPath();
      ctx.moveTo(gx, b.top);
      ctx.lineTo(gx, b.bottom);
      ctx.stroke();
    }
    for (let gy = b.top; gy <= b.bottom; gy += grid) {
      ctx.beginPath();
      ctx.moveTo(b.left, gy);
      ctx.lineTo(b.right, gy);
      ctx.stroke();
    }

    // --- светящаяся разметка (трассы платы) ---
    ctx.save();
    ctx.shadowColor = 'rgba(0, 240, 255, 0.55)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(0, 230, 255, 0.85)';
    ctx.lineWidth = 2.5;

    // внешняя рамка поля
    ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);

    // центральная линия
    ctx.beginPath();
    ctx.moveTo(b.cx, b.top);
    ctx.lineTo(b.cx, b.bottom);
    ctx.stroke();

    // центральный круг ("чип" в центре платы)
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, WORLD.centerCircleR, 0, Math.PI * 2);
    ctx.stroke();

    // центральная точка
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 230, 255, 0.9)';
    ctx.fill();

    // штрафные зоны (вид компонента: прямоугольник с "контактами")
    [{ side: 'left', x: b.left }, { side: 'right', x: b.right }].forEach(({ side, x }) => {
      const dir = side === 'left' ? 1 : -1;
      const boxX = side === 'left' ? x : x - WORLD.penaltyBoxW;
      ctx.strokeRect(boxX, b.cy - WORLD.penaltyBoxH / 2, WORLD.penaltyBoxW, WORLD.penaltyBoxH);

      const gBoxX = side === 'left' ? x : x - WORLD.goalBoxW;
      ctx.strokeRect(gBoxX, b.cy - WORLD.goalBoxH / 2, WORLD.goalBoxW, WORLD.goalBoxH);

      // пенальти точка
      const dotX = x + dir * 120;
      ctx.beginPath();
      ctx.arc(dotX, b.cy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // дуга штрафной (вид разъёма)
      ctx.beginPath();
      ctx.arc(dotX, b.cy, 60, side === 'left' ? -0.7 : Math.PI - 0.7, side === 'left' ? 0.7 : Math.PI + 0.7);
      ctx.stroke();
    });

    ctx.restore();

    // --- угловые "контактные площадки" платы ---
    ctx.fillStyle = 'rgba(0, 230, 255, 0.6)';
    [[b.left, b.top], [b.right, b.top], [b.left, b.bottom], [b.right, b.bottom]].forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    drawGoals(ctx, goals);
  }

  function drawGoals(ctx, goals) {
    [goals.left, goals.right].forEach(goal => {
      const x0 = goal.dir < 0 ? goal.x - goal.depth : goal.x;
      const w = goal.depth;
      const h = goal.y1 - goal.y0;

      // корпус ворот — "порт" платы: тёмный прямоугольник с рамкой пульсации
      const t = (Date.now() % 2000) / 2000;
      const pulse = 0.5 + Math.sin(t * Math.PI * 2) * 0.5;

      ctx.save();
      ctx.shadowColor = `rgba(255, 61, 90, ${0.4 + pulse * 0.3})`;
      ctx.shadowBlur = 16;
      ctx.fillStyle = 'rgba(8, 5, 10, 0.9)';
      ctx.fillRect(x0, goal.y0, w, h);

      ctx.strokeStyle = `rgba(255, 61, 90, ${0.7 + pulse * 0.3})`;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x0, goal.y0, w, h);

      // "контакты" внутри ворот — горизонтальные полоски как разъём
      ctx.strokeStyle = `rgba(255, 61, 90, 0.35)`;
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const yy = goal.y0 + (h / 5) * i;
        ctx.beginPath();
        ctx.moveTo(x0, yy);
        ctx.lineTo(x0 + w, yy);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  return { WORLD, getPlayBounds, getGoals, drawField };
})();
