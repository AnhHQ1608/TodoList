# Quản trị phiên truy cập và lịch sử hoạt động

## Trạng thái hiện tại

Backend đã triển khai tại `https://focus-list-activity.quocanh0918106.workers.dev`, database D1 đã tạo và secret quản trị đã cấu hình. Frontend kết nối bằng URL công khai trong `telemetry-config.js`. Chỉ thu thập sau khi khách đồng ý.

Trang quản trị: `https://anhhq1608.github.io/TodoList/admin.html`. Mật khẩu ban đầu được tạo ngẫu nhiên và lưu trong tệp riêng `%USERPROFILE%\.focus-list\admin-access.txt`, bên ngoài project/Git, chỉ tài khoản Windows hiện tại có quyền đọc. Không đưa tệp đó vào Git hoặc chia sẻ cho người khác. Nên chuyển mật khẩu vào trình quản lý mật khẩu. Không cần nhập tên đăng nhập, chỉ cần mật khẩu.

**Để ngừng ghi nhận:** đổi `apiUrl` thành `''` và push. GitHub Pages chỉ phục vụ frontend; push lên GitHub không tự triển khai Worker. Khi sửa `backend/worker.mjs`, cần chạy lại lệnh Wrangler deploy bên dưới. Các bước triển khai lần đầu dưới đây dùng khi chuyển sang tài khoản/database mới; không tạo lại database đang dùng.

Người dùng vẫn dùng TodoList không cần tài khoản. Mỗi trình duyệt có mã khách ngẫu nhiên, mỗi lần mở/tải trang có mã phiên mới. Đây không phải danh tính hoặc mã phần cứng thật. Chế độ ẩn danh, đổi trình duyệt hoặc xóa storage sẽ tạo khách khác.

## Dữ liệu được ghi nhận

- Khi người dùng đồng ý: mở trang; trang còn hoạt động (heartbeat khi tab hiện); thêm/sửa/xóa/hoàn thành/mở lại task; tạo/xóa thư mục; đợt tự dọn task hoàn thành.
- Chỉ gửi mã sự kiện, mã khách, mã phiên, tên thao tác và nhóm trình duyệt/hệ điều hành/thiết bị. Thời gian do máy chủ ghi nhận.
- Không gửi nội dung task, tên thư mục, deadline, phím gõ, ảnh màn hình, URL đang mở, mật khẩu hay tên người dùng.
- Không ghi IP gốc vào D1. IP hạ tầng cung cấp chỉ được băm HMAC theo cửa sổ thời gian để giới hạn tốc độ. Khóa chống spam hết hạn sẽ được dọn mỗi ngày. Nhà cung cấp hạ tầng có thể xử lý dữ liệu mạng theo chính sách riêng.
- Chỉ bắt đầu sau khi đồng ý; có thể tắt trong Cài đặt. Do Not Track / Global Privacy Control được tôn trọng. Từ chối không ảnh hưởng tính năng TodoList.
- Lịch sử cũ hết 30 ngày bị dọn hằng ngày, API không trả dữ liệu quá 30 ngày. Tắt chia sẻ dừng gửi sự kiện mới, không tự xóa lịch sử đã lưu trước đó.
- Lịch sử là dữ liệu do client tự khai báo, không phải bằng chứng kiểm toán hay bảo mật. Trình chặn quảng cáo, offline, quota hoặc giới hạn tốc độ có thể làm thiếu sự kiện. “Vừa hoạt động” nghĩa là nhận sự kiện trong 2 phút gần đây, không chứng minh thiết bị đang online.

## Triển khai lần đầu trên Cloudflare

Yêu cầu Node.js 22 trở lên và tài khoản Cloudflare có Workers/D1. Các lệnh chạy ở thư mục project bằng Terminal của VS Code. Dùng `npx.cmd` / `npm.cmd` trên Windows nếu PowerShell chặn script.

1. Đăng nhập bằng trình duyệt:

   ```powershell
   npx.cmd --yes wrangler@4.162.0 login
   ```

2. Tạo database:

   ```powershell
   npx.cmd --yes wrangler@4.162.0 d1 create focus-list-activity
   ```

   Chép `database_id` trả về vào `backend/wrangler.toml`, thay UUID toàn số 0. Giữ `ALLOWED_ORIGIN = "https://anhhq1608.github.io"` (origin không chứa `/TodoList/`). Không ghi API token hoặc mật khẩu vào file này.

