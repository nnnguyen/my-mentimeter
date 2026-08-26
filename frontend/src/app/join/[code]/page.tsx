'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Alert, Button, Card, Input, Progress, Result, Space, Spin, Typography, message } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { io, Socket } from 'socket.io-client';
import { apiFetch, API_BASE_URL } from '@/lib/api';
import { getParticipantSessionId } from '@/lib/participant';

const RECONNECT_GRACE_MS = 5000;
const POLL_INTERVAL_MS = 3000;

const { Title, Paragraph, Text } = Typography;

interface CurrentQuestion {
  id: string;
  prompt: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  config: {
    responseLimit: number | null;
    maxWordLength: number;
    allowDuplicateFromSameUser: boolean;
    showResultsToAudience: boolean;
  };
  myResponseCount: number;
}

interface PublicTopic {
  topicTitle: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  currentQuestion: CurrentQuestion | null;
}

interface QuestionChangedEvent {
  questionId: string;
  prompt: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  config: {
    responseLimit: number | null;
    maxWordLength: number;
    allowDuplicateFromSameUser: boolean;
    showResultsToAudience: boolean;
  };
}

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const [topic, setTopic] = useState<PublicTopic | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTopicRef = useRef<() => Promise<void>>();
  fetchTopicRef.current = async () => {
    const participantSessionId = getParticipantSessionId();
    const res = await apiFetch(
      `/api/public/topics/${code}?participantSessionId=${participantSessionId}`,
    );
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (!res.ok) return;
    const data: PublicTopic = await res.json();
    setTopic(data);
    setSubmittedCount(data.currentQuestion?.myResponseCount ?? 0);
  };

  useEffect(() => {
    fetchTopicRef.current?.().finally(() => setLoading(false));
  }, [code]);

  // Listen for question:changed so the audience screen follows the presenter
  // without re-scanning the QR (mục 4 CLAUDE.md). Fetch snapshot via HTTP
  // first (done above), THEN connect the socket; fall back to polling the
  // public snapshot if the socket stays disconnected for a while.
  useEffect(() => {
    if (loading || notFound) return;
    let cancelled = false;
    let socket: Socket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    socket = io(`${API_BASE_URL}/audience`, { withCredentials: true });

    socket.on('connect', () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const wasPolling = pollInterval !== null;
      stopPolling();
      socket?.emit('join', { code });
      if (wasPolling) {
        void fetchTopicRef.current?.();
      }
    });

    socket.on('question:changed', (event: QuestionChangedEvent) => {
      if (cancelled) return;
      setTopic((prev) =>
        prev
          ? {
              ...prev,
              currentQuestion: {
                id: event.questionId,
                prompt: event.prompt,
                status: event.status,
                config: event.config,
                myResponseCount: 0,
              },
            }
          : prev,
      );
      setSubmittedCount(0);
      setText('');
      setError(null);
      message.info('Đã chuyển sang câu hỏi mới', 3);
    });

    socket.on('disconnect', () => {
      reconnectTimer = setTimeout(() => {
        pollInterval = setInterval(() => {
          void fetchTopicRef.current?.();
        }, POLL_INTERVAL_MS);
      }, RECONNECT_GRACE_MS);
    });

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopPolling();
      socket?.disconnect();
    };
  }, [code, loading, notFound]);

  const question = topic?.currentQuestion ?? null;

  const handleSubmit = async () => {
    if (!text.trim() || !question) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/public/questions/${question.id}/responses`, {
        method: 'POST',
        body: JSON.stringify({ text, participantSessionId: getParticipantSessionId() }),
      });
      const data = await res.json();

      if (res.status === 201) {
        setSubmittedCount((data as { submittedCount: number }).submittedCount);
        setText('');
      } else {
        setError((data as { message?: string }).message ?? 'Có lỗi xảy ra, vui lòng thử lại.');
        if (res.status === 429 && question.config.responseLimit !== null) {
          setSubmittedCount(question.config.responseLimit);
        }
      }
    } catch {
      setError('Có lỗi xảy ra, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </main>
    );
  }

  if (notFound || !topic) {
    return (
      <main style={{ padding: 16 }}>
        <Result status="404" title="Không tìm thấy" subTitle="Mã tham gia không tồn tại." />
      </main>
    );
  }

  const responseLimit = question?.config.responseLimit ?? null;
  const quotaReached = responseLimit !== null && submittedCount >= responseLimit;
  const isClosed = !question || question.status !== 'ACTIVE';
  const disabled = isClosed || quotaReached;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            {question && (
              <Title level={4} style={{ marginBottom: 4 }}>
                {question.prompt}
              </Title>
            )}
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {topic.topicTitle}
            </Paragraph>
          </div>

          {!question && (
            <Alert type="info" showIcon message="Chưa có câu hỏi nào đang mở." />
          )}
          {question?.status === 'DRAFT' && (
            <Alert type="warning" showIcon message="Câu hỏi chưa được bắt đầu." />
          )}
          {question?.status === 'CLOSED' && (
            <Alert type="info" showIcon message="Câu hỏi đã đóng, không nhận thêm câu trả lời." />
          )}
          {error && (
            <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} />
          )}

          {question && (
            <>
              <Input
                size="large"
                placeholder="Nhập một từ..."
                value={text}
                maxLength={question.config.maxWordLength}
                disabled={disabled || submitting}
                onChange={(e) => setText(e.target.value)}
                onPressEnter={handleSubmit}
              />
              <Button
                type="primary"
                size="large"
                block
                icon={<SendOutlined />}
                loading={submitting}
                disabled={disabled || !text.trim()}
                onClick={handleSubmit}
              >
                Gửi
              </Button>

              <div>
                {responseLimit !== null ? (
                  <>
                    <Text type="secondary">
                      Đã gửi {submittedCount}/{responseLimit} từ
                    </Text>
                    <Progress
                      percent={Math.min(100, (submittedCount / responseLimit) * 100)}
                      showInfo={false}
                      size="small"
                    />
                  </>
                ) : (
                  <Text type="secondary">Đã gửi {submittedCount} từ</Text>
                )}
              </div>
            </>
          )}
        </Space>
      </Card>
    </main>
  );
}
