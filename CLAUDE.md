# CLAUDE.md — Ứng dụng Word Cloud realtime (kiểu Mentimeter)

> **Cách dùng:** copy file này vào gốc repo với tên `CLAUDE.md`. Claude Code tự động đọc file này ở đầu mỗi phiên làm việc. Các khối "PROMPT" ở mục 9 là thứ bạn gõ vào Claude Code theo từng giai đoạn.

---

## 1. Tổng quan sản phẩm

Web app cho phép người thuyết trình (đã đăng nhập Google) tạo một **Topic** (một buổi trình chiếu) gồm **nhiều Question** (mỗi câu hỏi là một word cloud). Khán giả quét QR **một lần duy nhất** để vào buổi trình chiếu, sau đó presenter điều khiển chuyển câu hỏi và màn hình khán giả tự động chuyển theo.

Kết quả hiện thành **word cloud realtime** trên màn hình chiếu — từ nào được gửi nhiều lần thì chữ càng to, kèm bảng thống kê số lần lặp.

Tham khảo hành vi UX: https://www.mentimeter.com/features/word-cloud (chỉ tham khảo luồng sử dụng, không sao chép thiết kế/nội dung thương hiệu).

## 2. Tech stack (bắt buộc — không tự đổi sang lựa chọn khác)

| Layer | Công nghệ |
|---|---|
| Frontend | Next.js 14+ (App Router), TypeScript, **Ant Design** (dùng nhất quán toàn app) |
| Animation | `framer-motion` cho hiệu ứng chữ trong word cloud |
| Word cloud render | `d3-cloud` |
| Backend | **NestJS** + TypeScript |
| Database | PostgreSQL + **Prisma ORM** |
| Realtime | **Socket.IO** (`@nestjs/websockets` + `@nestjs/platform-socket.io`; client dùng `socket.io-client`) |
| Auth | Google OAuth 2.0 (Passport Google Strategy, JWT trong cookie httpOnly) |
| QR code | thư viện `qrcode` |

**KHÔNG dùng Firebase.** Realtime hoàn toàn qua Socket.IO chạy chung process với NestJS backend.

## 3. Mô hình khái niệm

```
User (presenter)
 └── Topic  = một buổi trình chiếu, có 1 mã tham gia + 1 QR duy nhất
      ├── Question #1  (word cloud, có config riêng)
      ├── Question #2
      └── Question #3
           └── Response (từ khán giả gửi) → gộp thành WordAggregate
```

- Khán giả quét QR → vào `/join/{code}` → luôn thấy **câu hỏi đang active** của topic đó.
- Presenter bấm "Câu tiếp theo" → server cập nhật `Topic.currentQuestionId` → emit socket → điện thoại khán giả tự chuyển màn hình, không cần quét lại.

## 4. Kiến trúc realtime (làm đúng pattern này, không tự đổi)

```
[Điện thoại khán giả — /join/{code}]
   socket namespace /audience, join room `topic:{topicId}`
   POST /api/public/questions/:questionId/responses
        │
        ▼
[NestJS API]
   1. validate + chuẩn hoá từ (mục 6)
   2. kiểm tra Question đang ACTIVE + kiểm tra giới hạn lượt (mục 5.3)
   3. transaction: INSERT Response + UPSERT WordAggregate (count += 1)
   4. sau khi commit → emit vào room `topic:{topicId}`
        event "wordcloud:update"
        payload { questionId, words: [{displayText, count}], totalResponses, uniqueWords }
        │
        ▼
[Màn hình chiếu — /topics/{id}/present]
   nhận event → nếu questionId khớp câu đang chiếu → re-render word cloud + bảng thống kê
```

**Sự kiện socket khác:**
- `question:changed` — server emit vào room `topic:{topicId}` khi presenter đổi câu hỏi. Payload `{ questionId, order, prompt, config }`. Cả màn hình chiếu lẫn điện thoại khán giả đều lắng nghe event này.
- `topic:closed` — khi presenter kết thúc buổi.

**Quy tắc quan trọng:**
- PostgreSQL là **source of truth** duy nhất. Socket.IO chỉ là kênh truyền tải, không lưu trạng thái.
- Payload gửi kèm luôn dữ liệu tổng hợp (không chỉ từ mới) → client không cần gọi thêm API.
- Khi mở trang lần đầu: gọi API lấy snapshot **rồi mới** subscribe socket. Tránh màn hình trắng trước event đầu tiên.
- **Fallback:** mất socket > 5 giây → polling API mỗi 3 giây; reconnect được thì dừng polling và fetch snapshot 1 lần.
- **Phân quyền socket:** namespace `/presenter` yêu cầu JWT và chỉ owner mới join được room topic của mình. Namespace `/audience` public nhưng **chỉ nhận**, không được emit dữ liệu.
- **Scale (chưa làm bây giờ):** nhiều instance backend sẽ cần `@socket.io/redis-adapter`. Hiện tại chạy 1 instance.

## 5. Data model (Prisma)

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

enum QuestionStatus {
  DRAFT      // chưa mở, khán giả không thấy
  ACTIVE     // đang nhận câu trả lời
  CLOSED     // đã đóng, chỉ xem kết quả
}

enum QuestionType {
  WORD_CLOUD   // hiện chỉ hỗ trợ loại này; để enum sẵn cho việc mở rộng sau
}

enum JoiningInfoType {
  QR_CODE
  LINK
  CODE
}

enum ResultVisibility {
  INSTANT    // kết quả hiện ngay khi khán giả gửi
  ON_CLICK   // presenter bấm mới hiện — tránh hiệu ứng bầy đàn (khuyến nghị)
  PRIVATE    // không hiện trên màn hình chiếu, chỉ xem/export sau
}

