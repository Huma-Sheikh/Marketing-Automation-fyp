import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import { CallingService } from './calling.service';
import {
  TWILIO_FRAME_MS,
  chunkMuLawFrames,
  muLawDecode,
} from './audio/codec';
import { UtteranceDetector } from './audio/utterance-detector';

/** Path Twilio connects to. Must match the <Stream url> in TwimlController. */
export const MEDIA_STREAM_PATH = '/audio-stream';

interface StreamSession {
  callSid: string;
  streamSid: string;
  leadId?: string;
  campaignId?: string;
  detector: UtteranceDetector;
  /** Bumped on every barge-in/new turn so in-flight playback loops abort. */
  playbackToken: number;
  /** Set while we are streaming TTS audio, so we know when barge-in applies. */
  playing: boolean;
  /** Guards against starting a second turn while one is still being processed. */
  processing: boolean;
}

/**
 * Twilio Media Streams speak raw RFC-6455 WebSocket with newline-free JSON
 * frames — NOT Socket.IO. The previous implementation was a Socket.IO gateway,
 * so Twilio's upgrade request hit a 404 and no call ever streamed audio. This
 * attaches a plain `ws` server to the existing HTTP server and implements
 * Twilio's protocol directly.
 *
 * Protocol reference: inbound events are `connected`, `start`, `media`, `dtmf`,
 * `mark` and `stop`; outbound we send `media`, `mark` and `clear`.
 */
