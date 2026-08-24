# CLAUDE.md — Ứng dụng Word Cloud realtime (kiểu Mentimeter)

> **Cách dùng:** copy file này vào gốc repo với tên `CLAUDE.md`. Claude Code tự động đọc file này ở đầu mỗi phiên làm việc, nên bạn không cần dán lại yêu cầu mỗi lần. Các khối "PROMPT" ở mục 9 là thứ bạn gõ vào Claude Code theo từng giai đoạn.

---

## 1. Tổng quan sản phẩm

Web app cho phép người thuyết trình (đã đăng nhập Google) tạo một "topic" (câu hỏi mở), sinh mã QR để khán giả quét bằng điện thoại (**không cần đăng nhập**) và gõ từ/câu trả lời ngắn. Kết quả hiện thành **word cloud realtime** trên màn hình chiếu — từ nào được gửi nhiều lần thì chữ càng to, kèm bảng thống kê số lần lặp.

Tham khảo hành vi UX: https://www.mentimeter.com/features/word-cloud (chỉ tham khảo luồng sử dụng, không sao chép thiết kế/nội dung thương hiệu).

## 2. Tech stack (bắt buộc — không tự đổi sang lựa chọn khác)

| Layer | Công nghệ |
|---|---|
| Frontend | Next.js 14+ (App Router), TypeScript, **Ant Design** (chọn 1 UI lib duy nhất, dùng nhất quán toàn app) |
| Animation | `framer-motion` cho hiệu ứng chữ xuất hiện trong word cloud |
| Word cloud render | `d3-cloud` (hoặc `react-wordcloud`) |
| Backend | **NestJS** + TypeScript |
| Database | PostgreSQL + **Prisma ORM** |
| Realtime | **Socket.IO** (`@nestjs/websockets` + `@nestjs/platform-socket.io` phía server, `socket.io-client` phía Next.js) |
| Auth | Google OAuth 2.0 (Passport Google Strategy ở NestJS, JWT lưu trong cookie httpOnly) |
| QR code | thư viện `qrcode` (Node) |

**KHÔNG dùng Firebase.** Realtime hoàn toàn qua Socket.IO chạy chung process với NestJS backend.

## 3. Kiến trúc realtime (làm đúng pattern này, không tự đổi)

```
[Điện thoại khán giả — /vote/{code}]
   POST /api/public/topics/:code/responses
        │
        ▼
[NestJS API]
   1. validate input + chuẩn hoá từ (mục 5)
   2. transaction: INSERT Response + UPSERT WordAggregate (count += 1)
   3. sau khi commit → WordCloudGateway.emit vào room `topic:{topicId}`
        event: "wordcloud:update"
        payload: { words: [{ displayText, count }], totalResponses, uniqueWords }
        │
        ▼
[Màn hình chiếu — /topics/{id}]
   socket.io-client đã join room `topic:{topicId}` từ lúc mở trang
   → nhận event → cập nhật state → re-render word cloud + bảng thống kê
```

**Quy tắc quan trọng:**
- PostgreSQL là **source of truth** duy nhất. Socket.IO chỉ là kênh truyền tải, không lưu trạng thái.
- Payload gửi kèm luôn dữ liệu tổng hợp (không chỉ từ mới), để client không cần gọi thêm API — danh sách từ của 1 topic thường chỉ vài chục đến vài trăm phần tử nên payload vẫn nhẹ.
- Khi mở trang `/topics/{id}` lần đầu: gọi `GET /api/topics/:id/wordcloud` để lấy snapshot ban đầu, **rồi mới** subscribe socket. Tránh màn hình trắng trước event đầu tiên.
- **Fallback:** nếu socket mất kết nối > 5 giây, tự động chuyển sang polling `GET /api/topics/:id/wordcloud` mỗi 3 giây; khi socket kết nối lại thì dừng polling và fetch lại snapshot 1 lần.
- **Auth cho socket:** namespace `/presenter` yêu cầu JWT (chỉ owner của topic mới join được room của topic đó). Participant không cần kết nối socket — chỉ POST là đủ.
- **Ghi chú scale (chưa làm bây giờ):** nếu sau này chạy nhiều instance backend, cần thêm `@socket.io/redis-adapter`. Hiện tại triển khai 1 instance, không cần Redis.

## 4. Data model (Prisma)

