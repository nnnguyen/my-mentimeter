'use client';

import { Button, Dropdown, Modal } from 'antd';
import type { MenuProps } from 'antd';
import { BarChartOutlined, CopyOutlined, DeleteOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface SidebarQuestion {
  id: string;
  order: number;
  prompt: string;
}

interface QuestionSidebarProps {
  questions: SidebarQuestion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onShowStats?: (id: string) => void;
}

function SortableItem({
  question,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
  onShowStats,
}: {
  question: SidebarQuestion;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onShowStats?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });

  const menuItems: MenuProps['items'] = [
    { key: 'stats', icon: <BarChartOutlined />, label: 'Xem thống kê' },
    { key: 'duplicate', icon: <CopyOutlined />, label: 'Nhân bản' },
    { key: 'delete', icon: <DeleteOutlined />, label: 'Xoá', danger: true },
  ];

  const handleMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent.stopPropagation();
    if (key === 'stats') onShowStats?.();
    if (key === 'duplicate') onDuplicate();
    if (key === 'delete') {
      Modal.confirm({
        title: 'Xoá câu hỏi này?',
        content: 'Toàn bộ câu trả lời của câu hỏi sẽ bị xoá vĩnh viễn.',
        okText: 'Xoá',
        okButtonProps: { danger: true },
        cancelText: 'Huỷ',
        onOk: onDelete,
      });
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        marginBottom: 6,
        borderRadius: 6,
        cursor: 'pointer',
        background: selected ? '#e6f4ff' : '#fff',
        border: selected ? '1px solid #91caff' : '1px solid #f0f0f0',
      }}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <span style={{ fontSize: 12, color: '#8c8c8c', minWidth: 16 }}>{question.order}</span>
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 13,
        }}
      >
        {question.prompt || 'Câu hỏi chưa đặt tên'}
      </span>
      <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['click']}>
        <Button
          type="text"
          size="small"
          icon={<MoreOutlined />}
          onClick={(e) => e.stopPropagation()}
        />
      </Dropdown>
    </div>
  );
}

export function QuestionSidebar({
  questions,
  selectedId,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onReorder,
  onShowStats,
}: QuestionSidebarProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...questions];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onReorder(reordered.map((q) => q.id));
  };

  return (
    <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          {questions.map((question) => (
            <SortableItem
              key={question.id}
              question={question}
              selected={question.id === selectedId}
              onSelect={() => onSelect(question.id)}
              onDuplicate={() => onDuplicate(question.id)}
              onDelete={() => onDelete(question.id)}
              onShowStats={() => onShowStats?.(question.id)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button type="dashed" icon={<PlusOutlined />} onClick={onAdd} style={{ marginTop: 4 }}>
        Thêm câu hỏi
      </Button>
    </div>
  );
}
