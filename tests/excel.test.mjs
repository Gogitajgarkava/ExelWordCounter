import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { columnLabel, WorkbookSource, isSupportedFile } from '../js/excel.js';

// Load the UMD build in a sandbox so the same file the browser uses is tested.
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../vendor/xlsx.full.min.js', import.meta.url), 'utf8'), sandbox);
const XLSX = sandbox.XLSX;

globalThis.XLSX = XLSX;

function makeFile(buffer, name = 'test.xlsx') {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return {
    name,
    size: buffer.byteLength,
    arrayBuffer: async () => arrayBuffer,
  };
}

function buildWorkbook() {
  const workbook = XLSX.utils.book_new();
  const first = XLSX.utils.aoa_to_sheet([
    ['სათაური', 'აღწერა'],
    ['ვაშლი', 'წითელი ხილი'],
    ['მსხალი', 'მწვანე ხილი'],
  ]);
  const second = XLSX.utils.aoa_to_sheet([['მარტო']]);
  XLSX.utils.book_append_sheet(workbook, first, 'პირველი');
  XLSX.utils.book_append_sheet(workbook, second, 'მეორე');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('detects supported files', () => {
  assert.equal(isSupportedFile({ name: 'report.XLSX' }), true);
  assert.equal(isSupportedFile({ name: 'report.csv' }), true);
  assert.equal(isSupportedFile({ name: 'report.pdf' }), false);
  assert.equal(isSupportedFile(null), false);
});

test('reads sheets, rows and header skipping', async () => {  const source = await WorkbookSource.fromFile(makeFile(buildWorkbook()));

  assert.deepEqual([...source.sheetNames], ['პირველი', 'მეორე']);
  assert.equal(source.getRows('პირველი').length, 3);
  assert.deepEqual([...source.getGrid('პირველი', true)[0]], ['ვაშლი', 'წითელი ხილი']);
  assert.equal(
    JSON.stringify(source.getGrids(['პირველი', 'მეორე'], true)),
    JSON.stringify([
      [
        ['ვაშლი', 'წითელი ხილი'],
        ['მსხალი', 'მწვანე ხილი'],
      ],
      [],
    ]),
  );
});

test('caps the combined preview at the requested row count', async () => {
  const source = await WorkbookSource.fromFile(makeFile(buildWorkbook()));
  const rows = source.getPreviewRows(['პირველი', 'მეორე'], false, 2);
  assert.equal(rows.length, 2);
});

test('caches parsed rows instead of reading the sheet twice', async () => {
  const source = await WorkbookSource.fromFile(makeFile(buildWorkbook()));
  const first = source.getRows('პირველი');
  const second = source.getRows('პირველი');
  assert.equal(first, second);
});

test('rejects unsupported, empty and oversized files', async () => {
  await assert.rejects(() => WorkbookSource.fromFile({ name: 'a.pdf', size: 10 }), /Excel/);
  await assert.rejects(() => WorkbookSource.fromFile({ name: 'a.xlsx', size: 0 }), /ცარიელი/);
  await assert.rejects(
    () => WorkbookSource.fromFile({ name: 'a.xlsx', size: 30 * 1024 * 1024 }),
    /25 MB/,
  );
});

test('converts column indexes to Excel letters', () => {
  assert.equal(columnLabel(0), 'A');
  assert.equal(columnLabel(25), 'Z');
  assert.equal(columnLabel(26), 'AA');
  assert.equal(columnLabel(51), 'AZ');
  assert.equal(columnLabel(52), 'BA');
});

test('decodes UTF-8 CSV without BOM (Georgian text)', async () => {
  const buffer = Buffer.from('სიტყვა,რაოდენობა\nვაშლი,3\nმსხალი,2\n', 'utf8');
  const source = await WorkbookSource.fromFile(makeFile(buffer, 'fruit.csv'));
  const rows = source.getRows(source.sheetNames[0]);

  assert.equal(rows[0][0], 'სიტყვა');
  assert.equal(rows[1][0], 'ვაშლი');
  assert.equal(rows[2][0], 'მსხალი');
});

test('decodes CSV with a UTF-8 BOM', async () => {
  const buffer = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from('სიტყვა,რაოდენობა\nვაშლი,3\n', 'utf8'),
  ]);
  const source = await WorkbookSource.fromFile(makeFile(buffer, 'fruit.csv'));
  assert.equal(source.getRows(source.sheetNames[0])[1][0], 'ვაშლი');
});
