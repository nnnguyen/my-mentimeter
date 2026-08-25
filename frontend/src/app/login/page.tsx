'use client';

import { Button, Card, Typography } from 'antd';
import { GoogleOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '@/lib/api';

const { Title, Paragraph } = Typography;

export default function LoginPage() {
  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Card style={{ width: 360, textAlign: 'center' }}>
        <Title level={3}>Mentimeter</Title>
        <Paragraph type="secondary">Đăng nhập để tạo topic và xem word cloud realtime.</Paragraph>
        <Button
          type="primary"
          icon={<GoogleOutlined />}
          size="large"
          block
          onClick={handleGoogleLogin}
        >
          Đăng nhập với Google
        </Button>
      </Card>
    </main>
  );
}
