// ============================================================
// hudLayout.js — настройка расположения сенсорных кнопок.
// Джойстик можно зеркалить влево/вправо, а кнопки УДАР/OVERCLOCK/
// СМЕНА/ПАУЗА можно перетаскивать пальцем и сохранить позицию.
//
// Слушатели перетаскивания вешаются один раз при старте приложения
// (HUDLayout.init) и весь остальной код проверяет флаг editing —
// это исключает риск случайно снять «боевые» обработчики кнопок.
// ============================================================

const HUDLayout = (() => {

  const STORAGE_KEY = 'ncfc_hud_layout';
  const DRAG_KEYS = ['shoot', 'overclock', 'switchBtn', 'pause'];
  const MAX_OFFSET = 140;

  function defaultLayout() {
    return {
      mirrored: false,
      offsets: { shoot: { x: 0, y: 0 }, overclock: { x: 0, y: 0 }, switchBtn: { x: 0, y: 0 }, pause: { x: 0, y: 0 } }
    };
  }

  function getLayout() {
    const l = Utils.storage.get(STORAGE_KEY, null);
    if (!l) return defaultLayout();
    const d = defaultLayout();
    return { ...d, ...l, offsets: { ...d.offsets, ...(l.offsets || {}) } };
  }

  function saveLayout(l) {
    Utils.storage.set(STORAGE_KEY, l);
  }

  function elForKey(key) {
    if (key === 'shoot') return document.getElementById('touch-btn-shoot');
    if (key === 'overclock') return document.getElementById('touch-btn-overclock');
    if (key === 'switchBtn') return document.getElementById('touch-btn-switch');
    if (key === 'pause') return document.getElementById('btn-pause');
    return null;
  }

  function apply() {
    const layout = getLayout();
    document.body.classList.toggle('controls-mirrored', !!layout.mirrored);
    for (const key of DRAG_KEYS) {
      const el = elForKey(key);
      if (!el) continue;
      const off = layout.offsets[key] || { x: 0, y: 0 };
      el.style.transform = `translate(${off.x}px, ${off.y}px)`;
    }
  }

  function isMirrored() {
    return getLayout().mirrored;
  }

  // ---- редактор перетаскивания ----
  let editing = false;
  let dragKey = null;
  let dragStartPointer = { x: 0, y: 0 };
  let dragStartOffset = { x: 0, y: 0 };
  let pendingLayout = null;

  function clamp(v) { return Utils.clamp(v, -MAX_OFFSET, MAX_OFFSET); }

  function onPointerDown(key, e) {
    if (!editing) return;
    e.preventDefault();
    dragKey = key;
    dragStartPointer = { x: e.clientX, y: e.clientY };
    const off = pendingLayout.offsets[key] || { x: 0, y: 0 };
    dragStartOffset = { x: off.x, y: off.y };
  }

  function onPointerMove(e) {
    if (!editing || !dragKey) return;
    const dx = e.clientX - dragStartPointer.x;
    const dy = e.clientY - dragStartPointer.y;
    const nx = clamp(dragStartOffset.x + dx);
    const ny = clamp(dragStartOffset.y + dy);
    pendingLayout.offsets[dragKey] = { x: nx, y: ny };
    const el = elForKey(dragKey);
    if (el) el.style.transform = `translate(${nx}px, ${ny}px)`;
  }

  function onPointerUp() {
    dragKey = null;
  }

  // Вызывается один раз при старте приложения — вешает постоянные
  // слушатели, безопасные вне режима редактирования (early-return).
  function init() {
    for (const key of DRAG_KEYS) {
      const el = elForKey(key);
      if (!el) continue;
      el.addEventListener('pointerdown', (e) => onPointerDown(key, e));
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    apply();
  }

  function openEditor() {
    editing = true;
    pendingLayout = getLayout();
    document.body.classList.add('hud-edit-mode');
    document.getElementById('touch-controls').classList.add('active');
    document.body.classList.toggle('controls-mirrored', !!pendingLayout.mirrored);
    UI.showScreen('screen-game');
    for (const key of DRAG_KEYS) {
      const el = elForKey(key);
      if (!el) continue;
      const off = pendingLayout.offsets[key] || { x: 0, y: 0 };
      el.style.transform = `translate(${off.x}px, ${off.y}px)`;
    }
  }

  function closeEditor(commit) {
    editing = false;
    document.body.classList.remove('hud-edit-mode');
    document.getElementById('touch-controls').classList.remove('active');
    if (commit && pendingLayout) saveLayout(pendingLayout);
    apply();
    UI.showScreen('screen-menu');
    UI.goToMenu();
  }

  function editorReset() {
    pendingLayout = defaultLayout();
    document.body.classList.remove('controls-mirrored');
    for (const key of DRAG_KEYS) {
      const el = elForKey(key);
      if (el) el.style.transform = 'translate(0px, 0px)';
    }
  }

  function editorSetMirrored(v) {
    if (!pendingLayout) return;
    pendingLayout.mirrored = !!v;
    document.body.classList.toggle('controls-mirrored', !!v);
  }

  return { init, apply, isMirrored, openEditor, closeEditor, editorReset, editorSetMirrored };
})();
