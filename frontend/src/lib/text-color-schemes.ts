export const DEFAULT_TEXT_COLOR_SCHEME = 'default';

export const TEXT_COLOR_SCHEMES: Record<string, string[]> = {
  default: ['#1677ff', '#722ed1', '#13a8a8', '#eb2f96', '#fa8c16', '#52c41a'],
  vibrant: ['#f5222d', '#fa8c16', '#fadb14', '#52c41a', '#1677ff', '#eb2f96'],
  pastel: ['#adc6ff', '#b7eb8f', '#ffd6e7', '#ffe7ba', '#d3adf7', '#87e8de'],
  mono: ['#262626', '#434343', '#595959', '#8c8c8c', '#bfbfbf', '#000000'],
};

export const TEXT_COLOR_SCHEME_OPTIONS = [
  { value: 'default', label: 'Mặc định' },
  { value: 'vibrant', label: 'Rực rỡ' },
  { value: 'pastel', label: 'Pastel' },
  { value: 'mono', label: 'Đơn sắc' },
];

// Minimum WCAG contrast ratio word cloud text is nudged towards. 3:1 matches
// the AA threshold for large/bold text, which is what word cloud words are.
const MIN_WORD_CLOUD_CONTRAST = 3;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const color = hex.startsWith('#') ? hex.slice(1) : hex;
  const full = color.length === 3
    ? color.split('').map((c) => c + c).join('')
    : color;
  return {
    r: parseInt(full.substring(0, 2), 16),
    g: parseInt(full.substring(2, 4), 16),
    b: parseInt(full.substring(4, 6), 16),
  };
}

function srgbChannelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

// Black or white, whichever contrasts more with the given background.
export function getContrastColor(backgroundColor: string): string {
  return relativeLuminance(backgroundColor) > 0.5 ? '#000000' : '#FFFFFF';
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
  }
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function hueToRgbChannel(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToHex(h: number, s: number, l: number): string {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = s / 100;
  const ln = l / 100;

  let r: number;
  let g: number;
  let b: number;
  if (sn === 0) {
    r = g = b = ln;
  } else {
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = hueToRgbChannel(p, q, hn + 1 / 3);
    g = hueToRgbChannel(p, q, hn);
    b = hueToRgbChannel(p, q, hn - 1 / 3);
  }

  const toHex = (c: number) =>
    Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Nudges a color's lightness away from the background's until it clears
// MIN_WORD_CLOUD_CONTRAST, keeping its hue/saturation so it stays recognizably
// "that" color instead of collapsing to plain black/white.
function ensureContrast(color: string, backgroundColor: string, minRatio = MIN_WORD_CLOUD_CONTRAST): string {
  if (contrastRatio(color, backgroundColor) >= minRatio) return color;

  const darken = relativeLuminance(backgroundColor) > 0.5;
  const { h, s } = hexToHsl(color);
  let l = hexToHsl(color).l;

  for (let i = 0; i < 24; i++) {
    l = darken ? Math.max(4, l - 4) : Math.min(96, l + 4);
    const candidate = hslToHex(h, s, l);
    if (contrastRatio(candidate, backgroundColor) >= minRatio) return candidate;
    if (darken ? l <= 4 : l >= 96) break;
  }
  return hslToHex(h, s, l);
}

// The palette for a scheme, with each color nudged for contrast against the
// given background so word cloud text stays readable on any background color.
export function getContrastingPalette(schemeKey: string, backgroundColor: string): string[] {
  const base = TEXT_COLOR_SCHEMES[schemeKey] ?? TEXT_COLOR_SCHEMES[DEFAULT_TEXT_COLOR_SCHEME];
  return base.map((color) => ensureContrast(color, backgroundColor));
}
