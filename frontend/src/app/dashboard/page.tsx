'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Button,
  Card,
  Form,
  Input,
  Layout,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
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
  description: string | null;
  code: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
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
  const [form] = Form.useForm();
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm] = Form.useForm();
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

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

  const handleCreate = async (values: { title: string; description?: string }) => {
    setCreating(true);
    try {
      const res = await apiFetch('/api/topics', { method: 'POST', body: JSON.stringify(values) });
      if (!res.ok) throw new Error('create failed');
      const { id } = await res.json();
      message.success('Tạo topic thành công');
      setModalOpen(false);
      form.resetFields();
      router.push(`/topics/${id}/edit`);
    } catch {
      message.error('Tạo topic thất bại');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (topic: Topic) => {
    setEditingTopic(topic);
    editForm.setFieldsValue({ title: topic.title, description: topic.description ?? '' });
  };

  const handleEditSubmit = async (values: { title: string; description?: string }) => {
    if (!editingTopic) return;
    setSavingEdit(true);
    try {
      const res = await apiFetch(`/api/topics/${editingTopic.id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('update failed');
      const updated: Topic = await res.json();
      setTopics((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      message.success('Đã cập nhật topic');
      setEditingTopic(null);
    } catch {
      message.error('Cập nhật thất bại');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleStatus = async (topic: Topic) => {
    const nextStatus = topic.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE';
    setUpdatingStatusId(topic.id);
    try {
      const res = await apiFetch(`/api/topics/${topic.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error('update failed');
      const updated: Topic = await res.json();
      setTopics((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      message.success(nextStatus === 'ACTIVE' ? 'Đã mở lại topic' : 'Đã đóng topic');
    } catch {
      message.error('Cập nhật trạng thái thất bại');
    } finally {
      setUpdatingStatusId(null);
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
                    <Button size="small" onClick={() => router.push(`/topics/${record.id}/edit`)}>
                      Mở
                    </Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                      Sửa
                    </Button>
                    <Button
                      size="small"
                      loading={updatingStatusId === record.id}
                      onClick={() => handleToggleStatus(record)}
                    >
                      {record.status === 'ACTIVE'
                        ? 'Đóng'
                        : record.status === 'CLOSED'
                          ? 'Mở lại'
                          : 'Mở'}
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
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea maxLength={1000} rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Sửa topic"
        open={editingTopic !== null}
        onCancel={() => setEditingTopic(null)}
        onOk={() => editForm.submit()}
        confirmLoading={savingEdit}
        okText="Lưu"
        cancelText="Huỷ"
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item
            name="title"
            label="Tiêu đề"
            rules={[{ required: true, message: 'Nhập tiêu đề' }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea maxLength={1000} rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
