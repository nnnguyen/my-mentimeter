import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Namespace, Socket } from 'socket.io';
import { Question } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.constants';
import type { AuthenticatedUser, JwtPayload } from '../auth/strategies/jwt.strategy';
import { WordCloudService } from '../word-cloud/word-cloud.service';
import { AudienceGateway } from './audience.gateway';
import { parseCookieHeader } from './parse-cookie-header';

interface PresenterSocketData {
  user?: AuthenticatedUser;
}

type PresenterSocket = Socket<any, any, any, PresenterSocketData>;

interface QuestionChangedPayload {
  questionId: string;
  order: number;
  prompt: string;
  status: string;
  config: {
    type: string;
    responseLimit: number | null;
    maxWordLength: number;
    allowDuplicateFromSameUser: boolean;
    backgroundColor: string;
    textColorScheme: string;
    showLogo: boolean;
    maxWordsDisplayed: number;
    showJoiningInfo: boolean;
    joiningInfoType: string;
    resultVisibility: string;
    resultsRevealed: boolean;
    showResultsToAudience: boolean;
  };
}

@WebSocketGateway({
  namespace: '/presenter',
  cors: { origin: process.env.FRONTEND_URL?.split(',') ?? [], credentials: true },
})
export class WordCloudGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Namespace;

  private readonly logger = new Logger(WordCloudGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly wordCloudService: WordCloudService,
    @Inject(forwardRef(() => AudienceGateway))
    private readonly audienceGateway: AudienceGateway,
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
  ): Promise<{ ok: boolean; message?: string; joinedCount?: number }> {
    const user = client.data.user;
    if (!user || !body?.topicId) {
      client.disconnect();
      return { ok: false, message: 'Unauthenticated.' };
    }
    const topic = await this.prisma.topic.findUnique({ where: { id: body.topicId } });
    if (!topic || topic.ownerId !== user.id) {
      const message = 'Bạn không có quyền truy cập topic này.';
      client.emit('join:error', { message });
      return { ok: false, message };
    }
    await client.join(`topic:${body.topicId}`);
    // The presenter's socket reconnects on every question change (see
    // present/page.tsx), so it must learn the CURRENT audience count here
    // rather than only from participants:joined broadcasts, which it would
    // otherwise miss between reconnects.
    return { ok: true, joinedCount: this.audienceGateway.joinedCount(body.topicId) };
  }

  private isResultHidden(
    question: Pick<Question, 'resultVisibility' | 'resultsRevealed'> | null,
  ): boolean {
    if (!question) {
      return false;
    }
    if (question.resultVisibility === 'PRIVATE') {
      return true;
    }
    return question.resultVisibility === 'ON_CLICK' && !question.resultsRevealed;
  }

  async broadcastSnapshot(topicId: string, questionId: string): Promise<void> {
    const [snapshot, question] = await Promise.all([
      this.wordCloudService.getSnapshot(questionId),
      this.prisma.question.findUnique({ where: { id: questionId } }),
    ]);

    const payload = this.isResultHidden(question)
      ? {
          totalResponses: snapshot.totalResponses,
          uniqueParticipants: snapshot.uniqueParticipants,
          questionId,
        }
      : { ...snapshot, questionId };

    this.server.to(`topic:${topicId}`).emit('wordcloud:update', payload);
    this.audienceGateway.server.to(`topic:${topicId}`).emit('wordcloud:update', payload);
    this.logger.debug(`Broadcast wordcloud:update to topic:${topicId} for question:${questionId}`);
  }

  async broadcastResultsRevealed(topicId: string, questionId: string): Promise<void> {
    const snapshot = await this.wordCloudService.getSnapshot(questionId);
    const payload = { ...snapshot, questionId };

    this.server.to(`topic:${topicId}`).emit('results:revealed', payload);
    this.audienceGateway.server.to(`topic:${topicId}`).emit('results:revealed', payload);
    this.logger.debug(`Broadcast results:revealed to topic:${topicId} for question:${questionId}`);
  }

  broadcastJoinedCount(topicId: string, count: number): void {
    this.server.to(`topic:${topicId}`).emit('participants:joined', { count });
    this.logger.debug(`Broadcast participants:joined (${count}) to topic:${topicId}`);
  }

  broadcastQuestionChanged(topicId: string, question: Question): void {
    const payload: QuestionChangedPayload = {
      questionId: question.id,
      order: question.order,
      prompt: question.prompt,
      status: question.status,
      config: {
        type: question.type,
        responseLimit: question.responseLimit,
        maxWordLength: question.maxWordLength,
        allowDuplicateFromSameUser: question.allowDuplicateFromSameUser,
        backgroundColor: question.backgroundColor,
        textColorScheme: question.textColorScheme,
        showLogo: question.showLogo,
        maxWordsDisplayed: question.maxWordsDisplayed,
        showJoiningInfo: question.showJoiningInfo,
        joiningInfoType: question.joiningInfoType,
        resultVisibility: question.resultVisibility,
        resultsRevealed: question.resultsRevealed,
        showResultsToAudience: question.showResultsToAudience,
      },
    };

    this.server.to(`topic:${topicId}`).emit('question:changed', payload);
    this.audienceGateway.server.to(`topic:${topicId}`).emit('question:changed', payload);
    this.logger.debug(`Broadcast question:changed to topic:${topicId} for question:${question.id}`);
  }
}
