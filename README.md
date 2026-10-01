# Pustaka — Perpustakaan Digital Berbasis QR Code

Cek buku tanpa keliling rak. Siswa mencari dan mengajukan peminjaman dari browser, petugas memverifikasi serah terima lewat pemindaian QR, dan stok selalu dihitung ulang dari data transaksi.

Aplikasi web statis: HTML + ES Modules + Tailwind CDN + `localStorage`. Tanpa server, tanpa build step.

---

## Menjalankan

ES Modules tidak berjalan dari `file://`, jadi pakai server lokal:

```bash
python3 -m http.server 5500
# atau
npx serve .
```

Lalu buka `http://localhost:5500`.

Akses kamera hanya diizinkan browser pada `https://` atau `http://localhost`. Kalau kamera tidak tersedia atau izinnya ditolak, pemindaian tetap bisa diselesaikan lewat input kode manual di halaman yang sama.

---

## Peran

| Peran | Kewenangan |
|---|---|
| Siswa | Katalog, ajukan pinjam, pinjaman saya, kembalikan buku |
| Guru | Sama seperti siswa; kelas terisi otomatis sebagai `Guru` |
| Petugas | Kelola buku, cetak/unduh QR, verifikasi serah terima, terima pengembalian, riwayat |

Masuk tanpa kata sandi. Sesi disimpan **per tab** supaya satu browser bisa memuat siswa dan petugas berdampingan; data buku dan pinjaman disimpan **per perangkat**.

### Skenario A — satu perangkat (paling mulus)

1. Tab 1 → masuk sebagai siswa, buka `#/katalog`, ajukan satu buku.
2. Tab 2 → masuk sebagai petugas, buka `#/admin/scan`.
3. Daftar pengajuan di tab 2 bertambah sendiri tanpa reload.
4. Petugas pindai QR di layar siswa (atau ketik `PJ-0001`) → status jadi `DIPINJAM`.
5. Tab 1 → `#/pinjaman` → isi form pengembalian → stok kembali tersedia.

### Skenario B — HP siswa + laptop petugas

HP dan laptop punya penyimpanan sendiri, jadi pengajuan di HP **tidak terlihat** di laptop. Supaya tetap bisa, QR pengajuan membawa datanya, bukan sekadar nomor:

1. Siswa ajukan dari HP. QR di layarnya berisi kode kiriman `PD1-…`.
2. Petugas memindai QR itu. Kalau kamera tidak dipakai, siswa menekan **Salin kode kirim** lalu mengirim teksnya lewat chat.
3. Laptop mengenali kode kiriman, membuat salinan pengajuan lokal, lalu menandainya `DIPINJAM`.
4. Setelah serah terima, transaksi itu **hidup di laptop**. Pengembalian dicatat petugas dari `#/admin/riwayat` → **Terima kembali**.

Yang perlu disadari: HP siswa tidak ikut ter-update. Tiket di HP-nya hanya berlaku sebagai kode antrean, dan akan tampak batal setelah 1 jam. Kalau butuh status yang benar-benar sama di kedua perangkat, itu sudah wilayah server — lihat `docs/perpustakaan-digital-spec.md` bagian 19.

## Tiga jenis kode

| Kode | Isi | Dibuat di | Dipakai untuk |
|---|---|---|---|
| QR buku | `BK-001` | Kelola Buku → tombol QR | Label 3 × 3 cm di sampul, dicetak sekali |
| Nomor pengajuan | `PJ-0001` | Otomatis saat siswa mengajukan | Disebutkan ke petugas, atau diketik di kolom input |
| Kode kirim | `PD1-…` (60 karakter) | Isi QR pengajuan, tombol **Salin kode kirim** | Menyeberangkan pengajuan dari HP ke perangkat petugas |

Halaman pemindai menerima ketiganya:

- **Kode kirim** — jalur tercepat lintas perangkat: satu pindai, petugas langsung tahu siswa mana yang dilayani.
- **Nomor pengajuan** — untuk demo satu perangkat, atau saat siswa menyebutkan nomornya.
- **QR buku** — kalau label buku lebih mudah dijangkau daripada layar siswa. Bila ada beberapa pengajuan untuk buku itu, petugas memilih nama yang hadir.