model Topic {
  id                String      @id @default(uuid())
  ownerId           String
  owner             User        @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  title             String
  description       String?
  code              String      @unique   // mã tham gia, vd "AB12CD"
  status            TopicStatus @default(DRAFT)
  currentQuestionId String?     @unique   // câu hỏi đang chiếu
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  questions         Question[]

  @@index([ownerId])
}

model Question {
  id        String         @id @default(uuid())
  topicId   String
  topic     Topic          @relation(fields: [topicId], references: [id], onDelete: Cascade)
  order     Int            // thứ tự hiển thị, bắt đầu từ 1
  prompt    String         // nội dung câu hỏi
  status    QuestionStatus @default(DRAFT)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  // ==== Cấu hình (mỗi câu hỏi cấu hình riêng) — bám theo panel Edit của Mentimeter ====
  type QuestionType @default(WORD_CLOUD)

  // --- Response settings ---
  responseLimit Int?                          // null = KHÔNG GIỚI HẠN; có giá trị = số lượt tối đa/thiết bị
  maxWordLength Int     @default(40)          // độ dài tối đa 1 từ/cụm từ
  allowDuplicateFromSameUser Boolean @default(false) // 1 người gửi trùng từ có tính 2 lượt không

  // --- Design ---
  backgroundColor   String  @default("#FFFFFF")
  textColorScheme   String  @default("default") // tên bảng màu chữ dùng cho word cloud
  showLogo          Boolean @default(true)
  maxWordsDisplayed Int     @default(50)        // số từ hiển thị tối đa trên word cloud

  // --- Joining instructions ---
  showJoiningInfo Boolean         @default(true)
  joiningInfoType JoiningInfoType @default(QR_CODE)

  // --- Show responses ---
  resultVisibility ResultVisibility @default(INSTANT)
  resultsRevealed  Boolean @default(false)      // dùng cho ON_CLICK: presenter đã bấm hiện chưa
  showResultsToAudience Boolean @default(false) // (thêm ngoài Mentimeter) khán giả xem kết quả trên điện thoại

  responses      Response[]
  wordAggregates WordAggregate[]

  @@unique([topicId, order])
  @@index([topicId])
}

model Response {
  id                   String   @id @default(uuid())
  questionId           String
  question             Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  rawText              String              // nguyên văn người dùng gõ
  normalizedText       String              // đã chuẩn hoá theo mục 6
  participantSessionId String              // UUID sinh ở client, lưu localStorage
  createdAt            DateTime @default(now())

  @@index([questionId, participantSessionId])
}

model WordAggregate {
  id             String   @id @default(uuid())
  questionId     String
  question       Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  normalizedText String
  displayText    String   // giữ bản gõ đầu tiên để hiển thị
  count          Int      @default(1)

  @@unique([questionId, normalizedText])
  @@index([questionId, count])
}
```

### 5.3 Logic giới hạn lượt trả lời (quan trọng)

- `responseLimit = null` → **không giới hạn**, khán giả gửi bao nhiêu từ cũng được.
- `responseLimit = N` (N ≥ 1) → mỗi `participantSessionId` gửi tối đa N từ cho câu hỏi đó.
- `allowDuplicateFromSameUser = false` → nếu người đó đã gửi từ có cùng `normalizedText` cho câu hỏi này rồi thì từ chối (trả 409), không tăng count.
- Trên UI cấu hình: dùng Switch "Giới hạn số lượt trả lời" — bật lên mới hiện ô nhập số (InputNumber, min 1). Tắt đi thì lưu `null`.
- Trên UI khán giả: nếu có giới hạn thì hiện "Đã gửi 2/3 từ"; nếu không giới hạn thì hiện "Đã gửi 5 từ" và form luôn mở.
- Vẫn giữ rate limit theo IP ở backend kể cả khi không giới hạn lượt, để chống spam tự động.

### 5.4 Logic hiển thị kết quả (`resultVisibility`)

- `INSTANT` — word cloud cập nhật ngay trên màn hình chiếu mỗi khi có câu trả lời mới.
- `ON_CLICK` — trong lúc thu thập, màn hình chiếu chỉ hiện **bộ đếm số câu trả lời đã nhận**, không hiện từ nào. Presenter bấm "Hiện kết quả" → set `resultsRevealed = true` → emit socket `results:revealed` → word cloud hiện ra kèm animation. Mục đích: tránh khán giả trả lời sau bị ảnh hưởng bởi câu trả lời của người trước.
- `PRIVATE` — không hiện word cloud trên màn hình chiếu trong suốt buổi; presenter chỉ xem ở bảng thống kê/export sau.
- Presenter chuyển câu hỏi khác rồi quay lại: `resultsRevealed` giữ nguyên giá trị đã lưu.

### 5.5 Chức năng "Apply to all"

Hai nhóm **Joining instructions** và **Show responses** trong panel Edit có link "Apply to all" — áp dụng cấu hình của câu hỏi hiện tại cho **tất cả câu hỏi trong cùng topic**. Implement bằng endpoint riêng (mục 7), không gọi PATCH lặp ở frontend. Sau khi áp dụng, hiện message xác nhận số câu hỏi đã cập nhật.

### 5.6 Phạm vi CHƯA làm ở phiên bản này

Panel Mentimeter có **Content image** và **Background image** (upload ảnh). Phần này cần hạ tầng lưu trữ file (S3/Cloudinary/local volume) + resize + CDN — một khối công việc riêng đáng kể. **Không implement ở giai đoạn 0-7.** Nếu cần thì tách thành giai đoạn 8. Trong UI để 2 dòng này ở trạng thái disabled kèm tooltip "Sắp có".

## 6. Quy tắc chuẩn hoá từ (implement chính xác — dùng để gộp từ trùng)

1. Trim khoảng trắng đầu/cuối; gộp nhiều khoảng trắng liên tiếp thành 1.
2. Chuyển toàn bộ về chữ thường.
3. Bỏ dấu câu (`. , ! ? " ' ; :` ...).
4. **GIỮ NGUYÊN dấu tiếng Việt** — "sáng tạo" và "sang tao" là 2 từ khác nhau. Không tự ý bỏ dấu.
5. Giới hạn độ dài theo `Question.maxWordLength`. Sanitize để chặn HTML/script injection.
6. Nếu sau chuẩn hoá còn chuỗi rỗng → trả 400, không lưu.