3. Tạo bảng trên database vừa tạo:

   ```powershell
   npx.cmd --yes wrangler@4.162.0 d1 execute focus-list-activity --remote --file backend/schema.sql --config backend/wrangler.toml
   ```

4. Tạo 2 secret bằng prompt của công cụ. Không gửi mật khẩu vào chat, không ghi trong repository, không dùng mật khẩu Facebook/GitHub:

   ```powershell
   npx.cmd --yes wrangler@4.162.0 secret put ADMIN_PASSWORD --config backend/wrangler.toml
   npx.cmd --yes wrangler@4.162.0 secret put AUTH_SECRET --config backend/wrangler.toml
   ```

   `ADMIN_PASSWORD`: mật khẩu riêng dài ít nhất 16 ký tự (lưu trong trình quản lý mật khẩu). `AUTH_SECRET`: chuỗi ngẫu nhiên khác dài ít nhất 32 ký tự. Backend trả 503 nếu thiếu cấu hình. Token quản trị có hạn 30 phút và chỉ giữ trong bộ nhớ trang. Đăng xuất hoặc tải lại trang sẽ mất token; xoay `AUTH_SECRET` vô hiệu hóa mọi token đã cấp. Đổi mật khẩu bằng cách chạy lại lệnh `secret put ADMIN_PASSWORD`.

5. Triển khai:

   ```powershell
   npx.cmd --yes wrangler@4.162.0 deploy --config backend/wrangler.toml
   ```

   Kiểm tra URL Worker được trả về, ví dụ `https://focus-list-activity.<tài-khoản>.workers.dev/health`. Phải trả `{"ready":true}`. Nếu Cloudflare yêu cầu chọn tài khoản/subdomain hoặc kích hoạt Workers/D1, hoàn tất trên dashboard. Theo dõi usage/quota trong tài khoản; không dựa vào API này để chặn truy cập website.

6. Điền URL Worker thực tế (không phải URL ví dụ) vào `telemetry-config.js`:

   ```javascript
   window.TODO_ANALYTICS = Object.freeze({ apiUrl: 'https://URL-WORKER-THAT.workers.dev' });
   ```

   Commit/push thay đổi cấu hình công khai để GitHub Pages cập nhật. File này tuyệt đối không có secret.

7. Mở TodoList, chọn Đồng ý cho ghi nhận. Mở `/TodoList/admin.html`, đăng nhập bằng `ADMIN_PASSWORD`. Kiểm tra:
   - Một phiên mới xuất hiện sau khi đồng ý.
   - Tạo/sửa/hoàn thành/xóa task chỉ hiện **tên thao tác**, không có nội dung task.
   - Lọc theo phiên, chuyển trang lịch sử và đăng xuất.
   - Tab ẩn không gửi heartbeat. Đang thao tác vẫn có thể gửi sự kiện đã đồng ý.
   - Tắt chia sẻ trong Cài đặt: không gửi thêm sự kiện.
   - Truy cập API `/admin/events` không có token phải trả 401.

## Kiểm tra mã

```powershell
node --test tests/deadline.test.cjs tests/activity.test.cjs
node --check backend/worker.mjs
npx.cmd --yes wrangler@4.162.0 deploy --dry-run --config backend/wrangler.toml
```

Các kiểm thử backend dùng SQLite trong bộ nhớ của Node.js, kiểm tra schema SQL thật, quyền truy cập, token hết hạn, giới hạn thử mật khẩu, CORS, payload, lọc phiên và thời gian lưu. Kiểm thử cục bộ không thay thế kiểm tra Cloudflare/thiết bị thật sau triển khai.

## Bảo vệ trang quản trị

`admin.html` là file công khai nhưng không chứa dữ liệu lịch sử hoặc secret. API mới là nơi kiểm tra quyền đăng nhập. Không bỏ xác thực API chỉ vì trang quản trị ít người biết. Không gắn script quảng cáo/thư viện ngoài vào trang quản trị. Chỉ dùng qua HTTPS. Tài khoản Cloudflare cần bật xác thực hai bước. Không bật log toàn bộ request body.

Ngắt kết nối ghi nhận bằng cách để `apiUrl: ''` và push. Dữ liệu TodoList của người dùng vẫn nằm trong localStorage của họ. Xóa lịch sử D1 và thu hồi quyền hạ tầng là thao tác riêng, không nằm trong nút xóa task/thư mục.
