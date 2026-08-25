'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Space, Spin, Tag, Typography, message } from 'antd';
import { ArrowLeftOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { apiFetch } from '@/lib/api';

const { Title, Paragraph, Text } = Typography;

interface Topic {
  id: string;
  title: string;
  question: string;
  code: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  maxWordsPerUser: number;
  createdAt: string;
}

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
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
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
    </main>
  );
}
