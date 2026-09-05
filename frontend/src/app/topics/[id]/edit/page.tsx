'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Drawer, Empty, Modal, Popover, Select, Space, Spin, Statistic, Tabs, Typography, message } from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  QrcodeOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { apiFetch } from '@/lib/api';
import { createAutosaveController } from '@/lib/autosave';
import { getContrastColor, getContrastingPalette } from '@/lib/text-color-schemes';
import { WordCloud, type WordCloudWord } from '@/components/WordCloud';
import { WordStatsTable } from '@/components/WordStatsTable';
import { StatsVisualizer } from '@/components/StatsVisualizer';
import { QuestionSidebar } from '@/components/QuestionSidebar';
import {
  QuestionEditPanel,
  type ApplyToAllGroup,
  type SaveStatus,
} from '@/components/QuestionEditPanel';
import { DEFAULT_TEXT_COLOR_SCHEME, type Question, type QuestionPatch } from '@/types/question';

const { Title, Paragraph, Text } = Typography;

interface Topic {
  id: string;
  title: string;
  description: string | null;
  code: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
}

interface TopicPatch {
  title?: string;
  description?: string;
}

const SAMPLE_WORDS = [
  { displayText: 'sáng tạo', count: 9 },
  { displayText: 'dẫn dắt', count: 7 },
  { displayText: 'tập trung', count: 6 },
  { displayText: 'nhiệt huyết', count: 6 },
  { displayText: 'đổi mới', count: 5 },
  { displayText: 'hợp tác', count: 4 },
  { displayText: 'linh hoạt', count: 3 },
  { displayText: 'quyết tâm', count: 3 },
];

const COMPACT_BREAKPOINT = 1200;

