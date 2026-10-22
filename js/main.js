/**
 * App bootstrap + event wiring.
 * Keeps all mutable UI state in one small store and delegates rendering to ui.js.
 */

import { analyzeCells, DEFAULT_SETTINGS, EMPTY_ANALYSIS, iterateGridCells } from './analysis.js';
import {
  ALL_SHEETS,
  MAX_FILE_SIZE,
  WorkbookSource,
  isSupportedFile,
} from './excel.js';
import * as ui from './ui.js';
import { debounce, downloadBlob, formatNumber, slugifyFilename, todayISO } from './utils.js';

const SAMPLE_TEXT = `გამარჯობა! ეს არის სადემონსტრაციო ტექსტი WordCounter-ისთვის.
აქ შეგიძლიათ შეამოწმოთ სიტყვებისა და სიმბოლოების დათვლის სიზუსტე.
ელ-ფოსტა: info@example.com
ვებ-საიტი: https://vercel.com
ტელეფონი: +995 599 00 11 22 (ეს ციფრები ავტომატურად გაიფილტრება).

სიტყვები, სიტყვები, სიტყვები და უნიკალური ტექსტი.`;

const state = {
  mode: 'file',
  source: null,
  fileName: '',
  fileSize: 0,
  sheetNames: [],
  selectedSheet: ALL_SHEETS,
  settings: { ...DEFAULT_SETTINGS },
  view: 'freq',
  query: '',
  sort: 'count',
  limit: 100,
  analysis: { ...EMPTY_ANALYSIS, freqList: [] },
  grids: [],
  busy: false,
};

const el = {};

function cacheElements() {
  Object.assign(el, {
    fileInput: document.getElementById('fileInput'),
    dropzone: document.getElementById('dropzone'),
    rawText: document.getElementById('rawText'),
    sheetSelect: document.getElementById('sheetSelect'),
    settingsCard: document.getElementById('settingsCard'),
    searchInput: document.getElementById('searchInput'),
    sortSelect: document.getElementById('sortSelect'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),
    exportBtn: document.getElementById('exportBtn'),
    sampleBtn: document.getElementById('sampleBtn'),
    resetBtn: document.getElementById('resetBtn'),
    clearFileBtn: document.getElementById('clearFileBtn'),
    clearTextBtn: document.getElementById('clearTextBtn'),
    year: document.getElementById('year'),
  });
}

/* ---------------------------------------------------------------- Startup */

function init() {
  cacheElements();
  state.settings = ui.readSettings();

  ui.renderSettings(state.settings);
  ui.setInputMode(state.mode);
  ui.setResultView(state.view);
  ui.renderSheetOptions([], ALL_SHEETS);
  ui.renderSheetState({ mode: state.mode, sheetNames: [] });
  ui.renderFilterSummary(state.settings, state.mode);
  ui.renderStats(state.analysis);
  ui.renderTextStats('');
  renderFrequencyView();
  renderPreviewView();
  bindEvents();

  if (el.year) el.year.textContent = String(new Date().getFullYear());
}

/* ------------------------------------------------------------------ Events */

function bindEvents() {
  // Input mode tabs
  document.querySelectorAll('[data-mode]').forEach((tab) => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });
  bindTabKeys('[data-mode]');

  // Result view tabs
  document.querySelectorAll('[data-view]').forEach((tab) => {
    tab.addEventListener('click', () => switchResultView(tab.dataset.view));
  });
  bindTabKeys('[data-view]');

  // Demo + reset
  el.sampleBtn.addEventListener('click', loadSample);
  el.resetBtn.addEventListener('click', resetSettings);

  // File picker + dropzone
  el.dropzone.addEventListener('click', () => el.fileInput.click());
  el.dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      el.fileInput.click();
    }
  });
  el.fileInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) handleFile(file);
  });
  el.clearFileBtn.addEventListener('click', clearFile);
  bindDragAndDrop();

  // Text input
  const processText = debounce(() => {
    state.limit = 100;
    refresh();
  }, 180);
  el.rawText.addEventListener('input', () => {
    ui.renderTextStats(el.rawText.value);
    processText();
  });
  el.clearTextBtn.addEventListener('click', () => {
    el.rawText.value = '';
    el.rawText.focus();
    ui.renderTextStats('');
    state.limit = 100;
    refresh();
  });

  // Settings
  el.sheetSelect.addEventListener('change', () => {
    state.selectedSheet = el.sheetSelect.value;
    state.limit = 100;
    refresh();
  });

  const applySoon = debounce(applySettings, 140);
  el.settingsCard.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'range') return;
    applySettings();
  });
  document.getElementById('minWordLen').addEventListener('input', (event) => {
    document.getElementById('minWordLenVal').textContent = event.target.value;
    applySoon();
  });

  // Results controls
  const searchSoon = debounce(() => {
    state.limit = 100;
    renderFrequencyView();
  }, 140);
  el.searchInput.addEventListener('input', () => {
    state.query = el.searchInput.value;
    searchSoon();
  });
  el.sortSelect.addEventListener('change', () => {
    state.sort = el.sortSelect.value;
    state.limit = 100;
    renderFrequencyView();
  });
  el.loadMoreBtn.addEventListener('click', () => {
    state.limit += 100;
    renderFrequencyView();
  });
  el.exportBtn.addEventListener('click', exportCsv);

  // Prevent the browser from opening files dropped outside the dropzone.
  window.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
  });
  window.addEventListener('drop', (event) => {
    if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
  });
}

