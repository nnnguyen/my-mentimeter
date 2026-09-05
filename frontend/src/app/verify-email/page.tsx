'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, Typography, Button, Result, Spin, message } from 'antd';
import { apiFetch } from '@/lib/api';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (token) {
      apiFetch('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      })
        .then((data) => {
          setSuccess(true);
          setEmail(data.email);
        })
        .catch((err) => {
          message.error(err.message || 'Xác thực thất bại');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
        <div style={{ marginTop: 20 }}>Đang xác thực email...</div>
      </div>
    );
  }

  return (
    <Card style={{ width: 500, borderRadius: 12 }}>
      {success ? (
        <Result
          status="success"
          title={`Xác thực email ${email} thành công.`}
          extra={[
            <Button type="primary" key="login" onClick={() => router.push('/login')} size="large">
              Đăng nhập
            </Button>,
          ]}
        />
      ) : (
        <Result
          status="error"
          title="Xác thực email thất bại"
          subTitle="Liên kết xác thực không hợp lệ hoặc đã hết hạn."
          extra={[
            <Button type="primary" key="home" onClick={() => router.push('/login')}>
              Quay lại Đăng nhập
            </Button>,
          ]}
        />
      )}
    </Card>
  );
}

export default function VerifyEmailPage() {
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
      <Suspense fallback={<Spin size="large" />}>
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