Viết thành util riêng (`normalizeWord`) có unit test đầy đủ — đây là logic cốt lõi của tính năng đếm trùng.

## 7. API endpoints

**Auth**
- `GET  /api/auth/google` · `GET /api/auth/google/callback` · `GET /api/auth/session` · `POST /api/auth/logout`

**Topic (cần đăng nhập, chỉ owner)**
- `POST   /api/topics` — tạo topic, trả `{ id, code }`
- `GET    /api/topics` — danh sách topic của user
- `GET    /api/topics/:id` — chi tiết, kèm danh sách questions
- `PATCH  /api/topics/:id` — **sửa** title/description/status
- `DELETE /api/topics/:id`
- `GET    /api/topics/:id/qrcode` — QR trỏ tới `{FRONTEND_URL}/join/{code}`
- `POST   /api/topics/:id/current-question` — body `{ questionId }`, đặt câu hỏi đang chiếu, emit `question:changed`

**Question (cần đăng nhập, chỉ owner của topic cha)**
- `POST   /api/topics/:topicId/questions` — tạo câu hỏi mới (tự gán `order` = max + 1)
- `GET    /api/topics/:topicId/questions` — danh sách theo `order`
- `GET    /api/questions/:id` — chi tiết + config
- `PATCH  /api/questions/:id` — **sửa** prompt, status, và toàn bộ config word cloud ở mục 5
- `DELETE /api/questions/:id` — xoá, tự sắp lại `order` các câu còn lại
- `PATCH  /api/topics/:topicId/questions/reorder` — body `{ orderedIds: string[] }`, sắp xếp lại thứ tự
- `POST   /api/questions/:id/duplicate` — nhân bản 1 câu hỏi kèm config
- `POST   /api/questions/:id/apply-settings-to-all` — body `{ groups: ("joining" | "showResponses")[] }`, copy cấu hình nhóm đó sang mọi câu hỏi khác cùng topic; trả về số câu hỏi đã cập nhật
- `POST   /api/questions/:id/reveal-results` — dùng cho `resultVisibility = ON_CLICK`: set `resultsRevealed = true` và emit `results:revealed`
- `GET    /api/questions/:id/wordcloud` — `{ words: [{displayText, count}] sort desc, totalResponses, uniqueWords }`
- `DELETE /api/questions/:id/responses` — xoá toàn bộ câu trả lời của câu hỏi (reset để chạy lại)

**Public (không cần đăng nhập)**
- `GET  /api/public/topics/:code` — `{ topicTitle, status, currentQuestion: { id, prompt, config, myResponseCount } }`
- `POST /api/public/questions/:questionId/responses` — body `{ text, participantSessionId }`
  - 409 nếu question không ACTIVE, hoặc gửi trùng từ khi `allowDuplicateFromSameUser = false`
  - 429 nếu đã đạt `responseLimit` (bỏ qua check này khi `responseLimit = null`)

**WebSocket**
- Namespace `/presenter` (cần JWT): join room `topic:{topicId}` — chỉ owner
- Namespace `/audience` (public): join room `topic:{topicId}` bằng `code`, chỉ nhận event
- Events: `wordcloud:update`, `question:changed`, `results:revealed`, `topic:closed`

## 8. Các trang giao diện

| Route | Mô tả | Auth |
|---|---|---|
| `/login` | Nút "Đăng nhập với Google" | Public |
| `/dashboard` | Danh sách topic + nút tạo mới | Cần login |
| `/topics/[id]/edit` | **Trang soạn thảo chính** (xem mục 8.1) | Owner |
| `/topics/[id]/present` | **Màn hình chiếu**: câu hỏi hiện tại, QR, word cloud realtime, bảng thống kê, nút chuyển câu | Owner |
| `/join/[code]` | Trang khán giả, mobile-first, tự chuyển theo câu hỏi presenter đang chiếu | Public |

### 8.1 Trang soạn thảo `/topics/[id]/edit` — bám theo ảnh tham chiếu Mentimeter

Bố cục 3 vùng: **sidebar danh sách câu hỏi (trái, hẹp)** — **canvas preview (giữa, chiếm phần lớn)** — **panel Edit (phải, ~340px, đóng/mở được)**.

```
┌──────────┬───────────────────────────────────┬────────────────────────┐
│ 1. Câu A │                        [Logo]     │ Edit               [×] │
│ 2. Câu B │  Your Word Cloud question here    │                        │
│ 3. Câu C │  ↑ sửa inline, cỡ chữ lớn         │ Question               │
│          │                                   │  [▾ Word Cloud      ]  │
│ [+ Thêm] │  ┌─────────────────────────────┐  │ ────────────────────── │
│          │  │                             │  │ Response settings      │
│ (kéo thả │  │    fast   bold              │  │  Số lượt trả lời       │
│  đổi thứ │  │  creative                   │  │   [Switch giới hạn]    │
│  tự)     │  │    leader  focus            │  │   [InputNumber  3 ⇅]   │
│          │  │      transpiration          │  │  Độ dài tối đa từ [40] │
│          │  │   ↑ preview dữ liệu mẫu     │  │  [Switch] Cho gửi trùng│
│          │  └─────────────────────────────┘  │ ────────────────────── │
│          │                                   │ Design                 │
│          │                          [QR] ⌐   │  Content image   (mờ)  │
│          │                                   │  Background image(mờ)  │
│          │                                   │  Background color  ⬤   │
│          │                                   │  Màu chữ word cloud ⬤  │
│          │                                   │  Show logo    [Switch] │
│          │                                   │  Số từ hiển thị  [50]  │
│          │                                   │  Khôi phục màu mặc định│
│          │                                   │ ────────────────────── │
│          │                                   │ Joining instructions   │
│          │                                   │            [Apply all] │
│          │                                   │  Hiện thông tin tham   │
│          │                                   │   gia         [Switch] │
│          │                                   │  Kiểu  [▾ QR code   ]  │
│          │                                   │ ────────────────────── │
│          │                                   │ Show responses         │
│          │                                   │            [Apply all] │
│          │                                   │  ◉ Hiện ngay           │
│          │                                   │  ○ Hiện khi bấm ⭐KN    │
│          │                                   │  ○ Không hiện          │
└──────────┴───────────────────────────────────┴────────────────────────┘
```

