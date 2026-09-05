'use client';

import React, { Suspense, useState } from 'react';
import { Button, Card, Typography, Form, Input, Checkbox, message, Divider } from 'antd';
import { GoogleOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { API_BASE_URL, API_URL, apiFetch } from '@/lib/api';
import RegisterModal from '@/components/auth/RegisterModal';
import ForgotPasswordModal from '@/components/auth/ForgotPasswordModal';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

const { Title, Paragraph, Text } = Typography;

function LoginErrorHandler({ router }: { router: ReturnType<typeof useRouter> }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      if (error === 'google_auth_failed') {
        message.error('Đăng nhập Google thất bại. Vui lòng thử lại.');
      } else if (error === 'google_auth_error') {
        message.error('Có lỗi xảy ra trong quá trình xác thực với Google.');
      }
      // Clear URL params
      router.replace('/login');
    }
  }, [searchParams, router]);

  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);

  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/auth/google`;
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: values.email,
          password: values.password,
        }),
      });

      message.success('Đăng nhập thành công!');
      router.push('/dashboard');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: '#f5f5f5'
      }}
    >
      <Suspense fallback={null}>
        <LoginErrorHandler router={router} />
      </Suspense>
      <Card style={{ width: 400, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: 80, height: 80, marginBottom: 16, borderRadius: 8 }} />
          <Title level={2} style={{ margin: 0 }}>SOH Word Cloud</Title>
          <Title level={4} style={{ marginTop: 8, color: '#595959' }}>Đăng nhập</Title>
        </div>

        <Form
          name="login_form"
          initialValues={{ remember: true }}
          onFinish={onFinish}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Vui lòng nhập email!' },
              { type: 'email', message: 'Email không hợp lệ!' }
            ]}
          >
            <Input prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} placeholder="Email" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="Mật khẩu"
            />
          </Form.Item>

          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>Ghi nhớ cho lần sau</Checkbox>
              </Form.Item>
              <a onClick={() => setIsForgotOpen(true)} style={{ color: '#1890ff' }}>
                Quên mật khẩu?
              </a>
            </div>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 48, borderRadius: 8 }}>
              Đăng nhập
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Text type="secondary">Chưa có tài khoản? </Text>
          <a onClick={() => setIsRegisterOpen(true)} style={{ fontWeight: 'bold', color: '#1890ff' }}>Đăng ký</a>
        </div>

        <Divider plain>Hoặc</Divider>

        <Button
          icon={<GoogleOutlined />}
          block
          onClick={handleGoogleLogin}
          style={{ 
            height: 48, 
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #d9d9d9',
            boxShadow: 'none'
          }}
        >
          Đăng nhập với Google
        </Button>
      </Card>

      <RegisterModal 
        open={isRegisterOpen} 
        onCancel={() => setIsRegisterOpen(false)} 
        onSuccess={() => setIsRegisterOpen(false)}
      />
      
      <ForgotPasswordModal 
        open={isForgotOpen} 
        onCancel={() => setIsForgotOpen(false)} 
      />
    </main>
  );
}