Nomor pengajuan hanya ada di perangkat yang membuatnya, jadi memindainya di perangkat lain akan menjawab `TIDAK_ADA_PENGAJUAN`. Gunakan kode kirim untuk kasus itu.

Pengembalian dapat dicatat dari dua sisi: siswa lewat `#/pinjaman`, atau petugas lewat `#/admin/riwayat` → **Terima kembali**. Keduanya meminta kode buku diketik lebih dulu supaya buku fisik benar-benar diperiksa.

---

## Aturan yang dijaga sistem

- `stokTersedia = stokTotal − (DIPESAN aktif + DIPINJAM)`; stok tidak pernah disimpan sebagai angka bebas.
- Pengajuan menahan buku selama 60 menit, lalu menjadi `KEDALUWARSA` dan stoknya dilepas.
- Maksimal 3 pinjaman aktif per siswa, dan hanya satu pinjaman aktif per judul.
- Transisi status hanya lewat tabel `TRANSITIONS`: `DIPESAN → DIPINJAM | KEDALUWARSA`, `DIPINJAM → DIKEMBALIKAN`.
- Pengembalian hanya boleh oleh pemiliknya (`nama` + `kelas`, dibandingkan tanpa spasi tepi dan tanpa beda huruf besar/kecil).
- Judul dengan pinjaman aktif tidak bisa dihapus, dan stok total tidak bisa diturunkan di bawah jumlah pinjaman aktif.
- Identitas peminjam tidak bisa dipalsukan lewat form pengembalian karena nama dan kelas diambil dari sesi tab.

---

## Struktur

```
index.html                kerangka, token warna, font, area cetak QR
js/
  app.js                  boot, appbar, navigasi, timer global, sinkron antar tab
  config.js               konstanta, state machine, rute, pesan error, data seed
  result.js               kontrak hasil: { ok, data } atau { ok, code, message }
  storage.js              baca/tulis, transaksi tulis, seed, reset
  session.js              masuk/keluar, kunci identitas, validasi nama & kelas
  router.js               hash router, guard peran, siklus hidup halaman
  books.js                katalog, stok, pencarian, CRUD, buku populer
  loans.js                state machine, kedaluwarsa, pengajuan, verifikasi, pengembalian
  scanner.js              pembungkus html5-qrcode: debounce, jeda, senter, pesan error
  qr.js                   render QR, unduh PNG, cetak lembar QR
  ui/
    components.js         elemen, badge, modal, toast, field, format waktu
    masuk.js              halaman masuk
    katalog.js            katalog + modal pengajuan + QR pengajuan
    pinjaman.js           pinjaman aktif, riwayat, form pengembalian siswa
    adminBuku.js          kelola koleksi, QR, reset data demo
    adminScan.js          pemindai QR buku, nomor pengajuan, dan kode kirim
    adminRiwayat.js       riwayat transaksi, ekspor CSV, terima kembali
```

`books.js` dan `loans.js` tidak menyentuh DOM, jadi seluruh aturan bisa dipanggil dari console browser:

```js
const { createLoan, findScanTarget, loanPayload, readLoanPayload, verifyAndBorrow, returnLoan } = await import('./js/loans.js');
const { getStock, browse } = await import('./js/books.js');

createLoan({ kode: 'BK-001', namaSiswa: 'Ario', kelas: 'X PPLG 1' });
getStock('BK-001');
findScanTarget('BK-001');
findScanTarget(loanPayload({ id: 'PJ-0001', bookKode: 'BK-001', namaSiswa: 'Ario', kelas: 'X PPLG 1', batasAmbil: Date.now() + 3600000 }));
```

---

## Uji cepat

