import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.constants';
import type { AuthenticatedUser, JwtPayload } from '../auth/strategies/jwt.strategy';
import { TopicsService } from '../topics/topics.service';
import { WordCloudService } from '../word-cloud/word-cloud.service';
import { parseCookieHeader } from './parse-cookie-header';

interface PresenterSocketData {
  user?: AuthenticatedUser;
}

type PresenterSocket = Socket<any, any, any, PresenterSocketData>;

@WebSocketGateway({
  namespace: '/presenter',
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
})
export class WordCloudGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WordCloudGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly topicsService: TopicsService,
    private readonly wordCloudService: WordCloudService,
  ) {}

  handleConnection(client: PresenterSocket) {
    const cookies = parseCookieHeader(client.handshake.headers.cookie);
    const token = cookies[ACCESS_TOKEN_COOKIE];
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      const user: AuthenticatedUser = { id: payload.sub, email: payload.email, name: payload.name };
      client.data.user = user;
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: PresenterSocket,
    @MessageBody() body: { topicId?: string },
  ): Promise<{ ok: boolean; message?: string }> {
    const user = client.data.user;
    if (!user || !body?.topicId) {
      client.disconnect();
      return { ok: false, message: 'Unauthenticated.' };
    }
    try {
      await this.topicsService.findOneForUser(body.topicId, user.id);
    } catch {
      const message = 'Bạn không có quyền truy cập topic này.';
      client.emit('join:error', { message });
      return { ok: false, message };
    }
    await client.join(`topic:${body.topicId}`);
    return { ok: true };
  }

  async broadcastSnapshot(topicId: string): Promise<void> {
    const snapshot = await this.wordCloudService.getSnapshot(topicId);
    this.server.to(`topic:${topicId}`).emit('wordcloud:update', snapshot);
    this.logger.debug(`Broadcast wordcloud:update to topic:${topicId}`);
  }
}