**Sidebar trái**
- Danh sách câu hỏi theo `order`, item đang chọn highlight.
- Kéo thả đổi thứ tự (`@dnd-kit/sortable`) → gọi `PATCH .../questions/reorder` khi thả.
- Menu ngữ cảnh mỗi item: Nhân bản / Xoá (Modal confirm khi xoá).
- Nút "+ Thêm câu hỏi" ở cuối.

**Canvas giữa**
- Nội dung câu hỏi sửa **inline ngay trên canvas** (không phải trong panel phải), cỡ chữ lớn, placeholder "Nhập câu hỏi Word Cloud của bạn".
- Bên dưới là khung preview word cloud với **dữ liệu mẫu cứng** (vd: sáng tạo, dẫn dắt, tập trung, nhiệt huyết, đổi mới) để presenter hình dung bố cục — không gọi API.
- Preview phản ánh ngay các thay đổi ở panel phải: `backgroundColor`, màu chữ, `showLogo`, `maxWordsDisplayed`.
- Logo góc trên phải canvas (ẩn/hiện theo `showLogo`).
- Nút QR nhỏ góc dưới phải canvas → mở popup xem trước QR + mã tham gia.

**Panel Edit phải** — đúng 4 nhóm, đúng thứ tự trên:

1. **Question** — Select loại câu hỏi. Hiện chỉ có "Word Cloud", để sẵn cho mở rộng.
2. **Response settings**
  - Switch "Giới hạn số lượt trả lời" — **BẬT** mới hiện InputNumber (min 1, mặc định 3); **TẮT** → gửi `responseLimit: null`. Đây là điểm khác Mentimeter (họ bắt buộc phải có số) và là yêu cầu quan trọng, làm đúng.
  - InputNumber "Độ dài tối đa mỗi từ" (`maxWordLength`).
  - Switch "Cho phép 1 người gửi trùng từ".
3. **Design**
  - "Content image" và "Background image": để **disabled** kèm tooltip "Sắp có" (xem mục 5.6).
  - ColorPicker "Màu nền" (`backgroundColor`).
  - Select "Bảng màu chữ" (`textColorScheme`) — cung cấp sẵn 3-4 preset.
  - Switch "Hiện logo" (`showLogo`).
  - InputNumber "Số từ hiển thị tối đa" (`maxWordsDisplayed`).
  - Link "Khôi phục màu mặc định" — reset `backgroundColor` + `textColorScheme` về giá trị default.
4. **Joining instructions** — có link "Áp dụng cho tất cả" ở góc phải tiêu đề nhóm
  - Switch "Hiện thông tin tham gia" (`showJoiningInfo`).
  - Select "Kiểu hiển thị" (`joiningInfoType`): QR code / Đường link / Mã tham gia.
5. **Show responses** — có link "Áp dụng cho tất cả"
  - Radio.Group (`resultVisibility`): "Hiện ngay" / "Hiện khi bấm" (gắn Tag "Khuyến nghị") / "Không hiện".

**Hành vi chung của panel**
- **Auto-save debounce 800ms**, không có nút Save. Chỉ báo trạng thái nhỏ ở đầu panel: "Đang lưu…" / "Đã lưu lúc HH:mm".
- Nút × đóng panel để canvas rộng ra; có nút mở lại.
- Link "Áp dụng cho tất cả" → gọi `POST /api/questions/:id/apply-settings-to-all` với `groups` tương ứng, sau đó `message.success("Đã áp dụng cho N câu hỏi")`.
- Header trang: sửa title/description topic, nút "Trình chiếu" → mở `/topics/[id]/present`.
- Responsive: dưới 1200px, panel phải chuyển thành Drawer mở bằng nút "Cấu hình"; sidebar trái thu thành dropdown chọn câu hỏi.

## 9. Checklist nghiệm thu

- [ ] Đăng nhập Google hoạt động, session giữ được sau reload
- [ ] Tạo topic → thêm được **nhiều câu hỏi** → sắp xếp lại thứ tự bằng kéo thả
- [ ] **Sửa** được title/description topic và prompt/config của từng câu hỏi; auto-save chạy đúng
- [ ] Quét QR bằng điện thoại thật → mở đúng `/join/[code]`, thấy câu hỏi đang active
- [ ] Presenter bấm chuyển câu → điện thoại khán giả **tự chuyển**, không cần quét lại
- [ ] Word cloud trên màn hình chiếu cập nhật **trong vòng 1 giây**, không cần F5
- [ ] Từ giống nhau sau chuẩn hoá gộp đúng, `count` tăng chính xác (có unit test `normalizeWord`)
- [ ] `responseLimit = null` → gửi không giới hạn; `responseLimit = 3` → chặn ở lượt thứ 4
- [ ] `allowDuplicateFromSameUser = false` → chặn gửi trùng từ từ cùng thiết bị
- [ ] `resultVisibility = ON_CLICK` → màn hình chiếu chỉ hiện bộ đếm cho tới khi presenter bấm "Hiện kết quả"
- [ ] `resultVisibility = PRIVATE` → không hiện word cloud trên màn hình chiếu
- [ ] "Áp dụng cho tất cả" cập nhật đúng mọi câu hỏi trong topic, báo đúng số lượng
- [ ] Đổi màu nền / bảng màu chữ / ẩn logo trong panel → preview trên canvas đổi theo ngay
- [ ] Auto-save chạy đúng, không mất dữ liệu khi chuyển nhanh giữa các câu hỏi
- [ ] Question CLOSED → không gửi được nữa
- [ ] Xoá câu hỏi → `order` các câu còn lại tự sắp lại liên tục, không thủng số
- [ ] Rút mạng → frontend chuyển polling; kết nối lại thì tự đồng bộ
- [ ] User A không xem/sửa được topic của user B

