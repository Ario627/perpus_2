import { fail, ok } from './result.js';

const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

const SHEET_CSS = `
.qr-sheet { display: grid; gap: 8mm; }
.qr-cell { break-inside: avoid; padding: 3mm; border: 1px dashed #b9b6ac; border-radius: 2mm; text-align: center; }
.qr-cell canvas, .qr-cell img { display: block; margin: 0 auto; width: 30mm; height: 30mm; }
.qr-kode { margin: 2.4mm 0 0; font: 600 3.6mm/1.2 ui-sans-serif, system-ui, sans-serif; letter-spacing: .03em; }
.qr-judul { margin: .9mm 0 0; font: 400 2.9mm/1.3 ui-sans-serif, system-ui, sans-serif; color: #57554d; }
`;

const lib = () => {
  const ctor = globalThis.QRCode;
  if (typeof ctor !== 'function') throw new Error('qr-lib-tidak-siap');
  return ctor;
};

const px = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : fallback);

export function renderQr(target, kode, size = 200) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  const code = String(kode ?? '').trim();
  if (!host || !code) return null;

  const ctor = lib();
  const sisi = px(typeof size === 'object' ? size?.size : size, 200);

  host.replaceChildren();
  new ctor(host, {
    text: code,
    width: sisi,
    height: sisi,
    colorDark: '#191813',
    colorLight: '#ffffff',
    correctLevel: ctor.CorrectLevel?.Q ?? 3,
  });

  return host.querySelector('canvas') ?? host.querySelector('img');
}

async function toCanvas(kode, size) {
  const host = document.createElement('div');
  renderQr(host, kode, size);
  await nextPaint();

  const source = host.querySelector('canvas') ?? host.querySelector('img');
  if (!source) return null;
  if (source instanceof HTMLCanvasElement) return source;

  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return canvas;
}

export async function qrDataUrl(kode, size = 720) {
  const canvas = await toCanvas(kode, size);
  return canvas ? canvas.toDataURL('image/png') : null;
}

export async function downloadQrPng(kode, size = 720) {
  const code = String(kode ?? '').trim().toUpperCase();

  try {
    const canvas = await toCanvas(code, size);
    if (!canvas) return fail('BUKU_TIDAK_ADA');

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return fail('VALIDASI', 'QR gagal disiapkan.');

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `QR-${code}.png`;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4_000);

    return ok(true);
  } catch {
    return fail('VALIDASI', 'QR gagal disiapkan.');
  }
}

export async function printQrSheet(books, { perRow = 3, size = 420 } = {}) {
  const root = document.getElementById('print-root');
  const list = (Array.isArray(books) ? books : []).filter((book) => String(book?.kode ?? '').trim());

  if (!root) return fail('VALIDASI', 'Area cetak tidak tersedia.');
  if (list.length === 0) return fail('BUKU_TIDAK_ADA');

  root.replaceChildren();

  const style = document.createElement('style');
  style.dataset.qr = 'sheet-css';
  style.textContent = SHEET_CSS;

  const sheet = document.createElement('div');
  sheet.className = 'qr-sheet';
  sheet.style.gridTemplateColumns = `repeat(${Math.min(4, Math.max(1, perRow))}, minmax(0, 1fr))`;

  for (const book of list) {
    const cell = document.createElement('div');
    cell.className = 'qr-cell';

    const canvas = await toCanvas(book.kode, size);
    if (canvas) cell.append(canvas);

    const kode = document.createElement('p');
    kode.className = 'qr-kode tnum';
    kode.textContent = book.kode;

    const judul = document.createElement('p');
    judul.className = 'qr-judul';
    judul.textContent = book.judul ?? '';

    cell.append(kode, judul);
    sheet.append(cell);
  }

  root.append(style, sheet);

  try {
    await Promise.resolve(document.fonts?.ready);
  } catch {
    await nextPaint();
  }

  window.addEventListener(
    'afterprint',
    () => {
      root.replaceChildren();
    },
    { once: true },
  );

  window.print();
  return ok(list.length);
}