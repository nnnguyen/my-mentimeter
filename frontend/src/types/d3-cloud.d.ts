// The @types/d3-cloud package targets the old d3 v3 namespace API and doesn't
// match how this project imports d3-cloud directly, so this is a minimal
// hand-written declaration covering only the API surface actually used here.
declare module 'd3-cloud' {
  export interface CloudWord {
    text?: string;
    size?: number;
    x?: number;
    y?: number;
    rotate?: number;
    font?: string;
  }

  export interface Cloud<T extends CloudWord = CloudWord> {
    size(size: [number, number]): Cloud<T>;
    words(words: T[]): Cloud<T>;
    padding(padding: number | ((datum: T, index: number) => number)): Cloud<T>;
    rotate(rotate: number | ((datum: T, index: number) => number)): Cloud<T>;
    font(font: string | ((datum: T, index: number) => string)): Cloud<T>;
    fontSize(size: number | ((datum: T, index: number) => number)): Cloud<T>;
    spiral(name: string): Cloud<T>;
    on(type: 'end', listener: (tags: T[]) => void): Cloud<T>;
    start(): Cloud<T>;
    stop(): Cloud<T>;
  }

  export default function cloud<T extends CloudWord = CloudWord>(): Cloud<T>;
}