## 10. PROMPT theo từng giai đoạn (gõ vào Claude Code)

> **Chỉ dùng mục 10 nếu bắt đầu từ repo trống.** Nếu bạn đã build theo phiên bản cũ (1 câu hỏi/topic), BỎ QUA mục 10 và dùng **mục 12 — Phụ lục Migration**.
>
> Mỗi giai đoạn là 1 phiên làm việc riêng. Luôn để Claude Code lập kế hoạch trước (Plan Mode), duyệt kế hoạch, rồi mới cho thực thi. Commit git sau mỗi giai đoạn xanh.

### Giai đoạn 0 — Khởi tạo monorepo

```
Đọc CLAUDE.md. Vào Plan Mode và đề xuất kế hoạch cho Giai đoạn 0, chưa sửa file.

Mục tiêu: khởi tạo monorepo gồm
- /frontend: Next.js 14 App Router + TypeScript + Ant Design
- /backend: NestJS + TypeScript + Prisma + PostgreSQL

Bao gồm:
1. ESLint + Prettier cho cả 2 project, config thống nhất.
2. Prisma schema đúng y hệt mục 5 trong CLAUDE.md + migration đầu tiên.
3. docker-compose.yml chạy PostgreSQL local cho dev.
4. .env.example cho từng project, liệt kê đầy đủ biến môi trường.
5. README.md ghi rõ các lệnh chạy dev.

Sau khi tôi duyệt plan và bạn thực thi xong: chạy docker compose up -d,
chạy migration, build cả 2 project để xác nhận không lỗi, rồi báo lại kết quả.
```

### Giai đoạn 1 — Auth Google

```
Đọc CLAUDE.md mục 2, 7 (Auth), 8. Lập kế hoạch trước.

Implement đăng nhập Google:
- Backend: Passport Google Strategy, JWT lưu cookie httpOnly, các endpoint auth ở mục 7.
- Frontend: trang /login, login xong redirect /dashboard.
- Middleware bảo vệ /dashboard, /topics/*; /join/[code] luôn public.
- Khán giả KHÔNG cần đăng nhập.

Xong thì liệt kê các bước thủ công tôi cần làm (tạo OAuth Client ID trên Google
Cloud Console, redirect URI cần khai báo, biến env cần điền).
Chạy build + test, tự sửa nếu lỗi.
```

### Giai đoạn 2 — CRUD Topic + Question + QR

```
Đọc CLAUDE.md mục 3, 5, 7 (Topic + Question), 8. Lập kế hoạch trước.

Implement backend:
- Toàn bộ endpoint /api/topics và /api/topics/:topicId/questions ở mục 7,
  bao gồm PATCH (sửa), DELETE, reorder, duplicate.
- Guard: chỉ owner thao tác được topic/question của mình.
  Viết test cho case user A truy cập topic của user B → 403.
- `code` topic: 6 ký tự chữ hoa + số, ngẫu nhiên, retry nếu trùng.
- Khi tạo Question: tự gán order = max(order trong topic) + 1.
- Khi xoá Question: sắp lại order các câu còn lại cho liên tục (1,2,3...).
- Khi PATCH responseLimit: chấp nhận null (không giới hạn) và số nguyên >= 1.
  Validate rõ ràng, có test cho cả 2 trường hợp.

Frontend:
- /dashboard: Table danh sách topic + Modal tạo mới.
- Chưa làm giao diện soạn thảo ở giai đoạn này, chỉ cần API chạy đúng.

Chạy build + test, tự sửa nếu lỗi.
```

### Giai đoạn 3 — Trang soạn thảo (canvas + panel Edit)

```
Đọc CLAUDE.md mục 5 (model Question + config), 5.4, 5.5, 5.6 và mục 8.1.
Mục 8.1 mô tả bố cục bám theo Mentimeter — LÀM ĐÚNG theo mô tả đó,
đúng 5 nhóm trong panel Edit và đúng thứ tự. Lập kế hoạch trước.

Implement /topics/[id]/edit:

1. Sidebar trái: danh sách câu hỏi, kéo thả đổi thứ tự bằng @dnd-kit/sortable
   (gọi PATCH reorder khi thả), menu nhân bản/xoá có confirm, nút "+ Thêm câu hỏi".

2. Canvas giữa: sửa nội dung câu hỏi INLINE ngay trên canvas (không đặt trong panel phải),
   bên dưới là preview word cloud dùng dữ liệu mẫu cứng tiếng Việt (không gọi API).
   Preview phải phản ánh NGAY khi đổi backgroundColor, bảng màu chữ, showLogo,
   maxWordsDisplayed ở panel phải. Nút QR góc dưới phải mở popup xem trước.

3. Panel Edit phải (~340px, đóng/mở được) đúng 5 nhóm ở mục 8.1:
   Question / Response settings / Design / Joining instructions / Show responses.
   Lưu ý bắt buộc:
   - Switch "Giới hạn số lượt trả lời": BẬT mới hiện InputNumber; TẮT thì gửi
     responseLimit = null lên API. Đây là yêu cầu quan trọng nhất của nhóm này.
   - "Content image" và "Background image" để DISABLED kèm tooltip "Sắp có" (mục 5.6),
     KHÔNG implement upload ảnh ở giai đoạn này.
   - Hai nhóm Joining instructions và Show responses có link "Áp dụng cho tất cả"
     gọi POST /api/questions/:id/apply-settings-to-all rồi báo số câu hỏi đã cập nhật.

4. Auto-save debounce 800ms, không có nút Save. Chỉ báo "Đang lưu…" / "Đã lưu lúc HH:mm".
   Chú ý race condition: khi tôi chuyển nhanh sang câu hỏi khác trước lúc debounce chạy,
   phải flush thay đổi của câu cũ trước, không được ghi nhầm sang câu mới. Viết test cho case này.

5. Header: sửa title/description topic, nút "Trình chiếu".

Responsive: dưới 1200px panel phải thành Drawer, sidebar trái thành dropdown chọn câu hỏi.
Chạy build + lint + test, tự sửa nếu lỗi.
```