```prisma
model User {
  id        String   @id @default(uuid())
  googleId  String   @unique
  email     String   @unique
  name      String
  avatarUrl String?
  createdAt DateTime @default(now())
  topics    Topic[]
}

enum TopicStatus {
  DRAFT
  ACTIVE
  CLOSED
}

model Topic {
  id              String      @id @default(uuid())
  ownerId         String
  owner           User        @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  title           String
  question        String
  code            String      @unique   // mã ngắn trong URL public, vd "AB12CD"
  status          TopicStatus @default(DRAFT)
  maxWordsPerUser Int         @default(3)
  createdAt       DateTime    @default(now())
  responses       Response[]
  wordAggregates  WordAggregate[]

  @@index([ownerId])
}

model Response {
  id                   String   @id @default(uuid())
  topicId              String
  topic                Topic    @relation(fields: [topicId], references: [id], onDelete: Cascade)
  rawText              String              // nguyên văn người dùng gõ
  normalizedText       String              // đã chuẩn hoá theo mục 5
  participantSessionId String              // UUID sinh ở client, lưu localStorage
  createdAt            DateTime @default(now())

  @@index([topicId, participantSessionId])
}

model WordAggregate {
  id             String @id @default(uuid())
  topicId        String
  topic          Topic  @relation(fields: [topicId], references: [id], onDelete: Cascade)
  normalizedText String
  displayText    String   // giữ bản gõ đầu tiên để hiển thị
  count          Int      @default(1)

  @@unique([topicId, normalizedText])
  @@index([topicId, count])
}
```

## 5. Quy tắc chuẩn hoá từ (implement chính xác — dùng để gộp từ trùng)

1. Trim khoảng trắng đầu/cuối; gộp nhiều khoảng trắng liên tiếp thành 1.
2. Chuyển toàn bộ về chữ thường.
3. Bỏ dấu câu (`. , ! ? " ' ; :` ...).
4. **GIỮ NGUYÊN dấu tiếng Việt** — "sáng tạo" và "sang tao" là 2 từ khác nhau. Không tự ý bỏ dấu.
5. Giới hạn độ dài input: tối đa 40 ký tự. Sanitize để chặn HTML/script injection.
6. Nếu sau chuẩn hoá còn chuỗi rỗng → trả lỗi 400, không lưu.

Viết hàm này thành 1 util riêng (`normalizeWord`) có unit test đầy đủ, vì đây là logic cốt lõi của tính năng đếm trùng.

## 6. API endpoints

**Auth**
- `GET  /api/auth/google` — bắt đầu OAuth flow
- `GET  /api/auth/google/callback` — callback, set JWT cookie, redirect về `/dashboard`
- `GET  /api/auth/session` — thông tin user hiện tại
- `POST /api/auth/logout`

**Topic (yêu cầu đăng nhập, chỉ owner truy cập được topic của mình)**
- `POST   /api/topics` — tạo topic, trả về `{ id, code }`
- `GET    /api/topics` — danh sách topic của user
- `GET    /api/topics/:id` — chi tiết
- `PATCH  /api/topics/:id` — sửa title/question/maxWordsPerUser/status (DRAFT → ACTIVE → CLOSED)
- `DELETE /api/topics/:id`
- `GET    /api/topics/:id/qrcode` — trả PNG/SVG QR trỏ tới `{FRONTEND_URL}/vote/{code}`
- `GET    /api/topics/:id/wordcloud` — `{ words: [{displayText, count}] (sort count desc), totalResponses, uniqueWords }`

**Public (không cần đăng nhập)**
- `GET  /api/public/topics/:code` — trả `{ title, question, status, maxWordsPerUser }`
- `POST /api/public/topics/:code/responses` — body `{ text, participantSessionId }`
  - Chặn nếu topic không ở trạng thái ACTIVE (trả 409)
  - Chặn nếu `participantSessionId` đã gửi đủ `maxWordsPerUser` từ (trả 429)
  - Rate limit cơ bản theo IP để tránh spam

**WebSocket** — namespace `/presenter`
- Client emit `join` với `{ topicId }` (kèm JWT trong handshake auth)
- Server emit `wordcloud:update` vào room `topic:{topicId}` mỗi khi có response mới

## 7. Các trang giao diện

