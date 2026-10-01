# DOBBLE BACKEND V1

High-Performance Node.js, TypeScript, PostgreSQL & WebSocket Relay/Signaling Server connecting:

```text
DOBBLE R (Sender/Tracker) ↔ DOBBLE BACKEND V1 ↔ DOBBLE R1 (Viewer/Controller)
```

Backend ini adalah server komunikasi terpisah yang siap di-deploy ke cloud (Render, Railway, VPS, Docker) dan menyediakan REST API serta WebSocket (WSS) yang dapat digunakan oleh kedua aplikasi Android.

---

## 📑 DAFTAR ISI

1. [Fitur Utama](#-fitur-utama)
2. [Teknologi yang Digunakan](#-teknologi-yang-digunakan)
3. [Arsitektur Proyek](#-arsitektur-proyek)
4. [Prasyarat Sistem](#-prasyarat-sistem)
5. [Instalasi & Environment Setup](#-instalasi--environment-setup)
6. [Database & Migrasi PostgreSQL](#-database--migrasi-postgresql)
7. [Menjalankan Server (Lokal & Docker)](#-menjalankan-server-lokal--docker)
8. [Menjalankan Test](#-menjalankan-test)
9. [Build & Production](#-build--production)
10. [Dokumentasi REST API](#-dokumentasi-rest-api)
11. [Dokumentasi WebSocket Protocol (/ws)](#-dokumentasi-websocket-protocol-ws)
12. [WebRTC Signaling Flow (Camera & Screen)](#-webrtc-signaling-flow-camera--screen)
13. [Panduan Integrasi DOBBLE R (Android)](#-panduan-integrasi-dobble-r-android)
14. [Panduan Integrasi DOBBLE R1 (Android)](#-panduan-integrasi-dobble-r1-android)
15. [Panduan Deployment Cloud (Render, Railway, VPS)](#-panduan-deployment-cloud)

---

## 🚀 FITUR UTAMA

* **Autentikasi Nyata**: Password hashing dengan bcrypt, token JWT access & refresh token rotation, serta session management.
* **Manajemen Perangkat (Device Registration)**: Registrasi perangkat DOBBLE R dan DOBBLE R1 dengan token unik dan pelacakan status online/offline.
* **Sistem Pairing Terotentikasi**:
  * DOBBLE R meminta pairing (`POST /api/pairing/request`).
  * Notifikasi real-time dikirim ke DOBBLE R1 via WebSocket.
  * DOBBLE R1 menyetujui (`approve`), menolak (`reject`), atau mencabut (`revoke`) pairing.
  * Otorisasi ketat: Hanya DOBBLE R1 yang ditargetkan yang dapat menyetujui pairing.
* **Pelacakan Lokasi Real-time**:
  * Endpoint `POST /api/location/update` menerima GPS latitude, longitude, accuracy, dan timestamp dari DOBBLE R.
  * Otomatis di-relay via WebSocket ke semua DOBBLE R1 yang berstatus `APPROVED`.
* **WebRTC Signaling Server (Camera & Screen Sharing)**:
  * Backend bertindak murni sebagai signaling broker (SDP offer/answer & ICE candidates relay). Tidak menyimpan video, menjaga privasi dan latensi sangat rendah.
  * Enforcing otorisasi: Signaling ditolak jika status pairing bukan `APPROVED`.
* **Keamanan & Validasi**:
  * Otorisasi berbasis peran (`R` vs `R1`).
  * Perlindungan rate limiting per IP.
  * Sanitasi input dengan skema Zod.
  * Error handler yang tidak membocorkan secrets atau stack traces internal.

---

## 🛠 TEKNOLOGI YANG DIGUNAKAN

* **Runtime**: Node.js (v18 / v20+)
* **Bahasa**: TypeScript (ES2022)
* **Web Framework**: Express.js
* **WebSocket**: ws (RFC 6455)
* **ORM & Database**: Prisma ORM & PostgreSQL 16
* **Autentikasi**: JSON Web Token (JWT) & bcryptjs
* **Validasi Skema**: Zod
* **Testing**: Vitest & Supertest
* **Containerization**: Docker & Docker Compose

---

## 📂 ARSITEKTUR PROYEK

```text
dobble-backend/
├── src/
│   ├── server.ts              # Entry point HTTP & WebSocket listener
│   ├── app.ts                 # Express application & middleware setup
│   ├── config/                # Environment variables configuration
│   ├── routes/                # REST API route handlers
│   │   ├── api.routes.ts
│   │   ├── auth.routes.ts
│   │   ├── device.routes.ts
│   │   ├── pairing.routes.ts
│   │   └── location.routes.ts
│   ├── controllers/           # HTTP Request & Response handlers
│   ├── services/              # Business logic
│   ├── repositories/          # Prisma ORM & persistence layer
│   ├── middleware/            # JWT Auth, Rate limiter, Error handler
│   ├── websocket/             # Real-time WebSocket manager & signaling
│   ├── auth/                  # Password hashing & JWT helpers
│   ├── pairing/               # Pairing state verification logic
│   ├── devices/               # Device state tracking
│   └── models/                # TypeScript types & event definitions
├── prisma/
│   └── schema.prisma          # PostgreSQL schema definition
├── tests/
│   └── dobble-backend.test.ts # Unit & integration test suite
├── Dockerfile                 # Multi-stage production container
├── docker-compose.yml         # Compose stack (Backend + PostgreSQL)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## ⚙️ PRASYARAT SISTEM

* Node.js v18.0.0 atau lebih tinggi
* npm v9.0.0 atau lebih tinggi
* Docker & Docker Compose (opsional namun disarankan untuk PostgreSQL)

---

## 📥 INSTALASI & ENVIRONMENT SETUP

1. Clone repositori:
   ```bash
   git clone <repo-url> dobble-backend
   cd dobble-backend
   ```

2. Salin template konfigurasi:
   ```bash
   cp .env.example .env
   ```

3. Sesuaikan isi `.env`:
   ```dotenv
   PORT=3000
   NODE_ENV=development
   DATABASE_URL=postgresql://dobble_user:dobble_secure_password@localhost:5432/dobble_db?schema=public
   JWT_SECRET=ganti_dengan_random_secret_panjang_64_karakter
   JWT_REFRESH_SECRET=ganti_dengan_random_refresh_secret_64_karakter
   JWT_EXPIRES_IN=1h
   JWT_REFRESH_EXPIRES_IN=7d
   CORS_ORIGIN=*
   RATE_LIMIT_WINDOW_MS=60000
   RATE_LIMIT_MAX_REQUESTS=120
   ```

4. Install dependencies:
   ```bash
   npm install
   ```

---

## 🗄 DATABASE & MIGRASI POSTGRESQL

### Menjalankan PostgreSQL via Docker Compose
Jika belum memiliki server PostgreSQL lokal, jalankan container PostgreSQL:
```bash
docker compose up -d postgres
```

### Menjalankan Migrasi Prisma
Generate client Prisma dan buat struktur tabel di PostgreSQL:
```bash
npx prisma generate
npx prisma migrate dev --name init_dobble_v1
```

---

## 🏃 MENJALANKAN SERVER

### Mode Development (dengan auto-reload):
```bash
npx tsx watch src/server.ts
```

Output console:
```text
=======================================================
  DOBBLE BACKEND V1 (Production & Dev Gateway)
=======================================================
  HTTP/REST API:     http://0.0.0.0:3000
  WebSocket (WSS):   ws://0.0.0.0:3000/ws
  Environment:       development
  Health Status:     http://0.0.0.0:3000/api/health
  Live Metrics:      http://0.0.0.0:3000/api/status
=======================================================
```

### Menjalankan Full-Stack dengan Docker Compose (Backend + PostgreSQL):
```bash
docker compose up --build -d
```
Cek log:
```bash
docker compose logs -f backend
```

---

## 🧪 MENJALANKAN TEST

Backend dilengkapi dengan test suite lengkap (Autentikasi, Registrasi Perangkat, Otorisasi, Pairing Lifecycle, Tracking Lokasi, dan Validasi WebSocket):

```bash
npm test
```
atau
```bash
npx vitest run
```

---

## 📦 BUILD & PRODUCTION

Untuk mem-build project sebelum deployment:
```bash
npm run build
```

Menjalankan server di production:
```bash
NODE_ENV=production npx tsx src/server.ts
```

---

## 📡 DOKUMENTASI REST API

Base URL lokal: `http://localhost:3000/api`  
Semua request dengan token menyertakan header:
`Authorization: Bearer <access_token>`

### 1. Autentikasi (`/api/auth`)

#### `POST /api/auth/register`
Mendaftarkan akun pengguna baru.
* **Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "PasswordRahasia123"
  }
  ```
* **Response (201):**
  ```json
  {
    "success": true,
    "data": {
      "user": { "id": "uuid", "email": "user@example.com" },
      "accessToken": "jwt_token...",
      "refreshToken": "jwt_refresh_token..."
    }
  }
  ```

#### `POST /api/auth/login`
Masuk dan mendapatkan token JWT.
* **Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "PasswordRahasia123"
  }
  ```

#### `POST /api/auth/refresh`
Memperbarui token akses yang kedaluwarsa.
* **Body:**
  ```json
  {
    "refreshToken": "jwt_refresh_token..."
  }
  ```

#### `POST /api/auth/logout`
Logout dan membatalkan sesi.

---

### 2. Registrasi Perangkat (`/api/devices`)

#### `POST /api/devices/register`
Mendaftarkan perangkat fisik Android (DOBBLE R atau DOBBLE R1).
* **Header:** `Authorization: Bearer <token>`
* **Body:**
  ```json
  {
    "deviceId": "samsung-s23-imei12345",
    "deviceName": "Samsung Galaxy S23 (DOBBLE R)",
    "platform": "Android",
    "appType": "R"
  }
  ```
  *(Untuk DOBBLE R1, gunakan `"appType": "R1"`)*
* **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "device": {
        "id": "uuid",
        "deviceId": "samsung-s23-imei12345",
        "deviceName": "Samsung Galaxy S23 (DOBBLE R)",
        "platform": "Android",
        "appType": "R",
        "isOnline": true
      },
      "deviceAccessToken": "device_jwt_token..."
    }
  }
  ```

#### `GET /api/devices`
Menampilkan daftar perangkat milik pengguna beserta status online/offline.

#### `GET /api/devices/:id`
Menampilkan detail perangkat berdasarkan `id` atau `deviceId`.
*(Akses dibatasi hanya untuk pemilik atau perangkat yang telah APPROVED berpasangan)*

#### `DELETE /api/devices/:id`
Menghapus registrasi perangkat.

---

### 3. Sistem Pairing (`/api/pairing`)

#### `POST /api/pairing/request`
Dipanggil oleh **DOBBLE R** untuk meminta pairing dengan **DOBBLE R1**.
* **Header:** `Authorization: Bearer <token>`
* **Body:**
  ```json
  {
    "rDeviceId": "samsung-s23-imei12345",
    "r1DeviceId": "tablet-lenovo-imei67890"
  }
  ```
* **Alur:** Backend membuat record pairing dengan status `PENDING` dan langsung mengirim event WebSocket `pairing.request` ke DOBBLE R1.

#### `GET /api/pairing/requests`
Dipanggil oleh **DOBBLE R1** untuk melihat semua permintaan pairing yang tertunda (`PENDING`).
* **Query:** `?r1DeviceId=tablet-lenovo-imei67890`

#### `POST /api/pairing/:id/approve`
Dipanggil oleh **DOBBLE R1** untuk menyetujui pairing.
* Status berubah menjadi `APPROVED`.
* Backend langsung mengirim event WebSocket `pairing.approved` ke DOBBLE R.

#### `POST /api/pairing/:id/reject`
Dipanggil oleh **DOBBLE R1** untuk menolak pairing.
* Status berubah menjadi `REJECTED`.
* Event WebSocket `pairing.rejected` dikirim ke DOBBLE R.

#### `POST /api/pairing/:id/revoke`
Mencabut pairing yang sebelumnya telah disetujui.

---

### 4. Pelacakan Lokasi Real-time (`/api/location`)

#### `POST /api/location/update`
Dipanggil secara periodik oleh **DOBBLE R** untuk memperbarui koordinat GPS.
* **Header:** `Authorization: Bearer <device_token>`
* **Body:**
  ```json
  {
    "deviceId": "samsung-s23-imei12345",
    "latitude": -6.2087634,
    "longitude": 106.845599,
    "accuracy": 8.5,
    "timestamp": 1727712000000
  }
  ```
* **Alur:** Backend menyimpan data lokasi dan meneruskan event `location.update` via WebSocket ke semua DOBBLE R1 yang berstatus `APPROVED`.

#### `GET /api/location/:deviceId`
Mengambil data lokasi terakhir dari perangkat (hanya dapat diakses jika berstatus `APPROVED`).

---

## ⚡ DOKUMENTASI WEBSOCKET PROTOCOL (/ws)

WebSocket Endpoint:
```text
ws://localhost:3000/ws?token=<DEVICE_ACCESS_TOKEN>
```
atau (Production WSS):
```text
wss://api.domain-anda.com/ws?token=<DEVICE_ACCESS_TOKEN>
```

### Format Pesan JSON

Semua pesan yang dikirim dan diterima menggunakan format JSON standar:
```json
{
  "type": "nama.event",
  "deviceId": "id-pengirim",
  "targetDeviceId": "id-tujuan",
  "requestId": "id-permintaan-opsional",
  "payload": {},
  "timestamp": 1727712000000
}
```

### Event yang Didukung

| Event Name | Pengirim | Penerima | Keterangan |
| :--- | :--- | :--- | :--- |
| `device.online` | Server | Paired Devices | Dikirim saat perangkat paired terhubung ke WS |
| `device.offline` | Server | Paired Devices | Dikirim saat perangkat paired terputus |
| `pairing.request` | Server | DOBBLE R1 | Notifikasi permintaan pairing baru dari DOBBLE R |
| `pairing.approved` | Server | DOBBLE R | Notifikasi bahwa pairing telah disetujui R1 |
| `pairing.rejected` | Server | DOBBLE R | Notifikasi bahwa pairing ditolak R1 |
| `pairing.revoked` | Server | Keduanya | Notifikasi bahwa pairing dicabut |
| `location.update` | DOBBLE R / Server | DOBBLE R1 | Pembaruan koordinat GPS real-time |
| `camera.request` | DOBBLE R1 | DOBBLE R | R1 meminta streaming kamera dari R |
| `camera.approved` | DOBBLE R | DOBBLE R1 | R menyetujui permintaan streaming kamera |
| `camera.rejected` | DOBBLE R | DOBBLE R1 | R menolak permintaan streaming kamera |
| `camera.offer` | DOBBLE R | DOBBLE R1 | SDP Offer WebRTC untuk streaming kamera |
| `camera.answer` | DOBBLE R1 | DOBBLE R | SDP Answer WebRTC untuk streaming kamera |
| `camera.ice_candidate`| R ↔ R1 | Keduanya | Pertukaran ICE candidate WebRTC kamera |
| `camera.stop` | R atau R1 | Lawan | Menghentikan sesi kamera |
| `screen.request` | DOBBLE R1 | DOBBLE R | R1 meminta live screen sharing dari R |
| `screen.approved` | DOBBLE R | DOBBLE R1 | R menyetujui screen sharing |
| `screen.rejected` | DOBBLE R | DOBBLE R1 | R menolak screen sharing |
| `screen.offer` | DOBBLE R | DOBBLE R1 | SDP Offer WebRTC untuk screen sharing |
| `screen.answer` | DOBBLE R1 | DOBBLE R | SDP Answer WebRTC untuk screen sharing |
| `screen.ice_candidate`| R ↔ R1 | Keduanya | Pertukaran ICE candidate WebRTC screen |
| `screen.stop` | R atau R1 | Lawan | Menghentikan sesi screen sharing |
| `ping` / `pong` | Client / Server | Keduanya | Heartbeat menjaga koneksi tetap hidup |

---

## 📹 WEBRTC SIGNALING FLOW (CAMERA & SCREEN)

Backend **tidak memproses frame video atau audio**. Backend hanya bertindak sebagai secure signaling relay:

```text
DOBBLE R1 (Viewer)                  DOBBLE BACKEND                    DOBBLE R (Sender)
      │                                    │                                  │
      │─── camera.request ────────────────>│─── camera.request ─────────────>│
      │                                    │                                  │
      │<── camera.approved ────────────────│<── camera.approved ──────────────│
      │                                    │                                  │
      │<── camera.offer (SDP) ─────────────│<── camera.offer (SDP) ───────────│
      │                                    │                                  │
      │─── camera.answer (SDP) ───────────>│─── camera.answer (SDP) ──────────>│
      │                                    │                                  │
      │<── camera.ice_candidate ───────────│<── camera.ice_candidate ─────────│
      │─── camera.ice_candidate ──────────>│─── camera.ice_candidate ─────────>│
      │                                    │                                  │
      │══════════════════ Peer-to-Peer WebRTC Media Stream ═══════════════════│
```

---

## 📱 PANDUAN INTEGRASI DOBBLE R (ANDROID)

Di aplikasi Android **DOBBLE R**, konfigurasikan environment / constants berikut:

```kotlin
// BuildKonfig / Constants di DOBBLE R
object BackendConfig {
    const val BASE_API_URL = "https://api.yourdomain.com/api"
    const val WEBSOCKET_URL = "wss://api.yourdomain.com/ws"
    const val APP_TYPE = "R"
}
```

### Langkah Kerja DOBBLE R:
1. Panggil `POST /api/auth/login` untuk mendapatkan `accessToken`.
2. Panggil `POST /api/devices/register` dengan `appType: "R"` untuk mendaftarkan hardware device ID.
3. Hubungkan WebSocket ke `wss://api.yourdomain.com/ws?token=<deviceAccessToken>`.
4. Kirimkan permintaan pairing ke DOBBLE R1 via `POST /api/pairing/request`.
5. Dengarkan event WebSocket `pairing.approved`.
6. Kirim GPS update via `POST /api/location/update` setiap interval tertentu (misal tiap 5-15 detik).
7. Tangani event `camera.request` dan `screen.request` lalu lakukan WebRTC PeerConnection.

---

## 📱 PANDUAN INTEGRASI DOBBLE R1 (ANDROID)

Di aplikasi Android **DOBBLE R1**, konfigurasikan environment / constants berikut:

```kotlin
// BuildKonfig / Constants di DOBBLE R1
object BackendConfig {
    const val BASE_API_URL = "https://api.yourdomain.com/api"
    const val WEBSOCKET_URL = "wss://api.yourdomain.com/ws"
    const val APP_TYPE = "R1"
}
```

### Langkah Kerja DOBBLE R1:
1. Panggil `POST /api/auth/login`.
2. Panggil `POST /api/devices/register` dengan `appType: "R1"`.
3. Buka WebSocket ke `wss://api.yourdomain.com/ws?token=<deviceAccessToken>`.
4. Dengarkan event WebSocket `pairing.request` dari DOBBLE R.
5. Setujui permintaan pairing dengan `POST /api/pairing/:id/approve`.
6. Terima koordinat GPS real-time lewat event `location.update`.
7. Mulai streaming kamera/layar dengan mengirim event WS `camera.request` / `screen.request` dengan `targetDeviceId: <rDeviceId>`.

---

## ☁️ PANDUAN DEPLOYMENT CLOUD

### 1. Deployment ke Render.com
1. Buat **PostgreSQL Database** di Render dashboard:
   * Catat **Internal Database URL** atau **External Database URL**.
2. Buat **Web Service** baru:
   * Connect repositori GitHub Anda.
   * Runtime: `Node` atau `Docker`.
   * Jika Docker: Render akan otomatis membaca `Dockerfile`.
   * Environment Variables:
     * `NODE_ENV=production`
     * `PORT=10000` (atau biarkan default Render)
     * `DATABASE_URL=postgresql://...`
     * `JWT_SECRET=super_secret_jwt_random_string`
     * `JWT_REFRESH_SECRET=super_secret_refresh_random_string`
     * `CORS_ORIGIN=*`
3. Setelah deploy sukses, Render menyediakan URL seperti:
   * HTTPS API: `https://dobble-backend.onrender.com`
   * WSS WebSocket: `wss://dobble-backend.onrender.com/ws`

### 2. Deployment ke Railway.app
1. Di Railway dashboard, klik **New Project** → **Provision PostgreSQL**.
2. Tambahkan **GitHub Repo Service** untuk backend:
   * Railway otomatis mendeteksi Dockerfile.
   * Di tab **Variables**, tambahkan:
     * `DATABASE_URL=${{Postgres.DATABASE_URL}}`
     * `JWT_SECRET=super_secret_jwt_random_string`
     * `JWT_REFRESH_SECRET=super_secret_refresh_random_string`
3. Di tab **Settings**, klik **Generate Domain**.
4. URL yang dihasilkan:
   * HTTPS API: `https://dobble-backend.up.railway.app`
   * WSS WebSocket: `wss://dobble-backend.up.railway.app/ws`

### 3. Deployment ke Ubuntu / Debian VPS (Docker)
1. Install Docker & Compose di VPS:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose
   ```
2. Clone repository & sesuaikan file `.env`:
   ```bash
   git clone <repo-url> /opt/dobble-backend
   cd /opt/dobble-backend
   cp .env.example .env
   nano .env
   ```
3. Jalankan service:
   ```bash
   docker-compose up -d --build
   ```
4. Gunakan Nginx / Caddy sebagai reverse proxy dengan SSL Let's Encrypt:
   ```nginx
   server {
       server_name api.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
5. URL publik yang didapatkan:
   * HTTPS API: `https://api.yourdomain.com`
   * WSS WebSocket: `wss://api.yourdomain.com/ws`

---

## 🔒 SECURITY & AUTHORIZATION RULES

1. **Prinsip Least-Privilege**: DOBBLE R tidak dapat membaca atau memodifikasi resource milik DOBBLE R1, dan sebaliknya.
2. **Strict Pairing Check**: WebRTC signaling (`camera.*`, `screen.*`) dan GPS streaming hanya diizinkan jika status pairing antara kedua perangkat adalah `APPROVED`.
3. **No Arbitrary IDs**: Target device diverifikasi keberadaannya dan keterhubungannya dengan user sebelum event diteruskan.
4. **Token Expiration**: Access token berumur 1 jam dan refresh token berumur 7 hari.

---

**DOBBLE BACKEND V1** — Ready for Production.
