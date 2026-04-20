import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { CallingService } from './calling.service';
import { AiService } from '../ai/ai.service';

@WebSocketGateway({ namespace: '/audio-stream', cors: { origin: '*' } })
export class CallingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(CallingGateway.name);

  constructor(private callingService: CallingService, private aiService: AiService) {}

  handleConnection(client: Socket) { this.logger.log(`WS connected: ${client.id}`); }
  handleDisconnect(client: Socket) { this.logger.log(`WS disconnected: ${client.id}`); }

  @SubscribeMessage('connected')
  handleConnected(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    client.data.callSid = data?.callSid;
  }

  @SubscribeMessage('start')
  async handleStart(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const callSid = data?.start?.callSid;
    client.data.callSid = callSid;
    client.data.streamSid = data?.start?.streamSid;
    this.logger.log(`Stream started: ${callSid}`);
    await this.sendGreeting(client);
  }

  @SubscribeMessage('media')
  async handleMedia(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const callSid = client.data.callSid;
    if (!callSid || !data?.media?.payload) return;
    const responseAudio = await this.callingService.handleAudioChunk(callSid, data.media.payload, this.aiService);
    if (responseAudio && responseAudio.length > 0) {
      client.emit('media', {
        event: 'media',
        streamSid: client.data.streamSid,
        media: { payload: responseAudio.toString('base64') },
      });
    }
  }

  @SubscribeMessage('stop')
  async handleStop(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const callSid = client.data.callSid;
    const duration = data?.stop?.duration || 0;
    if (callSid) await this.callingService.handleCallComplete(callSid, duration, this.aiService);
  }

  private async sendGreeting(client: Socket) {
    try {
      const greeting = 'Hello! This is an automated call. How are you today?';
      const audio = await this.aiService.synthesizeSpeech(greeting);
      if (audio.length > 0) {
        client.emit('media', {
          event: 'media',
          streamSid: client.data.streamSid,
          media: { payload: audio.toString('base64') },
        });
      }
    } catch (err) {
      this.logger.warn('Greeting TTS failed: ' + err.message);
    }
  }
}
