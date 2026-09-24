import { KATEGORI, LIMITS, ROLES } from '../config.js';
import { browse, createBook, deleteBook, listBooks, suggestKode, summary, updateBook } from '../books.js';
import { downloadQrPng, printQrSheet, renderQr } from '../qr.js';
import { signIn } from '../session.js';
import { resetAll } from '../storage.js';
import {
  alertBox,
  bookBadge,
  button,
  confirmDialog,
  el,
  emptyState,
  field,
  formatDateTime,
  notice,
  openModal,
  pageHead,
  shell,
  showFieldErrors,
  stat,
  stockBar,
  toast,
} from './components.js';

const collator = new Intl.Collator('id-ID', { numeric: true, sensitivity: 'base' });
const lower = (value) => String(value ?? '').toLocaleLowerCase('id-ID');

const SORTS = [
  { value: 'kode', label: 'Kode A–Z' },
  { value: 'judul', label: 'Judul A–Z' },
  { value: 'stok', label: 'Stok tersedikit' },
  { value: 'populer', label: 'Paling sering dipinjam' },
];

export function render() {
  const filter = { q: '', urut: 'kode' };

  const stats = el('div', { class: 'grid grid-cols-2 gap-3 sm:grid-cols-4' });
  const hitung = el('p', { class: 'text-[13px] text-ink-mute', 'aria-live': 'polite' });
  const list = el('ul', { class: 'mt-3 flex flex-col gap-3' });

  const search = field({ name: 'cari', type: 'search', placeholder: 'Cari kode, judul, penulis, rak' });
  search.control.setAttribute('aria-label', 'Cari buku');

  const urut = field({ name: 'urut', options: SORTS.map(({ value, label }) => ({ value, label })), value: 'kode' });
  urut.control.setAttribute('aria-label', 'Urutkan daftar');

  const rows = () => {
    const terms = lower(filter.q).split(' ').filter(Boolean);

    const filtered = browse({}).filter((row) => {
      if (terms.length === 0) return true;
      const jejak = lower([row.book.kode, row.book.judul, row.book.penulis, row.book.kategori, row.book.lokasiRak].join(' '));
      return terms.every((term) => jejak.includes(term));
    });

    return filtered.sort((a, b) => {
      if (filter.urut === 'judul') return collator.compare(a.book.judul, b.book.judul);
      if (filter.urut === 'stok') return a.stock.tersedia - b.stock.tersedia || collator.compare(a.book.kode, b.book.kode);
      if (filter.urut === 'populer') return b.populer - a.populer || collator.compare(a.book.kode, b.book.kode);
      return collator.compare(a.book.kode, b.book.kode);
    });
  };

  const baris = (row) => {
    const { book, stock, statusKey } = row;

    return el(
      'li',
      { class: 'grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card transition duration-200 hover:border-line-strong md:grid-cols-[6.5rem_minmax(0,1fr)_8rem_auto] md:items-center md:gap-5' },
      el(
        'div',
        { class: 'flex items-center justify-between gap-3 md:block' },
        el('p', { class: 'tnum text-[13px] font-semibold text-ink-soft' }, book.kode),
        el('div', { class: 'md:mt-1.5 md:hidden' }, bookBadge(statusKey)),
      ),
      el(
        'div',
        { class: 'min-w-0' },
        el('p', { class: 'font-display text-[19px] leading-snug' }, book.judul),
        el('p', { class: 'mt-1 text-[12.5px] text-ink-mute' }, `${book.penulis} · ${book.kategori} · ${book.lokasiRak}`),
        row.populer > 0
          ? el('p', { class: 'mt-1 text-[12px] text-ink-mute tnum' }, `Sering dipinjam · ${row.populer} transaksi`)
          : null,
      ),
      el('div', { class: 'hidden md:block' }, bookBadge(statusKey)),
      el(
        'div',
        { class: 'flex flex-wrap items-center justify-between gap-3 md:justify-end md:gap-5' },
        el(
          'div',
          { class: 'min-w-0 md:w-24' },
          el(
            'p',
            { class: 'flex items-baseline gap-1.5 text-[12.5px]' },
            el('span', { class: 'tnum font-semibold' }, `${stock.tersedia}/${stock.total}`),
            el('span', { class: 'text-ink-mute' }, 'tersedia'),
          ),
          el('div', { class: 'mt-2' }, stockBar(stock.tersedia, stock.total)),
        ),
        el(
          'div',
          { class: 'flex items-center gap-1.5' },
          button({ label: 'QR', variant: 'outline', size: 'sm', onClick: () => bukaQr(book) }),
          button({ label: 'Edit', variant: 'ghost', size: 'sm', onClick: () => bukaForm(book) }),
          button({ label: 'Hapus', variant: 'ghost', size: 'sm', onClick: () => hapus(book) }),
        ),
      ),
    );
  };

  function paint() {
    const data = rows();
    const total = summary();

    stats.replaceChildren(
      stat({ label: 'Judul terdaftar', value: String(total.judul), note: `${total.eksemplar} eksemplar` }),
      stat({ label: 'Siap dipinjam', value: String(total.tersedia), note: 'eksemplar di rak' }),
      stat({ label: 'Dipesan', value: String(total.dipesan), note: 'menunggu diambil' }),
      stat({ label: 'Sedang dipinjam', value: String(total.dipinjam), note: `${total.sirkulasi} transaksi aktif` }),
    );

    hitung.textContent = data.length
      ? `Menampilkan ${data.length} dari ${total.judul} judul`
      : 'Tidak ada judul yang cocok';

    list.replaceChildren(
      ...(data.length
        ? data.map(baris)
        : [
            el(
              'li',
              {},
              emptyState({
                title: filter.q ? 'Tidak ada buku yang cocok' : 'Katalog masih kosong',
                description: filter.q
                  ? 'Coba kata kunci lain atau bersihkan pencarian.'
                  : 'Tambahkan judul pertama supaya siswa bisa mulai mencari.',
                action: filter.q
                  ? button({
                      label: 'Bersihkan pencarian',
                      variant: 'outline',
                      onClick: () => {
                        filter.q = '';
                        search.setValue('');
                        paint();
                      },
                    })
                  : button({ label: 'Tambah buku', variant: 'ink', onClick: () => bukaForm(null) }),
              }),
            ),
          ]),
    );
  }

  function bukaForm(book) {
    const editing = Boolean(book);
    const bindings = {};
    const errorBox = el('div');

    const kode = field({
      label: 'Kode buku',
      name: 'kode',
      value: book?.kode ?? suggestKode(),
      readOnly: editing,
      maxLength: 12,
      hint: editing ? 'Kode tidak bisa diubah karena QR-nya sudah dicetak.' : 'Format BK-001. Kode inilah yang dicetak menjadi QR.',
    });
    const judul = field({ label: 'Judul', name: 'judul', value: book?.judul ?? '', maxLength: LIMITS.judul.max });
    const penulis = field({ label: 'Penulis', name: 'penulis', value: book?.penulis ?? '', maxLength: LIMITS.penulis.max });
    const kategori = field({
      label: 'Kategori',
      name: 'kategori',
      options: [{ value: '', label: 'Pilih kategori' }, ...KATEGORI.map((item) => ({ value: item, label: item }))],
      value: book?.kategori ?? '',
    });
    const rak = field({ label: 'Lokasi rak', name: 'lokasiRak', value: book?.lokasiRak ?? '', placeholder: 'Rak A-1', maxLength: LIMITS.rak.max });
    const stok = field({
      label: 'Stok total',
      name: 'stokTotal',
      type: 'number',
      inputMode: 'numeric',
      value: String(book?.stokTotal ?? 1),
      hint: 'Jumlah eksemplar fisik. Tidak boleh kurang dari pinjaman aktif.',
    });

    Object.assign(bindings, { kode, judul, penulis, kategori, lokasiRak: rak, stokTotal: stok });

    kode.control.addEventListener('input', () => {
      const upper = kode.value().toUpperCase();
      if (kode.value() !== upper) kode.setValue(upper);
    });

    const form = el(
      'form',
      {
        class: 'flex flex-col gap-4',
        novalidate: true,
        onSubmit: (event) => {
          event.preventDefault();
          kirim();
        },
      },
      el('div', { class: 'grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]' }, kode.wrap, kategori.wrap),
      judul.wrap,
      penulis.wrap,
      el('div', { class: 'grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]' }, rak.wrap, stok.wrap),
      errorBox,
    );

    const modal = openModal({
      title: editing ? 'Ubah data buku' : 'Tambah buku',
      description: editing ? `${book.kode} · ${book.judul}` : 'Isi data sesuai koleksi fisik di rak.',
      body: form,
      actions: [
        button({ label: 'Batal', variant: 'ghost', onClick: () => modal.close() }),
        button({ label: editing ? 'Simpan perubahan' : 'Tambah buku', variant: 'primary', onClick: () => kirim() }),
      ],
    });

    function kirim() {
      const payload = {
        kode: kode.value(),
        judul: judul.value(),
        penulis: penulis.value(),
        kategori: kategori.value(),
        lokasiRak: rak.value(),
        stokTotal: stok.value(),
      };

      const result = editing ? updateBook(book.id, payload) : createBook(payload);

      if (!result.ok) {
        const adaField = showFieldErrors(bindings, result);
        errorBox.replaceChildren(adaField ? '' : alertBox(result.message));
        if (!adaField) toast(result.message, { tone: 'gagal' });
        return;
      }

      modal.close();
      toast(editing ? `Perubahan ${result.data.kode} tersimpan.` : `${result.data.judul} ditambahkan.`, { tone: 'sukses' });
      paint();
    }
  }

  function bukaQr(book) {
    const holder = el('div', { class: 'mx-auto w-fit rounded-2xl border border-line bg-white p-4' });

    const modal = openModal({
      title: book.kode,
      description: book.judul,
      size: 'sm',
      body: el(
        'div',
        { class: 'flex flex-col items-center gap-4' },
        holder,
        el(
          'div',
          { class: 'text-center' },
          el('p', { class: 'text-[13px] font-medium' }, 'Cetak ukuran 3 × 3 cm, lalu tempel di sampul atau punggung buku.'),
          el('p', { class: 'mt-1 text-[12.5px] text-ink-mute' }, `Diperbarui ${formatDateTime(book.updatedAt)}`),
        ),
      ),
      actions: [
        button({
          label: 'Unduh PNG',
          variant: 'outline',
          onClick: async () => {
            const done = await downloadQrPng(book.kode);
            toast(done.ok ? `QR ${book.kode} diunduh.` : done.message, { tone: done.ok ? 'sukses' : 'gagal' });
          },
        }),
        button({
          label: 'Cetak',
          variant: 'outline',
          onClick: async () => {
            const done = await printQrSheet([book], { perRow: 3 });
            if (!done.ok) toast(done.message, { tone: 'gagal' });
          },
        }),
        button({ label: 'Tutup', variant: 'primary', onClick: () => modal.close() }),
      ],
    });

    renderQr(holder, book.kode, 240);
  }

  async function hapus(book) {
    const setuju = await confirmDialog({
      title: `Hapus ${book.kode}?`,
      message: `${book.judul} akan dihapus dari katalog. Riwayat peminjaman tetap tersimpan.`,
      confirmLabel: 'Hapus buku',
      tone: 'danger',
    });

    if (!setuju) return;

    const result = deleteBook(book.id);
    toast(result.ok ? `${book.judul} dihapus dari katalog.` : result.message, { tone: result.ok ? 'sukses' : 'gagal' });
    if (result.ok) paint();
  }

  async function resetDemo() {
    const setuju = await confirmDialog({
      title: 'Reset data demo?',
      message: 'Seluruh buku, pinjaman, dan sesi dihapus lalu diganti koleksi contoh. Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Reset sekarang',
      tone: 'danger',
    });

    if (!setuju) return;

    const result = resetAll();
    signIn({ role: ROLES.PETUGAS });
    toast(result.ok ? 'Data demo dikembalikan ke kondisi awal.' : result.message, { tone: result.ok ? 'sukses' : 'gagal' });
    paint();
  }

  async function cetakSemua() {
    const books = listBooks();
    const result = await printQrSheet(books);

    toast(result.ok ? `${result.data} QR disiapkan untuk dicetak.` : result.message, { tone: result.ok ? 'sukses' : 'gagal' });
  }

  search.control.addEventListener('input', () => {
    filter.q = search.value();
    paint();
  });

  search.control.addEventListener('search', () => {
    filter.q = search.value();
    paint();
  });

  urut.control.addEventListener('change', () => {
    filter.urut = urut.value();
    paint();
  });

  paint();

  return shell(
    pageHead({
      eyebrow: 'Kelola buku',
      title: 'Koleksi, stok, dan QR dalam satu tempat.',
      description: 'Stok tersedia dihitung otomatis dari pengajuan dan peminjaman yang sedang berjalan.',
      actions: [
        button({ label: 'Cetak semua QR', variant: 'outline', onClick: cetakSemua }),
        button({ label: 'Tambah buku', variant: 'ink', onClick: () => bukaForm(null) }),
      ],
    }),
    el('section', { class: 'mt-8' }, stats),
    el(
      'section',
      { class: 'mt-8' },
      el(
        'div',
        { class: 'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between' },
        el('div', { class: 'w-full sm:max-w-sm' }, search.wrap),
        el('div', { class: 'w-full sm:w-56' }, urut.wrap),
      ),
      el(
        'div',
        { class: 'mt-6' },
        el(
          'div',
          { class: 'hidden gap-5 px-4 pb-2 md:grid md:grid-cols-[6.5rem_minmax(0,1fr)_8rem_auto] md:items-center' },
          el('span', { class: 'text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute' }, 'Kode'),
          el('span', { class: 'text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute' }, 'Judul'),
          el('span', { class: 'text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute' }, 'Status'),
          el('span', { class: 'text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute' }, 'Stok & aksi'),
        ),
        hitung,
        list,
      ),
      el(
        'div',
        { class: 'mt-8' },
        notice({
          tone: 'info',
          title: 'Data demo',
          message: 'Semua data tersimpan di browser ini. Gunakan reset bila ingin kembali ke koleksi contoh saat presentasi.',
          action: button({ label: 'Reset data demo', variant: 'danger', size: 'sm', onClick: resetDemo }),
        }),
      ),
    ),
  );
}