@Injectable()
export class TwilioMediaStreamServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TwilioMediaStreamServer.name);
  private wss: WebSocketServer;
  private readonly sessions = new Map<WebSocket, StreamSession>();

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly callingService: CallingService,
  ) {}

  onApplicationBootstrap() {
    const httpServer = this.httpAdapterHost.httpAdapter?.getHttpServer();
    if (!httpServer) {
      this.logger.error('No HTTP server available - media stream endpoint not mounted');
      return;
    }

    // noServer + a manual upgrade handler so this coexists with the REST API on
    // one port and only claims the /audio-stream path.
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      let pathname: string;
      try {
        pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
      } catch {
        socket.destroy();
        return;
      }
      if (pathname !== MEDIA_STREAM_PATH) return; // leave other paths alone

      this.wss.handleUpgrade(req, socket, head, ws => this.wss.emit('connection', ws, req));
    });

    this.wss.on('connection', ws => this.handleConnection(ws));
    this.logger.log(`Twilio media stream server listening on ${MEDIA_STREAM_PATH}`);
  }

  async onApplicationShutdown() {
    for (const ws of this.sessions.keys()) ws.close();
    this.sessions.clear();
    await new Promise<void>(resolve => (this.wss ? this.wss.close(() => resolve()) : resolve()));
  }

  private handleConnection(ws: WebSocket) {
    ws.on('message', (raw: RawData) => {
      let message: any;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        this.logger.warn('Discarded non-JSON frame from Twilio');
        return;
      }
      this.handleMessage(ws, message).catch(err =>
        this.logger.error(`Media stream error: ${err.message}`, err.stack),
      );
    });

    ws.on('error', err => this.logger.warn(`Media stream socket error: ${err.message}`));
    ws.on('close', () => this.handleClose(ws));
  }

  private async handleMessage(ws: WebSocket, message: any) {
    switch (message.event) {
      case 'connected':
        return;
      case 'start':
        return this.handleStart(ws, message);
      case 'media':
        return this.handleMedia(ws, message);
      case 'stop':
        return this.handleStop(ws, message);
      case 'mark':
      case 'dtmf':
        return;
      default:
        this.logger.debug(`Unhandled media stream event: ${message.event}`);
    }
  }

  private async handleStart(ws: WebSocket, message: any) {
    const start = message.start ?? {};
    // leadId/campaignId arrive as <Parameter> elements on the TwiML <Stream>.
    const params = start.customParameters ?? {};

    const session: StreamSession = {
      callSid: start.callSid,
      streamSid: start.streamSid ?? message.streamSid,
      leadId: params.leadId,
      campaignId: params.campaignId,
      detector: new UtteranceDetector(),
      playbackToken: 0,
      playing: false,
      processing: false,
    };
    this.sessions.set(ws, session);

    this.logger.log(`Stream started for call ${session.callSid} (lead ${session.leadId ?? 'n/a'})`);
    await this.callingService.registerStream(session.callSid, session.leadId, session.campaignId);

    const greeting = await this.callingService.buildGreeting(session.callSid);
    if (greeting) await this.play(ws, session, greeting);
  }

  private async handleMedia(ws: WebSocket, message: any) {
    const session = this.sessions.get(ws);
    const payload = message.media?.payload;
    if (!session || !payload) return;

    // Twilio echoes our own outbound audio on the `outbound` track; only the
    // caller's `inbound` track should reach the recognizer.
    if (message.media?.track && message.media.track !== 'inbound') return;

    const frame = muLawDecode(Buffer.from(payload, 'base64'));
    const wasSpeaking = session.detector.isSpeaking;
    const utterance = session.detector.push(frame);

    // Barge-in: the caller started talking over the agent, so stop playback
    // immediately and drop whatever Twilio has already buffered.
    if (!wasSpeaking && session.detector.isSpeaking && session.playing) {
      this.stopPlayback(ws, session);
    }

    if (!utterance || session.processing) return;

    session.processing = true;
    try {
      const response = await this.callingService.handleUtterance(session.callSid, utterance);
      if (response) await this.play(ws, session, response);
    } finally {
      session.processing = false;
    }
  }

  private async handleStop(ws: WebSocket, message: any) {
    const session = this.sessions.get(ws);
    if (!session) return;
    const duration = Number(message.stop?.duration ?? 0);
    await this.callingService.handleCallComplete(session.callSid, duration);
    this.sessions.delete(ws);
  }

  private handleClose(ws: WebSocket) {
    const session = this.sessions.get(ws);
    if (!session) return;
    // A dropped socket without a `stop` event still ends the call; let the
    // service settle the record so it does not sit at `initiated` forever.
    this.callingService
      .handleCallComplete(session.callSid, 0)
      .catch(err => this.logger.warn(`Failed to finalise call ${session.callSid}: ${err.message}`));
    this.sessions.delete(ws);
  }

  private stopPlayback(ws: WebSocket, session: StreamSession) {
    session.playbackToken++;
    session.playing = false;
    this.send(ws, { event: 'clear', streamSid: session.streamSid });
  }

  /**
   * Stream μ-law audio back to Twilio in real time. Frames are paced at 20 ms
   * because Twilio plays them as fast as they arrive — dumping the whole
   * utterance at once makes barge-in impossible and overruns their buffer.
   */
  private async play(ws: WebSocket, session: StreamSession, mulaw: Buffer) {
    const token = ++session.playbackToken;
    session.playing = true;

    const frames = chunkMuLawFrames(mulaw);
    const startedAt = Date.now();

    for (let i = 0; i < frames.length; i++) {
      if (token !== session.playbackToken || ws.readyState !== WebSocket.OPEN) return; // barged in or gone

      this.send(ws, {
        event: 'media',
        streamSid: session.streamSid,
        media: { payload: frames[i].toString('base64') },
      });

      // Pace against elapsed wall-clock rather than a flat sleep, so slow
      // iterations do not accumulate drift across a long response.
      const target = startedAt + (i + 1) * TWILIO_FRAME_MS;
      const delay = target - Date.now();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (token === session.playbackToken) {
      session.playing = false;
      this.send(ws, { event: 'mark', streamSid: session.streamSid, mark: { name: `turn-${token}` } });
    }
  }

  private send(ws: WebSocket, payload: object) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  /** Live streams held by this process — used by the dashboard. */
  getActiveStreamCount(): number {
    return this.sessions.size;
  }
}
