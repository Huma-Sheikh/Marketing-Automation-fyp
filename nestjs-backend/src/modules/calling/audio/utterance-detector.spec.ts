import { UtteranceDetector } from './utterance-detector';

const SAMPLE_RATE = 8000;
const FRAME = 160; // 20 ms

const silentFrame = () => new Int16Array(FRAME);

const loudFrame = (amplitude = 6000) => {
  const f = new Int16Array(FRAME);
  for (let i = 0; i < FRAME; i++) f[i] = i % 2 === 0 ? amplitude : -amplitude;
  return f;
};

/** Push `count` frames, returning the first utterance emitted (if any). */
function pushMany(detector: UtteranceDetector, frame: () => Int16Array, count: number) {
  let emitted: Int16Array | null = null;
  for (let i = 0; i < count; i++) {
    const out = detector.push(frame());
    if (out && !emitted) emitted = out;
  }
  return emitted;
}

describe('UtteranceDetector', () => {
  it('emits nothing while the line is silent', () => {
    const d = new UtteranceDetector({ sampleRate: SAMPLE_RATE });

    expect(pushMany(d, silentFrame, 100)).toBeNull();
    expect(d.isSpeaking).toBe(false);
  });

  it('emits an utterance once speech is followed by a pause', () => {
    const d = new UtteranceDetector({ sampleRate: SAMPLE_RATE, minSpeechMs: 300, endSilenceMs: 400 });

    expect(pushMany(d, loudFrame, 25)).toBeNull();       // 500 ms of speech, still talking
    const utterance = pushMany(d, silentFrame, 25);       // 500 ms pause ends the turn

    expect(utterance).not.toBeNull();
    expect(utterance.length).toBeGreaterThan(SAMPLE_RATE * 0.5);
  });

  it('reports isSpeaking during a turn and clears it afterwards', () => {
    const d = new UtteranceDetector({ sampleRate: SAMPLE_RATE, minSpeechMs: 100, endSilenceMs: 200 });

    d.push(loudFrame());
    expect(d.isSpeaking).toBe(true);

    pushMany(d, silentFrame, 20);
    expect(d.isSpeaking).toBe(false);
  });

  it('discards a burst too short to be speech', () => {
    const d = new UtteranceDetector({ sampleRate: SAMPLE_RATE, minSpeechMs: 300, endSilenceMs: 200 });

    pushMany(d, loudFrame, 2);                       // 40 ms — a click, not a word
    expect(pushMany(d, silentFrame, 20)).toBeNull();
  });

  it('drops leading silence instead of buffering it', () => {
    const d = new UtteranceDetector({ sampleRate: SAMPLE_RATE, minSpeechMs: 100, endSilenceMs: 200 });

    pushMany(d, silentFrame, 250);                   // 5 s of nothing
    pushMany(d, loudFrame, 10);                      // 200 ms of speech
    const utterance = pushMany(d, silentFrame, 15);

    expect(utterance).not.toBeNull();
    // Only the speech plus the trailing pause, not the 5 s of dead air.
    expect(utterance.length).toBeLessThan(SAMPLE_RATE);
  });

  it('flushes on the max-length cap so a monologue still gets transcribed', () => {
    const d = new UtteranceDetector({
      sampleRate: SAMPLE_RATE, minSpeechMs: 100, endSilenceMs: 10_000, maxUtteranceMs: 1000,
    });

    const utterance = pushMany(d, loudFrame, 100);   // 2 s of unbroken speech

    expect(utterance).not.toBeNull();
    expect(utterance.length).toBeGreaterThanOrEqual(SAMPLE_RATE);
  });

  it('starts clean after emitting, so the next turn is independent', () => {
    const d = new UtteranceDetector({ sampleRate: SAMPLE_RATE, minSpeechMs: 100, endSilenceMs: 200 });

    pushMany(d, loudFrame, 10);
    const first = pushMany(d, silentFrame, 15);
    pushMany(d, loudFrame, 10);
    const second = pushMany(d, silentFrame, 15);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second.length).toBeCloseTo(first.length, -3);
  });

  it('treats quiet background noise below the threshold as silence', () => {
    const d = new UtteranceDetector({ sampleRate: SAMPLE_RATE, silenceThreshold: 500 });
    const hiss = () => {
      const f = new Int16Array(FRAME);
      for (let i = 0; i < FRAME; i++) f[i] = i % 2 === 0 ? 100 : -100;
      return f;
    };

    expect(pushMany(d, hiss, 100)).toBeNull();
    expect(d.isSpeaking).toBe(false);
  });

  it('flush() emits a partial turn that has enough speech in it', () => {
    const d = new UtteranceDetector({ sampleRate: SAMPLE_RATE, minSpeechMs: 100 });

    pushMany(d, loudFrame, 10);
    const flushed = d.flush();

    expect(flushed).not.toBeNull();
    expect(d.isSpeaking).toBe(false);
  });

  it('flush() returns null when nothing worth sending was buffered', () => {
    const d = new UtteranceDetector({ sampleRate: SAMPLE_RATE, minSpeechMs: 300 });

    pushMany(d, loudFrame, 1);
    expect(d.flush()).toBeNull();
  });

  it('reset() discards the buffered turn', () => {
    const d = new UtteranceDetector({ sampleRate: SAMPLE_RATE, minSpeechMs: 100 });

    pushMany(d, loudFrame, 10);
    d.reset();

    expect(d.isSpeaking).toBe(false);
    expect(d.flush()).toBeNull();
  });
});
