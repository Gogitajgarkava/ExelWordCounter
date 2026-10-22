/**
 * DOM rendering + small UI helpers.
 * All user-provided text is escaped before being written with innerHTML.
 */

import { escapeHtml, formatBytes, formatNumber, icon } from './utils.js';
import { ALL_SHEETS, columnLabel } from './excel.js';

const byId = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ Toast */

let toastTimer = null;
let toastHideTimer = null;

export function showToast(message, type = 'info') {
  const toast = byId('toast');
  const text = byId('toastMessage');
  const iconEl = byId('toastIcon');
  const useEl = iconEl.querySelector('use');

  const styles = {
    success: { icon: 'circle-check', color: 'text-emerald-400' },
    error: { icon: 'circle-alert', color: 'text-rose-400' },
    info: { icon: 'info', color: 'text-sky-400' },
  };
  const style = styles[type] || styles.info;

  useEl.setAttribute('href', `#i-${style.icon}`);
  iconEl.setAttribute('class', `icon icon-sm ${style.color}`);
  text.textContent = message;

  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);

  toast.classList.remove('hidden', 'animate-toast-out');
  toast.classList.add('animate-toast-in');

  toastTimer = setTimeout(() => {
    toast.classList.remove('animate-toast-in');
    toast.classList.add('animate-toast-out');
    toastHideTimer = setTimeout(() => {
      toast.classList.add('hidden');
      toast.classList.remove('animate-toast-out');
    }, 200);
  }, 3400);
}

/* ------------------------------------------------------------------- Tabs */

export function setInputMode(mode) {
  byId('panel-file').classList.toggle('hidden', mode !== 'file');
  byId('panel-text').classList.toggle('hidden', mode !== 'text');

  document.querySelectorAll('[data-mode]').forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
}

export function setResultView(view) {
  byId('viewPanel-freq').classList.toggle('hidden', view !== 'freq');
  byId('viewPanel-preview').classList.toggle('hidden', view !== 'preview');

  document.querySelectorAll('[data-view]').forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
}

/* ------------------------------------------------------------- File & busy */

export function renderFileInfo({ name, size, sheetCount }) {
  byId('fileMeta').classList.remove('hidden');
  byId('fileName').textContent = name;
  byId('fileMetaLine').textContent = `${formatBytes(size)} · ${formatNumber(sheetCount)} Sheet`;
  byId('dropzone').classList.add('border-brand-300', 'bg-brand-50/40');
}

export function clearFileInfo() {
  byId('fileMeta').classList.add('hidden');
  byId('fileName').textContent = '';
  byId('fileMetaLine').textContent = '';
  byId('dropzone').classList.remove('border-brand-300', 'bg-brand-50/40');
  byId('fileInput').value = '';
}

export function setBusy(busy, label = 'მონაცემები მუშავდება…') {
  byId('busyBar').classList.toggle('hidden', !busy);
  byId('busyText').textContent = label;
  byId('dropzone').setAttribute('aria-busy', String(busy));
}

export function setDragActive(active) {
  const dropzone = byId('dropzone');
  dropzone.classList.toggle('border-brand-500', active);
  dropzone.classList.toggle('bg-brand-50/70', active);
  dropzone.classList.toggle('scale-[0.995]', active);
}

/* ----------------------------------------------------------------- Sheets */

export function renderSheetOptions(names, selected = ALL_SHEETS) {
  const select = byId('sheetSelect');
  const options = [
    `<option value="${ALL_SHEETS}">ყველა Sheet (${formatNumber(names.length)})</option>`,
    ...names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
  ];
  select.innerHTML = options.join('');
  select.value = names.includes(selected) ? selected : ALL_SHEETS;
  select.disabled = names.length === 0;
}

export function renderSheetState({ mode, sheetNames }) {
  const select = byId('sheetSelect');
  const hint = byId('sheetHint');
  const isFile = mode === 'file';

  select.disabled = !isFile || !sheetNames || sheetNames.length === 0;
  hint.textContent = isFile
    ? 'აირჩიეთ კონკრეტული Sheet ან მთელი ფაილი'
    : 'ტექსტის რეჟიმში Sheet არ გამოიყენება';
  hint.classList.toggle('text-slate-500', !isFile);
  hint.classList.toggle('text-brand-600', isFile);
}

/* --------------------------------------------------------------- Settings */

