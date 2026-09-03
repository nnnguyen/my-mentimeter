'use client';

import {
  Button,
  ColorPicker,
  Divider,
  InputNumber,
  Radio,
  Select,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { CloseOutlined } from '@ant-design/icons';
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
  saveStatus,
  onFieldChange,
  onApplyToAll,
  onClose,
}: QuestionEditPanelProps) {
  const questionId = question.id;
  const change = (patch: QuestionPatch) => onFieldChange(questionId, patch);

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
    </div>
  );
}
