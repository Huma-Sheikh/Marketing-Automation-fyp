import { TWILIO_SAMPLE_RATE } from './codec';

export interface UtteranceDetectorOptions {
  /** Rate of the PCM being pushed in. Twilio is always 8 kHz. */
  sampleRate?: number;
  /** RMS (0-32767) below which a frame counts as silence. */
  silenceThreshold?: number;
  /** Ignore bursts shorter than this — coughs, line clicks, a door slamming. */
  minSpeechMs?: number;
  /** Trailing silence that marks the end of a turn. */
  endSilenceMs?: number;
  /** Hard cap so a monologue still gets transcribed instead of buffering forever. */
  maxUtteranceMs?: number;
}

/**
 * Energy-based voice activity detection over a rolling buffer.
 *
 * The previous implementation handed each individual 20 ms Twilio frame to
 * Whisper, which cannot transcribe 20 ms of audio and produced one HTTP request
 * every 20 ms per call. This accumulates frames into whole utterances and only
 * emits when the caller has actually stopped speaking.
 *
 * Energy VAD is deliberate: it costs nothing, adds no latency, and on a
 * telephone line (already band-limited and noise-suppressed by the carrier) it
 * is accurate enough. Swap in a neural VAD if you start seeing false triggers on
 * noisy mobile calls.
 */
export class UtteranceDetector {
  private readonly sampleRate: number;
  private readonly silenceThreshold: number;
  private readonly minSpeechSamples: number;
  private readonly endSilenceSamples: number;
  private readonly maxUtteranceSamples: number;

  private buffer: number[] = [];
  private speechSamples = 0;
  private trailingSilenceSamples = 0;
  private speaking = false;

  constructor(options: UtteranceDetectorOptions = {}) {
    const {
      sampleRate = TWILIO_SAMPLE_RATE,
      silenceThreshold = 500,
      minSpeechMs = 300,
      endSilenceMs = 700,
      maxUtteranceMs = 15000,
    } = options;

    this.sampleRate = sampleRate;
    this.silenceThreshold = silenceThreshold;
    this.minSpeechSamples = (minSpeechMs / 1000) * sampleRate;
    this.endSilenceSamples = (endSilenceMs / 1000) * sampleRate;
    this.maxUtteranceSamples = (maxUtteranceMs / 1000) * sampleRate;
  }

  /** True while the caller is mid-utterance — used to trigger barge-in. */
  get isSpeaking(): boolean {
    return this.speaking;
  }

  private static rms(frame: Int16Array): number {
    if (frame.length === 0) return 0;
    let sumSquares = 0;
    for (let i = 0; i < frame.length; i++) sumSquares += frame[i] * frame[i];
    return Math.sqrt(sumSquares / frame.length);
  }

  /**
   * Push one decoded frame. Returns the completed utterance when the caller has
   * finished speaking, otherwise null.
   */
  push(frame: Int16Array): Int16Array | null {
    const isSpeech = UtteranceDetector.rms(frame) >= this.silenceThreshold;

    if (isSpeech) {
      this.speaking = true;
      this.speechSamples += frame.length;
      this.trailingSilenceSamples = 0;
    } else if (!this.speaking) {
      // Nothing has been said yet — drop leading silence instead of buffering it.
      return null;
    } else {
      this.trailingSilenceSamples += frame.length;
    }

    for (let i = 0; i < frame.length; i++) this.buffer.push(frame[i]);

    const endedByPause = this.trailingSilenceSamples >= this.endSilenceSamples;
    const endedByLength = this.buffer.length >= this.maxUtteranceSamples;
    if (!endedByPause && !endedByLength) return null;

    // A burst too short to be speech is discarded rather than sent to the STT
    // service, which would only ever return an empty string for it.
    const utterance = this.speechSamples >= this.minSpeechSamples
      ? Int16Array.from(this.buffer)
      : null;

    this.reset();
    return utterance;
  }

  /** Drop any partial utterance — used when a turn is abandoned or the call ends. */
  reset(): void {
    this.buffer = [];
    this.speechSamples = 0;
    this.trailingSilenceSamples = 0;
    this.speaking = false;
  }

  /** Emit whatever has been buffered so far, if it qualifies as speech. */
  flush(): Int16Array | null {
    const utterance = this.speechSamples >= this.minSpeechSamples
      ? Int16Array.from(this.buffer)
      : null;
    this.reset();
    return utterance;
  }
}
