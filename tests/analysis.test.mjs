import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeCells, DEFAULT_SETTINGS, iterateGridCells } from '../js/analysis.js';

const analyze = (cells, overrides = {}) =>
  analyzeCells(cells, { ...DEFAULT_SETTINGS, ...overrides });

test('counts words, unique words, characters and frequency', () => {
  const result = analyze(['გამარჯობა გამარჯობა world', 'World test']);

  assert.equal(result.words, 5);
  assert.equal(result.uniqueWords, 3);
  assert.equal(result.cells, 2);
  assert.equal(result.freqList.find((item) => item.word === 'გამარჯობა').count, 2);
  assert.equal(result.freqList.find((item) => item.word === 'world').count, 2);
  assert.equal(result.maxCount, 2);
  assert.equal(result.chars, 35);
  assert.equal(result.charsNoSpace, 32);
});

test('ignores purely numeric cells but keeps mixed cells', () => {
  const result = analyze(['125', '99.9', '₾ 1 250', '2024 წელი'], { filterCase: false });

  assert.equal(result.cells, 4);
  assert.equal(result.skippedCells, 3);
  assert.equal(result.words, 1);
  assert.equal(result.skippedWords, 1);
  assert.deepEqual(result.freqList.map((item) => item.word), ['წელი']);
});

test('strips punctuation and attaches internal apostrophes/hyphens', () => {
  const result = analyze(['Hello, world! don’t stop-state.']);
  assert.deepEqual(
    result.freqList.map((item) => item.word),
    ['don’t', 'hello', 'stop-state', 'world'],
  );
});

test('removes URLs and e-mails consistently across multiple calls', () => {
  const settings = { ...DEFAULT_SETTINGS, filterUrlsEmails: true };
  const first = analyzeCells(['https://vercel.com info@example.com text'], settings);
  const second = analyzeCells(['https://vercel.com info@example.com text'], settings);

  assert.equal(first.words, 1);
  assert.equal(second.words, 1);
  assert.deepEqual(first.freqList.map((item) => item.word), ['text']);
  assert.deepEqual(second.freqList.map((item) => item.word), ['text']);
});

test('respects minimum word length', () => {
  const result = analyze(['I am a developer from Georgia'], { minWordLen: 3 });
  assert.deepEqual(result.freqList.map((item) => item.word), ['developer', 'from', 'georgia']);
  assert.equal(result.skippedWords, 3);
  assert.equal(result.skipped, 3);
});

test('keeps case when registry filter is off', () => {
  const result = analyze(['Word word WORD'], { filterCase: false });
  assert.equal(result.uniqueWords, 3);
  assert.equal(result.words, 3);
});

test('does not strip punctuation when the filter is off', () => {
  const result = analyze(['hello, world!'], { filterPunctuation: false });
  assert.deepEqual(result.freqList.map((item) => item.word).sort(), ['hello,', 'world!']);
});

test('iterateGridCells walks nested grids lazily and skips empty cells', () => {
  const grids = [
    [
      ['a', ''],
      ['b'],
    ],
    [['c']],
  ];
  assert.deepEqual([...iterateGridCells(grids)], ['a', 'b', 'c']);
});

test('empty input returns a stable empty result', () => {
  const result = analyze([]);
  assert.equal(result.words, 0);
  assert.equal(result.uniqueWords, 0);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.freqList, []);
});
