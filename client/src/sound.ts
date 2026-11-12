// Âm thanh tổng hợp bằng WebAudio (không cần file âm thanh, không lo bản quyền).

export type SfxName =
  | 'step' | 'click' | 'plant' | 'water' | 'harvest' | 'coin' | 'buy' | 'error' | 'levelup'
  | 'horn' | 'dice' | 'card' | 'ding' | 'win' | 'lose' | 'pop' | 'whoosh' | 'bark';

let ctx: AudioContext | null = null;
let sfxBus: GainNode;
let musicBus: GainNode;
let noiseBuf: AudioBuffer;

function load(key: string, def: boolean) {
  try { const v = localStorage.getItem(key); return v == null ? def : v === '1'; } catch { return def; }
}
function save(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* bỏ qua */ }
}

export const audioPrefs = { sfx: load('xv_sfx', true), music: load('xv_music', true) };
const listeners = new Set<() => void>();
export function onAudioPrefs(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = audioPrefs.sfx ? 1 : 0;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = audioPrefs.music ? 1 : 0;
    musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Trình duyệt chỉ cho phát âm thanh sau khi người dùng chạm/bấm. */
export function initAudioUnlock() {
  const unlock = () => {
    if (!ensure()) return;
    if (audioPrefs.music) startMusic();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function toggleSfx() {
  audioPrefs.sfx = !audioPrefs.sfx;
  save('xv_sfx', audioPrefs.sfx);
  if (ctx) sfxBus.gain.setTargetAtTime(audioPrefs.sfx ? 1 : 0, ctx.currentTime, 0.05);
  listeners.forEach((f) => f());
}
export function toggleMusic() {
  audioPrefs.music = !audioPrefs.music;
  save('xv_music', audioPrefs.music);
  if (ctx) {
    musicBus.gain.setTargetAtTime(audioPrefs.music ? 1 : 0, ctx.currentTime, 0.2);
    if (audioPrefs.music) startMusic();
  }
  listeners.forEach((f) => f());
}

// ------------------------------------------------------------ khối tạo âm

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number; attack?: number; bus?: GainNode } = {}) {
  const c = ctx!;
  const t0 = c.currentTime + (opts.at ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
  const v = opts.vol ?? 0.15;
  const a = opts.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(opts.bus ?? sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, opts: { freq?: number; to?: number; q?: number; type?: BiquadFilterType; vol?: number; at?: number } = {}) {
  const c = ctx!;
  const t0 = c.currentTime + (opts.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.setValueAtTime(opts.freq ?? 1200, t0);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(opts.vol ?? 0.1, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

let lastStep = 0;

export function sfx(name: SfxName) {
  if (!audioPrefs.sfx || !ensure()) return;
  switch (name) {
    case 'step': {
      const now = performance.now();
      if (now - lastStep < 180) return;
      lastStep = now;
      noise(0.06, { type: 'lowpass', freq: 700 + Math.random() * 300, vol: 0.05 });
      break;
    }
    case 'click': tone(1100, 0.05, { type: 'triangle', vol: 0.05 }); break;
    case 'pop': tone(420, 0.09, { slide: 840, vol: 0.12 }); break;
    case 'plant': tone(260, 0.12, { slide: 520, vol: 0.14 }); noise(0.08, { freq: 500, vol: 0.05, at: 0.02 }); break;
    case 'water':
      noise(0.45, { freq: 2200, to: 500, q: 2, vol: 0.12 });
      [1400, 1700, 1250].forEach((f, i) => tone(f, 0.08, { vol: 0.03, at: 0.05 + i * 0.09 }));
      break;
    case 'harvest': [660, 880, 1320].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.1, at: i * 0.07 })); break;
    case 'coin': tone(988, 0.08, { type: 'square', vol: 0.04 }); tone(1319, 0.3, { type: 'square', vol: 0.04, at: 0.07 }); break;
    case 'buy': tone(620, 0.1, { type: 'triangle', vol: 0.08 }); tone(820, 0.15, { type: 'triangle', vol: 0.08, at: 0.08 }); break;
    case 'error': tone(220, 0.14, { type: 'square', vol: 0.04 }); tone(165, 0.2, { type: 'square', vol: 0.04, at: 0.12 }); break;
    case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.1, at: i * 0.09 })); break;
    case 'horn':
      for (const at of [0, 0.32]) { tone(392, 0.25, { type: 'square', vol: 0.05, at }); tone(494, 0.25, { type: 'square', vol: 0.04, at }); }
      break;
    case 'dice':
      for (let i = 0; i < 7; i++) noise(0.05, { freq: 2500 + Math.random() * 1500, q: 3, vol: 0.12, at: i * 0.08 + Math.random() * 0.03 });
      break;
    case 'card': noise(0.05, { type: 'highpass', freq: 2500, vol: 0.12 }); break;
    case 'ding': tone(1047, 0.5, { vol: 0.08 }); tone(1568, 0.4, { vol: 0.04, at: 0.02 }); break;
    case 'win': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.1, at: i * 0.07 })); break;
    case 'lose': tone(392, 0.45, { type: 'triangle', slide: 196, vol: 0.1 }); break;
    case 'whoosh': noise(0.4, { freq: 400, to: 2400, q: 1.5, vol: 0.08 }); break;
    case 'bark':
      // "Gâu! Gâu!": 2 tiếng sủa ngắn
      for (const at of [0, 0.22]) {
        tone(620, 0.12, { type: 'square', slide: 330, vol: 0.06, at });
        noise(0.1, { freq: 900, q: 2, vol: 0.08, at });
      }
      break;
  }
}

