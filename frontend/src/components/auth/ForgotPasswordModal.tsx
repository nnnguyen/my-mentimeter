'use client';

import React, { useState } from 'react';
import { Modal, Form, Input, Button, Typography, message } from 'antd';
import { apiFetch } from '@/lib/api';

const { Title, Paragraph, Text } = Typography;

interface ForgotPasswordModalProps {
  open: boolean;
  onCancel: () => void;
}

export default function ForgotPasswordModal({ open, onCancel }: ForgotPasswordModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailSent, setEmailSent] = useState('');

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: values.email }),
      });

      setSubmitted(true);
      setEmailSent(values.email);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSubmitted(false);
    setEmailSent('');
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      width={450}
      closable={true}
    >
      <div style={{ textAlign: 'center', padding: '20px 10px' }}>
        <Title level={2} style={{ fontSize: 28, fontWeight: 800, textTransform: 'uppercase', marginBottom: 20 }}>
          QUÊN MẬT KHẨU
        </Title>
        
        <Paragraph style={{ color: '#666', fontSize: 16, fontWeight: 600, marginBottom: 10 }}>
          Khôi phục mật mã đăng nhập
        </Paragraph>
        
        <Paragraph style={{ color: '#999', fontSize: 14, lineHeight: 1.6, marginBottom: 25 }}>
          Bạn muốn khôi phục mật khẩu đăng nhập, bạn cần nhập thư điện tử của bạn đang sử dụng để chúng tôi có thể liên kết khôi phục mật khẩu của bạn. Điều này sẽ được chúng tôi bảo mật hoàn toàn.
        </Paragraph>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          requiredMark={false}
        >
          <Form.Item
            name="email"
            label={<Text strong>Nhập vào thư điện tử <span style={{ color: 'red' }}>*</span></Text>}
            rules={[
              { required: true, message: 'Vui lòng nhập email!' },
              { type: 'email', message: 'Email không hợp lệ!' }
            ]}
          >
            <Input 
              placeholder="Nhập địa chỉ email của bạn" 
              size="large" 
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          {submitted && (
            <div style={{ textAlign: 'left', marginBottom: 20 }}>
                <Text style={{ color: '#999', fontStyle: 'italic', fontSize: 13 }}>
                    * Email khôi phục đã được gửi đến <br/>
                    <Text strong style={{ color: '#1890ff' }}>{emailSent}</Text>. Vui lòng kiểm tra email và nhấp vào liên kết
                </Text>
            </div>
          )}

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              size="large" 
              block 
              loading={loading}
              style={{ 
                height: 50, 
                borderRadius: 8, 
                background: '#fee2e2', 
                borderColor: submitted ? '#1890ff' : 'transparent',
                color: '#d73224',
                fontWeight: 'bold',
                fontSize: 16,
                borderWidth: submitted ? 1 : 0
              }}
            >
              {submitted ? 'Gửi lại' : 'Gửi yêu cầu'}
            </Button>
          </Form.Item>
          
          <Button type="link" onClick={handleClose} style={{ color: '#999' }}>
            Đóng
          </Button>
        </Form>
      </div>
    </Modal>
  );
}
