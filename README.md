# Bl4ck-F1les

Bot Telegram yang diintegrasikan dengan WhatsApp Multi-Device API (Baileys) untuk manajemen sender dan pengiriman pesan otomatis.

## Fitur Utama

- Integrasi Multi-Session WhatsApp via Kode Pairing
- Manajemen Sender WhatsApp (Tambah, Lihat, Hapus Sesi)
- Pengiriman Pesan WhatsApp langsung dari Telegram
- Sistem Manajemen Role User (Owner, Premium, Murbug)
- Navigasi Menu Telegram berbasis Inline Keyboard

## Persyaratan Sistem

- Node.js v18 atau versi yang lebih baru
- NPM / Yarn

## Instalasi

1. Clone atau unduh repositori ini.
2. Pasang dependensi yang diperlukan:
   npm install
3. Buka file config.js dan sesuaikan nilainya:
   - token: Token Bot Telegram dari @BotFather
   - ownerId: Telegram ID milik Owner

## Cara Menjalankan

Jalankan bot dengan perintah berikut:

npm start

Untuk mode pengembangan (auto-reload):

npm run dev

## Daftar Perintah

### Perintah Umum & Sender
- /start - Menampilkan menu utama bot
- /pair - Menghubungkan nomor WhatsApp baru via Kode Pairing
- /listsender - Menampilkan daftar nomor WhatsApp sender yang aktif
- /delsender <nomor> - Menghapus sesi sender WhatsApp
- /send <nomor>|<pesan> - Mengirim pesan WhatsApp ke nomor tujuan

### Perintah Owner
- /addprem <ID> - Menambahkan ID Telegram ke daftar Premium
- /delprem <ID> - Menghapus ID Telegram dari daftar Premium
- /listprem - Menampilkan seluruh ID user Premium
- /addmurbug <ID> - Menambahkan ID Telegram ke daftar Murbug
- /delmurbug <ID> - Menghapus ID Telegram dari daftar Murbug
- /listmurbug - Menampilkan seluruh ID user Murbug

## Kontak

- WhatsApp: 628998052763
- Telegram: @ArcvynX
