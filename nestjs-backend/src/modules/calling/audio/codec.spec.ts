import {
  TWILIO_FRAME_BYTES,
  TWILIO_SAMPLE_RATE,
  chunkMuLawFrames,
  muLawDecode,
  muLawDecodeSample,
  muLawEncode,
  muLawEncodeSample,
  pcmToWav,
  resample,
  wavToPcm,
  wavToTwilioMuLaw,
} from './codec';

/** One second of a sine wave — a realistic stand-in for speech energy. */
function tone(freq: number, sampleRate: number, samples: number, amplitude = 8000): Int16Array {
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    pcm[i] = Math.round(amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate));
  }
  return pcm;
}

describe('codec', () => {
  // ─── μ-law ──────────────────────────────────────────────────────────────────

  describe('mu-law', () => {
    it('round-trips silence exactly', () => {
      expect(muLawDecodeSample(muLawEncodeSample(0))).toBeCloseTo(0, -2);
    });

    it('preserves sign through an encode/decode round trip', () => {
      for (const sample of [-20000, -5000, -100, 100, 5000, 20000]) {
        const round = muLawDecodeSample(muLawEncodeSample(sample));
        expect(Math.sign(round)).toBe(Math.sign(sample));
      }
    });

    it('round-trips within mu-law quantisation error (< 8%)', () => {
      for (const sample of [-30000, -8000, -1000, 1000, 8000, 30000]) {
        const round = muLawDecodeSample(muLawEncodeSample(sample));
        const error = Math.abs(round - sample) / Math.abs(sample);
        expect(error).toBeLessThan(0.08);
      }
    });

    it('clips samples beyond the mu-law range instead of wrapping', () => {
      const high = muLawDecodeSample(muLawEncodeSample(32767));
      const low = muLawDecodeSample(muLawEncodeSample(-32768));
      expect(high).toBeGreaterThan(30000);
      expect(low).toBeLessThan(-30000);
    });

    it('encodes one byte per sample', () => {
      const pcm = tone(440, TWILIO_SAMPLE_RATE, 160);
      expect(muLawEncode(pcm)).toHaveLength(160);
    });

    it('decodes one sample per byte', () => {
      expect(muLawDecode(Buffer.alloc(160, 0xff))).toHaveLength(160);
    });

    it('survives a full buffer round trip with bounded error', () => {
      const original = tone(300, TWILIO_SAMPLE_RATE, 800);
      const round = muLawDecode(muLawEncode(original));

      let worst = 0;
      for (let i = 0; i < original.length; i++) {
        worst = Math.max(worst, Math.abs(round[i] - original[i]));
      }
      // mu-law is logarithmic: absolute error grows with amplitude.
      expect(worst).toBeLessThan(500);
    });
  });

  // ─── resampling ─────────────────────────────────────────────────────────────

  describe('resample', () => {
    it('returns the input untouched when rates match', () => {
      const pcm = tone(440, 8000, 100);
      expect(resample(pcm, 8000, 8000)).toBe(pcm);
    });

    it('doubles the sample count going 8k -> 16k', () => {
      expect(resample(tone(440, 8000, 160), 8000, 16000)).toHaveLength(320);
    });

    it('halves the sample count going 16k -> 8k', () => {
      expect(resample(tone(440, 16000, 320), 16000, 8000)).toHaveLength(160);
    });

    it('handles the 22.05k TTS output rate Twilio cannot play', () => {
      const out = resample(tone(440, 22050, 2205), 22050, 8000);
      expect(out.length).toBe(800);
    });

    it('returns an empty array for empty input', () => {
      expect(resample(new Int16Array(0), 8000, 16000)).toHaveLength(0);
    });
  });

  // ─── WAV ────────────────────────────────────────────────────────────────────

  describe('pcmToWav / wavToPcm', () => {
    it('writes a canonical 44-byte RIFF header', () => {
      const wav = pcmToWav(tone(440, 16000, 160), 16000);

      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
      expect(wav.toString('ascii', 36, 40)).toBe('data');
      expect(wav.readUInt32LE(24)).toBe(16000); // sample rate
      expect(wav.readUInt16LE(22)).toBe(1);     // mono
      expect(wav.readUInt16LE(34)).toBe(16);    // bits per sample
      expect(wav).toHaveLength(44 + 320);
    });

    it('round-trips PCM exactly', () => {
      const pcm = tone(440, 16000, 240);
      const decoded = wavToPcm(pcmToWav(pcm, 16000));

      expect(decoded).not.toBeNull();
      expect(decoded.sampleRate).toBe(16000);
      expect(Array.from(decoded.pcm)).toEqual(Array.from(pcm));
    });

    it('returns null for a non-RIFF buffer', () => {
      expect(wavToPcm(Buffer.from('not audio at all'))).toBeNull();
    });

    it('returns null for an empty buffer', () => {
      expect(wavToPcm(Buffer.alloc(0))).toBeNull();
    });

    it('skips extra chunks placed before the data chunk', () => {
      const pcm = tone(440, 16000, 80);
      const base = pcmToWav(pcm, 16000);

      // Splice a LIST chunk between `fmt ` and `data`, as some encoders emit.
      const list = Buffer.alloc(12);
      list.write('LIST', 0);
      list.writeUInt32LE(4, 4);
      list.write('INFO', 8);
      const spliced = Buffer.concat([base.subarray(0, 36), list, base.subarray(36)]);
      spliced.writeUInt32LE(spliced.length - 8, 4);

      const decoded = wavToPcm(spliced);
      expect(decoded).not.toBeNull();
      expect(decoded.pcm).toHaveLength(80);
    });
  });

  // ─── end-to-end TTS -> Twilio ───────────────────────────────────────────────

  describe('wavToTwilioMuLaw', () => {
    it('converts a 22.05k TTS WAV to 8k mu-law of the right length', () => {
      const wav = pcmToWav(tone(300, 22050, 22050), 22050); // 1 second
      const mulaw = wavToTwilioMuLaw(wav);

      expect(mulaw).not.toBeNull();
      // 1 second at 8 kHz, 1 byte per sample.
      expect(mulaw.length).toBe(8000);
    });

    it('returns null rather than garbage when the WAV cannot be parsed', () => {
      expect(wavToTwilioMuLaw(Buffer.from('garbage'))).toBeNull();
    });

    it('returns null for a WAV with no samples', () => {
      expect(wavToTwilioMuLaw(pcmToWav(new Int16Array(0), 16000))).toBeNull();
    });
  });

  // ─── framing ────────────────────────────────────────────────────────────────

  describe('chunkMuLawFrames', () => {
    it('splits into 160-byte (20 ms) frames', () => {
      const frames = chunkMuLawFrames(Buffer.alloc(TWILIO_FRAME_BYTES * 3));

      expect(frames).toHaveLength(3);
      frames.forEach(f => expect(f).toHaveLength(TWILIO_FRAME_BYTES));
    });

    it('pads a short tail with mu-law silence so every frame is full length', () => {
      const frames = chunkMuLawFrames(Buffer.alloc(TWILIO_FRAME_BYTES + 40, 0x10));

      expect(frames).toHaveLength(2);
      expect(frames[1]).toHaveLength(TWILIO_FRAME_BYTES);
      expect(frames[1][39]).toBe(0x10); // real audio
      expect(frames[1][40]).toBe(0xff); // padding
    });

    it('returns no frames for empty input', () => {
      expect(chunkMuLawFrames(Buffer.alloc(0))).toHaveLength(0);
    });
  });
});
