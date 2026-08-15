import { FrequencyData, SoundCategory } from '../types';

export class NYC_AudioEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private onDataCallback: ((decibels: number, freq: FrequencyData, rawArray: Uint8Array) => void) | null = null;
  
  // Calibration parameter: standard mobile/desktop mic reference offset
  private calibrationOffset: number = 98; // Maps RMS float (0.0001 - 1.0) into realistic ~30-110 dB SPL
  private smoothedDb: number = 40;

  // Synthesizer active nodes
  private synthContext: AudioContext | null = null;
  private activeSynthNodes: { [key: string]: { stop: () => void } } = {};

  public getStatus(): boolean {
    return this.isRunning;
  }

  public setCalibration(offset: number) {
    this.calibrationOffset = offset;
  }

  public getCalibration(): number {
    return this.calibrationOffset;
  }

  public async startMicrophone(
    onData: (decibels: number, freq: FrequencyData, rawArray: Uint8Array) => void
  ): Promise<{ success: boolean; error?: string }> {
    this.onDataCallback = onData;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return {
          success: false,
          error: 'Your browser does not support Web Audio / getUserMedia microphone capture.'
        };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });

      this.micStream = stream;
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.65;

      this.micSource = this.audioCtx.createMediaStreamSource(stream);
      this.micSource.connect(this.analyser);

      this.isRunning = true;
      this.startAnalysisLoop();

      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn('Microphone permission or hardware error:', errorMsg);
      return {
        success: false,
        error: errorMsg.includes('Permission denied') || errorMsg.includes('NotAllowedError')
          ? 'Microphone permission was denied. Please allow microphone access in your browser bar.'
          : `Microphone error: ${errorMsg}`
      };
    }
  }

  public stopMicrophone() {
    this.isRunning = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }

  private startAnalysisLoop() {
    if (!this.analyser) return;

    const timeDomainBuffer = new Float32Array(this.analyser.fftSize);
    const freqDomainBuffer = new Uint8Array(this.analyser.frequencyBinCount);

    const tick = () => {
      if (!this.isRunning || !this.analyser) return;

      this.analyser.getFloatTimeDomainData(timeDomainBuffer);
      this.analyser.getByteFrequencyData(freqDomainBuffer);

      // Compute Root-Mean-Square (RMS) for accurate energy calculation
      let sumSquares = 0;
      for (let i = 0; i < timeDomainBuffer.length; i++) {
        const val = timeDomainBuffer[i];
        sumSquares += val * val;
      }
      const rms = Math.sqrt(sumSquares / timeDomainBuffer.length);

      // Convert RMS to dB SPL with calibrated offset
      let instantDb = 30;
      if (rms > 0.00001) {
        // dBFS formula: 20 * log10(rms) -> ranges from -100 to 0
        const dbFS = 20 * Math.log10(rms);
        // Map dBFS to approximate SPL decibels (e.g. -60 dBFS + 98 = 38 dB SPL; -10 dBFS + 98 = 88 dB SPL)
        instantDb = Math.max(30, Math.min(125, dbFS + this.calibrationOffset));
      }

      // Smooth decibels for visual stability while retaining responsiveness
      this.smoothedDb = this.smoothedDb * 0.7 + instantDb * 0.3;

      // Extract frequency band energies (Lows, Mids, Highs)
      const binCount = freqDomainBuffer.length;
      const lowBinEnd = Math.floor(binCount * 0.08);   // ~20 - 350 Hz
      const midBinEnd = Math.floor(binCount * 0.35);   // ~350 - 2500 Hz

      let lowSum = 0;
      for (let i = 0; i < lowBinEnd; i++) lowSum += freqDomainBuffer[i];
      const lowEnergy = lowBinEnd > 0 ? lowSum / lowBinEnd / 255 : 0;

      let midSum = 0;
      for (let i = lowBinEnd; i < midBinEnd; i++) midSum += freqDomainBuffer[i];
      const midEnergy = midBinEnd > lowBinEnd ? midSum / (midBinEnd - lowBinEnd) / 255 : 0;

      let highSum = 0;
      for (let i = midBinEnd; i < binCount; i++) highSum += freqDomainBuffer[i];
      const highEnergy = binCount > midBinEnd ? highSum / (binCount - midBinEnd) / 255 : 0;

      if (this.onDataCallback) {
        this.onDataCallback(
          Math.round(this.smoothedDb * 10) / 10,
          { lows: lowEnergy, mids: midEnergy, highs: highEnergy },
          freqDomainBuffer
        );
      }

      this.animationFrameId = requestAnimationFrame(tick);
    };

    tick();
  }

  // --- Synthetic NYC Soundscape Audio Synthesis (Pure Web Audio API) ---
  private getSynthContext(): AudioContext {
    if (!this.synthContext || this.synthContext.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.synthContext = new AudioCtxClass();
    }
    if (this.synthContext.state === 'suspended') {
      this.synthContext.resume();
    }
    return this.synthContext;
  }

  public isSynthPlaying(type: string): boolean {
    return Boolean(this.activeSynthNodes[type]);
  }

  public toggleSynthSound(type: 'subway' | 'siren' | 'traffic' | 'park', volume: number = 0.5): boolean {
    if (this.activeSynthNodes[type]) {
      this.stopSynthSound(type);
      return false;
    } else {
      this.playSynthSound(type, volume);
      return true;
    }
  }

  public stopSynthSound(type: string) {
    if (this.activeSynthNodes[type]) {
      try {
        this.activeSynthNodes[type].stop();
      } catch {}
      delete this.activeSynthNodes[type];
    }
  }

  public stopAllSynths() {
    Object.keys(this.activeSynthNodes).forEach((k) => this.stopSynthSound(k));
  }

  public playSynthSound(type: 'subway' | 'siren' | 'traffic' | 'park', volume: number = 0.5) {
    this.stopSynthSound(type);
    const ctx = this.getSynthContext();

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    masterGain.connect(ctx.destination);

    if (type === 'subway') {
      // Subway rail rumble + high frequency track screech
      // 1. Low brown/pink rumble
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02; // brown noise
        lastOut = output[i];
        output[i] *= 3.5;
      }

      const noiseNode = ctx.createBufferSource();
      noiseNode.buffer = noiseBuffer;
      noiseNode.loop = true;

      const rumbleFilter = ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.setValueAtTime(140, ctx.currentTime);

      const rumbleGain = ctx.createGain();
      rumbleGain.gain.setValueAtTime(0.7, ctx.currentTime);

      noiseNode.connect(rumbleFilter);
      rumbleFilter.connect(rumbleGain);
      rumbleGain.connect(masterGain);
      noiseNode.start();

      // 2. High-pitch resonant flange screech (Subway track curve squeal ~2400Hz - 3800Hz)
      const screechOsc1 = ctx.createOscillator();
      screechOsc1.type = 'sawtooth';
      screechOsc1.frequency.setValueAtTime(2850, ctx.currentTime);

      const screechMod = ctx.createOscillator();
      screechMod.frequency.setValueAtTime(0.4, ctx.currentTime);
      const screechModGain = ctx.createGain();
      screechModGain.gain.setValueAtTime(600, ctx.currentTime);
      screechMod.connect(screechModGain);
      screechModGain.connect(screechOsc1.frequency);

      const screechFilter = ctx.createBiquadFilter();
      screechFilter.type = 'bandpass';
      screechFilter.frequency.setValueAtTime(2900, ctx.currentTime);
      screechFilter.Q.setValueAtTime(15, ctx.currentTime);

      const screechGain = ctx.createGain();
      screechGain.gain.setValueAtTime(0.25, ctx.currentTime);

      screechOsc1.connect(screechFilter);
      screechFilter.connect(screechGain);
      screechGain.connect(masterGain);

      screechOsc1.start();
      screechMod.start();

      this.activeSynthNodes['subway'] = {
        stop: () => {
          noiseNode.stop();
          screechOsc1.stop();
          screechMod.stop();
        }
      };
    } else if (type === 'siren') {
      // NYPD / FDNY Emergency Dual-Tone Siren with Doppler sweep
      const sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sawtooth';
      sirenOsc.frequency.setValueAtTime(750, ctx.currentTime);

      // LFO for wailing siren sweep between 650Hz and 1250Hz
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.25, ctx.currentTime); // 4-second period
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(320, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);

      // Bandpass acoustic body
      const sirenFilter = ctx.createBiquadFilter();
      sirenFilter.type = 'bandpass';
      sirenFilter.frequency.setValueAtTime(950, ctx.currentTime);
      sirenFilter.Q.setValueAtTime(4.0, ctx.currentTime);

      const sirenGain = ctx.createGain();
      sirenGain.gain.setValueAtTime(0.4, ctx.currentTime);

      sirenOsc.connect(sirenFilter);
      sirenFilter.connect(sirenGain);
      sirenGain.connect(masterGain);

      sirenOsc.start();
      lfo.start();

      this.activeSynthNodes['siren'] = {
        stop: () => {
          sirenOsc.stop();
          lfo.stop();
        }
      };
    } else if (type === 'traffic') {
      // Midtown Traffic Hum + Periodic Taxi Horn blasts
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const trafficNoise = ctx.createBufferSource();
      trafficNoise.buffer = noiseBuffer;
      trafficNoise.loop = true;

      const trafficFilter = ctx.createBiquadFilter();
      trafficFilter.type = 'bandpass';
      trafficFilter.frequency.setValueAtTime(450, ctx.currentTime);
      trafficFilter.Q.setValueAtTime(1.2, ctx.currentTime);

      const trafficGain = ctx.createGain();
      trafficGain.gain.setValueAtTime(0.45, ctx.currentTime);

      trafficNoise.connect(trafficFilter);
      trafficFilter.connect(trafficGain);
      trafficGain.connect(masterGain);
      trafficNoise.start();

      // Dual-frequency Taxi Horn (F4 & A4 notes ~349Hz and 440Hz)
      const horn1 = ctx.createOscillator();
      const horn2 = ctx.createOscillator();
      horn1.type = 'square';
      horn2.type = 'square';
      horn1.frequency.setValueAtTime(349, ctx.currentTime);
      horn2.frequency.setValueAtTime(440, ctx.currentTime);

      const hornGain = ctx.createGain();
      hornGain.gain.setValueAtTime(0.001, ctx.currentTime);

      horn1.connect(hornGain);
      horn2.connect(hornGain);
      hornGain.connect(masterGain);
      horn1.start();
      horn2.start();

      // Periodic horn honk trigger interval
      const hornInterval = setInterval(() => {
        if (!this.activeSynthNodes['traffic']) return;
        const now = ctx.currentTime;
        hornGain.gain.cancelScheduledValues(now);
        hornGain.gain.setValueAtTime(0.2, now);
        hornGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      }, 3500);

      this.activeSynthNodes['traffic'] = {
        stop: () => {
          clearInterval(hornInterval);
          trafficNoise.stop();
          horn1.stop();
          horn2.stop();
        }
      };
    } else if (type === 'park') {
      // Quiet Central Park rustle / gentle breeze & distant birds
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const parkNoise = ctx.createBufferSource();
      parkNoise.buffer = noiseBuffer;
      parkNoise.loop = true;

      const parkFilter = ctx.createBiquadFilter();
      parkFilter.type = 'lowpass';
      parkFilter.frequency.setValueAtTime(320, ctx.currentTime);

      const parkGain = ctx.createGain();
      parkGain.gain.setValueAtTime(0.25, ctx.currentTime);

      parkNoise.connect(parkFilter);
      parkFilter.connect(parkGain);
      parkGain.connect(masterGain);
      parkNoise.start();

      this.activeSynthNodes['park'] = {
        stop: () => {
          parkNoise.stop();
        }
      };
    }
  }
}