function useIsCompact(breakpoint: number): boolean {
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const check = () => setIsCompact(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return isCompact;
}

export default function TopicEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [topic, setTopic] = useState<Topic | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ status: 'idle', lastSavedAt: null });
  const [realtimeStats, setRealtimeStats] = useState<Record<string, any>>({});
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [statsQuestionId, setStatsQuestionId] = useState<string | null>(null);

  const isCompact = useIsCompact(COMPACT_BREAKPOINT);

  const questionsAutosaveRef = useRef(
    createAutosaveController<QuestionPatch>({
      save: async (questionId, patch) => {
        const res = await apiFetch(`/api/questions/${questionId}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error('save failed');
      },
      onSaving: () => setSaveStatus({ status: 'saving', lastSavedAt: null }),
      onSaved: () => setSaveStatus({ status: 'saved', lastSavedAt: new Date() }),
      onError: () => message.error('Lưu câu hỏi thất bại, thử lại sau'),
    }),
  );
  const questionsAutosave = questionsAutosaveRef.current;

  const topicAutosaveRef = useRef(
    createAutosaveController<TopicPatch>({
      save: async (topicId, patch) => {
        const res = await apiFetch(`/api/topics/${topicId}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error('save failed');
      },
      onError: () => message.error('Lưu topic thất bại, thử lại sau'),
    }),
  );
  const topicAutosave = topicAutosaveRef.current;

  const loadQuestions = useCallback(async (topicId: string): Promise<Question[]> => {
    const res = await apiFetch(`/api/topics/${topicId}/questions`);
    if (!res.ok) return [];
    const data: Question[] = await res.json();
    setQuestions(data);

    // Fetch stats for each question to show real word cloud in preview
    data.forEach(async (q) => {
      const statsRes = await apiFetch(`/api/questions/${q.id}/wordcloud`);
      if (statsRes.ok) {
        const stats = await statsRes.json();
        setRealtimeStats((prev) => ({ ...prev, [q.id]: stats }));
      }
    });

    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
      if (!res.ok) return;
      const topicData: Topic = await res.json();
      if (cancelled) return;
      setTopic(topicData);
      const qs = await loadQuestions(topicData.id);
      if (cancelled) return;
      if (qs.length > 0) setSelectedQuestionId(qs[0].id);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router, loadQuestions]);

  // Realtime-adjacent fetch: reused pattern from /present — fetch the QR
  // blob once the topic is known.
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

  useEffect(() => {
    return () => {
      questionsAutosave.flushAll();
      topicAutosave.flushAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId) ?? null;

  const handleSelectQuestion = (newId: string) => {
    if (selectedQuestionId && selectedQuestionId !== newId) {
      questionsAutosave.flush(selectedQuestionId);
    }
    setSelectedQuestionId(newId);
  };

  const handleFieldChange = (questionId: string, patch: QuestionPatch) => {
    setQuestions((prev) => prev.map((q) => (q.id === questionId ? { ...q, ...patch } : q)));
    questionsAutosave.update(questionId, patch);
  };

  const handleAddQuestion = async () => {
    if (!topic) return;
    const res = await apiFetch(`/api/topics/${topic.id}/questions`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      message.error('Tạo câu hỏi thất bại');
      return;
    }
    const created: Question = await res.json();
    setQuestions((prev) => [...prev, created]);
    setSelectedQuestionId(created.id);
    setPanelOpen(true);
  };

  const handleDuplicateQuestion = async (questionId: string) => {
    const res = await apiFetch(`/api/questions/${questionId}/duplicate`, { method: 'POST' });
    if (!res.ok) {
      message.error('Nhân bản câu hỏi thất bại');
      return;
    }
    const created: Question = await res.json();
    setQuestions((prev) => [...prev, created]);
    setSelectedQuestionId(created.id);
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!topic) return;
    const deletedOrder = questions.find((q) => q.id === questionId)?.order ?? 0;
    const res = await apiFetch(`/api/questions/${questionId}`, { method: 'DELETE' });
    if (!res.ok) {
      message.error('Xoá câu hỏi thất bại');
      return;
    }
    message.success('Đã xoá câu hỏi');
    const remaining = await loadQuestions(topic.id);
    if (selectedQuestionId === questionId) {
      if (remaining.length === 0) {
        setSelectedQuestionId(null);
      } else {
        const neighbor = remaining.reduce((closest, q) =>
          Math.abs(q.order - deletedOrder) < Math.abs(closest.order - deletedOrder) ? q : closest,
        );
        setSelectedQuestionId(neighbor.id);
      }
    }
  };

  const handleReorder = async (orderedIds: string[]) => {
    if (!topic) return;
    const snapshot = questions;
    const reordered = orderedIds
      .map((qId) => questions.find((q) => q.id === qId))
      .filter((q): q is Question => Boolean(q));
    setQuestions(reordered);

    const res = await apiFetch(`/api/topics/${topic.id}/questions/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    });
    if (!res.ok) {
      setQuestions(snapshot);
      message.error('Sắp xếp lại thất bại');
      return;
    }
    const updated: Question[] = await res.json();
    setQuestions(updated);
  };

  const handleApplyToAll = async (group: ApplyToAllGroup) => {
    if (!selectedQuestion || !topic) return;
    questionsAutosave.flush(selectedQuestion.id);
    const res = await apiFetch(`/api/questions/${selectedQuestion.id}/apply-settings-to-all`, {
      method: 'POST',
      body: JSON.stringify({ groups: [group] }),
    });
    if (!res.ok) {
      message.error('Áp dụng thất bại');
      return;
    }
    const { updatedCount } = await res.json();
    await loadQuestions(topic.id);
    message.success(`Đã áp dụng cho ${updatedCount} câu hỏi`);
  };

  const handleTopicTitleChange = (title: string) => {
    if (!topic || !title.trim()) return;
    setTopic({ ...topic, title });
    topicAutosave.update(topic.id, { title });
  };

  const handleTopicDescriptionChange = (description: string) => {
    if (!topic) return;
    setTopic({ ...topic, description });
    topicAutosave.update(topic.id, { description });
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

  const previewWords =
    selectedQuestion && realtimeStats[selectedQuestion.id]?.words?.length > 0
      ? realtimeStats[selectedQuestion.id].words.slice(0, selectedQuestion.maxWordsDisplayed)
      : selectedQuestion
        ? SAMPLE_WORDS.slice(0, selectedQuestion.maxWordsDisplayed)
        : [];
  const previewColors = getContrastingPalette(
    selectedQuestion?.textColorScheme ?? DEFAULT_TEXT_COLOR_SCHEME,
    selectedQuestion?.backgroundColor ?? '#FFFFFF',
  );

  const statsQuestion = questions.find((q) => q.id === statsQuestionId);
  const statsData = statsQuestionId ? realtimeStats[statsQuestionId] : null;

  const questionTextColor = selectedQuestion?.questionColor
    ? selectedQuestion.questionColor
    : selectedQuestion?.backgroundColor
      ? getContrastColor(selectedQuestion.backgroundColor)
      : undefined;
  const secondaryTextColor =
    questionTextColor === '#FFFFFF' || questionTextColor?.toLowerCase() === '#ffffff'
      ? 'rgba(255, 255, 255, 0.65)'
      : undefined;

  const panelContent = selectedQuestion ? (
    <QuestionEditPanel
      question={selectedQuestion}
      questions={questions}
      saveStatus={saveStatus}
      onFieldChange={handleFieldChange}
      onApplyToAll={handleApplyToAll}
      onClose={() => setPanelOpen(false)}
    />
  ) : null;

  return (
    <main style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/dashboard')}>
            Quay lại
          </Button>
          <div style={{ minWidth: 0 }}>
            <Title
              level={4}
              style={{ margin: 0 }}
              editable={{ onChange: handleTopicTitleChange, triggerType: ['text'] }}
            >
              {topic.title}
            </Title>
            <Paragraph
              type="secondary"
              style={{ margin: 0, fontSize: 12 }}
              editable={{ onChange: handleTopicDescriptionChange, triggerType: ['text'] }}
            >
              {topic.description || 'Thêm mô tả'}
            </Paragraph>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isCompact && (
            <Button icon={<SettingOutlined />} onClick={() => setPanelOpen(true)}>
              Cấu hình
            </Button>
          )}
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => router.push(`/topics/${topic.id}/present`)}
          >
            Trình chiếu
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {!isCompact && (
          <div style={{ padding: 16, borderRight: '1px solid #f0f0f0', overflowY: 'auto' }}>
            <QuestionSidebar
              questions={questions}
              selectedId={selectedQuestionId}
              onSelect={handleSelectQuestion}
              onAdd={handleAddQuestion}
              onDuplicate={handleDuplicateQuestion}
              onDelete={handleDeleteQuestion}
              onReorder={handleReorder}
              onShowStats={(qId) => {
                setStatsQuestionId(qId);
                setStatsModalVisible(true);
              }}
            />
          </div>
        )}

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 24,
            overflowY: 'auto',
          }}
        >
          {isCompact && (
            <Select
              style={{ width: '100%', maxWidth: 640, marginBottom: 16 }}
              value={selectedQuestionId ?? undefined}
              placeholder="Chọn câu hỏi"
              onChange={handleSelectQuestion}
              options={questions.map((q) => ({
                value: q.id,
                label: `${q.order}. ${q.prompt || 'Câu hỏi chưa đặt tên'}`,
              }))}
            />
          )}

          {!selectedQuestion ? (
            <Empty description="Chưa có câu hỏi nào">
              <Button type="primary" onClick={handleAddQuestion}>
                + Thêm câu hỏi đầu tiên
              </Button>
            </Empty>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                maxWidth: 640,
                backgroundColor: selectedQuestion.backgroundColor,
                color: questionTextColor,
                borderRadius: 12,
                padding: 24,
                position: 'relative',
                minHeight: 480,
                border: '1px solid #f0f0f0',
              }}
            >
              {selectedQuestion.showLogo && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginBottom: 16,
                    padding: 6,
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: 8,
                    boxShadow: `0 2px 8px ${
                      questionTextColor === '#FFFFFF' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)'
                    }`,
                    border: `1px solid ${questionTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'}`,
                    backdropFilter: 'blur(4px)',
                    alignSelf: 'center',
                  }}
                >
                  {selectedQuestion.logoUrl ? (
                    <img
                      src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${selectedQuestion.logoUrl}`}
                      alt="Logo"
                      style={{ maxHeight: 60, maxWidth: 160, objectFit: 'contain', display: 'block' }}
                    />
                  ) : (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: secondaryTextColor || '#8c8c8c',
                        padding: '2px 8px',
                      }}
                    >
                      Logo
                    </div>
                  )}
                </div>
              )}

              <Title
                level={3}
                editable={{
                  onChange: (value) => handleFieldChange(selectedQuestion.id, { prompt: value }),
                  triggerType: ['text'],
                }}
                style={{ marginTop: 8, color: 'inherit', textAlign: 'center' }}
              >
                {selectedQuestion.prompt || 'Nhập câu hỏi Word Cloud của bạn'}
              </Title>

              <div style={{ marginTop: 24, width: '100%' }}>
                <WordCloud words={previewWords} colors={previewColors} />
              </div>

              <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
                <Popover
                  trigger="click"
                  content={
                    <div style={{ textAlign: 'center' }}>
                      {qrUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={qrUrl} alt="QR code tham gia" width={160} height={160} />
                      ) : (
                        <Spin />
                      )}
                      <div style={{ marginTop: 8 }}>
                        <Text strong>{topic.code}</Text>
                      </div>
                    </div>
                  }
                >
                  <Button shape="circle" icon={<QrcodeOutlined />} />
                </Popover>
              </div>
            </div>
          )}
        </div>

        {!isCompact && panelOpen && panelContent && (
          <div style={{ width: 340, flexShrink: 0, borderLeft: '1px solid #f0f0f0', padding: 16, overflowY: 'auto' }}>
            {panelContent}
          </div>
        )}
        {!isCompact && !panelOpen && (
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => setPanelOpen(true)}
            style={{ position: 'fixed', right: 16, top: 80 }}
          >
            Cấu hình
          </Button>
        )}

        {isCompact && (
          <Drawer
            title="Edit"
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            width={340}
            closable={false}
          >
            {panelContent}
          </Drawer>
        )}
      </div>

      {/* Stats Modal */}
      <Modal
        title={statsQuestion ? `Thống kê: ${statsQuestion.prompt || 'Câu hỏi'}` : 'Thống kê kết quả'}
        open={statsModalVisible}
        onCancel={() => setStatsModalVisible(false)}
        footer={null}
        width={800}
      >
        {statsData ? (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Space size="large">
              <Statistic title="Tổng câu trả lời" value={statsData.totalResponses || 0} />
              <Statistic title="Người tham gia" value={statsData.uniqueParticipants || 0} />
              <Statistic title="Số từ khác nhau" value={statsData.uniqueWords || 0} />
            </Space>

            {statsData.words && statsData.words.length > 0 ? (
              <Tabs
                defaultActiveKey="table"
                items={[
                  {
                    key: 'table',
                    label: 'Dạng bảng',
                    children: (
                      <WordStatsTable
                        words={statsData.words}
                        totalResponses={statsData.totalResponses || 0}
                        filename={`wordcloud-${topic.code}.csv`}
                      />
                    ),
                  },
                  {
                    key: 'bar',
                    label: 'Biểu đồ cột',
                    children: <StatsVisualizer words={statsData.words} type="bar" />,
                  },
                  {
                    key: 'pie',
                    label: 'Biểu đồ tròn',
                    children: <StatsVisualizer words={statsData.words} type="pie" />,
                  },
                ]}
              />
            ) : (
              <Empty description="Chưa có câu trả lời nào" />
            )}
          </Space>
        ) : (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Spin tip="Đang tải dữ liệu..." />
          </div>
        )}
      </Modal>
    </main>
  );
}