function bindTabKeys(selector) {
  const tabs = Array.from(document.querySelectorAll(selector));
  tabs.forEach((tab, index) => {
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(index + offset + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
  });
}

/* --------------------------------------------------------------- Drag/Drop */

function bindDragAndDrop() {
  let depth = 0;

  el.dropzone.addEventListener('dragenter', (event) => {
    event.preventDefault();
    depth += 1;
    ui.setDragActive(true);
  });
  el.dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  el.dropzone.addEventListener('dragleave', (event) => {
    event.preventDefault();
    depth = Math.max(0, depth - 1);
    if (depth === 0) ui.setDragActive(false);
  });
  el.dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    depth = 0;
    ui.setDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
}

/* ------------------------------------------------------------------- Modes */

function switchMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  state.limit = 100;

  ui.setInputMode(mode);
  ui.renderSheetState({ mode, sheetNames: state.sheetNames });
  ui.renderTextStats(el.rawText.value);
  ui.renderFilterSummary(state.settings, mode);
  refresh();

  if (mode === 'text') {
    el.rawText.focus({ preventScroll: true });
  }
}

function switchResultView(view) {
  if (state.view === view) return;
  state.view = view;
  ui.setResultView(view);
  if (view === 'preview') renderPreviewView();
}

/* ---------------------------------------------------------------- Settings */

function applySettings() {
  state.settings = ui.readSettings();
  state.limit = 100;
  ui.renderFilterSummary(state.settings, state.mode);
  if (state.mode === 'text') ui.renderTextStats(el.rawText.value);
  refresh();
}

function resetSettings() {
  state.settings = { ...DEFAULT_SETTINGS };
  ui.renderSettings(state.settings);
  applySettings();
  ui.showToast('პარამეტრები აღდგა საწყის მდგომარეობაში', 'info');
}

/* -------------------------------------------------------------------- Data */

function activeSheetNames() {
  if (state.selectedSheet === ALL_SHEETS) return state.sheetNames;
  return state.sheetNames.includes(state.selectedSheet) ? [state.selectedSheet] : [];
}

function buildGrids() {
  if (state.mode === 'text') {
    const text = el.rawText.value;
    if (!text.trim()) return [];
    let lines = text.split('\n').map((line) => [line]);
    if (state.settings.filterHeader) lines = lines.slice(1);
    return [lines];
  }

  if (!state.source) return [];
  return state.source.getGrids(activeSheetNames(), state.settings.filterHeader);
}

function refresh() {
  try {
    const grids = buildGrids();
    state.grids = grids;
    state.analysis = analyzeCells(iterateGridCells(grids), state.settings);

    ui.renderStats(state.analysis);
    renderFrequencyView();
    renderPreviewView();
  } catch (error) {
    console.error(error);
    ui.showToast('მონაცემების დამუშავებისას შეცდომა მოხდა', 'error');
  }
}

/* -------------------------------------------------------------------- File */

