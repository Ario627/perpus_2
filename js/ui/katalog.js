import { KATEGORI, LOAN_HOLD_MINUTES, ROLES, SEARCH_DEBOUNCE_MS } from '../config.js';
import { browse, summary } from '../books.js';
import { createLoan, loanPayload, quotaFor } from '../loans.js';
import {
  alertBox,
  bookBadge,
  button,
  chip,
  copy,
  el,
  emptyState,
  field,
  formatClock,
  kodePengajuanPanel,
  notice,
  openModal,
  pageHead,
  shell,
  showFieldErrors,
  stockBar,
  toast,
} from './components.js';

const KURANGI = ' — ';

const infoChip = (value, label) =>
  el(
    'span',
    { class: 'inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink-soft' },
    el('span', { class: 'tnum font-semibold text-ink' }, value),
    label,
  );

export function render({ session, query, navigate, patchQuery, onCleanup }) {
  const bolehPinjam = session.role === ROLES.SISWA || session.role === ROLES.GURU;

  const state = {
    q: (query.get('q') ?? '').trim(),
    kategori: KATEGORI.includes(query.get('kategori')) ? query.get('kategori') : '',
    tersedia: query.get('tersedia') === '1',
  };

  const punyaFilter = () => Boolean(state.q) || Boolean(state.kategori) || state.tersedia;

  const search = field({
    name: 'cari',
    type: 'search',
    value: state.q,
    placeholder: 'Cari judul, penulis, kategori, atau kode',
    autocomplete: 'off',
  });
  search.control.setAttribute('aria-label', 'Cari buku');

  const chipsRow = el('div', { class: 'flex items-center gap-2 overflow-x-auto no-scrollbar' });
  const hitung = el('p', { class: 'text-[13px] text-ink-mute', 'aria-live': 'polite' });
  const grid = el('div', { class: 'mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3' });
  const kuotaChip = infoChip('0 dari 0', 'pinjaman aktif');
  const stokChip = infoChip('0 dari 0', 'eksemplar siap dipinjam');
  kuotaChip.hidden = !bolehPinjam;

  let debounce = null;
  onCleanup(() => clearTimeout(debounce));

  const sync = () => {
    patchQuery({
      q: state.q || null,
      kategori: state.kategori || null,
      tersedia: state.tersedia ? '1' : null,
    });
    paintChips();
    paint();
  };

  const setKategori = (value) => {
    state.kategori = value;
    sync();
  };

  const reset = () => {
    state.q = '';
    state.kategori = '';
    state.tersedia = false;
    search.setValue('');
    sync();
  };

  const bukaModal = (row) => {
    const bindings = {};
    const errorBox = el('div');

    const namaField = field({
      label: 'Nama',
      name: 'nama',
      value: session.nama ?? '',
      autocomplete: 'name',
      required: true,
    });
    const kelasField = field({
      label: 'Kelas',
      name: 'kelas',
      value: session.kelas ?? '',
      placeholder: 'Contoh: X PPLG 1',
      required: true,
    });
    const judulField = field({ label: 'Judul buku', name: 'judul', value: row.book.judul, readOnly: true });

    bindings.nama = namaField;
    bindings.kelas = kelasField;

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
      judulField.wrap,
      namaField.wrap,
      kelasField.wrap,
      errorBox,
      notice({
        tone: 'tunggu',
        message: `Buku ditahan ${LOAN_HOLD_MINUTES} menit setelah pengajuan. Tunjukkan kode pengajuan ke petugas untuk dipindai.`,
      }),
    );

    const modal = openModal({
      title: 'Ajukan peminjaman',
      description: `${row.book.kode} · ${row.book.lokasiRak} · ${row.stock.tersedia} dari ${row.stock.total} tersedia`,
      body: form,
      actions: [
        button({ label: 'Batal', variant: 'ghost', onClick: () => modal.close() }),
        button({ label: 'Ajukan pinjam', variant: 'primary', onClick: () => form.requestSubmit() }),
      ],
    });

    function kirim() {
      const result = createLoan(
        { kode: row.book.kode, namaSiswa: namaField.value(), kelas: kelasField.value() },
        session,
      );

      if (!result.ok) {
        const adaField = showFieldErrors(bindings, result);
        errorBox.replaceChildren(adaField ? '' : alertBox(result.message));
        return;
      }

      terima(result.data);
      paint();
    }

    function terima(loan) {
      modal.setTitle('Pengajuan dibuat');
      modal.setDescription('Tunjukkan layar ini ke petugas perpustakaan.');
      modal.setBody(
        kodePengajuanPanel({
          loan,
          qrValue: loanPayload(loan),
          catatan: `Buku ditahan sampai ${formatClock(loan.batasAmbil)}. Kalau lewat, pengajuan batal sendiri dan stok kembali ke rak.`,
        }),
      );
      modal.setActions([
        button({
          label: 'Salin kode kirim',
          variant: 'outline',
          onClick: async () => {
            const done = await copy(loanPayload(loan));
            toast(
              done ? 'Kode kirim disalin. Kirim ke petugas kalau kamera tidak bisa dipakai.' : 'Gagal menyalin.',
              { tone: done ? 'sukses' : 'gagal' },
            );
          },
        }),
        button({ label: 'Lihat pinjaman saya', variant: 'ghost', onClick: () => { modal.close(); navigate('#/pinjaman'); } }),
        button({ label: 'Selesai', variant: 'primary', onClick: () => modal.close() }),
      ]);
    }
  };

  const kartu = (row) => {
    const habis = row.stock.tersedia < 1;

    return el(
      'article',
      { class: 'flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition duration-200 hover:border-line-strong' },
      el(
        'div',
        { class: 'flex items-start justify-between gap-3' },
        el(
          'div',
          { class: 'min-w-0' },
          el('h2', { class: 'font-display text-[21px] leading-snug' }, row.book.judul),
          el('p', { class: 'mt-1 text-[13px] text-ink-soft' }, row.book.penulis),
        ),
        el(
          'div',
          { class: 'flex shrink-0 flex-col items-end gap-1.5' },
          bookBadge(row.statusKey),
          row.populer > 0 ? el('span', { class: 'text-[11.5px] text-ink-mute tnum' }, `sering dipinjam · ${row.populer}`) : null,
        ),
      ),
      el(
        'p',
        { class: 'text-[12.5px] text-ink-mute' },
        el('span', { class: 'tnum font-medium text-ink-soft' }, row.book.kode),
        KURANGI,
        row.book.lokasiRak,
        KURANGI,
        row.book.kategori,
      ),
      el(
        'div',
        { class: 'mt-auto flex items-end justify-between gap-4 pt-1' },
        el(
          'div',
          { class: 'min-w-0 flex-1' },
          el(
            'p',
            { class: 'text-[13px]' },
            el('span', { class: 'tnum font-semibold' }, String(row.stock.tersedia)),
            ' dari ',
            el('span', { class: 'tnum' }, String(row.stock.total)),
            ' tersedia',
          ),
          el('div', { class: 'mt-2 max-w-[128px]' }, stockBar(row.stock.tersedia, row.stock.total)),
        ),
        bolehPinjam
          ? button({
              label: habis ? 'Stok habis' : 'Ajukan pinjam',
              variant: habis ? 'outline' : 'ink',
              size: 'sm',
              disabled: habis,
              title: habis ? row.status.label : '',
              onClick: () => bukaModal(row),
            })
          : null,
      ),
    );
  };

  function paint() {
    const rows = browse({ q: state.q, kategori: state.kategori, hanyaTersedia: state.tersedia });
    const total = summary();
    const kuota = bolehPinjam ? quotaFor(session.nama, session.kelas) : null;

    hitung.textContent = rows.length
      ? `Menampilkan ${rows.length} judul${punyaFilter() ? ` dari ${total.judul}` : ''}`
      : 'Tidak ada judul yang cocok';

    if (kuota) {
      kuotaChip.firstChild.textContent = `${kuota.sisa}`;
      kuotaChip.lastChild.textContent = `dari ${kuota.max} pinjaman aktif tersisa`;
      kuotaChip.hidden = false;
    }

    stokChip.firstChild.textContent = `${total.tersedia}`;
    stokChip.lastChild.textContent = `dari ${total.eksemplar} eksemplar siap dipinjam`;

    grid.replaceChildren(
      ...(rows.length
        ? rows.map(kartu)
        : [
            emptyState({
              title: 'Buku tidak ditemukan',
              description: punyaFilter()
                ? 'Coba kata kunci lain, atau bersihkan filter yang aktif.'
                : 'Katalog masih kosong. Petugas dapat menambah judul dari halaman Kelola Buku.',
              action: punyaFilter() ? button({ label: 'Bersihkan filter', variant: 'outline', onClick: reset }) : null,
            }),
          ]),
    );
  }

  function paintChips() {
    const buat = (label, active, onClick) => chip({ label, active, onClick });

    const daftar = [
      buat('Semua kategori', state.kategori === '', () => setKategori('')),
      ...KATEGORI.map((kategori) =>
        buat(kategori, state.kategori === kategori, () => setKategori(state.kategori === kategori ? '' : kategori)),
      ),
      el('span', { class: 'mx-1 h-6 w-px shrink-0 bg-line' }),
      buat('Hanya tersedia', state.tersedia, () => {
        state.tersedia = !state.tersedia;
        sync();
      }),
      punyaFilter() ? buat('Bersihkan filter', false, reset) : null,
    ];

    chipsRow.replaceChildren(...daftar.filter(Boolean));
  }

  search.control.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const next = search.value().trim();
      if (next === state.q) return;
      state.q = next;
      sync();
    }, SEARCH_DEBOUNCE_MS);
  });

  search.control.addEventListener('search', () => {
    state.q = search.value().trim();
    sync();
  });

  paintChips();
  paint();

  return shell(
    pageHead({
      eyebrow: 'Katalog',
      title: 'Cari buku, lihat rak, ajukan pinjam.',
      description: 'Ketersediaan dihitung otomatis dari pengajuan dan peminjaman yang sedang berjalan.',
      meta: el('div', { class: 'mt-5 flex flex-wrap items-center gap-2' }, kuotaChip, stokChip),
    }),
    bolehPinjam
      ? null
      : el('div', { class: 'mt-8' }, notice({
          tone: 'info',
          title: 'Mode petugas',
          message: 'Peminjaman diajukan lewat akun siswa atau guru. Gunakan menu Scan untuk memverifikasi.',
        })),
    el(
      'div',
      { class: 'sticky top-14 z-30 -mx-5 mt-8 border-b border-line bg-paper/85 px-5 py-3 backdrop-blur sm:top-16 sm:-mx-8 sm:px-8' },
      el('div', { class: 'flex flex-col gap-3' }, search.wrap, chipsRow),
    ),
    el('section', { class: 'mt-6' }, hitung, grid),
  );
}