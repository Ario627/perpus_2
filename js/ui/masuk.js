import { APP, HOME_ROUTE, LIMITS, ROLES, ROLE_LABEL, SESSION_KELAS_GURU } from '../config.js';
import { signIn } from '../session.js';
import { button, el, field, pageHead, segmented, shell, showFieldErrors, toast } from './components.js';

const FAKTA = [
  { nilai: '1 jam', label: 'Batas ambil buku setelah mengajukan' },
  { nilai: '3 buku', label: 'Maksimal pinjaman aktif per siswa' },
  { nilai: 'QR', label: 'Verifikasi serah terima oleh petugas' },
];

export function render({ navigate }) {
  const bindings = {};
  const role = { value: ROLES.SISWA };

  const namaField = field({
    label: 'Nama lengkap',
    name: 'nama',
    placeholder: 'Nama sesuai daftar kelas',
    autocomplete: 'name',
    maxLength: LIMITS.nama.max,
  });

  const kelasField = field({
    label: 'Kelas',
    name: 'kelas',
    placeholder: 'Contoh: X PPLG 1',
    maxLength: LIMITS.kelas.max,
  });

  bindings.nama = namaField;
  bindings.kelas = kelasField;

  const applyRole = () => {
    const guru = role.value === ROLES.GURU;

    if (guru) {
      kelasField.setValue(SESSION_KELAS_GURU);
      kelasField.control.readOnly = true;
      kelasField.hint.textContent = 'Terisi otomatis untuk akun guru.';
    } else {
      kelasField.setValue('');
      kelasField.control.readOnly = false;
      kelasField.hint.textContent = 'Tulis kelas dengan format yang dipakai sekolah.';
    }

    kelasField.hint.hidden = false;
    kelasField.clearError();
  };

  const submit = () => {
    const result = signIn({ role: role.value, nama: namaField.value(), kelas: kelasField.value() });

    if (!result.ok) {
      showFieldErrors(bindings, result);
      toast(result.message, { tone: 'gagal' });
      return;
    }

    const { role: masuk, nama } = result.data;
    toast(masuk === ROLES.PETUGAS ? 'Masuk sebagai petugas.' : `Selamat datang, ${nama}.`, { tone: 'sukses' });
    navigate(HOME_ROUTE[masuk]);
  };

  const form = el(
    'form',
    {
      class: 'flex flex-col gap-4',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        submit();
      },
    },
    namaField.wrap,
    kelasField.wrap,
    button({ label: 'Masuk', type: 'submit', size: 'lg' }),
  );

  const kartuSiswa = el(
    'section',
    { class: 'rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6' },
    el('p', { class: 'font-display text-[22px] leading-tight' }, 'Siswa & Guru'),
    el(
      'p',
      { class: 'mt-1.5 text-[13px] leading-relaxed text-ink-soft' },
      'Cari buku, ajukan peminjaman, dan pantau batas waktu pengambilan dari akunmu.',
    ),
    el('div', { class: 'mt-5' }, segmented({
      items: [
        { id: ROLES.SISWA, label: ROLE_LABEL[ROLES.SISWA] },
        { id: ROLES.GURU, label: ROLE_LABEL[ROLES.GURU] },
      ],
      value: role.value,
      onChange: (id) => {
        role.value = id;
        applyRole();
      },
    })),
    el('div', { class: 'mt-5' }, form),
  );

  const kartuPetugas = el(
    'section',
    { class: 'flex flex-col rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6' },
    el('p', { class: 'font-display text-[22px] leading-tight' }, 'Petugas'),
    el(
      'p',
      { class: 'mt-1.5 text-[13px] leading-relaxed text-ink-soft' },
      'Kelola koleksi, cetak QR buku, dan verifikasi serah terima lewat pemindaian.',
    ),
    el(
      'dl',
      { class: 'mt-5 space-y-2.5 text-[13px]' },
      ...[
        ['Katalog', 'Tambah, ubah, hapus judul'],
        ['QR', 'Cetak dan unduh per judul'],
        ['Scan', 'Cocokkan pengajuan dengan buku'],
      ].map(([istilah, arti]) =>
        el(
          'div',
          { class: 'flex items-baseline justify-between gap-4 border-b border-line pb-2.5 last:border-0' },
          el('dt', { class: 'text-ink-mute' }, istilah),
          el('dd', { class: 'text-right font-medium' }, arti),
        ),
      ),
    ),
    el('div', { class: 'mt-auto pt-6' }, button({
      label: 'Masuk sebagai petugas',
      variant: 'ink',
      size: 'lg',
      onClick: () => {
        const result = signIn({ role: ROLES.PETUGAS });
        if (!result.ok) {
          toast(result.message, { tone: 'gagal' });
          return;
        }
        toast('Masuk sebagai petugas.', { tone: 'sukses' });
        navigate(HOME_ROUTE[ROLES.PETUGAS]);
      },
    })),
    el('p', { class: 'mt-3 text-[12px] leading-relaxed text-ink-mute' }, 'Tanpa kata sandi — ini mode simulasi kelas.'),
  );

  applyRole();

  return shell(
    el(
      'div',
      { class: 'grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16' },
      el(
        'section',
        { class: 'flex flex-col gap-10' },
        pageHead({
          eyebrow: `${APP.nama} · Perpustakaan digital`,
          title: 'Cek buku tanpa keliling rak.',
          description:
            'Lihat ketersediaan, ajukan peminjaman dalam satu menit, lalu tunjukkan kode pengajuan ke petugas untuk dipindai.',
        }),
        el(
          'dl',
          { class: 'grid gap-6 sm:grid-cols-3' },
          ...FAKTA.map(({ nilai, label }) =>
            el(
              'div',
              { class: 'border-t border-line pt-4' },
              el('dt', { class: 'font-display text-[28px] leading-none' }, nilai),
              el('dd', { class: 'mt-2 text-[12.5px] leading-relaxed text-ink-soft' }, label),
            ),
          ),
        ),
        el(
          'p',
          { class: 'max-w-md text-[12.5px] leading-relaxed text-ink-mute' },
          'Seluruh data tersimpan di browser perangkat ini. Untuk demo dua peran, buka tab terpisah di perangkat yang sama.',
        ),
      ),
      el('div', { class: 'flex flex-col gap-4' }, kartuSiswa, kartuPetugas),
    ),
  );
}