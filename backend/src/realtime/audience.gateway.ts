import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Public namespace for audience devices (/join/[code]). No auth — anyone with
 * the topic's join code can subscribe. Receive-only: there is no handler for
 * audience clients to push data, submissions still go through the public REST
 * endpoint (POST /api/public/questions/:id/responses).
 */
@WebSocketGateway({
  namespace: '/audience',
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
})
export class AudienceGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AudienceGateway.name);

  constructor(private readonly prisma: PrismaService) {}

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
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
    return { ok: true };
  }
}
