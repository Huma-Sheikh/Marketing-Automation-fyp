import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CallingService } from './calling.service';
import { AiService } from '../ai/ai.service';
export declare class CallingGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private callingService;
    private aiService;
    server: Server;
    private readonly logger;
    constructor(callingService: CallingService, aiService: AiService);
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleConnected(client: Socket, data: any): void;
    handleStart(client: Socket, data: any): Promise<void>;
    handleMedia(client: Socket, data: any): Promise<void>;
    handleStop(client: Socket, data: any): Promise<void>;
    private sendGreeting;
}
