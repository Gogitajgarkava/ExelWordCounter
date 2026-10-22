/**
 * Pure text-analysis engine.
 * It has no DOM dependencies, which keeps it fast and easy to unit-test.
 */

export const DEFAULT_SETTINGS = Object.freeze({
  filterNumbers: true,
  filterPunctuation: true,
  filterHeader: false,
  filterUrlsEmails: true,
  filterCase: true,
  minWordLen: 1,
});

export const EMPTY_ANALYSIS = Object.freeze({
  words: 0,
  uniqueWords: 0,
  chars: 0,
  charsNoSpace: 0,
  cells: 0,
  skipped: 0,
  skippedCells: 0,
  skippedWords: 0,
  maxCount: 0,
  freqList: [],
});

// A cell that contains only numbers / numeric formatting, e.g. "1 250,50 ₾".
const NUMBER_CELL_RE = /^(?=.*\p{N})[\p{N}\s.,+\-/()$%€£₾]+$/u;
const NUMBER_WORD_RE = /^\p{N}+$/u;
// URLs and e-mail addresses, removed before counting when the filter is on.
const URL_EMAIL_RE =
  /(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"']+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/giu;
// Unicode-aware word tokenizer: keeps letters, digits, internal apostrophes/hyphens.
const WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
const WHITESPACE_RE = /\s+/u;

function codePointLength(value) {
  let length = 0;
  for (const _ of value) length += 1;
  return length;
}

/**
 * @param {Iterable<string>} cells Non-empty cell / text values.
 * @param {typeof DEFAULT_SETTINGS} settings
 * @returns {typeof EMPTY_ANALYSIS}
 */
export function analyzeCells(cells, settings = DEFAULT_SETTINGS) {
  const options = { ...DEFAULT_SETTINGS, ...settings };
  const minLen = Number(options.minWordLen) > 1 ? Number(options.minWordLen) : 0;

  let words = 0;
  let chars = 0;
  let charsNoSpace = 0;
  let cellsCount = 0;
  let skippedCells = 0;
  let skippedWords = 0;

  const frequencies = new Map();

  for (const rawCell of cells) {
    let text = String(rawCell ?? '');
    if (!text.trim()) continue;

    cellsCount += 1;

    // 1. Whole cell is just a number -> ignore completely.
    if (options.filterNumbers && NUMBER_CELL_RE.test(text.trim())) {
      skippedCells += 1;
      continue;
    }

    // 2. Remove links / e-mails before measuring characters.
    if (options.filterUrlsEmails) {
      text = text.replace(URL_EMAIL_RE, ' ');
    }

    // 3. Character statistics (punctuation still counts as characters).
    chars += text.length;
    charsNoSpace += text.replace(/\s+/gu, '').length;

    // 4. Tokenize.
    const tokens = options.filterPunctuation
      ? text.match(WORD_RE) || []
      : text.trim().split(WHITESPACE_RE).filter(Boolean);

    for (let token of tokens) {
      if (minLen && codePointLength(token) < minLen) {
        skippedWords += 1;
        continue;
      }
      if (options.filterNumbers && NUMBER_WORD_RE.test(token)) {
        skippedWords += 1;
        continue;
      }
      if (options.filterCase) token = token.toLowerCase();

      words += 1;
      frequencies.set(token, (frequencies.get(token) || 0) + 1);
    }
  }

  const freqList = Array.from(frequencies, ([word, count]) => ({ word, count })).sort(
    (a, b) => b.count - a.count || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0),
  );

  return {
    words,
    uniqueWords: freqList.length,
    chars,
    charsNoSpace,
    cells: cellsCount,
    skipped: skippedCells + skippedWords,
    skippedCells,
    skippedWords,
    maxCount: freqList.length ? freqList[0].count : 0,
    freqList,
  };
}

/** Lazily walks a list of 2D grids without building one huge flat array. */
export function* iterateGridCells(grids) {
  for (const grid of grids) {
    for (const row of grid) {
      for (const cell of row) {
        if (cell !== '' && cell != null) yield cell;
      }
    }
  }
}
