'use client';

import React, { useState } from 'react';
import { Modal, Form, Input, Button, message, Typography } from 'antd';
import { apiFetch } from '@/lib/api';

const { Title } = Typography;

interface RegisterModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function RegisterModal({ open, onCancel, onSuccess }: RegisterModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: values.email,
          password: values.password,
        }),
      });

      message.success(res.message || 'Đăng ký thành công! Vui lòng kiểm tra email.');
      form.resetFields();
      onSuccess();
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      centered
      width={400}
    >
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <img src="/logo.jpg" alt="Logo" style={{ width: 80, height: 80, marginBottom: 16, borderRadius: 8 }} />
        <Title level={2} style={{ margin: 0 }}>SOH Word Cloud</Title>
        <Title level={4} style={{ marginTop: 8, color: '#595959' }}>Đăng ký</Title>
      </div>
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        style={{ marginTop: 20 }}
      >
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Vui lòng nhập email!' },
            { type: 'email', message: 'Email không hợp lệ!' }
          ]}
        >
          <Input placeholder="Nhập địa chỉ email của bạn" size="large" />
        </Form.Item>

        <Form.Item
          name="password"
          label="Mật khẩu"
          rules={[
            { required: true, message: 'Vui lòng nhập mật khẩu!' },
            { min: 6, message: 'Mật khẩu phải ít nhất 6 ký tự!' }
          ]}
        >
          <Input.Password placeholder="Nhập mật khẩu" size="large" />
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
          <Input.Password placeholder="Nhập lại mật khẩu" size="large" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ height: 48, borderRadius: 24, background: '#d73224', borderColor: '#d73224' }}>
            Đăng ký
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}
