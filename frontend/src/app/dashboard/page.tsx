'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Button, Card, Spin, Typography } from 'antd';
import { apiFetch } from '@/lib/api';

const { Title, Text } = Typography;

interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/auth/session')
      .then((res) => {
        if (!res.ok) {
          router.push('/login');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setUser(data);
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
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
    <main style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar src={user.avatarUrl} size={64}>
            {user.name?.[0]}
          </Avatar>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {user.name}
            </Title>
            <Text type="secondary">{user.email}</Text>
          </div>
        </div>
        <Button style={{ marginTop: 24 }} onClick={handleLogout}>
          Đăng xuất
        </Button>
      </Card>
    </main>
  );
}
