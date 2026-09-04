'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from 'recharts';
import type { WordCloudWord } from './WordCloud';

interface StatsVisualizerProps {
  words: WordCloudWord[];
  type: 'bar' | 'pie';
}

const COLORS = ['#1677ff', '#722ed1', '#13a8a8', '#eb2f96', '#fa8c16', '#52c41a', '#1890ff', '#2f54eb', '#722ed1', '#eb2f96'];

export function StatsVisualizer({ words, type }: StatsVisualizerProps) {
  const data = (words || []).slice(0, 10).map(w => ({
    name: w.displayText || '',
    value: w.count || 0
  }));

  if (data.length === 0) return null;

  if (type === 'bar') {
    return (
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              width={100} 
              tick={{ fontSize: 12 }}
            />
            <Tooltip />
            <Bar dataKey="value" fill="#1677ff" radius={[0, 4, 4, 0]} label={{ position: 'right' }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
            label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