// ------------------------------------------------------------ tiếng động cơ xe buýt

export function startEngine(): () => void {
  if (!audioPrefs.sfx || !ensure()) return () => {};
  const c = ctx!;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 52;
  const lfo = c.createOscillator();
  lfo.frequency.value = 7;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 4;
  lfo.connect(lfoGain).connect(o.frequency);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 260;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.07, c.currentTime + 0.4);
  o.connect(f).connect(g).connect(sfxBus);
  o.start(); lfo.start();
  return () => {
    g.gain.setTargetAtTime(0.0001, c.currentTime, 0.15);
    o.stop(c.currentTime + 0.6); lfo.stop(c.currentTime + 0.6);
  };
}

// ------------------------------------------------------------ nhạc nền nhẹ nhàng

let musicTimer: number | null = null;

function startMusic() {
  if (musicTimer != null || !ctx) return;
  const c = ctx;
  const bpm = 92;
  const beat = 60 / bpm;
  // C - Am - F - G, giai điệu ngũ cung
  const chords = [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59]];
  const scale = [60, 62, 64, 67, 69, 72, 74, 76];
  const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
  let step = 0;
  let next = c.currentTime + 0.1;
  let seed = 7;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const note = (n: number, at: number, dur: number, vol: number, type: OscillatorType) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = midi(n);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(musicBus);
    o.start(at); o.stop(at + dur + 0.05);
  };
  const tick = () => {
    while (next < c.currentTime + 0.6) {
      const bar = Math.floor(step / 8) % 4;
      const ch = chords[bar];
      const s = step % 8;
      if (s === 0) { note(ch[0] - 12, next, beat * 3.5, 0.05, 'sine'); }
      if (s % 2 === 0) note(ch[1 + ((s / 2) % 2)], next, beat * 0.9, 0.018, 'triangle');
      if (rand() < 0.55) {
        const pool = scale.filter((n) => ch.some((cn) => (n - cn) % 12 === 0) || rand() < 0.35);
        note(pool[Math.floor(rand() * pool.length)], next, beat * 0.8, 0.03, 'sine');
      }
      next += beat / 2;
      step++;
    }
  };
  tick();
  musicTimer = window.setInterval(tick, 200);
}
