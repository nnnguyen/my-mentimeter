import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXT_COLOR_SCHEMES,
  contrastRatio,
  getContrastColor,
  getContrastingPalette,
} from './text-color-schemes.ts';

test('getContrastColor picks black on light backgrounds and white on dark ones', () => {
  assert.equal(getContrastColor('#FFFFFF'), '#000000');
  assert.equal(getContrastColor('#000000'), '#FFFFFF');
});

test('getContrastingPalette leaves an already-readable color untouched', () => {
  // "default" blue already clears 3:1 against white.
  const [firstColor] = TEXT_COLOR_SCHEMES.default;
  const palette = getContrastingPalette('default', '#FFFFFF');
  assert.equal(palette[0], firstColor);
});

test('getContrastingPalette raises every color of every scheme to at least 3:1 against a light background', () => {
  for (const scheme of Object.keys(TEXT_COLOR_SCHEMES)) {
    const palette = getContrastingPalette(scheme, '#FFFFFF');
    for (const color of palette) {
      assert.ok(
        contrastRatio(color, '#FFFFFF') >= 3 - 1e-6,
        `${scheme} color ${color} only has ${contrastRatio(color, '#FFFFFF')} contrast against white`,
      );
    }
  }
});

test('getContrastingPalette raises every color of every scheme to at least 3:1 against a dark background', () => {
  for (const scheme of Object.keys(TEXT_COLOR_SCHEMES)) {
    const palette = getContrastingPalette(scheme, '#111111');
    for (const color of palette) {
      assert.ok(
        contrastRatio(color, '#111111') >= 3 - 1e-6,
        `${scheme} color ${color} only has ${contrastRatio(color, '#111111')} contrast against dark bg`,
      );
    }
  }
});

test('getContrastingPalette keeps hue apart between adjusted colors of a scheme', () => {
  // Pastel is the worst offender against a light background — every adjusted
  // color should still be distinguishable, not all collapsed to near-black.
  const palette = getContrastingPalette('pastel', '#FFFFFF');
  const uniqueColors = new Set(palette);
  assert.equal(uniqueColors.size, palette.length);
});

test('unknown scheme falls back to the default scheme', () => {
  const fallback = getContrastingPalette('does-not-exist', '#FFFFFF');
  const expected = getContrastingPalette('default', '#FFFFFF');
  assert.deepEqual(fallback, expected);
});
