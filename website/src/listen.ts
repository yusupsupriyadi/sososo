// Opt-in microphone level for the hero rings. Only a loudness number leaves the
// analyser; no audio is stored, sent or transcribed.

export type ListenError = 'blocked' | 'unavailable';

export class VoiceLevel {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private smooth = 0;
  private quietSince = 0;

  static supported(): boolean {
    return Boolean(navigator.mediaDevices?.getUserMedia) && 'AudioContext' in window;
  }

  get active(): boolean {
    return this.ctx !== null;
  }

  async start(): Promise<ListenError | null> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      return (err as DOMException).name === 'NotAllowedError' ? 'blocked' : 'unavailable';
    }
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    source.connect(this.analyser);
    return null;
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.smooth = 0;
  }

  /** 0..1, fast attack and slow release so the rings breathe with speech. */
  read(): { level: number; onset: boolean } {
    if (!this.analyser || !this.buf) return { level: 0, onset: false };
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) sum += v * v;
    const db = 20 * Math.log10(Math.sqrt(sum / this.buf.length) + 1e-6);
    const target = Math.min(1, Math.max(0, (db + 58) / 40));
    this.smooth += (target - this.smooth) * (target > this.smooth ? 0.5 : 0.08);

    // a new phrase after a short quiet spell sends one pulse
    const now = performance.now();
    let onset = false;
    if (this.smooth < 0.18) this.quietSince ||= now;
    else if (this.smooth > 0.35 && this.quietSince && now - this.quietSince > 220) {
      onset = true;
      this.quietSince = 0;
    }
    return { level: this.smooth, onset };
  }
}
