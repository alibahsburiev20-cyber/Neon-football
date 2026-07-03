// ============================================================
// input.js — клавиатура + touch-джойстик. Выдаёт единый снапшот
// состояния ввода для текущего кадра.
// ============================================================

const InputSystem = (() => {
  const keys = new Set();
  let spaceDownTime = 0;
  let spaceHeld = false;
  let kickJustPressed = false;
  let kickJustReleased = false;
  let overdriveJustPressed = false;
  let dashHeld = false;

  let touchActive = false;
  let touchMoveX = 0, touchMoveY = 0;
  let touchShootPressedAt = 0;
  let touchShootHeld = false;
  let touchShootJustReleased = false;
  let touchOverdriveJustPressed = false;
  let switchJustPressed = false;
  let touchSwitchJustPressed = false;

  function isTouchDevice() {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  }

  function init() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      const k = e.key.toLowerCase();
      if (!keys.has(k)) {
        if (k === ' ') { spaceDownTime = performance.now(); kickJustPressed = true; spaceHeld = true; }
        if (k === 'shift') dashHeld = true;
        if (k === 'e') overdriveJustPressed = true;
        if (k === 'q') switchJustPressed = true;
      }
      keys.add(k);
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      keys.delete(k);
      if (k === ' ') { kickJustReleased = true; spaceHeld = false; }
      if (k === 'shift') dashHeld = false;
    });

    setupTouch();
  }

  function setupTouch() {
    const stickZone = document.getElementById('touch-stick-zone');
    const stickNub = document.getElementById('touch-stick-nub');
    const shootBtn = document.getElementById('touch-btn-shoot');
    const overdriveBtn = document.getElementById('touch-btn-overclock');
    const switchBtn = document.getElementById('touch-btn-switch');

    let stickCenter = { x: 0, y: 0 };
    let stickTouchId = null;

    function startStick(touch) {
      const rect = stickZone.getBoundingClientRect();
      stickCenter = { x: rect.left + rect.width * 0.32, y: rect.top + rect.height * 0.68 };
      stickTouchId = touch.identifier;
      touchActive = true;
    }

    stickZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (stickTouchId === null) startStick(e.changedTouches[0]);
      updateStick(e);
    }, { passive: false });

    stickZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      updateStick(e);
    }, { passive: false });

    stickZone.addEventListener('touchend', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === stickTouchId) {
          stickTouchId = null;
          touchMoveX = 0; touchMoveY = 0;
          stickNub.style.transform = 'translate(0px, 0px)';
        }
      }
    }, { passive: false });

    function updateStick(e) {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickTouchId) continue;
        let dx = t.clientX - stickCenter.x;
        let dy = t.clientY - stickCenter.y;
        const maxR = 50;
        const len = Math.hypot(dx, dy);
        if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; }
        stickNub.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMoveX = len > 6 ? dx / maxR : 0;
        touchMoveY = len > 6 ? dy / maxR : 0;
      }
    }

    shootBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      touchShootPressedAt = performance.now();
      touchShootHeld = true;
    }, { passive: false });
    shootBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      touchShootHeld = false;
      touchShootJustReleased = true;
    }, { passive: false });

    overdriveBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      touchOverdriveJustPressed = true;
    }, { passive: false });

    if (switchBtn) {
      switchBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchSwitchJustPressed = true;
      }, { passive: false });
    }
  }

  // Вызывается раз в кадр, чтобы получить итоговый снапшот и сбросить one-shot флаги
  function poll() {
    let moveX = 0, moveY = 0;
    if (keys.has('w') || keys.has('arrowup')) moveY -= 1;
    if (keys.has('s') || keys.has('arrowdown')) moveY += 1;
    if (keys.has('a') || keys.has('arrowleft')) moveX -= 1;
    if (keys.has('d') || keys.has('arrowright')) moveX += 1;

    if (touchActive) {
      moveX = touchMoveX;
      moveY = touchMoveY;
    }

    const len = Utils.vecLen(moveX, moveY);
    if (len > 1) { moveX /= len; moveY /= len; }

    const holdDuration = spaceHeld ? (performance.now() - spaceDownTime) : (touchShootHeld ? (performance.now() - touchShootPressedAt) : 0);

    const result = {
      moveX, moveY,
      kickPressed: kickJustPressed,
      kickReleased: kickJustReleased || touchShootJustReleased,
      kickHeld: spaceHeld || touchShootHeld,
      holdDuration,
      wantDash: dashHeld,
      overdrivePressed: overdriveJustPressed || touchOverdriveJustPressed,
      switchPressed: switchJustPressed || touchSwitchJustPressed
    };

    kickJustPressed = false;
    kickJustReleased = false;
    overdriveJustPressed = false;
    touchShootJustReleased = false;
    touchOverdriveJustPressed = false;
    switchJustPressed = false;
    touchSwitchJustPressed = false;

    return result;
  }

  function showTouchControls(show) {
    document.getElementById('touch-controls').classList.toggle('active', show);
  }

  return { init, poll, isTouchDevice, showTouchControls };
})();
