'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import cloud from 'd3-cloud';
import type { CloudWord } from 'd3-cloud';

export interface WordCloudWord {
  displayText: string;
  count: number;
}

interface PositionedWord extends CloudWord {
  text: string;
  size: number;
  count: number;
  fontWeight: number;
  x: number;
  y: number;
  rotate: number;
}

const WIDTH = 1200;
const HEIGHT = 600;
const MIN_FONT_SIZE = 20;
const MAX_FONT_SIZE = 80;
const MIN_FONT_WEIGHT = 400;
const MAX_FONT_WEIGHT = 800;
const DEFAULT_COLORS = ['#1677ff', '#722ed1', '#13a8a8', '#eb2f96', '#fa8c16', '#52c41a'];

function ratioFor(count: number, minCount: number, maxCount: number): number {
  if (maxCount === minCount) return 0.5;
  return (count - minCount) / (maxCount - minCount);
}

function fontSizeFor(ratio: number): number {
  return MIN_FONT_SIZE + ratio * (MAX_FONT_SIZE - MIN_FONT_SIZE);
}

// Words with more responses render bolder, not just bigger — rounded to the
// nearest 100 to stay on standard CSS font-weight steps.
function fontWeightFor(ratio: number): number {
  return Math.round((MIN_FONT_WEIGHT + ratio * (MAX_FONT_WEIGHT - MIN_FONT_WEIGHT)) / 100) * 100;
}

export function WordCloud({ words, colors = DEFAULT_COLORS }: { words: WordCloudWord[]; colors?: string[] }) {
  const [positioned, setPositioned] = useState<PositionedWord[]>([]);
  const seenWords = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (words.length === 0) {
      setPositioned([]);
      return;
    }

    const counts = words.map((w) => w.count);
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);

    const layout = cloud()
      .size([WIDTH, HEIGHT])
      .words(
        words.map((w) => {
          const ratio = ratioFor(w.count, minCount, maxCount);
          return {
            text: w.displayText,
            count: w.count,
            size: fontSizeFor(ratio),
            fontWeight: fontWeightFor(ratio),
          };
        }),
      )
      .padding(10)
      .rotate(0)
      .font('sans-serif')
      .fontSize((d) => d.size ?? MIN_FONT_SIZE)
      .on('end', (tags) => {
        setPositioned(tags as PositionedWord[]);
      });

    layout.start();

    return () => {
      layout.stop();
    };
  }, [words]);

  useEffect(() => {
    positioned.forEach((w) => seenWords.current.add(w.text));
  }, [positioned]);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Word cloud"
      style={{ overflow: 'visible' }}
    >
      <g transform={`translate(${WIDTH / 2},${HEIGHT / 2})`}>
        <AnimatePresence>
          {positioned.map((w, i) => (
            <motion.text
              key={w.text}
              initial={seenWords.current.has(w.text) ? false : { opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1, x: w.x, y: w.y, rotate: w.rotate }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              style={{
                fontSize: w.size,
                fontWeight: w.fontWeight,
                fontFamily: 'sans-serif',
                fill: colors[i % colors.length],
              }}
              textAnchor="middle"
            >
              {w.text}
            </motion.text>
          ))}
        </AnimatePresence>
      </g>
    </svg>
  );
}