| # | Uji | Hasil |
|---|---|---|
| T01 | Cari `matematika` | BK-001 muncul `3 dari 3 tersedia` |
| T02 | Ajukan BK-001 | `DIPESAN`, stok jadi `2 dari 3`, batas ambil +60 menit |
| T03 | Ajukan BK-001 lagi oleh siswa sama | `DUPLIKAT_AKTIF` |
| T04 | Ajukan buku berstok 0 | tombol nonaktif; fungsi mengembalikan `STOK_HABIS` |
| T05 | Pinjaman aktif ke-4 | `BATAS_PINJAM` |
| T06 | Mundurkan `batasAmbil` lalu muat ulang | `KEDALUWARSA`, stok kembali |
| T07 | Petugas serahkan 1 pengajuan | `DIPINJAM` |
| T08 | Dua pengajuan untuk satu buku | petugas memilih nama siswa |
| T09 | Kode di luar `BK-xxx` | `QR_TIDAK_DIKENALI` |
| T10 | Kode benar tanpa pengajuan | `TIDAK_ADA_PENGAJUAN` |
| T11 | Kode setelah 1 jam | `KEDALUWARSA` |
| T12 | Kode pengembalian salah | `KODE_TIDAK_COCOK`, status tetap `DIPINJAM` |
| T13 | Kode pengembalian benar | `DIKEMBALIKAN`, stok +1 |
| T14 | Siswa lain mencoba mengembalikan | `BUKAN_PEMILIK` |
| T15 | Kode buku duplikat | `KODE_DUPLIKAT` + pesan per field |
| T16 | Hapus buku yang masih dipinjam | `MASIH_DIPINJAM` |
| T17 | Dua tab siswa & petugas | daftar pengajuan di tab petugas ikut terbarui |
| T18 | `DIKEMBALIKAN → DIPINJAM` | `STATUS_TIDAK_VALID` |
| T19 | Petugas memindai kode kirim dari HP siswa di laptop | pengajuan diimpor, langsung `DIPINJAM`, transaksi hidup di laptop |
| T20 | Kode kirim ditempel dua kali | tidak ada duplikat; percobaan kedua ditolak `STATUS_TIDAK_VALID` |
| T21 | Laptop sudah punya `PJ-0001` milik orang lain, lalu kode kirim `PJ-0001` masuk | tidak bentrok: pengajuan baru dapat nomor lokal, milik lama tetap utuh |
| T22 | Kode di luar `BK-`/`PJ-`/`PD1-` | `QR_TIDAK_DIKENALI` |
| T23 | Petugas mencatat pengembalian dengan kode buku salah | `KODE_TIDAK_COCOK`, status tetap `DIPINJAM` |
| T24 | Petugas mencatat pengembalian dengan kode benar | `DIKEMBALIKAN`, stok +1 |

---

## Data

Semua tersimpan di browser perangkat ini dengan awalan kunci `pd:`. Tombol **Reset data demo** di halaman Kelola Buku mengembalikan koleksi contoh tanpa menendang petugas keluar.

Untuk presentasi, siapkan satu tab siswa dan satu tab petugas di perangkat yang sama. Karena data tidak disinkronkan antar perangkat, hindari menguji dari dua perangkat berbeda.

---

## Catatan

- Waktu disimpan sebagai epoch milidetik, jadi kedaluwarsa tetap benar walau tab ditutup lebih dari satu jam.
- Pemindaian ganda pada QR yang sama ditahan oleh debounce 3 detik dan oleh state machine.
- Kode kirim hanya berisi nomor urut, kode buku, nama, kelas, dan batas ambil — tanpa identitas lain, dan mati sendiri setelah batas ambil lewat.
- Karena tanpa server, kode kirim bisa saja dibuat orang lain dengan isi karangan. Untuk kelas, itu sepadan dengan kemudahan demo; untuk pemakaian sungguhan, keasliannya harus diverifikasi server.
- Semua teks pengguna dirender lewat `textContent`, jadi tidak ada celah XSS dari input nama, kelas, atau data buku.
- Bila `localStorage` diblokir (mode privat ketat), aplikasi tetap jalan memakai penyimpanan memori dan memberi tahu lewat data yang hilang saat reload.