### Giai đoạn 4 — Trang khán giả + logic chuẩn hoá & giới hạn

```
Đọc CLAUDE.md mục 5.3, 6, 7 (Public), 8. Lập kế hoạch trước.

Backend:
- Util normalizeWord theo ĐÚNG 6 quy tắc mục 6. Viết unit test TRƯỚC,
  đặc biệt case tiếng Việt có dấu, khoảng trắng thừa, dấu câu, chuỗi rỗng, vượt maxWordLength.
- GET /api/public/topics/:code (trả câu hỏi đang active + myResponseCount theo sessionId)
- POST /api/public/questions/:questionId/responses:
  validate → chuẩn hoá → kiểm tra status ACTIVE → kiểm tra giới hạn theo mục 5.3
  (BỎ QUA check giới hạn khi responseLimit = null) → kiểm tra trùng nếu
  allowDuplicateFromSameUser = false → transaction INSERT Response + UPSERT WordAggregate.
  Rate limit theo IP kể cả khi không giới hạn lượt.
- Viết test riêng cho 3 case: không giới hạn / giới hạn 3 lượt / chặn trùng từ.

Frontend /join/[code]:
- Mobile-first, test viewport 375px.
- participantSessionId sinh bằng crypto.randomUUID(), lưu localStorage theo topic code.
- Hiển thị "Đã gửi X/N từ" khi có giới hạn, "Đã gửi X từ" khi không giới hạn.
- Disable form khi hết lượt hoặc question đã CLOSED.
- Nếu showResultsToAudience = true thì hiện word cloud thu nhỏ bên dưới form.

Chạy toàn bộ test, tự sửa nếu lỗi.
```

### Giai đoạn 5 — Realtime Socket.IO + màn hình chiếu

```
Đọc CLAUDE.md mục 4 — LÀM ĐÚNG PATTERN NÀY, không tự đổi sang giải pháp khác
(không Firebase, không SSE, không lấy polling làm cơ chế chính). Lập kế hoạch trước.

Backend:
- Cài @nestjs/websockets + @nestjs/platform-socket.io.
- Namespace /presenter (JWT, chỉ owner join được room topic:{topicId}).
- Namespace /audience (public, join bằng code, CHỈ NHẬN, không được emit dữ liệu).
- Emit wordcloud:update sau khi response commit thành công.
  Nếu resultVisibility = PRIVATE, hoặc ON_CLICK mà resultsRevealed = false,
  thì payload CHỈ gửi totalResponses, KHÔNG gửi danh sách từ — chặn ở server,
  không dựa vào frontend tự ẩn.
- POST /api/questions/:id/reveal-results → set resultsRevealed = true, emit results:revealed
  kèm payload word cloud đầy đủ.
- POST /api/topics/:id/current-question → cập nhật currentQuestionId → emit question:changed.

Frontend:
- /topics/[id]/present: câu hỏi hiện tại cỡ lớn, word cloud realtime
  (d3-cloud, cỡ chữ tỉ lệ count, animation framer-motion khi có từ mới),
  nút Trước/Sau chuyển câu hỏi, nút Đóng câu hỏi, badge trạng thái kết nối.
  - Áp dụng đúng config của câu hỏi: backgroundColor, bảng màu chữ, showLogo,
    maxWordsDisplayed.
  - Thông tin tham gia hiển thị theo showJoiningInfo + joiningInfoType
    (QR code / link / mã), ẩn hoàn toàn nếu showJoiningInfo = false.
  - resultVisibility theo mục 5.4: INSTANT hiện ngay; ON_CLICK chỉ hiện bộ đếm
    số câu trả lời kèm nút "Hiện kết quả" (gọi POST reveal-results, nghe event
    results:revealed rồi mới render word cloud); PRIVATE không hiện word cloud.
- /join/[code]: lắng nghe question:changed → tự chuyển sang câu hỏi mới,
  reset bộ đếm lượt, hiện thông báo ngắn "Đã chuyển sang câu hỏi mới".
- Cả 2 trang: fetch snapshot trước, RỒI MỚI connect socket.
  Fallback polling khi mất kết nối > 5s theo mục 4.

Chạy build + test. Sau đó hướng dẫn tôi cách test thủ công bằng 2 tab trình duyệt.
```

### Giai đoạn 6 — Bảng thống kê

```
Đọc CLAUDE.md mục 7, 9. Lập kế hoạch trước.

Trên /topics/[id]/present, thêm bảng thống kê song song word cloud:
- Ant Design Table: cột Từ / Số lượt / Tỉ lệ %, sort giảm dần theo count.
- Hiển thị tổng số câu trả lời và số từ khác nhau.
- Nút toggle ẩn/hiện bảng (khi chiếu màn hình lớn có thể muốn ẩn).
- Cập nhật realtime từ cùng event wordcloud:update, KHÔNG gọi thêm API.
- Nút export CSV.
- Nút "Xoá toàn bộ câu trả lời của câu hỏi này" (gọi DELETE /api/questions/:id/responses,
  có Modal confirm, sau đó emit wordcloud:update với dữ liệu rỗng).

Chạy build + test, tự sửa nếu lỗi.
```