| Route | Mô tả | Auth |
|---|---|---|
| `/login` | Nút "Đăng nhập với Google" | Public |
| `/dashboard` | Danh sách topic + nút tạo mới (Table + Modal form) | Cần login |
| `/topics/[id]` | **Màn hình chiếu**: câu hỏi, nút Start/Close, QR code, word cloud realtime, bảng thống kê | Cần login (owner) |
| `/vote/[code]` | Trang khán giả: câu hỏi + ô nhập từ, mobile-first | Public |

## 8. Checklist nghiệm thu

- [ ] Đăng nhập Google hoạt động, session giữ được sau khi reload trang
- [ ] Tạo topic → hiện QR → quét bằng điện thoại thật → mở đúng `/vote/[code]`
- [ ] Khán giả gửi từ thành công mà không cần đăng nhập
- [ ] Word cloud trên `/topics/[id]` cập nhật **trong vòng 1 giây**, không cần F5
- [ ] Từ giống nhau sau chuẩn hoá được gộp đúng, `count` tăng chính xác (có unit test cho `normalizeWord`)
- [ ] Giới hạn `maxWordsPerUser` hoạt động trên 1 thiết bị
- [ ] Topic ở trạng thái CLOSED thì không gửi được nữa
- [ ] Rút dây mạng / tắt backend → frontend tự chuyển polling, kết nối lại thì tự đồng bộ
- [ ] Người dùng A không xem/sửa được topic của người dùng B

## 9. PROMPT theo từng giai đoạn (gõ vào Claude Code)

> Nguyên tắc chung: mỗi giai đoạn là 1 phiên làm việc riêng. Luôn để Claude Code lập kế hoạch trước (Plan Mode), duyệt kế hoạch, rồi mới cho thực thi. Commit git sau mỗi giai đoạn xanh.

### Giai đoạn 0 — Khởi tạo monorepo

```
Đọc CLAUDE.md. Vào Plan Mode và đề xuất kế hoạch cho Giai đoạn 0, chưa sửa file.

Mục tiêu: khởi tạo monorepo gồm
- /frontend: Next.js 14 App Router + TypeScript + Ant Design
- /backend: NestJS + TypeScript + Prisma + PostgreSQL

Bao gồm:
1. ESLint + Prettier cho cả 2 project, config thống nhất.
2. Prisma schema đúng y hệt mục 4 trong CLAUDE.md + migration đầu tiên.
3. docker-compose.yml chạy PostgreSQL local cho dev.
4. .env.example cho từng project, liệt kê đầy đủ biến môi trường.
5. README.md ghi rõ các lệnh chạy dev.

Sau khi tôi duyệt plan và bạn thực thi xong: chạy `docker compose up -d`,
chạy migration, chạy build cả 2 project để xác nhận không lỗi, rồi báo lại kết quả.
```

### Giai đoạn 1 — Auth Google

```
Đọc CLAUDE.md mục 2, 6 (Auth), 7. Lập kế hoạch trước.

Implement đăng nhập Google:
- Backend: Passport Google Strategy, sinh JWT lưu cookie httpOnly, các endpoint auth ở mục 6.
- Frontend: trang /login, sau khi login redirect /dashboard.
- Middleware bảo vệ /dashboard và /topics/[id]; /vote/[code] luôn public.
- Khán giả KHÔNG cần đăng nhập.

Xong thì viết cho tôi danh sách bước thủ công cần làm (tạo OAuth Client ID trên
Google Cloud Console, redirect URI cần khai báo, biến env cần điền).
Chạy build + test để xác nhận, tự sửa nếu lỗi.
```

### Giai đoạn 2 — Tạo topic + QR code

```
Đọc CLAUDE.md mục 4, 6 (Topic), 7. Lập kế hoạch trước.

Implement:
- Toàn bộ CRUD endpoint /api/topics + GET /api/topics/:id/qrcode.
- Guard: chỉ owner mới thao tác được topic của mình (viết test cho case user A truy cập topic user B → 403).
- `code`: 6 ký tự chữ hoa + số, sinh ngẫu nhiên, retry nếu trùng.
- Frontend /dashboard: Table danh sách + Modal tạo topic.
- Frontend /topics/[id]: hiện câu hỏi, trạng thái, nút Start/Close, ảnh QR,
  nút copy link vote và nút tải QR về máy.

Chạy build + test, tự sửa nếu lỗi.
```

### Giai đoạn 3 — Trang vote công khai + logic chuẩn hoá

