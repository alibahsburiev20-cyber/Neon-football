// ============================================================
// squad.js — выбор позиции пользователя и построение формации
// 1-2-2-1 (вратарь, 2 защитника, 2 полузащитника, нападающий)
// для расширенного поля. Формация строится в мировых координатах
// на основе Field.getPlayBounds(), симметрично для home/away.
// ============================================================

const Squad = (() => {

  const STORAGE_KEY = 'ncfc_position_pref';

  // Порядок слотов задаёт формацию 1-2-2-1
  const SLOTS = [
    { role: 'gk',  label: 'ВРАТАРЬ' },
    { role: 'def', label: 'ЗАЩИТНИК' },
    { role: 'def', label: 'ЗАЩИТНИК' },
    { role: 'mid', label: 'ПОЛУЗАЩИТНИК' },
    { role: 'mid', label: 'ПОЛУЗАЩИТНИК' },
    { role: 'fwd', label: 'НАПАДАЮЩИЙ' },
  ];

  const POSITION_CHOICES = [
    { role: 'gk',  label: 'ВРАТАРЬ' },
    { role: 'def', label: 'ЗАЩИТНИК' },
    { role: 'mid', label: 'ПОЛУЗАЩИТНИК' },
    { role: 'fwd', label: 'НАПАДАЮЩИЙ' },
  ];

  function getPreferredPosition() {
    return Utils.storage.get(STORAGE_KEY, 'fwd');
  }

  function setPreferredPosition(role) {
    Utils.storage.set(STORAGE_KEY, role);
  }

  // Возвращает индекс первого слота, соответствующего роли (для назначения isUser)
  function firstSlotIndexForRole(role) {
    const idx = SLOTS.findIndex(s => s.role === role);
    return idx === -1 ? SLOTS.length - 1 : idx;
  }

  // roleToAIRole — маппинг короткой роли слота в роль, понятную AI/entities (gk/defender/mid/striker)
  function roleToEntityRole(role) {
    if (role === 'gk') return 'gk';
    if (role === 'def') return 'defender';
    if (role === 'mid') return 'mid';
    return 'striker';
  }

  // Строит массив {x,y,role,entityRole} для одной команды.
  // side: 'home' | 'away'. attackDir: home атакует вправо (+1), away — влево (-1).
  function buildFormation(bounds, side) {
    const b = bounds;
    const dir = side === 'home' ? 1 : -1;
    const baseX = side === 'home' ? b.left : b.right;
    const oppX = side === 'home' ? b.right : b.left;

    // X-координаты линий (от своих ворот к чужим)
    const xGK = baseX + dir * 60;
    const xDef = b.cx - dir * 300;
    const xMid = b.cx - dir * 110;
    const xFwd = b.cx - dir * 30;

    const rows = [
      { x: xGK,  y: b.cy },
      { x: xDef, y: b.cy - 170 },
      { x: xDef, y: b.cy + 170 },
      { x: xMid, y: b.cy - 220 },
      { x: xMid, y: b.cy + 220 },
      { x: xFwd, y: b.cy },
    ];

    return SLOTS.map((slot, i) => ({
      x: rows[i].x, y: rows[i].y,
      role: slot.role,
      entityRole: roleToEntityRole(slot.role)
    }));
  }

  return { SLOTS, POSITION_CHOICES, getPreferredPosition, setPreferredPosition, firstSlotIndexForRole, roleToEntityRole, buildFormation };
})();