### Giai đoạn 7 — Polish + rà soát

```
Đọc lại toàn bộ CLAUDE.md, đặc biệt checklist mục 9. Lập kế hoạch trước.

1. Rà từng mục checklist mục 9, báo cáo mục nào đạt / chưa đạt.
2. Loading state + error state cho mọi API call.
3. Empty state: topic chưa có câu hỏi, câu hỏi chưa có câu trả lời.
4. Kiểm tra /join/[code] ở viewport 375px.
5. Rà bảo mật: XSS từ input khán giả, rate limit, phân quyền owner ở cả REST
   lẫn WebSocket, secret có bị log ra không.

KHÔNG thêm tính năng mới ngoài phạm vi file này.
```

## 11. Quy ước làm việc cho Claude Code

- Luôn dùng Plan Mode cho việc đụng từ 3 file trở lên; tôi duyệt plan rồi mới thực thi.
- Sau mỗi giai đoạn: tự chạy build + test, tự sửa lỗi, rồi báo cáo tóm tắt ngắn gọn.
- Không thêm dependency ngoài danh sách mục 2 nếu chưa hỏi tôi.
- Không thêm tính năng ngoài phạm vi file này.
- Code comment và commit message viết bằng tiếng Anh; giải thích cho tôi bằng tiếng Việt.
- Không commit file `.env`, không hardcode secret trong source.

---

## 12. Phụ lục — Migration từ phiên bản cũ (1 câu hỏi/topic)

Áp dụng khi repo đã có: monorepo, auth Google, Topic CRUD + QR, trang `/vote/[code]`, Socket.IO realtime, bảng thống kê — tức mọi thứ **trừ** model `Question`, trang soạn thảo và các cấu hình mới.

### Cái gì giữ, cái gì đổi

| Thành phần | Xử lý |
|---|---|
| Monorepo, ESLint, docker-compose, auth Google | **Giữ nguyên** |
| `normalizeWord` + unit test | **Giữ nguyên** — quy tắc chuẩn hoá không đổi |
| Topic CRUD, sinh `code`, QR | Giữ, **mở rộng** thêm `currentQuestionId` |
| `Response`, `WordAggregate` | **Đổi khoá ngoại** từ `topicId` sang `questionId` |
| `Topic.maxWordsPerUser` | **Chuyển** thành `Question.responseLimit` — cùng kiểu `Int?`, cùng ngữ nghĩa `null` = không giới hạn, chỉ đổi tên và đổi chỗ gắn. Logic xử lý nhánh `null` ở backend **giữ nguyên**, chỉ đổi nguồn đọc từ `topic` sang `question` |
| Socket.IO gateway | Giữ, **thêm** namespace `/audience` và các event mới |
| Route `/vote/[code]` | **Đổi tên** thành `/join/[code]` |
| Route `/topics/[id]` | **Tách đôi** thành `/topics/[id]/edit` và `/topics/[id]/present` |
| Trang soạn thảo (mục 8.1) | **Làm mới hoàn toàn** — khối việc lớn nhất |

### Chuẩn bị trước khi bắt đầu

```bash
git checkout -b feat/multi-question
git add -A && git commit -m "checkpoint before multi-question refactor"
```

Ghi đè `CLAUDE.md` bằng bản mới, commit riêng, rồi `/clear` phiên Claude Code (hoặc thoát và chạy lại `claude`) để nó nạp lại spec.

### M0 — Đối chiếu, chưa sửa gì

```
CLAUDE.md vừa được cập nhật với thay đổi lớn về data model và giao diện.
Đọc lại TOÀN BỘ file, đặc biệt mục 5 (Prisma schema), 5.3-5.6, 7 (API), 8, 8.1.

Chưa sửa bất kỳ file nào. Việc của bạn lúc này là ĐỐI CHIẾU và báo cáo:
1. Schema hiện tại trong prisma/schema.prisma khác mục 5 ở những điểm nào.
2. Liệt kê MỌI file backend đang tham chiếu Topic.responses, Topic.wordAggregates,
   hoặc Topic.maxWordsPerUser.
3. Liệt kê MỌI file frontend đang gọi các endpoint sẽ bị đổi
   (/api/topics/:id/wordcloud, /api/public/topics/:code/responses).
4. Ước lượng khối lượng: file nào sửa nhẹ, file nào phải viết lại.

Trình bày dạng bảng ngắn gọn. Tôi sẽ duyệt rồi mới cho bạn làm tiếp.
```

### M1 — Schema + migration

```
Đọc CLAUDE.md mục 5. Lập kế hoạch trước.

Cập nhật prisma/schema.prisma khớp ĐÚNG mục 5: thêm model Question và các enum
QuestionType, JoiningInfoType, ResultVisibility; chuyển Response và WordAggregate
từ topicId sang questionId; thêm Topic.currentQuestionId; bỏ Topic.maxWordsPerUser.

Lưu ý: Topic.maxWordsPerUser hiện đã là Int? (nullable). Khi chuyển sang
Question.responseLimit thì giữ nguyên kiểu và ngữ nghĩa, chỉ đổi tên + đổi chỗ gắn.

Về dữ liệu: DB hiện chỉ có dữ liệu test, TÔI KHÔNG CẦN GIỮ.
Cứ prisma migrate reset cho gọn, đừng viết script bảo toàn dữ liệu.

Sau đó tạo seed script tạo sẵn 1 topic mẫu có 3 câu hỏi với cấu hình khác nhau
(1 câu không giới hạn lượt, 1 câu giới hạn 3 lượt, 1 câu resultVisibility = ON_CLICK)
để tôi test nhanh ở các bước sau.

Chạy migrate + seed, xác nhận không lỗi.
```