```
Đọc CLAUDE.md mục 5, 6 (Public), 7. Lập kế hoạch trước.

Implement:
- Util `normalizeWord` theo ĐÚNG 6 quy tắc ở mục 5. Viết unit test đầy đủ trước,
  đặc biệt case tiếng Việt có dấu, khoảng trắng thừa, dấu câu, chuỗi rỗng, quá 40 ký tự.
- GET /api/public/topics/:code
- POST /api/public/topics/:code/responses: validate, chuẩn hoá, transaction
  INSERT Response + UPSERT WordAggregate (count += 1), kiểm tra status ACTIVE
  và maxWordsPerUser theo participantSessionId, rate limit theo IP.
- Frontend /vote/[code]: mobile-first (test ở viewport 375px), sinh participantSessionId
  bằng crypto.randomUUID() lưu localStorage, hiển thị "đã gửi X/N từ",
  disable form khi hết lượt hoặc topic đã CLOSED.

Chạy toàn bộ test, tự sửa nếu lỗi.
```

### Giai đoạn 4 — Realtime bằng Socket.IO

```
Đọc CLAUDE.md mục 3 — LÀM ĐÚNG PATTERN NÀY, không tự đổi sang giải pháp khác
(không dùng Firebase, không dùng SSE, không dùng polling làm cơ chế chính).
Lập kế hoạch trước.

Backend:
- Cài @nestjs/websockets + @nestjs/platform-socket.io.
- Tạo WordCloudGateway ở namespace /presenter.
- Handshake xác thực JWT; client emit `join` với { topicId }, server kiểm tra
  user có phải owner của topic không rồi mới cho join room `topic:{topicId}`.
- Sau khi POST response commit thành công → emit `wordcloud:update` vào room đó
  với payload { words, totalResponses, uniqueWords }.

Frontend /topics/[id]:
- Mở trang: gọi GET /api/topics/:id/wordcloud lấy snapshot, RỒI MỚI connect socket.
- Nhận `wordcloud:update` → cập nhật state → re-render.
- Render word cloud bằng d3-cloud, cỡ chữ tỉ lệ theo count, animation nhẹ
  bằng framer-motion khi có từ mới xuất hiện.
- Fallback: mất socket > 5s → polling mỗi 3s; reconnect được thì dừng polling
  và fetch snapshot 1 lần. Hiển thị badge trạng thái kết nối trên UI.

Chạy build + test. Sau đó hướng dẫn tôi cách test thủ công bằng 2 tab trình duyệt.
```

### Giai đoạn 5 — Bảng thống kê

```
Đọc CLAUDE.md mục 6, 8. Lập kế hoạch trước.

Trên /topics/[id], thêm bảng thống kê song song với word cloud:
- Ant Design Table: cột Từ / Số lượt / Tỉ lệ %, sort giảm dần theo count.
- Hiển thị tổng số câu trả lời và số từ khác nhau.
- Nút toggle ẩn/hiện bảng (khi chiếu lên màn hình lớn có thể muốn ẩn đi).
- Bảng cũng cập nhật realtime từ cùng event `wordcloud:update`, không gọi thêm API.
- Nút export CSV danh sách từ + số lượt.

Chạy build + test, tự sửa nếu lỗi.
```

### Giai đoạn 6 — Polish + rà soát

```
Đọc lại toàn bộ CLAUDE.md, đặc biệt checklist mục 8. Lập kế hoạch trước.

1. Rà từng mục trong checklist mục 8, báo cáo mục nào đạt / chưa đạt.
2. Bổ sung loading state và error state cho mọi API call.
3. Empty state khi topic chưa có câu trả lời nào.
4. Kiểm tra /vote/[code] ở viewport 375px.
5. Rà soát bảo mật: SQL injection, XSS từ input người dùng, rate limit,
   phân quyền owner, secret có bị log ra không.

KHÔNG thêm tính năng mới ngoài phạm vi CLAUDE.md.
```

## 10. Quy ước làm việc cho Claude Code

- Luôn dùng Plan Mode cho việc đụng từ 3 file trở lên; tôi duyệt plan rồi mới thực thi.
- Sau mỗi giai đoạn: tự chạy build + test, tự sửa lỗi, rồi báo cáo tóm tắt ngắn gọn.
- Không thêm dependency ngoài danh sách ở mục 2 nếu chưa hỏi tôi.
- Không thêm tính năng ngoài phạm vi file này.
- Code comment và commit message viết bằng tiếng Anh; giải thích cho tôi bằng tiếng Việt.
- Không commit file `.env`, không hardcode secret trong source.
