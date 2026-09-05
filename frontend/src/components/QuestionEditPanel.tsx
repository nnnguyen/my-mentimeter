'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  ColorPicker,
  Divider,
  InputNumber,
  Radio,
  Select,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import { apiFetch } from '@/lib/api';
import { CloseOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import { TEXT_COLOR_SCHEME_OPTIONS } from '@/lib/text-color-schemes';
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_TEXT_COLOR_SCHEME,
  type Question,
  type QuestionPatch,
} from '@/types/question';

const { Text, Link } = Typography;

export type ApplyToAllGroup = 'joining' | 'showResponses';

export interface SaveStatus {
  status: 'idle' | 'saving' | 'saved';
  lastSavedAt: Date | null;
}

interface QuestionEditPanelProps {
  question: Question;
  questions: Question[];
  saveStatus: SaveStatus;
  onFieldChange: (questionId: string, patch: QuestionPatch) => void;
  onApplyToAll: (group: ApplyToAllGroup) => void;
  onClose: () => void;
}

function GroupHeader({ title, onApplyToAll }: { title: string; onApplyToAll?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text strong>{title}</Text>
      {onApplyToAll && (
        <Link onClick={onApplyToAll} style={{ fontSize: 12 }}>
          Áp dụng cho tất cả
        </Link>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <Text style={{ fontSize: 13 }}>{label}</Text>
      {children}
    </div>
  );
}

function formatSavedAt(date: Date): string {
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function QuestionEditPanel({
  question,
  questions,
  saveStatus,
  onFieldChange,
  onApplyToAll,
  onClose,
}: QuestionEditPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [applyToAll, setApplyToAllLocal] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);

  const questionId = question.id;
  const change = (patch: QuestionPatch) => {
    onFieldChange(questionId, patch);
    setHasChanges(true);
  };

  useEffect(() => {
    setHasChanges(false);
  }, [question.id]);

  const saveStatusText =
    saveStatus.status === 'saving'
      ? 'Đang lưu…'
      : saveStatus.lastSavedAt
        ? `Đã lưu lúc ${formatSavedAt(saveStatus.lastSavedAt)}`
        : '';

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text strong style={{ fontSize: 16 }}>
            Edit
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {saveStatusText}
            </Text>
          </div>
        </div>
        <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      <div>
        <Text strong>Question</Text>
        <div style={{ marginTop: 8 }}>
          <Select disabled value="WORD_CLOUD" style={{ width: '100%' }} options={[{ value: 'WORD_CLOUD', label: 'Word Cloud' }]} />
        </div>
      </div>

      <Divider style={{ margin: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Text strong>Response settings</Text>
        <Row label="Giới hạn số lượt trả lời">
          <Switch
            checked={question.responseLimit !== null}
            onChange={(checked) => change({ responseLimit: checked ? 3 : null })}
          />
        </Row>
        {question.responseLimit !== null && (
          <Row label="Số lượt tối đa">
            <InputNumber
              min={1}
              value={question.responseLimit}
              onChange={(value) => change({ responseLimit: value ?? 1 })}
            />
          </Row>
        )}
        <Row label="Độ dài tối đa mỗi từ">
          <InputNumber
            min={1}
            value={question.maxWordLength}
            onChange={(value) => change({ maxWordLength: value ?? 1 })}
          />
        </Row>
        <Row label="Cho phép 1 người gửi trùng từ">
          <Switch
            checked={question.allowDuplicateFromSameUser}
            onChange={(checked) => change({ allowDuplicateFromSameUser: checked })}
          />
        </Row>
      </div>

      <Divider style={{ margin: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Text strong>Design</Text>
        <Tooltip title="Sắp có">
          <Row label="Content image">
            <Switch disabled />
          </Row>
        </Tooltip>
        <Tooltip title="Sắp có">
          <Row label="Background image">
            <Switch disabled />
          </Row>
        </Tooltip>
        <Row label="Màu nền">
          <ColorPicker
            value={question.backgroundColor}
            onChange={(color) => change({ backgroundColor: color.toHexString() })}
          />
        </Row>
        <Row label="Màu chữ câu hỏi">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ColorPicker
              value={question.questionColor || '#000000'}
              disabled={!question.questionColor}
              onChange={(color) => change({ questionColor: color.toHexString() })}
            />
            <Switch
              size="small"
              checked={!!question.questionColor}
              onChange={(checked) => change({ questionColor: checked ? '#000000' : null })}
            />
            <Text style={{ fontSize: 12 }}>{question.questionColor ? 'Tùy chỉnh' : 'Tự động'}</Text>
          </div>
        </Row>
        <Row label="Bảng màu chữ">
          <Select
            value={question.textColorScheme}
            options={TEXT_COLOR_SCHEME_OPTIONS}
            style={{ width: 140 }}
            onChange={(value) => change({ textColorScheme: value })}
          />
        </Row>
        <Row label="Hiện logo">
          <Switch checked={question.showLogo} onChange={(checked) => change({ showLogo: checked })} />
        </Row>
        {question.showLogo && (
          <Row label="Logo">
            <Upload
              name="file"
              listType="picture-card"
              className="avatar-uploader"
              showUploadList={false}
              action={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/questions/upload-logo`}
              withCredentials={true}
              beforeUpload={(file) => {
                const isLt2M = file.size / 1024 / 1024 < 2;
                if (!isLt2M) {
                  message.error('Ảnh phải nhỏ hơn 2MB!');
                }
                return isLt2M;
              }}
              onChange={(info) => {
                if (info.file.status === 'uploading') {
                  setUploading(true);
                  return;
                }
                if (info.file.status === 'done') {
                  setUploading(false);
                  const url = info.file.response?.url;
                  if (url) {
                    change({ logoUrl: url });
                  } else {
                    message.error('Không tìm thấy URL ảnh trong phản hồi');
                  }
                } else if (info.file.status === 'error') {
                  setUploading(false);
                  message.error('Tải lên logo thất bại');
                }
              }}
            >
              {question.logoUrl ? (
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${question.logoUrl}`}
                  alt="logo"
                  style={{ width: '100%' }}
                />
              ) : (
                <div>
                  {uploading ? <LoadingOutlined /> : <PlusOutlined />}
                  <div style={{ marginTop: 8 }}>Tải lên</div>
                </div>
              )}
            </Upload>
          </Row>
        )}
        <Row label="Số từ hiển thị tối đa">
          <InputNumber
            min={1}
            value={question.maxWordsDisplayed}
            onChange={(value) => change({ maxWordsDisplayed: value ?? 1 })}
          />
        </Row>
        <Link
          style={{ fontSize: 12 }}
          onClick={() =>
            change({
              backgroundColor: DEFAULT_BACKGROUND_COLOR,
              textColorScheme: DEFAULT_TEXT_COLOR_SCHEME,
            })
          }
        >
          Khôi phục màu mặc định
        </Link>
      </div>

      <Divider style={{ margin: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <GroupHeader title="Joining instructions" onApplyToAll={() => onApplyToAll('joining')} />
        <Row label="Hiện thông tin tham gia">
          <Switch
            checked={question.showJoiningInfo}
            onChange={(checked) => change({ showJoiningInfo: checked })}
          />
        </Row>
        <Row label="Kiểu hiển thị">
          <Select
            value={question.joiningInfoType}
            style={{ width: 140 }}
            options={[
              { value: 'QR_CODE', label: 'QR code' },
              { value: 'LINK', label: 'Đường link' },
              { value: 'CODE', label: 'Mã tham gia' },
            ]}
            onChange={(value) => change({ joiningInfoType: value })}
          />
        </Row>
      </div>

      <Divider style={{ margin: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <GroupHeader title="Show responses" onApplyToAll={() => onApplyToAll('showResponses')} />
        <Radio.Group
          value={question.resultVisibility}
          onChange={(e) => change({ resultVisibility: e.target.value })}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Radio value="INSTANT">Hiện ngay</Radio>
            <Radio value="ON_CLICK">
              Hiện khi bấm <Tag color="blue">Khuyến nghị</Tag>
            </Radio>
            <Radio value="PRIVATE">Không hiện</Radio>
          </div>
        </Radio.Group>
      </div>

      <Divider style={{ margin: 0 }} />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          opacity: hasChanges ? 1 : 0.5,
          pointerEvents: hasChanges ? 'auto' : 'none',
        }}
      >
        <Text strong>Áp dụng thiết lập trên cho</Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Checkbox
            checked={applyToAll}
            onChange={(e) => {
              setApplyToAllLocal(e.target.checked);
              if (e.target.checked) setTargetIds([]);
            }}
          >
            Tất cả câu hỏi
          </Checkbox>
          <Select
            mode="multiple"
            placeholder="Chọn câu hỏi"
            style={{ width: '100%' }}
            disabled={applyToAll}
            value={targetIds}
            onChange={setTargetIds}
            options={questions
              .filter((q) => q.id !== questionId)
              .map((q) => ({
                label: `Câu ${q.order}: ${q.prompt || '(Trống)'}`,
                value: q.id,
              }))}
          />
          <Button
            type="primary"
            disabled={!applyToAll && targetIds.length === 0}
            loading={applying}
            onClick={async () => {
              setApplying(true);
              try {
                const res = await apiFetch(`/api/questions/${questionId}/apply-settings-to-others`, {
                  method: 'POST',
                  body: JSON.stringify({
                    applyToAll,
                    targetQuestionIds: targetIds,
                  }),
                });
                if (res.ok) {
                  message.success('Đã áp dụng config cho các câu hỏi khác');
                  setHasChanges(false);
                } else {
                  message.error('Áp dụng config thất bại');
                }
              } finally {
                setApplying(false);
              }
            }}
          >
            Áp dụng
          </Button>
        </div>
      </div>
    </div>
  );
}
