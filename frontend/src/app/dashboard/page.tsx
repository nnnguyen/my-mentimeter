'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { apiFetch } from '@/lib/api';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface Topic {
  id: string;
  title: string;
  question: string;
  code: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  maxWordsPerUser: number | null;
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

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [wordLimit, setWordLimit] = useState(3);
  const [form] = Form.useForm();

  const loadTopics = useCallback(async () => {
    const res = await apiFetch('/api/topics');
    if (res.ok) setTopics(await res.json());
  }, []);

  useEffect(() => {
    apiFetch('/api/auth/session')
      .then((res) => {
        if (!res.ok) {
          router.push('/login');
          return null;
        }
        return res.json();
      })
      .then(async (data) => {
        if (data) {
          setUser(data);
          await loadTopics();
        }
      })
      .finally(() => setLoading(false));
  }, [router, loadTopics]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleCreate = async (values: { title: string; question: string }) => {
    setCreating(true);
    try {
      const payload = {
        ...values,
        maxWordsPerUser: limitEnabled ? wordLimit : null,
      };
      const res = await apiFetch('/api/topics', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('create failed');
      const { id } = await res.json();
      message.success('Tạo topic thành công');
      setModalOpen(false);
      form.resetFields();
      setLimitEnabled(false);
      setWordLimit(3);
      router.push(`/topics/${id}`);
    } catch {
      message.error('Tạo topic thất bại');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await apiFetch(`/api/topics/${id}`, { method: 'DELETE' });
    if (res.ok) {
      message.success('Đã xoá topic');
      await loadTopics();
    } else {
      message.error('Xoá thất bại');
    }
  };

  if (loading) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          Mentimeter
        </Title>
        <Space>
          <Avatar src={user.avatarUrl} size="small">
            {user.name?.[0]}
          </Avatar>
          <Text>{user.name}</Text>
          <Button onClick={handleLogout}>Đăng xuất</Button>
        </Space>
      </Header>
      <Content style={{ padding: 24, maxWidth: 960, margin: '0 auto', width: '100%' }}>
        <Card
          title="Danh sách topic"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Tạo topic
            </Button>
          }
        >
          <Table
            rowKey="id"
            dataSource={topics}
            locale={{ emptyText: 'Chưa có topic nào' }}
            columns={[
              { title: 'Tiêu đề', dataIndex: 'title' },
              { title: 'Mã', dataIndex: 'code' },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                render: (status: Topic['status']) => (
                  <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>
                ),
              },
              {
                title: 'Ngày tạo',
                dataIndex: 'createdAt',
                render: (value: string) => new Date(value).toLocaleString('vi-VN'),
              },
              {
                title: 'Hành động',
                render: (_: unknown, record: Topic) => (
                  <Space>
                    <Button size="small" onClick={() => router.push(`/topics/${record.id}`)}>
                      Mở
                    </Button>
                    <Popconfirm
                      title="Xoá topic này?"
                      onConfirm={() => handleDelete(record.id)}
                      okText="Xoá"
                      cancelText="Huỷ"
                    >
                      <Button size="small" danger>
                        Xoá
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </Content>

      <Modal
        title="Tạo topic mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={creating}
        okText="Tạo"
        cancelText="Huỷ"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="title"
            label="Tiêu đề"
            rules={[{ required: true, message: 'Nhập tiêu đề' }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="question"
            label="Câu hỏi"
            rules={[{ required: true, message: 'Nhập câu hỏi' }]}
          >
            <Input.TextArea maxLength={500} rows={3} />
          </Form.Item>
          <Form.Item label="Giới hạn số từ mỗi người">
            <Space>
              <Switch checked={limitEnabled} onChange={setLimitEnabled} />
              {limitEnabled ? (
                <InputNumber
                  min={1}
                  max={10}
                  value={wordLimit}
                  onChange={(value) => setWordLimit(value ?? 3)}
                />
              ) : (
                <Text type="secondary">Không giới hạn</Text>
              )}
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
