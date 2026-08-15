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
  private calibrationOffset: number = 98;
  private smoothedDb: number = 40;

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

      let sumSquares = 0;
      for (let i = 0; i < timeDomainBuffer.length; i++) {
        const val = timeDomainBuffer[i];
        sumSquares += val * val;
      }
      const rms = Math.sqrt(sumSquares / timeDomainBuffer.length);

      let instantDb = 30;
      if (rms > 0.00001) {
        const dbFS = 20 * Math.log10(rms);
        instantDb = Math.max(30, Math.min(125, dbFS + this.calibrationOffset));
      }

      this.smoothedDb = this.smoothedDb * 0.7 + instantDb * 0.3;

      const binCount = freqDomainBuffer.length;
      const lowBinEnd = Math.floor(binCount * 0.08);
      const midBinEnd = Math.floor(binCount * 0.35);

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
}

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