> Nếu DB của bạn **có** dữ liệu thật cần giữ, thay đoạn "cứ reset" bằng: *"DB có dữ liệu thật cần giữ. Viết migration tạo 1 Question mặc định cho mỗi Topic đang tồn tại, gán toàn bộ Response/WordAggregate của Topic đó sang Question này, copy maxWordsPerUser sang responseLimit."*

### M2 — Backend: Question module + sửa các chỗ vỡ

```
Đọc CLAUDE.md mục 5.3, 5.4, 5.5, 7. Lập kế hoạch trước.

1. Tạo QuestionModule: đầy đủ endpoint /api/topics/:topicId/questions và /api/questions/:id
   ở mục 7, gồm PATCH, DELETE (sắp lại order liên tục), reorder, duplicate,
   apply-settings-to-all, reveal-results, wordcloud, xoá responses.
2. Sửa TopicModule: bỏ maxWordsPerUser, thêm POST /api/topics/:id/current-question.
3. Sửa endpoint public: GET /api/public/topics/:code trả câu hỏi đang active kèm
   myResponseCount; POST chuyển sang /api/public/questions/:questionId/responses.
4. Guard phân quyền cho Question: kiểm tra qua topic cha, chỉ owner thao tác được.
5. responseLimit: repo hiện đã có logic maxWordsPerUser nullable chạy đúng —
   TÁI SỬ DỤNG logic đó, chỉ đổi tên trường và đổi nguồn đọc từ topic sang question.
   Đừng viết lại từ đầu. Test hiện có cho nhánh null cũng chuyển sang chứ đừng bỏ.
   Bổ sung test mới cho case chặn trùng từ khi allowDuplicateFromSameUser = false.

GIỮ NGUYÊN util normalizeWord và test của nó — quy tắc chuẩn hoá không đổi.
Chạy toàn bộ test, tự sửa mọi chỗ vỡ do đổi khoá ngoại.
```

### M3 — Socket.IO: mở rộng

```
Đọc CLAUDE.md mục 4 và 5.4. Lập kế hoạch trước.

Mở rộng gateway hiện có (KHÔNG viết lại từ đầu):
1. Thêm namespace /audience (public, join bằng code, CHỈ NHẬN, không được emit dữ liệu).
   Giữ namespace /presenter đang có, bổ sung kiểm tra owner khi join room.
2. Thêm event question:changed (khi presenter đổi câu hỏi) và results:revealed.
3. wordcloud:update: payload thêm questionId.
4. QUAN TRỌNG — chặn ở SERVER: nếu resultVisibility = PRIVATE, hoặc = ON_CLICK mà
   resultsRevealed = false, thì payload CHỈ chứa totalResponses, KHÔNG chứa danh sách từ.
   Không được dựa vào frontend tự ẩn. Viết test cho đúng điểm này.

Chạy build + test.
```

### M4 — Đổi cấu trúc route frontend

```
Đọc CLAUDE.md mục 8. Lập kế hoạch trước.

Refactor route, chưa làm tính năng mới:
1. Đổi /vote/[code] thành /join/[code], cập nhật URL trong phần sinh QR ở backend.
2. Tách /topics/[id] hiện tại thành:
   - /topics/[id]/present — chuyển toàn bộ phần màn hình chiếu + word cloud + bảng
     thống kê đang có sang đây, sửa để gọi API theo questionId thay vì topicId.
   - /topics/[id]/edit — TẠM THỜI để trang trống có tiêu đề, sẽ làm ở M5.
3. /dashboard: nút mở topic trỏ vào /topics/[id]/edit.
4. Sửa mọi API call frontend theo endpoint mới ở mục 7.

Mục tiêu M4: app chạy lại được như cũ trên cấu trúc route mới, chưa cần tính năng mới.
Chạy build, tự sửa lỗi TypeScript. Sau đó liệt kê chỗ nào còn chưa thông.
```

### M5 — Trang soạn thảo (khối việc lớn nhất)

```
Dùng nguyên prompt "Giai đoạn 3" ở mục 10 của CLAUDE.md.
```

> M5 nặng nhất và đụng nhiều file. Nếu plan Claude Code đưa ra quá dài, tách làm 2 lượt: lượt 1 làm sidebar + canvas + preview; lượt 2 làm panel Edit + auto-save + apply-to-all.

### M6 — Hoàn thiện màn hình chiếu

```
Đọc CLAUDE.md mục 5.4, 8.1, và phần "Frontend" của Giai đoạn 5 ở mục 10.
Lập kế hoạch trước.

Cập nhật /topics/[id]/present để áp dụng đầy đủ config của câu hỏi:
backgroundColor, bảng màu chữ, showLogo, maxWordsDisplayed,
showJoiningInfo + joiningInfoType, và 3 chế độ resultVisibility (mục 5.4)
gồm nút "Hiện kết quả" cho chế độ ON_CLICK.
Thêm nút Trước/Sau chuyển câu hỏi (gọi current-question, emit question:changed).

Cập nhật /join/[code]: lắng nghe question:changed để tự chuyển câu hỏi,
reset bộ đếm lượt, hiện thông báo ngắn. Hiển thị "Đã gửi X/N từ" khi có giới hạn,
"Đã gửi X từ" khi không giới hạn.

Chạy build + test, rồi hướng dẫn tôi test thủ công bằng 2 tab trình duyệt.
```

### M7 — Rà soát

```
Dùng nguyên prompt "Giai đoạn 7" ở mục 10 của CLAUDE.md,
kèm yêu cầu: rà thêm xem còn sót chỗ nào tham chiếu cấu trúc cũ
(topicId trong Response/WordAggregate, maxWordsPerUser, route /vote)
và xoá code chết còn lại sau refactor.
```
