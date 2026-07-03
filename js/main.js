// ============================================================
// main.js — точка входа: boot-анимация, инициализация подсистем,
// переход в главное меню.
// ============================================================

(function () {

  const bootMessages = [
    'ИНИЦИАЛИЗАЦИЯ ПОЛЯ…',
    'КАЛИБРОВКА ОВЕРКЛОКА…',
    'ЗАГРУЗКА АГЕНТОВ CPU…',
    'ПРОГРЕВ ТРАСС…',
    'ГОТОВО'
  ];

  function runBoot() {
    const fill = document.getElementById('boot-bar-fill');
    const status = document.getElementById('boot-status');
    let progress = 0;
    let msgIndex = 0;
    status.textContent = bootMessages[0];

    const interval = setInterval(() => {
      progress += Utils.rand(8, 18);
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(finishBoot, 280);
      }
      fill.style.width = progress + '%';
      const newMsgIndex = Math.min(bootMessages.length - 1, Math.floor((progress / 100) * (bootMessages.length - 1)));
      if (newMsgIndex !== msgIndex) {
        msgIndex = newMsgIndex;
        status.textContent = bootMessages[msgIndex];
      }
    }, 140);
  }

  function finishBoot() {
    document.getElementById('screen-boot').classList.remove('active');
    document.getElementById('screen-menu').classList.add('active');
    UI.goToMenu();
  }

  // Разблокировка AudioContext по первому пользовательскому жесту (требование браузеров)
  function setupAudioUnlock() {
    const unlock = () => { AudioEngine.ensureCtx(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  // Подсказка "поверни устройство" — актуальна только на тач-экранах в портретной
  // ориентации, и только пока активен игровой экран (не в меню/настройках).
  function setupRotateNotice() {
    const notice = document.getElementById('screen-rotate');
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    if (!isCoarse) return;

    let wasShowing = false;
    function check() {
      const isPortrait = window.matchMedia('(orientation: portrait)').matches;
      const gameActive = document.getElementById('screen-game').classList.contains('active');
      const shouldShow = isPortrait && gameActive;
      notice.classList.toggle('show', shouldShow);
      if (shouldShow && !wasShowing && typeof Match !== 'undefined' && Match.getState()) {
        Match.setPaused(true);
      } else if (!shouldShow && wasShowing && typeof Match !== 'undefined' && Match.getState() && Match.getState().paused) {
        Match.setPaused(false);
      }
      wasShowing = shouldShow;
    }

    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    // переотслеживаем при каждом переключении экранов (меню/игра/пауза и т.д.)
    const observer = new MutationObserver(check);
    observer.observe(document.getElementById('screen-game'), { attributes: true, attributeFilter: ['class'] });
    check();
  }

  document.addEventListener('DOMContentLoaded', () => {
    InputSystem.init();
    UI.init();
    HUDLayout.init();
    Shop.init();
    setupAudioUnlock();
    setupRotateNotice();
    runBoot();
  });

})();
