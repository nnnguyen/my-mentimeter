'use client';

import { Button, Table } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { WordCloudWord } from './WordCloud';

interface WordStatsTableProps {
  words: WordCloudWord[];
  totalResponses: number;
  filename: string;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(words: WordCloudWord[], filename: string) {
  const rows = [['Từ', 'Số lượt'], ...words.map((w) => [w.displayText, String(w.count)])];
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  // Prepend a UTF-8 BOM so Excel opens Vietnamese text correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function WordStatsTable({ words, totalResponses, filename }: WordStatsTableProps) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button
          size="small"
          icon={<DownloadOutlined />}
          disabled={words.length === 0}
          onClick={() => downloadCsv(words, filename)}
        >
          Xuất CSV
        </Button>
      </div>
      <Table
        size="small"
        rowKey={(_, index) => index ?? 0}
        dataSource={words}
        pagination={false}
        locale={{ emptyText: 'Chưa có câu trả lời nào.' }}
        columns={[
          { title: 'Từ', dataIndex: 'displayText' },
          {
            title: 'Số lượt',
            dataIndex: 'count',
            sorter: (a: WordCloudWord, b: WordCloudWord) => a.count - b.count,
            defaultSortOrder: 'descend',
          },
          {
            title: 'Tỉ lệ %',
            key: 'percent',
            render: (_, record: WordCloudWord) =>
              totalResponses > 0 ? `${((record.count / totalResponses) * 100).toFixed(1)}%` : '0%',
          },
        ]}
      />
    </div>
  );
}