async function handleFile(file) {
  if (state.busy) return;

  if (!isSupportedFile(file)) {
    ui.showToast('გთხოვთ აირჩიოთ Excel (.xlsx, .xls) ან CSV ფაილი', 'error');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    ui.showToast('ფაილი ძალიან დიდია — მაქსიმუმი 25 MB-ია', 'error');
    return;
  }

  state.busy = true;
  ui.setBusy(true, 'ფაილი იკითხება…');

  try {
    const source = await WorkbookSource.fromFile(file);

    state.source = source;
    state.fileName = file.name;
    state.fileSize = file.size;
    state.sheetNames = [...source.sheetNames];
    state.selectedSheet = ALL_SHEETS;
    state.query = '';
    state.limit = 100;
    el.searchInput.value = '';
    state.settings = ui.readSettings();

    if (state.mode !== 'file') {
      state.mode = 'file';
      ui.setInputMode('file');
    }
    ui.renderSheetOptions(state.sheetNames, state.selectedSheet);
    ui.renderSheetState({ mode: state.mode, sheetNames: state.sheetNames });
    ui.renderFileInfo({
      name: file.name,
      size: file.size,
      sheetCount: state.sheetNames.length,
    });
    ui.renderFilterSummary(state.settings, state.mode);

    refresh();

    if (state.analysis.cells === 0) {
      ui.showToast('ფაილი ჩაიტვირთა, მაგრამ ტექსტი ვერ მოიძებნა — შეამოწმეთ ფილტრები', 'info');
    } else {
      ui.showToast(`„${file.name}“ წარმატებით ჩაიტვირთა`, 'success');
    }
  } catch (error) {
    console.error(error);
    ui.showToast(error.message || 'ფაილის წაკითხვის შეცდომა', 'error');
  } finally {
    state.busy = false;
    ui.setBusy(false);
  }
}

function clearFile() {
  state.source = null;
  state.fileName = '';
  state.fileSize = 0;
  state.sheetNames = [];
  state.selectedSheet = ALL_SHEETS;
  state.limit = 100;

  ui.clearFileInfo();
  ui.renderSheetOptions([], ALL_SHEETS);
  ui.renderSheetState({ mode: state.mode, sheetNames: [] });
  refresh();
  ui.showToast('ფაილი წაიშალა', 'info');
}

/* ------------------------------------------------------------------ Render */

function renderFrequencyView() {
  const query = state.query.trim().toLowerCase();
  let list = state.analysis.freqList;

  if (query) {
    list = list.filter((item) => item.word.toLowerCase().includes(query));
  }
  if (state.sort === 'alpha') {
    list = [...list].sort((a, b) => a.word.localeCompare(b.word, 'ka'));
  }

  ui.renderFrequency({
    list,
    totalWords: state.analysis.words,
    maxCount: state.analysis.maxCount,
    visibleCount: state.limit,
    hasQuery: Boolean(query),
  });
}

function renderPreviewView() {
  const rows = [];
  for (const grid of state.grids) {
    for (const row of grid) {
      rows.push(row);
      if (rows.length >= 50) break;
    }
    if (rows.length >= 50) break;
  }
  ui.renderPreview(rows);
}

/* ------------------------------------------------------------------ Export */

function exportCsv() {
  const list = state.analysis.freqList;
  if (!list || list.length === 0) {
    ui.showToast('ექსპორტისთვის მონაცემები არ არის', 'error');
    return;
  }

  const total = state.analysis.words || 1;
  const lines = ['სიტყვა,რაოდენობა,წილი (%)'];

  for (const item of list) {
    const share = ((item.count / total) * 100).toFixed(2);
    lines.push(`"${item.word.replace(/"/g, '""')}",${item.count},${share}`);
  }

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const safeName = slugifyFilename(state.fileName || 'text');
  downloadBlob(blob, `sityvebi_${safeName}_${todayISO()}.csv`);
  ui.showToast(`CSV ფაილი გადმოიწერა — ${formatNumber(list.length)} სიტყვა`, 'success');
}

/* ------------------------------------------------------------------ Sample */

function loadSample() {
  state.mode = 'text';
  state.limit = 100;
  ui.setInputMode('text');
  ui.renderSheetState({ mode: 'text', sheetNames: state.sheetNames });
  ui.setSampleText(SAMPLE_TEXT);
  ui.renderFilterSummary(state.settings, 'text');
  refresh();
  el.rawText.focus({ preventScroll: true });
  ui.showToast('სადემონსტრაციო ტექსტი ჩაიტვირთა', 'success');
}

init();
