'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Space, Spin, Statistic, Tag, Typography, message } from 'antd';
import {
  ArrowLeftOutlined,
  CopyOutlined,
  DownloadOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { io, Socket } from 'socket.io-client';
import { apiFetch, API_BASE_URL } from '@/lib/api';
import { WordCloud, WordCloudWord } from '@/components/WordCloud';
import { WordStatsTable } from '@/components/WordStatsTable';

const { Title, Paragraph, Text } = Typography;

interface Topic {
  id: string;
  title: string;
  question: string;
  code: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  maxWordsPerUser: number | null;
  createdAt: string;
}

interface WordCloudSnapshot {
  words: WordCloudWord[];
  totalResponses: number;
  uniqueWords: number;
}

type ConnectionStatus = 'connected' | 'reconnecting' | 'polling';

const CONNECTION_LABEL: Record<ConnectionStatus, { text: string; color: string }> = {
  connected: { text: 'Realtime', color: 'green' },
  reconnecting: { text: 'Đang kết nối lại...', color: 'gold' },
  polling: { text: 'Polling mỗi 3s', color: 'default' },
};

const RECONNECT_GRACE_MS = 5000;
const POLL_INTERVAL_MS = 3000;

const STATUS_COLOR: Record<Topic['status'], string> = {
  DRAFT: 'default',
  ACTIVE: 'green',
  CLOSED: 'red',
};
const STATUS_LABEL: Record<Topic['status'], string> = {
  DRAFT: 'Nháp',
  ACTIVE: 'Đang mở',
  CLOSED: 'Đã đóng',
};

export default function TopicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [wordCloud, setWordCloud] = useState<WordCloudSnapshot>({
    words: [],
    totalResponses: 0,
    uniqueWords: 0,
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');
  const [showTable, setShowTable] = useState(true);

  const loadTopic = useCallback(async () => {
    const res = await apiFetch(`/api/topics/${id}`);
    if (res.status === 403 || res.status === 404) {
      message.error('Bạn không có quyền truy cập topic này');
      router.push('/dashboard');
      return;
    }
    if (res.ok) setTopic(await res.json());
  }, [id, router]);

  useEffect(() => {
    loadTopic().finally(() => setLoading(false));
  }, [loadTopic]);

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
  // (mục 3 CLAUDE.md) — avoids a blank screen before the first socket event.
  useEffect(() => {
    if (!topic) return;
    const topicId = topic.id;
    let cancelled = false;
    let socket: Socket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const fetchSnapshot = async () => {
      const res = await apiFetch(`/api/topics/${topicId}/wordcloud`);
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
        socket?.emit('join', { topicId });
        if (wasPolling) {
          void fetchSnapshot();
        }
      });

      socket.on('wordcloud:update', (data: WordCloudSnapshot) => {
        setWordCloud(data);
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
  }, [topic?.id]);

  const updateStatus = async (status: Topic['status']) => {
    if (!topic) return;
    setUpdating(true);
    try {
      const res = await apiFetch(`/api/topics/${topic.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (res.ok) setTopic(await res.json());
      else message.error('Cập nhật trạng thái thất bại');
    } finally {
      setUpdating(false);
    }
  };

  const voteUrl =
    topic && typeof window !== 'undefined' ? `${window.location.origin}/vote/${topic.code}` : '';

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(voteUrl);
    message.success('Đã copy link');
  };

  if (loading) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </main>
    );
  }

  if (!topic) {
    return null;
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
      <Button
        icon={<ArrowLeftOutlined />}
        style={{ marginBottom: 16 }}
        onClick={() => router.push('/dashboard')}
      >
        Quay lại
      </Button>
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Tag color={STATUS_COLOR[topic.status]}>{STATUS_LABEL[topic.status]}</Tag>
            <Title level={3} style={{ marginTop: 8 }}>
              {topic.title}
            </Title>
            <Paragraph>{topic.question}</Paragraph>
            <Text type="secondary">Mã: {topic.code}</Text>
            <br />
            <Text type="secondary">
              {topic.maxWordsPerUser !== null
                ? `Giới hạn: ${topic.maxWordsPerUser} từ/người`
                : 'Không giới hạn số từ'}
            </Text>
          </div>

          <Space>
            {topic.status === 'DRAFT' && (
              <Button type="primary" loading={updating} onClick={() => updateStatus('ACTIVE')}>
                Bắt đầu
              </Button>
            )}
            {topic.status === 'ACTIVE' && (
              <Button danger loading={updating} onClick={() => updateStatus('CLOSED')}>
                Đóng
              </Button>
            )}
          </Space>

          <div style={{ textAlign: 'center' }}>
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt="QR code vote" width={240} height={240} />
            ) : (
              <Spin />
            )}
            <div style={{ marginTop: 12 }}>
              <Space>
                <Button icon={<CopyOutlined />} onClick={handleCopyLink}>
                  Copy link
                </Button>
                {qrUrl && (
                  <a href={qrUrl} download={`qr-${topic.code}.png`}>
                    <Button icon={<DownloadOutlined />}>Tải QR</Button>
                  </a>
                )}
              </Space>
            </div>
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              {voteUrl}
            </Text>
          </div>
        </Space>
      </Card>

      <Card style={{ marginTop: 24 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size="large">
              <Statistic title="Tổng câu trả lời" value={wordCloud.totalResponses} />
              <Statistic title="Số từ khác nhau" value={wordCloud.uniqueWords} />
            </Space>
            <Space>
              <Button size="small" icon={<TableOutlined />} onClick={() => setShowTable((v) => !v)}>
                {showTable ? 'Ẩn bảng' : 'Hiện bảng'}
              </Button>
              <Tag color={CONNECTION_LABEL[connectionStatus].color}>
                {CONNECTION_LABEL[connectionStatus].text}
              </Tag>
            </Space>
          </div>

          {wordCloud.words.length > 0 ? (
            <WordCloud words={wordCloud.words} />
          ) : (
            <Text type="secondary">Chưa có câu trả lời nào.</Text>
          )}

          {showTable && (
            <WordStatsTable
              words={wordCloud.words}
              totalResponses={wordCloud.totalResponses}
              filename={`wordcloud-${topic.code}.csv`}
            />
          )}
        </Space>
      </Card>
    </main>
  );
}