// Global Singleton
export const audioEngine = new NYC_AudioEngine();

export function classifyDecibels(db: number): SoundCategory {
  if (db < 45) return 'Quiet / Whisper';
  if (db < 65) return 'Moderate Ambient';
  if (db < 78) return 'Busy City / Traffic';
  if (db < 88) return 'Heavy Transit';
  return 'Extreme / Sirens';
}

export function getCategoryColor(category: SoundCategory): {
  bg: string;
  text: string;
  border: string;
  badge: string;
  hex: string;
} {
  switch (category) {
    case 'Quiet / Whisper':
      return {
        bg: 'bg-emerald-950/60',
        text: 'text-emerald-400',
        border: 'border-emerald-700/60',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        hex: '#10b981'
      };
    case 'Moderate Ambient':
      return {
        bg: 'bg-sky-950/60',
        text: 'text-sky-400',
        border: 'border-sky-700/60',
        badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
        hex: '#38bdf8'
      };
    case 'Busy City / Traffic':
      return {
        bg: 'bg-amber-950/60',
        text: 'text-amber-400',
        border: 'border-amber-700/60',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        hex: '#f59e0b'
      };
    case 'Heavy Transit':
      return {
        bg: 'bg-orange-950/60',
        text: 'text-orange-400',
        border: 'border-orange-700/60',
        badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
        hex: '#f97316'
      };
    case 'Extreme / Sirens':
      return {
        bg: 'bg-rose-950/60',
        text: 'text-rose-400',
        border: 'border-rose-700/60',
        badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        hex: '#f43f5e'
      };
  }
}
