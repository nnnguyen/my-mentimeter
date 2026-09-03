'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Modal, Space, Spin, Statistic, Tag, Typography, message } from 'antd';
import {
  ArrowLeftOutlined,
  BarChartOutlined,
  CloseOutlined,
  CopyOutlined,
  EyeOutlined,
  LeftOutlined,
  QrcodeOutlined,
  RightOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { io, Socket } from 'socket.io-client';
import { apiFetch, API_BASE_URL } from '@/lib/api';
import { WordCloud, WordCloudWord } from '@/components/WordCloud';
import { WordStatsTable } from '@/components/WordStatsTable';
import { TEXT_COLOR_SCHEMES, DEFAULT_TEXT_COLOR_SCHEME } from '@/lib/text-color-schemes';
import type { Question } from '@/types/question';

const { Title, Text } = Typography;

interface Topic {
  id: string;
  title: string;
  description: string | null;
  code: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  currentQuestionId: string | null;
  createdAt: string;
}

interface WordCloudSnapshot {
  words: WordCloudWord[];
  totalResponses: number;
  uniqueWords: number;
  uniqueParticipants: number;
}

interface WordCloudUpdateEvent extends Partial<WordCloudSnapshot> {
  questionId: string;
  totalResponses: number;
}

interface QuestionChangedEvent {
  questionId: string;
  order: number;
  prompt: string;
  status: Question['status'];
  config: Omit<Question, 'id' | 'topicId' | 'order' | 'prompt' | 'status'>;
}

type ConnectionStatus = 'connected' | 'reconnecting' | 'polling';

const CONNECTION_LABEL: Record<ConnectionStatus, { text: string; color: string }> = {
  connected: { text: 'Realtime', color: 'green' },
  reconnecting: { text: 'Đang kết nối lại...', color: 'gold' },
  polling: { text: 'Polling mỗi 3s', color: 'default' },
};

const RECONNECT_GRACE_MS = 5000;
const POLL_INTERVAL_MS = 3000;
const QR_PANEL_WIDTH = 500;

function isResultHidden(question: Pick<Question, 'resultVisibility' | 'resultsRevealed'>): boolean {
  if (question.resultVisibility === 'PRIVATE') return true;
  return question.resultVisibility === 'ON_CLICK' && !question.resultsRevealed;
}

function getContrastColor(hexColor: string): string {
  // Remove hash if present
  const color = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;

  // Handle shorthand hex like #000
  let r, g, b;
  if (color.length === 3) {
    r = parseInt(color[0] + color[0], 16);
    g = parseInt(color[1] + color[1], 16);
    b = parseInt(color[2] + color[2], 16);
  } else {
    r = parseInt(color.substring(0, 2), 16);
    g = parseInt(color.substring(2, 4), 16);
    b = parseInt(color.substring(4, 6), 16);
  }

  // Calculate luminance - using relative luminance formula
  // 0.2126 * R + 0.7152 * G + 0.0722 * B
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

export default function TopicPresentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [changingQuestion, setChangingQuestion] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [wordCloud, setWordCloud] = useState<WordCloudSnapshot>({
    words: [],
    totalResponses: 0,
    uniqueWords: 0,
    uniqueParticipants: 0,
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');
  const [joinedCount, setJoinedCount] = useState(0);
  const [qrPanelOpen, setQrPanelOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);

  const loadTopic = useCallback(async () => {
    const res = await apiFetch(`/api/topics/${id}`);
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    if (res.status === 403 || res.status === 404) {
      message.error('Bạn không có quyền truy cập topic này');
      router.push('/dashboard');
      return;
    }
    if (res.ok) setTopic(await res.json());
  }, [id, router]);

  const loadQuestions = useCallback(async (topicId: string) => {
    const res = await apiFetch(`/api/topics/${topicId}/questions`);
    if (res.ok) setQuestions(await res.json());
  }, []);

  useEffect(() => {
    Promise.all([loadTopic(), loadQuestions(id)]).finally(() => setLoading(false));
  }, [id, loadTopic, loadQuestions]);

  const currentQuestion = questions.find((q) => q.id === topic?.currentQuestionId) ?? null;
  const currentIndex = currentQuestion
    ? questions.findIndex((q) => q.id === currentQuestion.id)
    : -1;
  const prevQuestion = currentIndex > 0 ? questions[currentIndex - 1] : null;
  const nextQuestion =
    currentIndex >= 0 && currentIndex < questions.length - 1 ? questions[currentIndex + 1] : null;

  const applyQuestionChanged = useCallback((event: QuestionChangedEvent) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === event.questionId
          ? { ...q, prompt: event.prompt, status: event.status, ...event.config }
          : q,
      ),
    );
    setTopic((prev) => (prev ? { ...prev, currentQuestionId: event.questionId } : prev));
  }, []);

  // Close the slide-in QR panel and the stats dialog whenever the current
  // question changes, so they don't carry over covering the new content.
  useEffect(() => {
    setQrPanelOpen(false);
    setStatsModalOpen(false);
  }, [currentQuestion?.id]);

  useEffect(() => {
    if (!topic) return;
    let objectUrl: string | null = null;
    apiFetch(`/api/topics/${topic.id}/qrcode`)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setQrUrl(objectUrl);
        }
      });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic?.id]);

  // Realtime word cloud: fetch snapshot via HTTP first, THEN connect the socket
  // (mục 4 CLAUDE.md) — avoids a blank screen before the first socket event.
  // Also listens for question:changed (mục 4 — both /present and /join react
  // to it) so a Prev/Sau press on another tab/device stays in sync here too.
  useEffect(() => {
    if (!topic || !currentQuestion) {
      setWordCloud({ words: [], totalResponses: 0, uniqueWords: 0, uniqueParticipants: 0 });
      return;
    }
    const topicId = topic.id;
    const questionId = currentQuestion.id;
    let cancelled = false;
    let socket: Socket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const fetchSnapshot = async () => {
      const res = await apiFetch(`/api/questions/${questionId}/wordcloud`);
      if (!cancelled && res.ok) {
        setWordCloud(await res.json());
      }
    };

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    fetchSnapshot().then(() => {
      if (cancelled) return;

      socket = io(`${API_BASE_URL}/presenter`, { withCredentials: true });

      socket.on('connect', () => {
        setConnectionStatus('connected');
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        const wasPolling = pollInterval !== null;
        stopPolling();
        socket?.emit('join', { topicId }, (ack: { joinedCount?: number }) => {
          // The presenter socket reconnects on every question change, so the
          // ack (not just the participants:joined broadcast) is what keeps
          // this accurate right after a switch.
          if (ack?.joinedCount !== undefined) setJoinedCount(ack.joinedCount);
        });
        if (wasPolling) {
          void fetchSnapshot();
        }
      });

      socket.on('participants:joined', (data: { count: number }) => {
        setJoinedCount(data.count);
      });

      socket.on('wordcloud:update', (data: WordCloudUpdateEvent) => {
        if (data.questionId === questionId) {
          setWordCloud({
            words: data.words ?? [],
            totalResponses: data.totalResponses,
            uniqueWords: data.uniqueWords ?? 0,
            uniqueParticipants: data.uniqueParticipants ?? 0,
          });
        }
      });

      socket.on('results:revealed', (data: WordCloudUpdateEvent) => {
        if (data.questionId === questionId) {
          setWordCloud({
            words: data.words ?? [],
            totalResponses: data.totalResponses,
            uniqueWords: data.uniqueWords ?? 0,
            uniqueParticipants: data.uniqueParticipants ?? 0,
          });
        }
      });

      socket.on('question:changed', (data: QuestionChangedEvent) => {
        applyQuestionChanged(data);
      });

      socket.on('disconnect', () => {
        setConnectionStatus('reconnecting');
        reconnectTimer = setTimeout(() => {
          setConnectionStatus('polling');
          pollInterval = setInterval(fetchSnapshot, POLL_INTERVAL_MS);
        }, RECONNECT_GRACE_MS);
      });
    });

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopPolling();
      socket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic?.id, currentQuestion?.id]);

  const handleChangeQuestion = async (target: Question | null) => {
    if (!topic || !target) return;
    setChangingQuestion(true);
    try {
      const res = await apiFetch(`/api/topics/${topic.id}/current-question`, {
        method: 'POST',
        body: JSON.stringify({ questionId: target.id }),
      });
      if (res.ok) setTopic(await res.json());
      else message.error('Chuyển câu hỏi thất bại');
    } finally {
      setChangingQuestion(false);
    }
  };

  // A topic has no current question until the presenter explicitly picks one
  // (via Trước/Sau, or here). Auto-select question 1 the first time this
  // screen is opened, so it doesn't land on an empty state with Trước/Sau
  // both disabled and nothing to click.
  useEffect(() => {
    if (!topic || topic.currentQuestionId !== null || questions.length === 0) return;
    handleChangeQuestion(questions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic?.id, topic?.currentQuestionId, questions.length]);

  const handleRevealResults = async () => {
    if (!currentQuestion) return;
    setRevealing(true);
    try {
      const res = await apiFetch(`/api/questions/${currentQuestion.id}/reveal-results`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated: Question = await res.json();
        setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      } else {
        message.error('Hiện kết quả thất bại');
      }
    } finally {
      setRevealing(false);
    }
  };

  const joinUrl =
    topic && typeof window !== 'undefined' ? `${window.location.origin}/join/${topic.code}` : '';

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(joinUrl);
    message.success('Đã copy link');
  };

  const handleCopyCode = async () => {
    if (!topic) return;
    await navigator.clipboard.writeText(topic.code);
    message.success('Đã copy mã tham gia');
  };

  if (loading) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </main>
    );
  }

  if (!topic) {
    return null;
  }

  const hidden = currentQuestion ? isResultHidden(currentQuestion) : false;
  const previewWords = currentQuestion
    ? wordCloud.words.slice(0, currentQuestion.maxWordsDisplayed)
    : wordCloud.words;
  const previewColors = currentQuestion
    ? TEXT_COLOR_SCHEMES[currentQuestion.textColorScheme] ?? TEXT_COLOR_SCHEMES[DEFAULT_TEXT_COLOR_SCHEME]
    : TEXT_COLOR_SCHEMES[DEFAULT_TEXT_COLOR_SCHEME];

  const questionTextColor = currentQuestion?.questionColor
    ? currentQuestion.questionColor
    : currentQuestion?.backgroundColor
      ? getContrastColor(currentQuestion.backgroundColor)
      : undefined;
  const secondaryTextColor =
    questionTextColor === '#FFFFFF' || questionTextColor?.toLowerCase() === '#ffffff'
      ? 'rgba(255, 255, 255, 0.65)'
      : undefined;

  return (
    <main
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: currentQuestion?.backgroundColor || '#FFFFFF',
        color: questionTextColor,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 16,
          flexShrink: 0,
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(`/topics/${topic.id}/edit`)}>
          Quay lại
        </Button>

        <Space>
          <Tag color={CONNECTION_LABEL[connectionStatus].color}>
            {CONNECTION_LABEL[connectionStatus].text}
          </Tag>
          {currentQuestion && (
            <Button icon={<BarChartOutlined />} onClick={() => setStatsModalOpen(true)}>
              Thống kê
            </Button>
          )}
          {currentQuestion?.showJoiningInfo && (
            <Button
              shape="circle"
              type={qrPanelOpen ? 'primary' : 'default'}
              icon={<QrcodeOutlined />}
              onClick={() => setQrPanelOpen((v) => !v)}
            />
          )}
        </Space>
      </div>

      {/* Main content: question + nav + live word cloud */}
      {questions.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text type="secondary">Chưa có câu hỏi nào — vào Chỉnh sửa để thêm câu hỏi.</Text>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
              padding: '0 24px',
              flexShrink: 0,
            }}
          >
            <Button
              shape="circle"
              size="large"
              icon={<LeftOutlined />}
              disabled={!prevQuestion || changingQuestion}
              onClick={() => handleChangeQuestion(prevQuestion)}
            />
            <div style={{ textAlign: 'center', maxWidth: '70%' }}>
              {currentQuestion && (
                <>
                  <Title level={2} style={{ margin: 0, color: 'inherit' }}>
                    {currentQuestion.prompt}
                  </Title>
                  <Text style={{ color: secondaryTextColor || 'rgba(0, 0, 0, 0.45)' }}>
                    Câu {currentIndex + 1}/{questions.length} ·{' '}
                    {currentQuestion.responseLimit !== null
                      ? `Giới hạn: ${currentQuestion.responseLimit} từ/người`
                      : 'Không giới hạn số từ'}
                  </Text>
                  <div style={{ marginTop: 8 }}>
                    <Space size="large">
                      <Space size="small">
                        <UserOutlined style={{ color: secondaryTextColor }} />
                        <Text style={{ color: secondaryTextColor || 'rgba(0, 0, 0, 0.45)' }}>
                          {joinedCount} người đã join
                        </Text>
                      </Space>
                      <Space size="small">
                        <TeamOutlined style={{ color: secondaryTextColor }} />
                        <Text style={{ color: secondaryTextColor || 'rgba(0, 0, 0, 0.45)' }}>
                          {wordCloud.uniqueParticipants} người đã trả lời
                        </Text>
                      </Space>
                    </Space>
                  </div>
                </>
              )}
            </div>
            <Button
              shape="circle"
              size="large"
              icon={<RightOutlined />}
              disabled={!nextQuestion || changingQuestion}
              onClick={() => handleChangeQuestion(nextQuestion)}
            />
          </div>

          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: 24,
            }}
          >
            {hidden ? (
              <Space direction="vertical" align="center">
                <Statistic
                  title={<Text style={{ color: secondaryTextColor }}>Tổng câu trả lời</Text>}
                  value={wordCloud.totalResponses}
                  valueStyle={{ color: 'inherit' }}
                />
                {currentQuestion?.resultVisibility === 'PRIVATE' && (
                  <Text style={{ color: secondaryTextColor || 'rgba(0, 0, 0, 0.45)' }}>
                    Kết quả ở chế độ riêng tư, không hiện trên màn hình chiếu.
                  </Text>
                )}
                {currentQuestion?.resultVisibility === 'ON_CLICK' && (
                  <Text style={{ color: secondaryTextColor || 'rgba(0, 0, 0, 0.45)' }}>
                    Bấm &quot;Thống kê&quot; để hiện kết quả.
                  </Text>
                )}
              </Space>
            ) : previewWords.length > 0 ? (
              <div style={{ width: '100%', maxWidth: 1200 }}>
                <WordCloud words={previewWords} colors={previewColors} />
              </div>
            ) : (
              <Text style={{ color: secondaryTextColor || 'rgba(0, 0, 0, 0.45)' }}>
                Chưa có câu trả lời nào.
              </Text>
            )}
          </div>
        </>
      )}

      {/* Click-outside-to-close overlay for the QR panel */}
      {qrPanelOpen && (
        <div
          onClick={() => setQrPanelOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 19 }}
        />
      )}

      {/* Slide-in QR panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100%',
          width: QR_PANEL_WIDTH,
          background: '#fff',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
          transform: qrPanelOpen ? 'translateX(0)' : `translateX(${QR_PANEL_WIDTH}px)`,
          transition: 'transform 0.3s ease',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
        }}
      >
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={() => setQrPanelOpen(false)}
          style={{ position: 'absolute', top: 8, right: 8 }}
        />

        {qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrUrl} alt="QR code tham gia" width={440} height={440} />
        ) : (
          <Spin />
        )}
        <Space direction="vertical" align="center" style={{ width: '100%' }}>
          <Button block icon={<CopyOutlined />} onClick={handleCopyLink}>
            Copy link
          </Button>
          <Text type="secondary">Mã tham gia</Text>
          <Button
            block
            onClick={handleCopyCode}
            style={{ height: 'auto', padding: '16px 8px', fontSize: 42, fontWeight: 600 }}
          >
            {topic.code}
          </Button>
        </Space>
      </div>

      {/* Stats dialog */}
      <Modal
        title="Thống kê kết quả"
        open={statsModalOpen}
        onCancel={() => setStatsModalOpen(false)}
        footer={null}
        width={720}
      >
        {currentQuestion && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space size="large">
              <Statistic title="Tổng câu trả lời" value={wordCloud.totalResponses} />
              <Statistic title="Người tham gia" value={wordCloud.uniqueParticipants} />
              {!hidden && <Statistic title="Số từ khác nhau" value={wordCloud.uniqueWords} />}
            </Space>

            {currentQuestion.resultVisibility === 'ON_CLICK' && !currentQuestion.resultsRevealed && (
              <Button
                type="primary"
                icon={<EyeOutlined />}
                loading={revealing}
                onClick={handleRevealResults}
              >
                Hiện kết quả
              </Button>
            )}

            {currentQuestion.resultVisibility === 'PRIVATE' && (
              <Text type="secondary">Kết quả ở chế độ riêng tư, không hiện trên màn hình chiếu.</Text>
            )}

            {!hidden && (
              <WordStatsTable
                words={wordCloud.words}
                totalResponses={wordCloud.totalResponses}
                filename={`wordcloud-${topic.code}.csv`}
              />
            )}
          </Space>
        )}
      </Modal>
    </main>
  );
}
