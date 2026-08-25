'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Alert, Button, Card, Input, Progress, Result, Space, Spin, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { apiFetch } from '@/lib/api';
import { getParticipantSessionId } from '@/lib/participant';

const { Title, Paragraph, Text } = Typography;

interface PublicTopic {
  title: string;
  question: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  maxWordsPerUser: number | null;
}

function submittedCountKey(code: string) {
  return `mentimeter_submitted_${code}`;
}

export default function VotePage() {
  const { code } = useParams<{ code: string }>();
  const [topic, setTopic] = useState<PublicTopic | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = Number(localStorage.getItem(submittedCountKey(code)) ?? '0');
    if (!Number.isNaN(stored)) setSubmittedCount(stored);

    apiFetch(`/api/public/topics/${code}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data: PublicTopic | null) => {
        if (data) setTopic(data);
      })
      .finally(() => setLoading(false));
  }, [code]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/public/topics/${code}/responses`, {
        method: 'POST',
        body: JSON.stringify({ text, participantSessionId: getParticipantSessionId() }),
      });

      if (res.status === 201) {
        const data: { submittedCount: number; maxWordsPerUser: number | null } = await res.json();
        setSubmittedCount(data.submittedCount);
        localStorage.setItem(submittedCountKey(code), String(data.submittedCount));
        setText('');
      } else if (res.status === 409) {
        setError('Chủ đề chưa mở hoặc đã đóng.');
      } else if (res.status === 429) {
        setError('Bạn đã gửi đủ số từ cho phép.');
        if (topic?.maxWordsPerUser !== null && topic?.maxWordsPerUser !== undefined) {
          setSubmittedCount(topic.maxWordsPerUser);
          localStorage.setItem(submittedCountKey(code), String(topic.maxWordsPerUser));
        }
      } else {
        setError('Từ không hợp lệ, vui lòng thử từ khác.');
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
        <Result status="404" title="Không tìm thấy" subTitle="Mã topic không tồn tại." />
      </main>
    );
  }

  const isClosed = topic.status !== 'ACTIVE';
  const maxWordsPerUser = topic.maxWordsPerUser;
  const quotaReached = maxWordsPerUser !== null && submittedCount >= maxWordsPerUser;
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
            <Title level={4} style={{ marginBottom: 4 }}>
              {topic.title}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {topic.question}
            </Paragraph>
          </div>

          {topic.status === 'DRAFT' && (
            <Alert type="warning" showIcon message="Chủ đề chưa được bắt đầu." />
          )}
          {topic.status === 'CLOSED' && (
            <Alert type="info" showIcon message="Chủ đề đã đóng, không nhận thêm câu trả lời." />
          )}
          {error && (
            <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} />
          )}

          <Input
            size="large"
            placeholder="Nhập một từ..."
            value={text}
            maxLength={40}
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
            {maxWordsPerUser !== null ? (
              <>
                <Text type="secondary">
                  Đã gửi {submittedCount}/{maxWordsPerUser} từ
                </Text>
                <Progress
                  percent={Math.min(100, (submittedCount / maxWordsPerUser) * 100)}
                  showInfo={false}
                  size="small"
                />
              </>
            ) : (
              <Text type="secondary">Đã gửi {submittedCount} từ</Text>
            )}
          </div>
        </Space>
      </Card>
    </main>
  );
}
