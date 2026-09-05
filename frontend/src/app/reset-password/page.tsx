'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, Typography, Form, Input, Button, message, Result } from 'antd';
import { apiFetch } from '@/lib/api';

const { Title, Paragraph } = Typography;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const onFinish = async (values: any) => {
    if (!token) {
      message.error('Token không hợp lệ');
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token,
          password: values.password,
        }),
      });

      setSuccess(true);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Card style={{ width: 400 }}>
        <Result
          status="error"
          title="Thiếu Token"
          subTitle="Liên kết này không hợp lệ."
          extra={<Button type="primary" onClick={() => router.push('/login')}>Quay lại Đăng nhập</Button>}
        />
      </Card>
    );
  }

  if (success) {
    return (
      <Card style={{ width: 400 }}>
        <Result
          status="success"
          title="Đặt lại mật khẩu thành công!"
          extra={[
            <Button type="primary" key="login" onClick={() => router.push('/login')}>
              Đăng nhập ngay
            </Button>,
          ]}
        />
      </Card>
    );
  }

  return (
    <Card style={{ width: 400, borderRadius: 12 }}>
      <Title level={2} style={{ textAlign: 'center' }}>Thiết lập lại mật khẩu</Title>
      <Paragraph type="secondary" style={{ textAlign: 'center' }}>
        Nhập mật khẩu mới cho tài khoản của bạn.
      </Paragraph>

      <Form layout="vertical" onFinish={onFinish} size="large">
        <Form.Item
          name="password"
          label="Mật khẩu mới"
          rules={[
            { required: true, message: 'Vui lòng nhập mật khẩu mới!' },
            { min: 6, message: 'Mật khẩu phải ít nhất 6 ký tự!' }
          ]}
        >
          <Input.Password placeholder="Nhập mật khẩu mới" />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label="Nhập lại mật khẩu"
          dependencies={['password']}
          rules={[
            { required: true, message: 'Vui lòng xác nhận mật khẩu!' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
              },
            }),
          ]}
        >
          <Input.Password placeholder="Nhập lại mật khẩu" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 48, borderRadius: 8 }}>
            Đặt lại mật khẩu
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        padding: 24,
      }}
    >
      <Suspense fallback={<div>Đang tải...</div>}>
        <ResetPasswordContent />
      </Suspense>
    </main>
  );
}
