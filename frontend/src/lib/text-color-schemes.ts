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
