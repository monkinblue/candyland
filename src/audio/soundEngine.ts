import {
  VOICE_MANIFEST,
  type VoiceKey,
  getCardVoiceKey,
  getColorCardVoiceKey,
  getLandmarkCardVoiceKey,
  getTurnVoiceKey,
  getVictoryVoiceKey,
  isVoiceKey,
} from '../data/audioManifest';

export type AudioMode = 'tv' | 'tablet' | 'mirror';

export interface AudioEngineState {
  mode: AudioMode;
  unlocked: boolean;
  muted: boolean;
  bgmMuted: boolean;
  bgmPlaying: boolean;
  speaking: boolean;
}

export interface PlayVoiceOptions {
  /** If true, interrupts any currently playing voiceover and clears queued clips. */
  interrupt?: boolean;
}

interface QueuedVoiceItem {
  key: VoiceKey;
  resolve: () => void;
}

type AudioStateListener = (state: AudioEngineState) => void;

// C major / G major storybook Candyland motif — 16 bars, 16th-note grid (64 eighth-note steps)
// Note frequencies (Hz)
const NOTE: Record<string, number> = {
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
  B5: 987.77,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
};

// 64 eighth-note steps (8 bars of 4/4 at ~114 BPM -> ~16.8s seamless fairytale loop)
const BGM_MELODY: ReadonlyArray<string | null> = [
  // Bar 1 (C): bouncy candy-shop theme
  'E5', null, 'G5', 'A5', 'G5', null, 'E5', 'C5',
  // Bar 2 (G7): playful answer
  'D5', null, 'F5', 'G5', 'F5', null, 'D5', null,
  // Bar 3 (F -> C): sweet climb
  'C5', 'D5', 'E5', 'G5', 'A5', null, 'G5', 'E5',
  // Bar 4 (G): twirling turnaround
  'D5', 'E5', 'F5', 'E5', 'D5', null, 'G4', null,
  // Bar 5 (C): sparkly variation
  'E5', null, 'G5', 'C6', 'A5', null, 'G5', 'E5',
  // Bar 6 (Am -> Dm): fairytale wonder
  'A5', 'G5', 'F5', 'E5', 'F5', null, 'D5', null,
  // Bar 7 (F -> G): skipping toward Candy Castle
  'F5', null, 'A5', 'G5', 'E5', 'G5', 'D5', 'F5',
  // Bar 8 (C): warm smiling cadence
  'E5', null, 'C5', null, 'C5', null, null, null,
];

const BGM_MARIMBA: ReadonlyArray<ReadonlyArray<string> | null> = [
  // Gentle off-beat marimba chords (on beats 2 & 4 mostly)
  null, null, ['C4', 'E4'], null, null, null, ['E4', 'G4'], null,
  null, null, ['B3', 'D4'], null, null, null, ['D4', 'F4'], null,
  null, null, ['C4', 'F4'], null, null, null, ['C4', 'E4'], null,
  null, null, ['B3', 'D4'], null, null, null, ['B3', 'G4'], null,
  null, null, ['C4', 'E4'], null, null, null, ['E4', 'G4'], null,
  null, null, ['C4', 'E4'], null, null, null, ['A3', 'D4'], null,
  null, null, ['C4', 'F4'], null, null, null, ['B3', 'F4'], null,
  null, null, ['C4', 'E4'], null, ['C4', 'E4', 'G4'], null, null, null,
];

const BGM_BASS: ReadonlyArray<string | null> = [
  'C3', null, null, null, 'G3', null, null, null,
  'G3', null, null, null, 'D3', null, null, null,
  'F3', null, null, null, 'C3', null, null, null,
  'G3', null, null, null, 'G3', null, null, null,
  'C3', null, null, null, 'G3', null, null, null,
  'A3', null, null, null, 'D3', null, null, null,
  'F3', null, null, null, 'G3', null, null, null,
  'C3', null, null, null, 'C3', null, null, null,
];

const HOP_PENTATONIC = [
  NOTE.C5,
  NOTE.D5,
  NOTE.E5,
  NOTE.G5,
  NOTE.A5,
  NOTE.C6,
  NOTE.D6,
  NOTE.E6,
];

const BGM_NORMAL_GAIN = 0.2;
const BGM_DUCKED_GAIN = 0.04;
const EIGHTH_NOTE_SEC = 60 / 114 / 2; // ~0.263s per 8th note
const SAME_KEY_DEDUPE_MS = 1400;

class CandylandSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private bgmDelay: DelayNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private mode: AudioMode = 'mirror';
  private unlocked = false;
  private muted = false;
  private bgmMuted = false;
  private bgmPlaying = false;
  private bgmDesired = false;
  private speaking = false;
  private cutsceneDucking = false;

  // BGM lookahead scheduler state
  private bgmTimerId: number | null = null;
  private bgmStep = 0;
  private bgmNextStepTime = 0;

  // Voiceover buffer cache & queue
  private voiceBufferCache = new Map<VoiceKey, AudioBuffer>();
  private voiceLoading = new Map<VoiceKey, Promise<AudioBuffer | null>>();
  private voiceQueue: QueuedVoiceItem[] = [];
  private processingVoiceQueue = false;
  private voiceGeneration = 0;
  private activeVoiceKey: VoiceKey | null = null;
  private lastPlayedVoiceKey: VoiceKey | null = null;
  private lastPlayedVoiceAt = 0;
  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private activeHtmlAudio: HTMLAudioElement | null = null;
  private activeVoiceCancel: (() => void) | null = null;

  private listeners = new Set<AudioStateListener>();
  private gestureListenersBound = false;

  constructor() {
    this.bindGestureUnlock();
  }

  private bindGestureUnlock(): void {
    if (this.gestureListenersBound || typeof window === 'undefined') return;
    this.gestureListenersBound = true;

    const handleGesture = () => {
      void this.unlock();
    };

    window.addEventListener('pointerdown', handleGesture, { capture: true, passive: true });
    window.addEventListener('touchstart', handleGesture, { capture: true, passive: true });
    window.addEventListener('keydown', handleGesture, { capture: true, passive: true });
    window.addEventListener('click', handleGesture, { capture: true, passive: true });
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      // Soft dynamics compressor on master bus prevents any harsh clipping when multiple SFX fire
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.15;

      const masterGain = ctx.createGain();
      masterGain.gain.value = this.muted ? 0 : 0.92;
      masterGain.connect(compressor);
      compressor.connect(ctx.destination);
      this.masterGain = masterGain;

      // BGM bus with gentle warm fairy-tale echo
      const bgmGain = ctx.createGain();
      bgmGain.gain.value = this.getTargetBgmGain();
      bgmGain.connect(masterGain);
      this.bgmGain = bgmGain;

      const bgmDelay = ctx.createDelay(0.5);
      bgmDelay.delayTime.value = 0.22;
      const delayFilter = ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.value = 1800;
      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.16;

      bgmDelay.connect(delayFilter);
      delayFilter.connect(delayFeedback);
      delayFeedback.connect(bgmGain);
      this.bgmDelay = bgmDelay;

      // SFX bus
      const sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.85;
      sfxGain.connect(masterGain);
      this.sfxGain = sfxGain;

      // Voiceover bus (crisp, prominent above ducked BGM)
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 1.0;
      voiceGain.connect(masterGain);
      this.voiceGain = voiceGain;

      // Track state changes (e.g. if browser auto-resumes or suspends)
      ctx.onstatechange = () => {
        const nowUnlocked = ctx.state === 'running';
        if (nowUnlocked !== this.unlocked) {
          this.unlocked = nowUnlocked;
          this.emitState();
        }
      };

      if (ctx.state === 'running') {
        this.unlocked = true;
      }
    }

    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 0.6);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Slightly smoothed pink-ish noise for warm paper/leaf sounds
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.45 + white * 0.55;
      data[i] = last;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private getTargetBgmGain(): number {
    if (this.muted || this.bgmMuted || !this.allowsBgmAndVoice()) {
      return 0;
    }
    if (this.speaking || this.cutsceneDucking) {
      return BGM_DUCKED_GAIN;
    }
    return BGM_NORMAL_GAIN;
  }

  private allowsBgmAndVoice(): boolean {
    return this.mode === 'tv' || this.mode === 'mirror';
  }

  private allowsSfx(): boolean {
    return !this.muted;
  }

  private updateGainTargets(fast = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.masterGain || !this.bgmGain) return;
    const now = ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.92, now, 0.04);

    const targetBgm = this.getTargetBgmGain();
    const tc = fast ? 0.06 : targetBgm < this.bgmGain.gain.value ? 0.1 : 0.28;
    this.bgmGain.gain.setTargetAtTime(targetBgm, now, tc);
  }

  private emitState(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  public getState(): AudioEngineState {
    return {
      mode: this.mode,
      unlocked: this.unlocked,
      muted: this.muted,
      bgmMuted: this.bgmMuted,
      bgmPlaying: this.bgmPlaying,
      speaking: this.speaking,
    };
  }

  public subscribe(listener: AudioStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  public async unlock(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;

    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
    } catch {
      return false;
    }

    const running = ctx.state === 'running';
    if (running) {
      if (!this.unlocked) {
        this.unlocked = true;
        this.emitState();
      }
      if (this.bgmDesired && this.allowsBgmAndVoice() && !this.bgmPlaying) {
        this.startBgmScheduler();
      }
    }
    return running;
  }

  public setAudioMode(mode: AudioMode): void {
    if (this.mode === mode) return;
    this.mode = mode;

    if (mode === 'tablet') {
      // Tablet defaults to tactile touch SFX only (no BGM/voiceover echo with TV)
      this.stopVoice();
      this.stopBgmScheduler();
    } else if (this.bgmDesired && this.unlocked && !this.bgmMuted && !this.muted) {
      this.startBgmScheduler();
    }

    this.updateGainTargets(true);
    this.emitState();
  }

  public getAudioMode(): AudioMode {
    return this.mode;
  }

  public setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (muted) {
      this.stopVoice();
    } else {
      void this.unlock();
    }
    this.updateGainTargets(true);
    this.emitState();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public setBgmMuted(bgmMuted: boolean): void {
    if (this.bgmMuted === bgmMuted) return;
    this.bgmMuted = bgmMuted;
    if (bgmMuted) {
      this.stopBgmScheduler();
    } else if (this.bgmDesired && this.allowsBgmAndVoice() && this.unlocked) {
      this.startBgmScheduler();
    }
    this.updateGainTargets(true);
    this.emitState();
  }

  public isBgmMuted(): boolean {
    return this.bgmMuted;
  }

  public toggleBgmMute(): boolean {
    this.setBgmMuted(!this.bgmMuted);
    return this.bgmMuted;
  }

  public setCutsceneDucking(active: boolean): void {
    if (active) {
      this.stopVoice();
    }
    if (this.cutsceneDucking === active) return;
    this.cutsceneDucking = active;
    this.updateGainTargets(false);
  }

  // =========================================================================
  // CHEERFUL CANDYLAND BGM (Polyphonic Web Audio Celesta + Marimba + Bass)
  // =========================================================================

  public startBgm(): void {
    this.bgmDesired = true;
    if (!this.allowsBgmAndVoice() || this.bgmMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (ctx.state === 'running') {
      this.startBgmScheduler();
    }
  }

  public stopBgm(): void {
    this.bgmDesired = false;
    this.stopBgmScheduler();
  }

  private startBgmScheduler(): void {
    if (this.bgmPlaying || typeof window === 'undefined') return;
    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== 'running') return;

    this.bgmPlaying = true;
    this.bgmNextStepTime = ctx.currentTime + 0.08;

    const lookaheadMs = 30;
    const scheduleAheadSec = 0.14;

    this.bgmTimerId = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      while (this.bgmNextStepTime < this.ctx.currentTime + scheduleAheadSec) {
        this.scheduleBgmStep(this.bgmStep, this.bgmNextStepTime);
        // Subtle fairytale swing feel on off-beat eighths
        const swing = this.bgmStep % 2 === 0 ? 1.06 : 0.94;
        this.bgmNextStepTime += EIGHTH_NOTE_SEC * swing;
        this.bgmStep = (this.bgmStep + 1) % BGM_MELODY.length;
      }
    }, lookaheadMs);

    this.updateGainTargets(false);
    this.emitState();
  }

  private stopBgmScheduler(): void {
    if (this.bgmTimerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.bgmTimerId);
      this.bgmTimerId = null;
    }
    if (this.bgmPlaying) {
      this.bgmPlaying = false;
      this.emitState();
    }
  }

  private scheduleBgmStep(step: number, time: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmGain) return;

    const melodyNote = BGM_MELODY[step];
    if (melodyNote && NOTE[melodyNote]) {
      this.playCelestaNote(ctx, NOTE[melodyNote], time, 0.34, 0.24);
    }

    const chord = BGM_MARIMBA[step];
    if (chord) {
      for (const n of chord) {
        if (NOTE[n]) {
          this.playMarimbaNote(ctx, NOTE[n], time, 0.2, 0.13);
        }
      }
    }

    const bassNote = BGM_BASS[step];
    if (bassNote && NOTE[bassNote]) {
      this.playPizzicatoBass(ctx, NOTE[bassNote], time, 0.36, 0.22);
    }
  }

  private playCelestaNote(
    ctx: AudioContext,
    freq: number,
    time: number,
    duration: number,
    volume: number
  ): void {
    if (!this.bgmGain) return;

    const osc = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const harmGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    // Gentle bell shimmer overtone
    harmonic.type = 'triangle';
    harmonic.frequency.setValueAtTime(freq * 2, time);
    harmGain.gain.setValueAtTime(0.18, time);
    harmGain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.45);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    osc.connect(filter);
    harmonic.connect(harmGain);
    harmGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    if (this.bgmDelay) {
      gain.connect(this.bgmDelay);
    }

    osc.start(time);
    harmonic.start(time);
    osc.stop(time + duration + 0.03);
    harmonic.stop(time + duration + 0.03);
  }

  private playMarimbaNote(
    ctx: AudioContext,
    freq: number,
    time: number,
    duration: number,
    volume: number
  ): void {
    if (!this.bgmGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private playPizzicatoBass(
    ctx: AudioContext,
    freq: number,
    time: number,
    duration: number,
    volume: number
  ): void {
    if (!this.bgmGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  // =========================================================================
  // ELEVENLABS NARRATOR VOICEOVER QUEUE WITH AUTOMATIC BGM DUCKING
  // =========================================================================

  public preloadVoices(keys: readonly VoiceKey[]): void {
    if (typeof window === 'undefined' || !this.allowsBgmAndVoice()) return;
    for (const key of keys) {
      void this.loadVoiceBuffer(key);
    }
  }

  private async loadVoiceBuffer(key: VoiceKey): Promise<AudioBuffer | null> {
    const cached = this.voiceBufferCache.get(key);
    if (cached) return cached;

    const inflight = this.voiceLoading.get(key);
    if (inflight) return inflight;

    const meta = VOICE_MANIFEST[key];
    if (!meta) return null;

    const promise = (async () => {
      try {
        const res = await fetch(meta.path);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        if (arr.byteLength < 1024) return null;
        const ctx = this.ensureContext();
        if (!ctx) return null;
        const decoded = await ctx.decodeAudioData(arr.slice(0));
        this.voiceBufferCache.set(key, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.voiceLoading.delete(key);
      }
    })();

    this.voiceLoading.set(key, promise);
    return promise;
  }

  public playVoice(key: VoiceKey, options?: PlayVoiceOptions): Promise<void> {
    if (this.muted || !this.allowsBgmAndVoice() || !(key in VOICE_MANIFEST)) {
      return Promise.resolve();
    }

    const now = Date.now();
    const isDuplicateActive = this.activeVoiceKey === key;
    const isDuplicateQueued = this.voiceQueue.some((item) => item.key === key);
    const isDuplicateRecent =
      this.lastPlayedVoiceKey === key && now - this.lastPlayedVoiceAt < SAME_KEY_DEDUPE_MS;

    if (isDuplicateActive || isDuplicateQueued || isDuplicateRecent) {
      return Promise.resolve();
    }

    if (options?.interrupt) {
      this.stopVoice();
    }

    this.lastPlayedVoiceKey = key;
    this.lastPlayedVoiceAt = now;

    return new Promise<void>((resolve) => {
      this.voiceQueue.push({ key, resolve });
      if (!this.processingVoiceQueue) {
        const runGen = this.voiceGeneration;
        void this.drainVoiceQueue(runGen);
      }
    });
  }

  private stopActivePlaybackOnly(): void {
    const src = this.activeVoiceSource;
    this.activeVoiceSource = null;
    if (src) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        // Already stopped
      }
      try {
        src.disconnect();
      } catch {
        // Already disconnected
      }
    }

    const htmlAudio = this.activeHtmlAudio;
    this.activeHtmlAudio = null;
    if (htmlAudio) {
      try {
        htmlAudio.onended = null;
        htmlAudio.onerror = null;
        htmlAudio.pause();
        htmlAudio.currentTime = 0;
      } catch {
        // Ignore
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }

    if (this.activeVoiceCancel) {
      const cancel = this.activeVoiceCancel;
      this.activeVoiceCancel = null;
      cancel();
    }
  }

  public stopVoice(): void {
    this.voiceGeneration += 1;
    this.processingVoiceQueue = false;
    this.activeVoiceKey = null;
    this.lastPlayedVoiceKey = null;
    this.lastPlayedVoiceAt = 0;

    // Resolve any pending queued items cleanly
    while (this.voiceQueue.length > 0) {
      const item = this.voiceQueue.shift();
      item?.resolve();
    }

    this.stopActivePlaybackOnly();

    if (this.speaking) {
      this.speaking = false;
      this.updateGainTargets(false);
      this.emitState();
    }
  }

  private async drainVoiceQueue(runGen: number): Promise<void> {
    if (this.processingVoiceQueue || runGen !== this.voiceGeneration) return;
    this.processingVoiceQueue = true;

    try {
      while (runGen === this.voiceGeneration && this.voiceQueue.length > 0) {
        const next = this.voiceQueue.shift();
        if (!next) continue;

        if (runGen !== this.voiceGeneration || this.muted || !this.allowsBgmAndVoice()) {
          next.resolve();
          continue;
        }

        this.activeVoiceKey = next.key;
        if (!this.speaking) {
          this.speaking = true;
          this.updateGainTargets(false);
          this.emitState();
        }

        await this.playSingleVoiceClip(next.key, runGen);

        if (runGen === this.voiceGeneration && this.activeVoiceKey === next.key) {
          this.activeVoiceKey = null;
        }
        next.resolve();
      }
    } finally {
      if (runGen === this.voiceGeneration) {
        this.processingVoiceQueue = false;
        this.activeVoiceKey = null;
        if (this.speaking) {
          this.speaking = false;
          this.updateGainTargets(false);
          this.emitState();
        }
      }
    }
  }

  private isVoiceStale(gen: number): boolean {
    return gen !== this.voiceGeneration || this.muted || !this.allowsBgmAndVoice();
  }

  private async playSingleVoiceClip(key: VoiceKey, gen: number): Promise<void> {
    const meta = VOICE_MANIFEST[key];
    if (!meta || this.isVoiceStale(gen)) return;

    const ctx = this.ensureContext();
    let mp3Missing = false;

    // Primary path: Web Audio API decoded AudioBuffer (low latency, respects master/voice gain)
    if (ctx && this.voiceGain) {
      if (ctx.state === 'suspended') {
        await this.unlock();
        if (this.isVoiceStale(gen)) return;
      }
      const buffer = await this.loadVoiceBuffer(key);
      if (this.isVoiceStale(gen)) return;

      if (!buffer) {
        mp3Missing = true;
      } else if (ctx.state === 'running') {
        // Defensively stop any lingering audio node before starting so clips can never overlap
        this.stopActivePlaybackOnly();
        if (this.isVoiceStale(gen)) return;

        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            if (this.activeVoiceCancel === finish) {
              this.activeVoiceCancel = null;
            }
            if (this.activeVoiceSource === src) {
              this.activeVoiceSource = null;
            }
            resolve();
          };

          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(this.voiceGain!);
          src.onended = finish;
          this.activeVoiceSource = src;
          this.activeVoiceCancel = finish;

          try {
            src.start(0);
          } catch {
            finish();
          }
        });
        return;
      }
    }

    if (this.isVoiceStale(gen)) return;

    // Fallback 1: HTMLAudioElement (only if MP3 wasn't known missing)
    if (!mp3Missing) {
      this.stopActivePlaybackOnly();
      if (this.isVoiceStale(gen)) return;

      const htmlResult = await new Promise<'played' | 'blocked' | 'error'>((resolve) => {
        if (typeof Audio === 'undefined') {
          resolve('error');
          return;
        }
        let settled = false;
        const audio = new Audio(meta.path);
        audio.volume = this.muted ? 0 : 0.95;

        const finish = (status: 'played' | 'blocked' | 'error') => {
          if (settled) return;
          settled = true;
          if (this.activeHtmlAudio === audio) {
            this.activeHtmlAudio = null;
          }
          if (this.activeVoiceCancel === cancel) {
            this.activeVoiceCancel = null;
          }
          resolve(status);
        };
        const cancel = () => {
          audio.pause();
          finish('played');
        };

        this.activeHtmlAudio = audio;
        this.activeVoiceCancel = cancel;

        audio.onended = () => finish('played');
        audio.onerror = () => finish('error');
        audio.play().catch((err: unknown) => {
          const name = err instanceof Error ? err.name : '';
          finish(name === 'NotAllowedError' ? 'blocked' : 'error');
        });
      });

      if (this.isVoiceStale(gen) || htmlResult === 'played' || htmlResult === 'blocked') return;
    }

    if (this.isVoiceStale(gen)) return;

    // Fallback 2: Browser Web Speech API ONLY when unlocked and MP3 asset is missing
    if (this.unlocked && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.stopActivePlaybackOnly();
      if (this.isVoiceStale(gen)) return;

      await new Promise<void>((resolve) => {
        let settled = false;
        const timeoutId = window.setTimeout(() => finish(), 7000);
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          if (this.activeVoiceCancel === finish) {
            this.activeVoiceCancel = null;
          }
          resolve();
        };
        try {
          const utterance = new SpeechSynthesisUtterance(meta.text);
          utterance.rate = 1.02;
          utterance.pitch = 1.12;
          utterance.volume = this.muted ? 0 : 0.88;
          utterance.onend = finish;
          utterance.onerror = finish;
          this.activeVoiceCancel = finish;
          window.speechSynthesis.speak(utterance);
        } catch {
          finish();
        }
      });
    }
  }

  // Convenience voiceover helpers
  public playVoiceIfValid(
    key: string | null | undefined,
    options?: PlayVoiceOptions
  ): Promise<void> {
    if (!isVoiceKey(key)) return Promise.resolve();
    return this.playVoice(key, options);
  }

  public playTurnVoice(characterId: string, options?: PlayVoiceOptions): Promise<void> {
    return this.playVoice(getTurnVoiceKey(characterId), options);
  }

  public playVictoryVoice(characterId?: string | null, options?: PlayVoiceOptions): Promise<void> {
    return this.playVoice(getVictoryVoiceKey(characterId), options);
  }

  public playColorCardVoice(
    color: 'red' | 'purple' | 'yellow' | 'blue' | 'orange' | 'green',
    isDouble = false,
    options?: PlayVoiceOptions
  ): Promise<void> {
    return this.playVoice(getColorCardVoiceKey(color, isDouble), options);
  }

  public playLandmarkCardVoice(landmarkId: string, options?: PlayVoiceOptions): Promise<void> {
    const key = getLandmarkCardVoiceKey(landmarkId);
    if (!key) return Promise.resolve();
    return this.playVoice(key, options);
  }

  public playCardVoice(
    card: { type: string; color?: string | null; landmark?: string | null },
    options?: PlayVoiceOptions
  ): Promise<void> {
    const key = getCardVoiceKey(card);
    if (!key) return Promise.resolve();
    return this.playVoice(key, options);
  }

  // =========================================================================
  // TACTILE WEB AUDIO SFX SUITE
  // =========================================================================

  private readySfx(): { ctx: AudioContext; out: GainNode; now: number } | null {
    if (!this.allowsSfx()) return null;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return null;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    return { ctx, out: this.sfxGain, now: ctx.currentTime };
  }

  private playTone(
    ctx: AudioContext,
    out: AudioNode,
    opts: {
      type?: OscillatorType;
      freqStart: number;
      freqEnd?: number;
      startTime: number;
      duration: number;
      volume?: number;
      attack?: number;
      filterFreq?: number;
    }
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freqStart, opts.startTime);
    if (opts.freqEnd && opts.freqEnd !== opts.freqStart) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, opts.freqEnd),
        opts.startTime + opts.duration
      );
    }

    const attack = opts.attack ?? 0.008;
    const vol = opts.volume ?? 0.25;
    gain.gain.setValueAtTime(0.0001, opts.startTime);
    gain.gain.linearRampToValueAtTime(vol, opts.startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.0008, opts.startTime + opts.duration);

    if (opts.filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(opts.filterFreq, opts.startTime);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(out);
    osc.start(opts.startTime);
    osc.stop(opts.startTime + opts.duration + 0.02);
  }

  /** Playful rising marimba-pop for each tile hop */
  public playHop(stepIndex = 0): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    const idx = Math.abs(Math.floor(stepIndex)) % HOP_PENTATONIC.length;
    const baseFreq = HOP_PENTATONIC[idx];

    // Bouncy pitch-lift body
    this.playTone(ctx, out, {
      type: 'sine',
      freqStart: baseFreq * 0.82,
      freqEnd: baseFreq * 1.04,
      startTime: now,
      duration: 0.13,
      volume: 0.32,
      attack: 0.006,
    });
    // Warm wooden overtone tap
    this.playTone(ctx, out, {
      type: 'triangle',
      freqStart: baseFreq * 2,
      freqEnd: baseFreq * 2.02,
      startTime: now,
      duration: 0.06,
      volume: 0.11,
      attack: 0.004,
      filterFreq: 3200,
    });
  }

  /** Crisp paper cardstock swish-flick */
  public playCardFlip(): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(3400, now + 0.09);
    filter.Q.value = 1.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(now);
    src.stop(now + 0.13);

    // Subtle cardstock snap
    this.playTone(ctx, out, {
      type: 'triangle',
      freqStart: 280,
      freqEnd: 520,
      startTime: now + 0.015,
      duration: 0.055,
      volume: 0.14,
      attack: 0.004,
    });
  }

  /** Sparkling celesta chime when a card reveals (extra shimmer for doubles!) */
  public playCardReveal(isDouble = false): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    const notes = isDouble
      ? [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6]
      : [NOTE.C5, NOTE.E5, NOTE.G5];

    notes.forEach((freq, i) => {
      const t = now + i * 0.065;
      this.playTone(ctx, out, {
        type: 'sine',
        freqStart: freq,
        startTime: t,
        duration: isDouble ? 0.38 : 0.28,
        volume: 0.24,
        attack: 0.008,
      });
      this.playTone(ctx, out, {
        type: 'triangle',
        freqStart: freq * 2,
        startTime: t,
        duration: 0.14,
        volume: 0.08,
        attack: 0.005,
        filterFreq: 4000,
      });
    });
  }

  /** Magical rainbow slide whoosh + harp glissando for shortcuts */
  public playShortcutWhoosh(): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    // Airy upward whoosh
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(2800, now + 0.42);
    filter.Q.value = 2.4;

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.001, now);
    nGain.gain.linearRampToValueAtTime(0.24, now + 0.12);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    src.connect(filter);
    filter.connect(nGain);
    nGain.connect(out);
    src.start(now);
    src.stop(now + 0.5);

    // Rising candy harp arpeggio
    const scale = [NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5, NOTE.C6, NOTE.D6, NOTE.E6, NOTE.G6];
    scale.forEach((freq, i) => {
      this.playTone(ctx, out, {
        type: 'sine',
        freqStart: freq,
        startTime: now + i * 0.045,
        duration: 0.32,
        volume: 0.18,
        attack: 0.006,
      });
    });
  }

  /** Silly cartoonish rubbery boing-squish for Licorice Lagoon */
  public playLicoriceSquish(): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    // Funny descending rubbery wobble
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(125, now + 0.36);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(14, now);
    lfoGain.gain.setValueAtTime(24, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(780, now);
    filter.frequency.exponentialRampToValueAtTime(260, now + 0.36);
    filter.Q.value = 4.5;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);

    osc.start(now);
    lfo.start(now);
    osc.stop(now + 0.4);
    lfo.stop(now + 0.4);

    // Little sticky pop at the end
    this.playTone(ctx, out, {
      type: 'sine',
      freqStart: 150,
      freqEnd: 290,
      startTime: now + 0.28,
      duration: 0.08,
      volume: 0.2,
    });
  }

  /** Bright fairy-dust sparkle chime for Star Mini-Game tiles */
  public playStarChime(): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    const sparkle = [NOTE.G5, NOTE.B5, NOTE.D6, NOTE.G6, NOTE.E6, NOTE.G6];
    sparkle.forEach((freq, i) => {
      this.playTone(ctx, out, {
        type: 'sine',
        freqStart: freq,
        startTime: now + i * 0.055,
        duration: 0.34,
        volume: 0.2,
        attack: 0.005,
      });
    });
  }

  /** Juicy hollow bubble bloop-pop for Pop Lollipop Bubbles */
  public playBubblePop(): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    const jitter = 0.9 + Math.random() * 0.28;
    this.playTone(ctx, out, {
      type: 'sine',
      freqStart: 300 * jitter,
      freqEnd: 960 * jitter,
      startTime: now,
      duration: 0.075,
      volume: 0.32,
      attack: 0.003,
    });
    this.playTone(ctx, out, {
      type: 'sine',
      freqStart: 1450 * jitter,
      freqEnd: 1850 * jitter,
      startTime: now + 0.03,
      duration: 0.06,
      volume: 0.12,
      attack: 0.003,
    });
  }

  /** Sweet melodic bell catch sound for Catch Gumdrops */
  public playGumdropCatch(): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    const freq = HOP_PENTATONIC[Math.floor(Math.random() * 5) + 1];
    this.playTone(ctx, out, {
      type: 'sine',
      freqStart: freq * 0.88,
      freqEnd: freq,
      startTime: now,
      duration: 0.16,
      volume: 0.28,
      attack: 0.005,
    });
    this.playTone(ctx, out, {
      type: 'triangle',
      freqStart: freq * 1.5,
      startTime: now + 0.04,
      duration: 0.16,
      volume: 0.16,
      attack: 0.005,
      filterFreq: 3600,
    });
  }

  /** Playful leafy canopy shake + peppermint rattle for Shake Peppermint Tree */
  public playTreeShake(): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    // Soft leafy rustle
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(950 + Math.random() * 450, now);
    filter.Q.value = 1.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(now);
    src.stop(now + 0.16);

    // Peppermint candy clink
    const pingFreq = 780 + Math.random() * 440;
    this.playTone(ctx, out, {
      type: 'sine',
      freqStart: pingFreq,
      freqEnd: pingFreq * 1.08,
      startTime: now + 0.025,
      duration: 0.09,
      volume: 0.18,
      attack: 0.003,
    });
  }

  /** Shimmering candy-cane trace sparkle (optionally rises with progress 0..1) */
  public playTraceSparkle(progress?: number): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    const idx =
      typeof progress === 'number'
        ? Math.min(HOP_PENTATONIC.length - 1, Math.max(0, Math.floor(progress * HOP_PENTATONIC.length)))
        : Math.floor(Math.random() * HOP_PENTATONIC.length);
    const freq = HOP_PENTATONIC[idx];

    this.playTone(ctx, out, {
      type: 'sine',
      freqStart: freq,
      startTime: now,
      duration: 0.16,
      volume: 0.2,
      attack: 0.004,
    });
    this.playTone(ctx, out, {
      type: 'sine',
      freqStart: freq * 2,
      startTime: now + 0.02,
      duration: 0.12,
      volume: 0.09,
      attack: 0.004,
    });
  }

  /** Cheerful double candy-shop bell for Action Cards */
  public playActionBell(): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    const bells: Array<[number, number]> = [
      [NOTE.E5, 0],
      [NOTE.A5, 0.13],
    ];
    for (const [freq, delay] of bells) {
      this.playTone(ctx, out, {
        type: 'sine',
        freqStart: freq,
        startTime: now + delay,
        duration: 0.42,
        volume: 0.26,
        attack: 0.005,
      });
      this.playTone(ctx, out, {
        type: 'triangle',
        freqStart: freq * 2,
        startTime: now + delay,
        duration: 0.24,
        volume: 0.12,
        attack: 0.004,
        filterFreq: 4200,
      });
    }
  }

  /** Triumphant fairytale Candy Castle victory fanfare */
  public playVictoryFanfare(): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    // Celebratory trumpet/bell melody: C5 - E5 - G5 - C6 (hold!) + sparkle chord
    const phrase: Array<{ freq: number; t: number; dur: number; vol: number }> = [
      { freq: NOTE.C5, t: 0.0, dur: 0.16, vol: 0.25 },
      { freq: NOTE.E5, t: 0.14, dur: 0.16, vol: 0.26 },
      { freq: NOTE.G5, t: 0.28, dur: 0.18, vol: 0.28 },
      { freq: NOTE.C6, t: 0.44, dur: 0.52, vol: 0.32 },
      { freq: NOTE.G5, t: 0.62, dur: 0.14, vol: 0.2 },
      { freq: NOTE.C6, t: 0.78, dur: 0.9, vol: 0.34 },
    ];

    for (const note of phrase) {
      this.playTone(ctx, out, {
        type: 'triangle',
        freqStart: note.freq,
        startTime: now + note.t,
        duration: note.dur,
        volume: note.vol,
        attack: 0.012,
        filterFreq: 3400,
      });
      this.playTone(ctx, out, {
        type: 'sine',
        freqStart: note.freq * 0.5,
        startTime: now + note.t,
        duration: note.dur,
        volume: note.vol * 0.55,
        attack: 0.014,
      });
    }

    // Final lush C major chord shimmer
    const chord = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6];
    chord.forEach((freq, i) => {
      this.playTone(ctx, out, {
        type: 'sine',
        freqStart: freq,
        startTime: now + 0.8 + i * 0.045,
        duration: 0.85,
        volume: 0.15,
        attack: 0.01,
      });
    });
  }

  /** Crisp friendly tactile candy button pop */
  public playButtonTap(): void {
    const sfx = this.readySfx();
    if (!sfx) return;
    const { ctx, out, now } = sfx;

    this.playTone(ctx, out, {
      type: 'sine',
      freqStart: 480,
      freqEnd: 760,
      startTime: now,
      duration: 0.055,
      volume: 0.24,
      attack: 0.003,
    });
  }
}

export const soundEngine = new CandylandSoundEngine();

export {
  VOICE_MANIFEST,
  type VoiceKey,
  isVoiceKey,
  getCardVoiceKey,
  getTurnVoiceKey,
  getVictoryVoiceKey,
  getColorCardVoiceKey,
  getLandmarkCardVoiceKey,
};