const SETTING_IDS = {
  filterNumbers: 'filterNumbers',
  filterPunctuation: 'filterPunctuation',
  filterHeader: 'filterHeader',
  filterUrlsEmails: 'filterUrlsEmails',
  filterCase: 'filterCase',
};

export function readSettings() {
  const settings = {};
  for (const [key, id] of Object.entries(SETTING_IDS)) {
    settings[key] = byId(id).checked;
  }
  settings.minWordLen = Number(byId('minWordLen').value) || 1;
  return settings;
}

export function renderSettings(settings) {
  for (const [key, id] of Object.entries(SETTING_IDS)) {
    byId(id).checked = Boolean(settings[key]);
  }
  byId('minWordLen').value = String(settings.minWordLen);
  byId('minWordLenVal').textContent = String(settings.minWordLen);
}

export function renderFilterSummary(settings, mode) {
  const labels = [];
  if (settings.filterNumbers) labels.push('ციფრები იგნორირებული');
  if (settings.filterPunctuation) labels.push('პუნქტუაცია ამოღებული');
  if (settings.filterUrlsEmails) labels.push('ბმულები / Email გამოტოვებული');
  if (settings.filterCase) labels.push('რეგისტრი არ აქვს მნიშვნელობა');
  if (settings.filterHeader && mode === 'file') labels.push('სათაურები გამოტოვებული');
  if (settings.minWordLen > 1) labels.push(`მინ. სიგრძე ${settings.minWordLen} ასო`);
  if (labels.length === 0) labels.push('ფილტრები გამორთულია');

  byId('filterSummary').innerHTML = labels
    .map((label) => `<span class="chip">${escapeHtml(label)}</span>`)
    .join('');
}

/* ------------------------------------------------------------------ Stats */

export function renderStats(analysis) {
  byId('statWords').textContent = formatNumber(analysis.words);
  byId('statUnique').textContent = formatNumber(analysis.uniqueWords);
  byId('statChars').textContent = formatNumber(analysis.chars);
  byId('statCharsNoSpace').textContent = formatNumber(analysis.charsNoSpace);
  byId('statCells').textContent = formatNumber(analysis.cells);

  const skipped = analysis.skipped;
  byId('statSkipped').textContent = formatNumber(skipped);
  byId('statSkippedHint').textContent = skipped
    ? `${formatNumber(analysis.skippedCells)} უჯრა · ${formatNumber(analysis.skippedWords)} სიტყვა`
    : 'ფილტრით დაბლოკილი';

  byId('resultMeta').textContent =
    analysis.words > 0
      ? `${formatNumber(analysis.words)} სიტყვა · ${formatNumber(analysis.uniqueWords)} უნიკალური · ${formatNumber(analysis.cells)} უჯრა`
      : 'შედეგი ცარიელია';
}

export function renderTextStats(text) {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/u).filter(Boolean).length : 0;
  byId('textStats').textContent = `${formatNumber(words)} სიტყვა · ${formatNumber(text.length)} სიმბოლო`;
  byId('clearTextBtn').classList.toggle('hidden', text.length === 0);
}

/* -------------------------------------------------------------- Frequency */

function emptyRow(colspan, title, hint, iconName) {
  return `
    <tr>
      <td colspan="${colspan}" class="px-4 py-14">
        <div class="flex flex-col items-center gap-2 text-center">
          <span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            ${icon(iconName, 'icon h-5 w-5')}
          </span>
          <p class="text-sm font-semibold text-slate-600">${escapeHtml(title)}</p>
          <p class="max-w-xs text-xs text-slate-500">${escapeHtml(hint)}</p>
        </div>
      </td>
    </tr>`;
}

/**
 * @param {object} params
 * @param {Array<{word: string, count: number}>} params.list Already filtered + sorted
 * @param {number} params.totalWords
 * @param {number} params.maxCount
 * @param {number} params.visibleCount
 * @param {boolean} params.hasQuery
 */
