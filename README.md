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

Điền các giá trị thật (Google OAuth client id/secret, JWT secret...) khi làm tới Giai đoạn 1. Không commit các file `.env`/`.env.local`.

## Migration database

```bash
npm run db:migrate
```

Chạy `prisma migrate dev` trong `backend`, áp schema ở `backend/prisma/schema.prisma` vào database.

Prisma Client được generate ra `backend/generated/prisma` (không phải `node_modules/@prisma/client` như bản cũ) — import từ đường dẫn này khi viết code backend.

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

## Cấu trúc thư mục

```
my-mentimeter/
├── frontend/        # Next.js app
├── backend/          # NestJS app + Prisma schema
├── docker-compose.yml
├── .prettierrc.json   # config Prettier dùng chung cho cả 2 project
└── CLAUDE.md           # đặc tả sản phẩm & kế hoạch từng giai đoạn
```
