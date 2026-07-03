// ============================================================
// audio.js — синтез звуков через Web Audio API.
// Никаких звуковых файлов: всё генерируется осцилляторами и шумом.
// ============================================================

const AudioEngine = (() => {
  let ctx = null;
  let masterGain = null;
  let volume = 0.7;
  let unlocked = false;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
  }

  function setVolume(v01) {
    volume = Utils.clamp(v01, 0, 1);
    if (masterGain) masterGain.gain.value = volume;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  // Generic oscillator blip with envelope
  function blip({ freq = 440, freqEnd = null, type = 'sine', dur = 0.12, gain = 0.3, attack = 0.005, delay = 0 }) {
    if (!ctx) return;
    const t0 = now() + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    }
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // White-noise burst (for kicks, crowd, impacts)
  function noiseBurst({ dur = 0.15, gain = 0.3, filterFreq = 1200, filterType = 'bandpass', delay = 0, Q = 1 }) {
    if (!ctx) return;
    const t0 = now() + delay;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---- Sound effect library ----

  function sfxKick() {
    // удар по мячу — короткий тональный "тук" + шумовой щелчок
    blip({ freq: 180, freqEnd: 70, type: 'triangle', dur: 0.1, gain: 0.35 });
    noiseBurst({ dur: 0.05, gain: 0.25, filterFreq: 2200, Q: 0.7 });
  }

  function sfxPowerKick() {
    blip({ freq: 260, freqEnd: 50, type: 'sawtooth', dur: 0.22, gain: 0.32 });
    noiseBurst({ dur: 0.12, gain: 0.3, filterFreq: 1800, Q: 0.6 });
  }

  function sfxOverdrive() {
    // зарядный электро-звук на овердрайв-удар
    blip({ freq: 220, freqEnd: 1400, type: 'sawtooth', dur: 0.32, gain: 0.28 });
    blip({ freq: 90, freqEnd: 900, type: 'square', dur: 0.32, gain: 0.18, delay: 0.02 });
    noiseBurst({ dur: 0.2, gain: 0.22, filterFreq: 3000, Q: 0.4, delay: 0.03 });
  }

  function sfxGoal() {
    // победный аккорд из 3 нот вверх + шумовой "взрыв" подсветки
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => blip({ freq: f, type: 'square', dur: 0.5, gain: 0.16, delay: i * 0.07, attack: 0.01 }));
    noiseBurst({ dur: 0.4, gain: 0.15, filterFreq: 4000, Q: 0.3, delay: 0.02 });
  }

  function sfxWhistleStart() {
    blip({ freq: 1800, type: 'square', dur: 0.18, gain: 0.12 });
  }

  function sfxWhistleEnd() {
    blip({ freq: 1500, freqEnd: 800, type: 'square', dur: 0.5, gain: 0.14 });
  }

  function sfxBounce() {
    blip({ freq: 320, freqEnd: 180, type: 'sine', dur: 0.08, gain: 0.12 });
  }

  function sfxTackle() {
    noiseBurst({ dur: 0.1, gain: 0.22, filterFreq: 700, filterType: 'lowpass', Q: 0.5 });
  }

  function sfxDash() {
    blip({ freq: 500, freqEnd: 900, type: 'sine', dur: 0.12, gain: 0.1 });
  }

  function sfxComboTick(comboLevel) {
    const f = 440 + Math.min(comboLevel, 10) * 60;
    blip({ freq: f, type: 'sine', dur: 0.06, gain: 0.08 });
  }

  function sfxOverclockFull() {
    blip({ freq: 600, freqEnd: 1200, type: 'sine', dur: 0.3, gain: 0.15 });
    blip({ freq: 900, freqEnd: 1800, type: 'sine', dur: 0.3, gain: 0.1, delay: 0.05 });
  }

  function sfxMenuHover() {
    blip({ freq: 700, type: 'sine', dur: 0.05, gain: 0.06 });
  }

  function sfxMenuConfirm() {
    blip({ freq: 500, freqEnd: 900, type: 'triangle', dur: 0.15, gain: 0.14 });
  }

  function sfxPost() {
    blip({ freq: 1200, type: 'sine', dur: 0.18, gain: 0.16 });
    blip({ freq: 1600, type: 'sine', dur: 0.18, gain: 0.1, delay: 0.04 });
  }

  return {
    ensureCtx, setVolume,
    sfxKick, sfxPowerKick, sfxOverdrive, sfxGoal,
    sfxWhistleStart, sfxWhistleEnd, sfxBounce, sfxTackle,
    sfxDash, sfxComboTick, sfxOverclockFull, sfxMenuHover, sfxMenuConfirm,
    sfxPost
  };
})();
