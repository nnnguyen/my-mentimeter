# my-mentimeter

Ứng dụng word cloud realtime kiểu Mentimeter. Xem đầy đủ đặc tả sản phẩm và kiến trúc trong [`CLAUDE.md`](./CLAUDE.md).

## Tech stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Ant Design — `/frontend`
- **Backend**: NestJS + TypeScript + Prisma ORM — `/backend`
- **Database**: PostgreSQL (chạy qua Docker Compose khi dev local)
- **Realtime**: Socket.IO (sẽ thêm ở Giai đoạn 4)

## Yêu cầu hệ thống

- Node.js 20+
- npm 10+
- Docker + Docker Compose (để chạy PostgreSQL local)

## Cài đặt

```bash
npm install
```

Lệnh này cài dependency cho cả `frontend` và `backend` (dùng npm workspaces).

## Chạy PostgreSQL local

```bash
docker compose up -d
```

> Container Postgres map ra cổng host **5433** (không phải 5432 mặc định) để tránh xung đột nếu máy bạn đã cài Postgres native sẵn trên 5432. Nếu máy bạn không có Postgres nào khác chạy trên 5432, vẫn cứ dùng 5433 cho khớp với `.env.example`, hoặc tự đổi port trong `docker-compose.yml` và các file `.env`.

Dừng lại: `docker compose down` (thêm `-v` nếu muốn xoá luôn volume data).

## Cấu hình biến môi trường

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Điền các giá trị thật (xem mục "Thiết lập Google OAuth" bên dưới). Không commit các file `.env`/`.env.local`.

## Migration database

```bash
npm run db:migrate
```

Chạy `prisma migrate dev` trong `backend`, áp schema ở `backend/prisma/schema.prisma` vào database. Prisma Client generate vào `node_modules/@prisma/client` (generator `prisma-client-js` — chọn generator này thay vì generator `prisma-client` mặc định của Prisma 6 vì generator mới xuất code ESM, không tương thích với backend NestJS đang chạy CommonJS).

## Thiết lập Google OAuth

Cần làm 1 lần trước khi test đăng nhập:

1. Vào [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → tạo OAuth Client ID, loại **Web application**.
2. **Authorized redirect URIs**: thêm `http://localhost:3001/api/auth/google/callback`.
3. Copy Client ID / Client Secret, điền vào `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
4. Sinh `JWT_SECRET` ngẫu nhiên (vd `openssl rand -hex 32`) điền vào `backend/.env`.
5. Restart `npm run dev:backend` sau khi sửa `.env`.

Cho tới khi làm bước này, backend vẫn chạy được bình thường (dùng giá trị placeholder trong `.env`) nhưng nút "Đăng nhập với Google" sẽ báo lỗi từ phía Google vì `client_id` không hợp lệ.

## Chạy dev

Mở 2 terminal riêng:

```bash
npm run dev:backend   # NestJS, mặc định http://localhost:3001
npm run dev:frontend  # Next.js, mặc định http://localhost:3000
```

## Build & lint

```bash
npm run build   # build backend rồi frontend
npm run lint     # lint backend rồi frontend
npm run format   # prettier --write toàn repo (dùng chung .prettierrc.json ở root)
```

## Deploy production (Vercel + Railway)

Vercel chỉ host được frontend Next.js — backend NestJS giữ kết nối Socket.IO
liên tục (`/presenter`, `/audience`) nên cần một nơi chạy Node process dài
hạn, không phải serverless function. Kiến trúc khuyến nghị:

- **Frontend** → Vercel (root directory: `frontend`).
- **Backend** → Railway (root directory: `backend`) — có sẵn `backend/railway.json`
  chỉ định build/start command đúng (`npm run start:prod`, không phải script
  `start` mặc định vốn chỉ dùng cho dev).
- **Database** → Postgres managed của Railway (hoặc Neon/Supabase) — Docker
  Compose chỉ dùng cho local dev, không deploy được lên Vercel/Railway.

### 1. Backend trên Railway

1. Tạo service mới từ repo này, đặt **Root Directory = `backend`**.
2. Thêm một Postgres database trong cùng Railway project, lấy `DATABASE_URL`.
3. Điền biến môi trường (Railway tự set `PORT`, không cần khai):
   ```
   DATABASE_URL=<connection string Postgres Railway>
   NODE_ENV=production
   FRONTEND_URL=https://<domain-vercel-cua-ban>
   JWT_SECRET=<chuỗi ngẫu nhiên, vd openssl rand -hex 32>
   JWT_EXPIRES_IN=7d
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_CALLBACK_URL=https://<domain-backend-railway>/api/auth/google/callback
   ```
4. Deploy. `start:prod` tự chạy `prisma migrate deploy` trước khi khởi động
   server, nên schema production luôn khớp với `prisma/migrations`.

### 2. Frontend trên Vercel

1. Import repo, đặt **Root Directory = `frontend`**.
2. Biến môi trường:
   ```
   NEXT_PUBLIC_API_URL=https://<domain-backend-railway>
   ```

### 3. Cập nhật Google OAuth Console

Thêm redirect URI production vào Authorized redirect URIs:
`https://<domain-backend-railway>/api/auth/google/callback`.

### Ghi chú kiến trúc cross-domain

Frontend (Vercel) và backend (Railway) khác domain nên:

- Cookie đăng nhập (`access_token`) tự chuyển sang `SameSite=None; Secure`
  khi `NODE_ENV=production` (xem `backend/src/auth/auth.constants.ts`) — bắt
  buộc để trình duyệt gửi cookie kèm các request `fetch` cross-origin.
- Next.js middleware cũ (chặn `/dashboard`, `/topics/*` dựa vào cookie) đã bị
  bỏ vì middleware chạy trên domain Vercel không bao giờ đọc được cookie do
  domain Railway set. Việc chặn truy cập trái phép giờ do từng trang tự gọi
  `GET /api/auth/session` / `GET /api/topics/:id` và redirect khi 401/403 —
  cơ chế này đã có sẵn, không cần cấu hình thêm.
- CORS backend (`FRONTEND_URL`) hiện chỉ nhận **một** origin cố định — Vercel
  preview deployment (URL khác domain production mỗi lần) sẽ bị CORS chặn.
  Nếu cần preview hoạt động, phải sửa `app.enableCors` trong `backend/src/main.ts`
  để nhận nhiều origin.

## Cấu trúc thư mục

```
my-mentimeter/
├── frontend/        # Next.js app
├── backend/          # NestJS app + Prisma schema
├── docker-compose.yml
├── .prettierrc.json   # config Prettier dùng chung cho cả 2 project
└── CLAUDE.md           # đặc tả sản phẩm & kế hoạch từng giai đoạn
```
