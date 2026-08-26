import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { WordCloudGateway } from './word-cloud.gateway';

interface AudienceSocketData {
  topicId?: string;
}

type AudienceSocket = Socket<any, any, any, AudienceSocketData>;

/**
 * Public namespace for audience devices (/join/[code]). No auth — anyone with
 * the topic's join code can subscribe. Receive-only: there is no handler for
 * audience clients to push data, submissions still go through the public REST
 * endpoint (POST /api/public/questions/:id/responses).
 */
@WebSocketGateway({
  namespace: '/audience',
  cors: { origin: process.env.FRONTEND_URL?.split(',') ?? [], credentials: true },
})
export class AudienceGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Namespace;

  private readonly logger = new Logger(AudienceGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WordCloudGateway))
    private readonly wordCloudGateway: WordCloudGateway,
  ) {}

  joinedCount(topicId: string): number {
    return this.server.adapter.rooms.get(`topic:${topicId}`)?.size ?? 0;
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: AudienceSocket,
    @MessageBody() body: { code?: string },
  ): Promise<{ ok: boolean; message?: string }> {
    if (!body?.code) {
      client.disconnect();
      return { ok: false, message: 'Thiếu mã tham gia.' };
    }

    const topic = await this.prisma.topic.findUnique({ where: { code: body.code } });
    if (!topic) {
      const message = 'Không tìm thấy buổi trình chiếu.';
      client.emit('join:error', { message });
      return { ok: false, message };
    }

    await client.join(`topic:${topic.id}`);
    client.data.topicId = topic.id;
    this.wordCloudGateway.broadcastJoinedCount(topic.id, this.joinedCount(topic.id));
    return { ok: true };
  }

  handleDisconnect(client: AudienceSocket): void {
    const topicId = client.data.topicId;
    if (!topicId) return;
    // Socket.IO has already removed this socket from its rooms by the time
    // `disconnect` fires, so joinedCount() already reflects the post-leave count.
    this.wordCloudGateway.broadcastJoinedCount(topicId, this.joinedCount(topicId));
  }
}