export function renderFrequency({ list, totalWords, maxCount, visibleCount, hasQuery }) {
  const tbody = byId('freqBody');
  const footer = byId('freqFooter');

  if (list.length === 0) {
    tbody.innerHTML = hasQuery
      ? emptyRow(4, 'სიტყვა ვერ მოიძებნა', 'სცადეთ სხვა საძიებო სიტყვა ან გაასუფთავეთ ძებნა.', 'search')
      : emptyRow(
          4,
          'მონაცემები ჯერ არ არის',
          'ატვირთეთ Excel / CSV ფაილი ან ჩასვით ტექსტი ზემოთ.',
          'chart-no-axes-column',
        );
    footer.classList.add('hidden');
    return;
  }

  const shown = Math.min(visibleCount, list.length);
  const total = totalWords || 1;
  const peak = maxCount || 1;

  tbody.innerHTML = list
    .slice(0, shown)
    .map((item, index) => {
      const share = (item.count / total) * 100;
      const shareLabel = share > 0 && share < 0.1 ? '<0.1' : share.toFixed(1);
      const barWidth = Math.max(4, Math.round((item.count / peak) * 100));

      return `
        <tr class="row-hover">
          <td class="hidden w-12 px-4 py-2.5 text-center font-mono text-[11px] text-slate-500 sm:table-cell">${index + 1}</td>
          <td class="max-w-[16rem] px-4 py-2.5">
            <span class="break-words text-[13px] font-semibold text-slate-800" title="${escapeHtml(item.word)}">${escapeHtml(item.word)}</span>
          </td>
          <td class="w-24 px-4 py-2.5 text-center">
            <span class="inline-flex min-w-[2.5rem] justify-center rounded-md bg-brand-50 px-2 py-0.5 font-mono text-xs font-bold text-brand-700">${formatNumber(item.count)}</span>
          </td>
          <td class="hidden px-4 py-2.5 md:table-cell">
            <div class="flex items-center gap-2">
              <div class="h-1.5 w-full max-w-[9rem] overflow-hidden rounded-full bg-slate-100">
                <div class="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal-400" style="width:${barWidth}%"></div>
              </div>
              <span class="w-12 text-right font-mono text-[10px] text-slate-500">${shareLabel}%</span>
            </div>
          </td>
        </tr>`;
    })
    .join('');

  footer.classList.remove('hidden');
  byId('freqRange').textContent = hasQuery
    ? `მოიძებნა ${formatNumber(list.length)} სიტყვა · ნაჩვენებია ${formatNumber(shown)}`
    : `ნაჩვენებია ${formatNumber(shown)} / ${formatNumber(list.length)}`;
  byId('loadMoreBtn').classList.toggle('hidden', shown >= list.length);
}

/* ---------------------------------------------------------------- Preview */

export function renderPreview(rows, maxColumns = 40) {
  const wrap = byId('previewTableWrap');
  const empty = byId('previewEmpty');
  const head = byId('previewHead');
  const body = byId('previewBody');

  if (!rows || rows.length === 0) {
    wrap.classList.add('hidden');
    empty.classList.remove('hidden');
    byId('previewMeta').textContent = '';
    return;
  }

  const columnCount = Math.min(maxColumns, Math.max(...rows.map((row) => row.length), 1));
  const headCells = ['#'];
  for (let c = 0; c < columnCount; c += 1) headCells.push(columnLabel(c));
  head.innerHTML = `<tr>${headCells
    .map(
      (label, index) =>
        `<th scope="col" class="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-500 ${
          index === 0 ? 'w-10 text-center' : 'text-left'
        }">${label}</th>`,
    )
    .join('')}</tr>`;

  body.innerHTML = rows
    .map((row, rowIndex) => {
      const cells = [];
      for (let c = 0; c < columnCount; c += 1) {
        const value = row[c] ?? '';
        cells.push(
          value
            ? `<td class="max-w-[18rem] truncate border-r border-slate-100 px-3 py-1.5 text-slate-700" title="${escapeHtml(value)}">${escapeHtml(value)}</td>`
            : '<td class="border-r border-slate-100 px-3 py-1.5 text-slate-500">—</td>',
        );
      }
      return `<tr class="row-hover align-top">
        <td class="border-r border-slate-200 bg-slate-50 px-2 py-1.5 text-center font-mono text-[10px] text-slate-500">${rowIndex + 1}</td>
        ${cells.join('')}
      </tr>`;
    })
    .join('');

  wrap.classList.remove('hidden');
  empty.classList.add('hidden');

  const truncated = Math.max(...rows.map((row) => row.length)) > columnCount;
  byId('previewMeta').textContent = `ნაჩვენებია პირველი ${formatNumber(rows.length)} სტრიქონი · ${formatNumber(columnCount)} სვეტი${
    truncated ? ' (დანარჩენი სვეტები დამალულია)' : ''
  }`;
}

/* ------------------------------------------------------------------- Misc */

export function setSampleText(text) {
  byId('rawText').value = text;
  renderTextStats(text);
}

export function focusTextarea() {
  const textarea = byId('rawText');
  textarea.focus({ preventScroll: true });
}
