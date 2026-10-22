/**
 * Excel / CSV loading layer (SheetJS).
 * Workbook data never leaves the browser.
 */

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
export const ALL_SHEETS = '__all__';

const EXTENSION_RE = /\.(xlsx|xlsm|xlsb|xls|csv)$/i;

export function isSupportedFile(file) {
  return Boolean(file) && EXTENSION_RE.test(file.name);
}

/** Decodes CSV bytes as UTF-8 (with BOM support), falling back to Windows-1252. */
function decodeCsv(buffer) {
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export class WorkbookSource {
  /** @param {object} workbook Parsed SheetJS workbook */
  constructor(workbook) {
    this.workbook = workbook;
    /** @type {Map<string, string[][]>} */
    this._rowsCache = new Map();
  }

  static async fromFile(file) {
    if (!isSupportedFile(file)) {
      throw new Error('გთხოვთ აირჩიოთ Excel (.xlsx, .xls) ან CSV ფაილი.');
    }
    if (file.size === 0) {
      throw new Error('ფაილი ცარიელია.');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('ფაილი ძალიან დიდია — მაქსიმუმი 25 MB-ია.');
    }

    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch {
      throw new Error('ფაილის წაკითხვა ვერ მოხერხდა. სცადეთ თავიდან.');
    }

    let workbook;
    try {
      if (/\.csv$/i.test(file.name)) {
        // CSV needs an explicit text decoder: SheetJS otherwise assumes a
        // legacy code page and Georgian UTF-8 text turns into mojibake.
        workbook = XLSX.read(decodeCsv(buffer), { type: 'string' });
      } else {
        workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', dense: true });
      }
    } catch {
      throw new Error('ფაილი დაზიანებულია ან დაშიფრულია და ვერ იკითხება.');
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('ფაილში ვერცერთი Sheet ვერ მოიძებნა.');
    }

    return new WorkbookSource(workbook);
  }

  get sheetNames() {
    return this.workbook.SheetNames;
  }

  /** All non-empty rows of a sheet, normalized to trimmed strings. */
  getRows(sheetName) {
    if (this._rowsCache.has(sheetName)) return this._rowsCache.get(sheetName);

    const sheet = this.workbook.Sheets[sheetName];
    let rows = [];

    if (sheet) {
      let json = [];
      try {
        json = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: false,
          defval: '',
          blankrows: false,
        });
      } catch {
        json = [];
      }

      rows = json
        .map((row) =>
          (Array.isArray(row) ? row : [])
            .map((value) => String(value ?? '').replace(/\r\n?/g, '\n').trim()),
        )
        .map((row) => {
          let end = row.length;
          while (end > 0 && row[end - 1] === '') end -= 1;
          row.length = end;
          return row;
        })
        .filter((row) => row.some((value) => value !== ''));
    }

    this._rowsCache.set(sheetName, rows);
    return rows;
  }

  /**
   * Grid for the analyser/preview. When skipHeader is on, the first row of
   * every selected sheet is dropped (each sheet has its own header row).
   */
  getGrid(sheetName, skipHeader = false) {
    const rows = this.getRows(sheetName);
    return skipHeader ? rows.slice(1) : rows;
  }

  getGrids(sheetNames, skipHeader = false) {
    return sheetNames.map((name) => this.getGrid(name, skipHeader));
  }

  /** Combined preview rows, capped for rendering performance. */
  getPreviewRows(sheetNames, skipHeader = false, maxRows = 50) {
    const combined = [];
    for (const sheetName of sheetNames) {
      for (const row of this.getGrid(sheetName, skipHeader)) {
        combined.push(row);
        if (combined.length >= maxRows) return combined;
      }
    }
    return combined;
  }
}

/** "A", "B", ... "Z", "AA", ... for preview column headers. */
export function columnLabel(index) {
  let label = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}
