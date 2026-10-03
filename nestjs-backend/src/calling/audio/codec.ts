/**
 * G.711 μ-law <-> 16-bit linear PCM, resampling, and WAV framing.
 *
 * Twilio Media Streams are always mono 8 kHz μ-law delivered in 20 ms frames
 * (160 bytes) — both inbound and outbound. Whisper wants 16 kHz mono PCM, and
 * the TTS service returns 16-bit PCM WAV at whatever rate the VITS checkpoint
 * was trained on (usually 16 kHz or 22.05 kHz). Everything in this file exists
 * to bridge those three formats; without it the call audio is noise in both
 * directions.
 */

/** Twilio's wire format. Do not change these without changing the TwiML too. */
export const TWILIO_SAMPLE_RATE = 8000;
export const TWILIO_FRAME_MS = 20;
/** 8000 Hz * 0.02 s = 160 samples, and μ-law is 1 byte per sample. */
export const TWILIO_FRAME_BYTES = (TWILIO_SAMPLE_RATE * TWILIO_FRAME_MS) / 1000;

/** What we feed the STT service. */
export const STT_SAMPLE_RATE = 16000;

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

export function muLawDecodeSample(uVal: number): number {
  const u = ~uVal & 0xff;
  let t = ((u & 0x0f) << 3) + MULAW_BIAS;
  t <<= (u & 0x70) >> 4;
  return (u & 0x80) ? MULAW_BIAS - t : t - MULAW_BIAS;
}

export function muLawEncodeSample(sample: number): number {
  const sign = sample < 0 ? 0x80 : 0;
  let magnitude = sign ? -sample : sample;
  if (magnitude > MULAW_CLIP) magnitude = MULAW_CLIP;
  magnitude += MULAW_BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (magnitude & mask) === 0 && exponent > 0; exponent--, mask >>= 1);

  const mantissa = (magnitude >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function muLawDecode(mulaw: Buffer): Int16Array {
  const pcm = new Int16Array(mulaw.length);
  for (let i = 0; i < mulaw.length; i++) pcm[i] = muLawDecodeSample(mulaw[i]);
  return pcm;
}

export function muLawEncode(pcm: Int16Array): Buffer {
  const out = Buffer.allocUnsafe(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = muLawEncodeSample(pcm[i]);
  return out;
}

/**
 * Linear-interpolation resampler. Good enough for 8 kHz telephony speech and
 * keeps the service dependency-free; swap in a windowed-sinc filter if call
 * quality ever becomes the bottleneck.
 */
export function resample(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || pcm.length === 0) return pcm;

  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(pcm.length / ratio));
  const out = new Int16Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const left = Math.floor(srcPos);
    const right = Math.min(left + 1, pcm.length - 1);
    const frac = srcPos - left;
    out[i] = Math.round(pcm[left] * (1 - frac) + pcm[right] * frac);
  }
  return out;
}

/** Wrap raw mono 16-bit PCM in a 44-byte canonical RIFF/WAVE header. */
export function pcmToWav(pcm: Int16Array, sampleRate: number): Buffer {
  const dataSize = pcm.length * 2;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // PCM fmt chunk size
  header.writeUInt16LE(1, 20);           // audio format = PCM
  header.writeUInt16LE(1, 22);           // channels = mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);           // block align
  header.writeUInt16LE(16, 34);          // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const body = Buffer.allocUnsafe(dataSize);
  for (let i = 0; i < pcm.length; i++) body.writeInt16LE(pcm[i], i * 2);

  return Buffer.concat([header, body]);
}

export interface DecodedWav {
  pcm: Int16Array;
  sampleRate: number;
  channels: number;
}

/**
 * Minimal RIFF parser for the 16-bit PCM WAV the TTS service returns. Walks the
 * chunk list rather than assuming a 44-byte header, because some encoders emit
 * LIST/fact chunks before `data`. Returns null for anything we cannot read, so
 * callers can degrade to silence instead of playing garbage down the phone.
 */
export function wavToPcm(wav: Buffer): DecodedWav | null {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }

  let sampleRate = 0;
  let channels = 1;
  let bitsPerSample = 16;
  let offset = 12;

  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString('ascii', offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (chunkId === 'fmt ' && body + 16 <= wav.length) {
      channels = wav.readUInt16LE(body + 2);
      sampleRate = wav.readUInt32LE(body + 4);
      bitsPerSample = wav.readUInt16LE(body + 14);
    } else if (chunkId === 'data') {
      if (bitsPerSample !== 16 || !sampleRate) return null;

      const available = Math.min(chunkSize, wav.length - body);
      const totalSamples = Math.floor(available / 2);
      const frames = Math.floor(totalSamples / channels);
      const pcm = new Int16Array(frames);

      // Downmix to mono by taking the first channel; TTS output is mono anyway.
      for (let i = 0; i < frames; i++) pcm[i] = wav.readInt16LE(body + i * channels * 2);

      return { pcm, sampleRate, channels };
    }

    // Chunks are word-aligned: an odd size is followed by a pad byte.
    offset = body + chunkSize + (chunkSize % 2);
  }
  return null;
}

/** Twilio μ-law frame -> PCM at the rate the STT service expects. */
export function twilioFrameToSttPcm(mulaw: Buffer): Int16Array {
  return muLawDecode(mulaw);
}

/** A WAV from the TTS service -> the μ-law bytes Twilio will play. */
export function wavToTwilioMuLaw(wav: Buffer): Buffer | null {
  const decoded = wavToPcm(wav);
  if (!decoded || decoded.pcm.length === 0) return null;
  return muLawEncode(resample(decoded.pcm, decoded.sampleRate, TWILIO_SAMPLE_RATE));
}

/** Split μ-law bytes into the 20 ms frames Twilio expects on the wire. */
export function chunkMuLawFrames(mulaw: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  for (let i = 0; i < mulaw.length; i += TWILIO_FRAME_BYTES) {
    const frame = mulaw.subarray(i, i + TWILIO_FRAME_BYTES);
    if (frame.length === TWILIO_FRAME_BYTES) {
      frames.push(frame);
    } else {
      // Pad the tail with μ-law silence (0xFF) so the last frame is full length.
      const padded = Buffer.alloc(TWILIO_FRAME_BYTES, 0xff);
      frame.copy(padded);
      frames.push(padded);
    }
  }
  return frames;
}
