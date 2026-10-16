/*
 * Sound effects and music, synthesised with Web Audio so there are no sound
 * files to download. Nothing plays until the player first presses a key or
 * touches the screen, as browsers require.
 */

export interface Sound {
  unlock(): void;
  play(name: string, n?: number): void;
  /** 'title', 'sector:N', 'boss:N', or null for silence. */
  music(track: string | null): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  dispose(): void;
}

/**
 * Overall loudness. The parts are mixed quietly so they can stack; this brings the whole mix up to the
 * level of other games and videos, and the limiter after it keeps the loudest moments from distorting.
 */
const VOLUME = 6;

const ROOTS = [45, 43, 46, 41, 44, 42];
const TEMPOS = [118, 122, 126, 130, 134, 138];

function freq(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

export function createSound(startMuted: boolean): Sound {
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfx: GainNode | null = null;
  let mus: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let muted = startMuted;
  let waka = false;
  const last = new Map<string, number>();

  let track: string | null = null;
  let wanted: string | null = null;
  let step = 0;
  let nextTime = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function ready(): boolean {
    return !!ac && ac.state === 'running';
  }

  /**
   * iPhones and iPads treat Web Audio like a ringtone, so the ring/silent switch mutes it. Asking for
   * "playback" (Safari 16.4 and later) makes the game sound like a video does. Older Safari gets the
   * same effect from a silent <audio> element kept playing.
   */
  let silent: HTMLAudioElement | null = null;
  function wakeApple(): void {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) {
      try {
        if (nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback';
      } catch {
        // Not allowed here; the switch just keeps its say.
      }
      return;
    }
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
    if (!apple) return;
    if (!silent) {
      silent = new Audio(silentWav());
      silent.loop = true;
      silent.setAttribute('playsinline', '');
    }
    if (silent.paused) silent.play().catch(() => undefined);
  }

  /** Call from every key press and tap: browsers only let sound start inside one. */
  function unlock(): void {
    wakeApple();
    if (!ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ac = new AC({ latencyHint: 'interactive' });
      master = ac.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      const limiter = ac.createDynamicsCompressor();
      limiter.threshold.value = -9;
      limiter.knee.value = 4;
      limiter.ratio.value = 16;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      master.connect(limiter);
      limiter.connect(ac.destination);
      sfx = ac.createGain();
      sfx.gain.value = 0.9;
      sfx.connect(master);
      mus = ac.createGain();
      mus.gain.value = 0.4;
      mus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    // 'suspended' before the first gesture, 'interrupted' on iOS after a call or a trip to another app.
    if (ac.state !== 'running' && ac.state !== 'closed') {
      // Older iOS only wakes once something actually plays inside the gesture.
      const blip = ac.createBufferSource();
      blip.buffer = ac.createBuffer(1, 1, 22050);
      blip.connect(ac.destination);
      blip.start(0);
      ac.resume().then(
        () => music(wanted),
        () => undefined,
      );
    } else music(wanted);
  }

  interface ToneOptions {
    type?: OscillatorType;
    vol?: number;
    to?: number;
    delay?: number;
    attack?: number;
    out?: GainNode | null;
  }

  function tone(f: number, dur: number, o: ToneOptions = {}): void {
    if (!ac) return;
    const t0 = ac.currentTime + (o.delay ?? 0);
    const osc = ac.createOscillator();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(o.vol ?? 0.06, t0 + (o.attack ?? 0.005));
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gn);
    gn.connect(o.out ?? sfx!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  interface NoiseOptions {
    vol?: number;
    filter?: BiquadFilterType;
    f?: number;
    to?: number;
    delay?: number;
    out?: GainNode | null;
  }

  function noise(dur: number, o: NoiseOptions = {}): void {
    if (!ac || !noiseBuf) return;
    const t0 = ac.currentTime + (o.delay ?? 0);
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = o.filter ?? 'lowpass';
    filter.frequency.setValueAtTime(o.f ?? 2000, t0);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    const gn = ac.createGain();
    gn.gain.setValueAtTime(o.vol ?? 0.1, t0);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gn);
    gn.connect(o.out ?? sfx!);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.03);
  }

  function arp(notes: number[], gap: number, o: ToneOptions = {}): void {
    notes.forEach((n, i) => tone(freq(n), gap * 1.6, { ...o, delay: (o.delay ?? 0) + i * gap }));
  }

  /** Minimum time between two plays of the same sound, so a burst of events doesn't clip. */
  const THROTTLE: Record<string, number> = { dot: 0.06, shoot: 0.05, zap: 0.08, bosshit: 0.06, clink: 0.06, pop: 0.05, clank: 0.05, kill: 0.04, enemyshot: 0.08, teleport: 0.2, spawn: 0.2 };

  function play(name: string, n = 0): void {
    if (!ready() || muted) return;
    const now = ac!.currentTime;
    const gap = THROTTLE[name];
    if (gap && now - (last.get(name) ?? -1) < gap) return;
    last.set(name, now);
    switch (name) {
      case 'shoot':
        tone(1100, 0.07, { to: 520, vol: 0.045 });
        tone(2300, 0.04, { type: 'triangle', to: 1200, vol: 0.025 });
        break;
      case 'dot': {
        // The waka climbs as Ben eats dots in quick succession.
        waka = !waka;
        const up = 2 ** ((Math.min(n, 8) * 1.5) / 12);
        tone((waka ? 470 : 620) * up, 0.06, { type: 'triangle', to: (waka ? 380 : 520) * up, vol: 0.06 });
        break;
      }
      case 'heartbeat':
        tone(70, 0.12, { type: 'sine', to: 45, vol: 0.35 });
        tone(64, 0.12, { type: 'sine', to: 40, vol: 0.28, delay: 0.16 });
        break;
      case 'combo':
        arp([72, 79, 84], 0.05, { vol: 0.06 });
        break;
      case 'megacombo':
        arp([72, 76, 79, 84, 88, 91, 96], 0.045, { vol: 0.06 });
        noise(0.4, { filter: 'highpass', f: 3000, vol: 0.08 });
        break;
      case 'power':
        arp([60, 64, 67, 72, 76, 79], 0.045, { vol: 0.05 });
        tone(120, 0.5, { type: 'sawtooth', to: 480, vol: 0.05 });
        break;
      case 'kill':
        noise(0.3, { f: 2600, to: 250, vol: 0.28 });
        tone(240, 0.25, { to: 50, vol: 0.07 });
        break;
      case 'eat':
        tone(300, 0.2, { to: 1500, vol: 0.06 });
        tone(600, 0.2, { type: 'triangle', to: 2600, vol: 0.04 });
        break;
      case 'clank':
        tone(950, 0.04, { vol: 0.05 });
        noise(0.05, { filter: 'highpass', f: 3000, vol: 0.08 });
        break;
      case 'enemyshot':
        tone(760, 0.12, { type: 'sawtooth', to: 280, vol: 0.035 });
        break;
      case 'charge':
        tone(200, 0.4, { type: 'sawtooth', to: 900, vol: 0.03 });
        break;
      case 'zap':
        noise(0.12, { filter: 'bandpass', f: 2200, vol: 0.1 });
        tone(1500, 0.12, { to: 300, vol: 0.03 });
        break;
      case 'bosshit':
        tone(150, 0.05, { to: 90, vol: 0.06 });
        break;
      case 'clink':
        tone(2500, 0.05, { type: 'triangle', vol: 0.05 });
        break;
      case 'death':
        tone(820, 1.3, { type: 'sawtooth', to: 70, vol: 0.07, attack: 0.02 });
        tone(830, 1.3, { type: 'square', to: 72, vol: 0.03, attack: 0.02 });
        noise(0.4, { f: 1200, to: 100, vol: 0.2, delay: 1.2 });
        break;
      case 'spawn':
        tone(200, 0.25, { type: 'triangle', to: 640, vol: 0.035 });
        break;
      case 'pickup':
      case 'drop':
        tone(660, 0.09, { type: 'triangle', vol: 0.06 });
        tone(990, 0.14, { type: 'triangle', vol: 0.06, delay: 0.08 });
        break;
      case 'life':
        arp([72, 76, 79, 84, 88], 0.08, { type: 'triangle', vol: 0.07 });
        break;
      case 'bonus':
      case 'sweep':
        arp([76, 79, 84, 88], 0.06, { type: 'triangle', vol: 0.06 });
        break;
      case 'emp':
        noise(0.6, { filter: 'bandpass', f: 900, to: 150, vol: 0.25 });
        tone(110, 0.6, { type: 'sine', to: 35, vol: 0.2 });
        break;
      case 'shieldbreak':
        noise(0.3, { filter: 'highpass', f: 2500, vol: 0.18 });
        tone(1300, 0.3, { type: 'triangle', to: 200, vol: 0.06 });
        break;
      case 'teleport':
        tone(300, 0.22, { type: 'sine', to: 1900, vol: 0.06 });
        break;
      case 'warning':
        for (let i = 0; i < 3; i++) {
          tone(880, 0.18, { vol: 0.05, delay: i * 0.42 });
          tone(660, 0.18, { vol: 0.05, delay: i * 0.42 + 0.21 });
        }
        break;
      case 'intro':
        arp([67, 72, 76, 79], 0.09, { vol: 0.05 });
        break;
      case 'go':
        tone(freq(79), 0.12, { vol: 0.05 });
        tone(freq(84), 0.2, { vol: 0.05, delay: 0.1 });
        break;
      case 'clear':
        arp([72, 76, 79, 84, 79, 84, 88], 0.09, { vol: 0.06 });
        break;
      case 'laserwarn':
        tone(400, 0.7, { type: 'sawtooth', to: 460, vol: 0.025 });
        break;
      case 'laser':
        noise(0.5, { filter: 'bandpass', f: 1300, vol: 0.18 });
        tone(95, 0.5, { type: 'sawtooth', vol: 0.07 });
        break;
      case 'slam':
        noise(0.4, { f: 900, to: 90, vol: 0.4 });
        tone(85, 0.4, { type: 'sine', to: 30, vol: 0.28 });
        break;
      case 'dash':
        noise(0.3, { filter: 'bandpass', f: 500, to: 2600, vol: 0.14 });
        break;
      case 'roar':
        tone(72, 1, { type: 'sawtooth', to: 48, vol: 0.12, attack: 0.05 });
        tone(75, 1, { type: 'square', to: 50, vol: 0.05, attack: 0.05 });
        noise(0.9, { f: 600, to: 120, vol: 0.15 });
        break;
      case 'bossdie':
        noise(1.6, { f: 3000, to: 90, vol: 0.4 });
        tone(220, 1.6, { type: 'sawtooth', to: 30, vol: 0.09 });
        break;
      case 'boom':
        noise(1.3, { f: 1600, to: 60, vol: 0.6 });
        tone(65, 1.3, { type: 'sine', to: 25, vol: 0.45 });
        break;
      case 'pop':
        noise(0.15, { filter: 'bandpass', f: 1600, vol: 0.14 });
        break;
      case 'summon':
      case 'appear':
      case 'warp':
        tone(180, 0.35, { type: 'triangle', to: 900, vol: 0.05 });
        tone(900, 0.35, { type: 'triangle', to: 180, vol: 0.03 });
        break;
      case 'glitch':
        for (let i = 0; i < 5; i++) tone(200 + Math.random() * 1800, 0.04, { vol: 0.04, delay: i * 0.04 });
        break;
      case 'vent':
        noise(1.2, { filter: 'highpass', f: 1500, to: 400, vol: 0.12 });
        break;
      case 'missile':
      case 'mine':
        tone(500, 0.15, { type: 'triangle', to: 250, vol: 0.04 });
        break;
      case 'shieldup':
        arp([60, 67, 72], 0.06, { type: 'sawtooth', vol: 0.03 });
        break;
      case 'shielddown':
        arp([72, 67, 60], 0.06, { type: 'sawtooth', vol: 0.04 });
        break;
      case 'powerdown':
      case 'overdriveend':
        tone(600, 0.2, { type: 'triangle', to: 300, vol: 0.04 });
        break;
      case 'menu':
        tone(880, 0.05, { vol: 0.04 });
        break;
      case 'type':
        tone(1200 + Math.random() * 300, 0.025, { type: 'square', vol: 0.02 });
        break;
      case 'taunt':
        // A robot voice: a burst of gruff blips.
        for (let i = 0; i < 7; i++) tone(110 + Math.random() * 90, 0.07, { type: 'sawtooth', vol: 0.05, delay: i * 0.08 });
        break;
      case 'start':
        arp([60, 67, 72, 79], 0.06, { vol: 0.05 });
        break;
      case 'pause':
      case 'resume':
        tone(660, 0.06, { type: 'triangle', vol: 0.05 });
        break;
      case 'gameover':
        arp([67, 63, 60, 55, 51], 0.22, { vol: 0.06 });
        break;
      case 'victory':
        arp([60, 64, 67, 72, 67, 72, 76, 79, 84], 0.12, { vol: 0.06 });
        break;
    }
  }

  /* ---------- music: a four-bar loop per sector, faster and harsher for bosses ---------- */

  const PROGRESSION = [0, 8, 3, 10];
  const QUALITY = [3, 4, 4, 4];

  function playStep(s: number, t: number): void {
    if (!ac || !track) return;
    const [kind, arg] = track.split(':');
    const sector = Number(arg ?? 0);
    const boss = kind === 'boss';
    const title = kind === 'title';
    const root = ROOTS[sector] ?? 45;
    const bar = Math.floor(s / 16) % 4;
    const i = s % 16;
    const chordRoot = root + PROGRESSION[bar];
    const chord = [0, QUALITY[bar], 7];
    const at = (n: number, dur: number, o: ToneOptions) => {
      const osc = ac!.createOscillator();
      osc.type = o.type ?? 'square';
      osc.frequency.setValueAtTime(freq(n), t);
      const gn = ac!.createGain();
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(o.vol ?? 0.05, t + 0.008);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gn);
      gn.connect(mus!);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    };
    // Bass on eighth notes, jumping an octave on the off-beats.
    if (i % 2 === 0) at(chordRoot - 12 + (i === 6 || i === 14 ? 12 : 0), 0.16, { type: boss ? 'sawtooth' : 'triangle', vol: boss ? 0.09 : 0.14 });
    // Arpeggio.
    if (!title || i % 2 === 0) {
      const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
      const n = chordRoot + 12 + chord[pattern[i % 8]] + (i >= 8 && boss ? 12 : 0);
      if (boss || i % 2 === 0) at(n, 0.09, { type: 'square', vol: title ? 0.025 : 0.03 });
    }
    if (title) return;
    // Drums.
    if (i === 0 || i === 8 || (boss && (i === 4 || i === 12 || i === 14))) {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      const gn = ac.createGain();
      gn.gain.setValueAtTime(0.3, t);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gn);
      gn.connect(mus!);
      osc.start(t);
      osc.stop(t + 0.16);
    }
    if (noiseBuf && (i === 4 || i === 12 || i % 4 === 2)) {
      const snare = i === 4 || i === 12;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      const filter = ac.createBiquadFilter();
      filter.type = snare ? 'bandpass' : 'highpass';
      filter.frequency.value = snare ? 1800 : 7000;
      const gn = ac.createGain();
      gn.gain.setValueAtTime(snare ? 0.12 : 0.035, t);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + (snare ? 0.12 : 0.04));
      src.connect(filter);
      filter.connect(gn);
      gn.connect(mus!);
      src.start(t, Math.random() * 0.5);
      src.stop(t + 0.15);
    }
  }

  function tempo(): number {
    if (!track) return 120;
    const [kind, arg] = track.split(':');
    if (kind === 'title') return 104;
    if (kind === 'boss') return 150 + Number(arg ?? 0) * 3;
    return TEMPOS[Number(arg ?? 0)] ?? 120;
  }

  function schedule(): void {
    if (!ac || !track) return;
    const sixteenth = 60 / tempo() / 4;
    while (nextTime < ac.currentTime + 0.15) {
      playStep(step, nextTime);
      nextTime += sixteenth;
      step++;
    }
  }

  function music(next: string | null): void {
    wanted = next;
    const play = ready() && !muted ? next : null;
    if (play === track) return;
    track = play;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (!track || !ac) return;
    step = 0;
    nextTime = ac.currentTime + 0.06;
    timer = setInterval(schedule, 25);
    schedule();
  }

  return {
    unlock,
    play,
    music,
    setMuted(m: boolean) {
      muted = m;
      if (master && ac) master.gain.setTargetAtTime(m ? 0 : VOLUME, ac.currentTime, 0.02);
      music(wanted);
    },
    isMuted: () => muted,
    dispose() {
      if (timer) clearInterval(timer);
      timer = null;
      track = null;
      if (ac) void ac.close();
      ac = null;
      silent?.pause();
      silent = null;
    },
  };
}

/** Half a second of silence as a WAV file, for the <audio> element that wakes older iPhones. */
function silentWav(): string {
  const n = 4000;
  const b = new DataView(new ArrayBuffer(44 + n));
  const tag = (at: number, t: string) => {
    for (let i = 0; i < t.length; i++) b.setUint8(at + i, t.charCodeAt(i));
  };
  tag(0, 'RIFF');
  b.setUint32(4, 36 + n, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true); // PCM
  b.setUint16(22, 1, true); // mono
  b.setUint32(24, 8000, true); // samples a second
  b.setUint32(28, 8000, true); // bytes a second
  b.setUint16(32, 1, true);
  b.setUint16(34, 8, true); // 8-bit, where silence is 128
  tag(36, 'data');
  b.setUint32(40, n, true);
  let bin = '';
  for (let i = 0; i < 44 + n; i++) bin += String.fromCharCode(i < 44 ? b.getUint8(i) : 128);
  return 'data:audio/wav;base64,' + btoa(bin);
}
