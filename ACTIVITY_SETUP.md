# Quản trị phiên truy cập và lịch sử hoạt động

## Trạng thái hiện tại

Backend đã triển khai tại `https://focus-list-activity.quocanh0918106.workers.dev`, database D1 đã tạo và secret quản trị đã cấu hình. Frontend kết nối bằng URL công khai trong `telemetry-config.js`. Ghi nhận loại thao tác tự động khi mở trang, có thông báo ngắn; không còn công tắc trong Cài đặt.

Trang quản trị: `https://anhhq1608.github.io/TodoList/admin.html`. Mật khẩu ban đầu được tạo ngẫu nhiên và lưu trong tệp riêng `%USERPROFILE%\.focus-list\admin-access.txt`, bên ngoài project/Git, chỉ tài khoản Windows hiện tại có quyền đọc. Không đưa tệp đó vào Git hoặc chia sẻ cho người khác. Nên chuyển mật khẩu vào trình quản lý mật khẩu. Không cần nhập tên đăng nhập, chỉ cần mật khẩu.

**Để ngừng ghi nhận:** đổi `apiUrl` thành `''` và push. GitHub Pages chỉ phục vụ frontend; push lên GitHub không tự triển khai Worker. Khi sửa `backend/worker.mjs`, cần chạy lại lệnh Wrangler deploy bên dưới. Các bước triển khai lần đầu dưới đây dùng khi chuyển sang tài khoản/database mới; không tạo lại database đang dùng.

TodoList bắt buộc đăng nhập bằng tài khoản tên đăng nhập/mật khẩu. Đăng ký tại `login.html`, tên 3–32 ký tự chữ không dấu/số/./_, mật khẩu 10–128 ký tự. Phiên người dùng có hạn cố định 10 ngày, tách hoàn toàn quyền quản trị. Một người có thể đăng nhập nhiều thiết bị, mỗi thiết bị có mã khách riêng theo tài khoản; đây không phải mã phần cứng thật. Chế độ ẩn danh, đổi trình duyệt hoặc xóa storage tạo mã thiết bị khác.

Task và thư mục được lưu riêng theo tài khoản trong D1 qua `/account/data`; máy chủ xác thực token ở mọi lần đọc/ghi. Đồng bộ sau thay đổi khoảng 0,7 giây, tải dữ liệu mới nhất khi mở lại trang. Hai thiết bị sửa cùng lúc dùng số phiên bản để phát hiện xung đột, không âm thầm ghi đè. Bản chưa đồng bộ vẫn giữ trên máy; khi tải lại có thể tải bản đó ra JSON trước khi mở bản máy chủ. Mỗi tài khoản tối đa 2.000 task, 200 thư mục và 256 KB mỗi lần lưu. Dọn task hoàn thành vẫn theo cơ chế cũ khi ứng dụng đang chạy.

Task cũ chưa có tài khoản vẫn giữ trong các khóa localStorage cũ. Sau đăng nhập, nút **Nhập task cũ trên máy** gộp task/thư mục chưa có ID vào tài khoản đang dùng, không xóa bản cũ. Chỉ bấm nút này trên tài khoản muốn nhận dữ liệu cũ. Đăng xuất giữ dữ liệu riêng trên máy để tránh mất bản chưa đồng bộ; trình duyệt dùng chung nên dùng hồ sơ riêng.

Mật khẩu người dùng băm PBKDF2-SHA256 100.000 vòng, salt ngẫu nhiên riêng và HMAC pepper ở secret `PASSWORD_PEPPER` của Worker. Token phiên 256-bit ngẫu nhiên; D1 chỉ lưu SHA-256 của token. Không ghi mật khẩu/token gốc vào database hay Git. `PASSWORD_PEPPER` phải giữ nguyên sau khi tạo tài khoản; đổi pepper sẽ làm mật khẩu cũ không xác thực được. `AUTH_SECRET` vẫn độc lập cho phiên admin và chống spam. Chưa có khôi phục mật khẩu qua email vì đăng ký không yêu cầu email.

Trang quản trị thêm tab **Tài khoản** (100 tài khoản mới nhất, ngày tạo, số thiết bị, lần cuối). Hai bảng thiết bị và lịch sử có cột Tài khoản; bản ghi cũ chưa gắn tài khoản hiện là Khách cũ. Không hiển thị hash mật khẩu hay nội dung task trong API admin.

Trang quản trị có ba tab **Phiên gần nhất**, **Lịch sử thao tác**, **Tài khoản**. Thiết bị được cấp mã số chung như **TB-000001** theo mã khách. Tab Phiên gần nhất chỉ có một dòng cho mỗi thiết bị: truy cập lại cập nhật thời gian Lần cuối, không thêm dòng theo phiên. Thông tin thiết bị lấy từ sự kiện đầu tiên còn trong thời gian lưu; bảng hiển thị tối đa 100 thiết bị hoạt động gần nhất. Bấm mã thiết bị để lọc lịch sử thao tác; lịch sử vẫn giữ từng thao tác riêng và hiển thị tối đa 100 dòng mới nhất, không có cột hay bộ lọc phiên. Mã không tái sử dụng cho thiết bị khác; sau 30 ngày không còn lịch sử, bản ghi thiết bị được dọn và lần truy cập sau có thể được cấp mã mới.

Khi cập nhật từ phiên bản chưa có mã TB, chạy lại `backend/schema.sql` bằng lệnh D1 execute bên dưới **trước** khi deploy Worker. Schema bổ sung bảng mã thiết bị và cấp mã cho lịch sử có sẵn, không xóa sự kiện cũ.

## Dữ liệu được ghi nhận

- Khi ghi nhận đang bật: mở trang; trang còn hoạt động (heartbeat khi tab hiện); thêm/sửa/xóa/hoàn thành/mở lại task; tạo/xóa thư mục; đợt tự dọn task hoàn thành.
- Chỉ gửi mã sự kiện, mã khách, mã phiên, tên thao tác và nhóm trình duyệt/hệ điều hành/thiết bị. Thời gian do máy chủ ghi nhận.
- API lịch sử không gửi nội dung task, tên thư mục, deadline, phím gõ, ảnh màn hình hoặc URL đang mở. API tài khoản riêng nhận tên đăng nhập/mật khẩu qua HTTPS để xác thực và nhận task/thư mục/deadline để đồng bộ. Tên tài khoản gắn với thiết bị và lịch sử từ phiên đã xác thực trên máy chủ.
- Không ghi IP gốc vào D1. IP hạ tầng cung cấp chỉ được băm HMAC theo cửa sổ thời gian để giới hạn tốc độ. Khóa chống spam hết hạn sẽ được dọn mỗi ngày. Nhà cung cấp hạ tầng có thể xử lý dữ liệu mạng theo chính sách riêng.
- Ghi nhận tự động, không còn công tắc hay lựa chọn cũ trong localStorage. Do Not Track / Global Privacy Control của trình duyệt vẫn được tôn trọng. Không thể bảo đảm ghi nhận mọi lượt truy cập khi trình duyệt chặn mạng hoặc tắt JavaScript.
- Lịch sử cũ hết 30 ngày bị dọn hằng ngày, API không trả dữ liệu quá 30 ngày.
- Lịch sử là dữ liệu do client tự khai báo, không phải bằng chứng kiểm toán hay bảo mật. Trình chặn quảng cáo, offline, quota hoặc giới hạn tốc độ có thể làm thiếu sự kiện. “Vừa hoạt động” nghĩa là nhận sự kiện trong 2 phút gần đây, không chứng minh thiết bị đang online.

## Triển khai lần đầu trên Cloudflare

Khi nâng cấp tài khoản: chạy lại schema idempotent, thêm secret `PASSWORD_PEPPER` bằng `npx.cmd --yes wrangler@4.162.0 secret put PASSWORD_PEPPER --config backend/wrangler.toml` (chuỗi ngẫu nhiên tối thiểu 32 ký tự, chỉ tạo một lần), rồi deploy Worker và push frontend. `REQUIRE_ACCOUNT = "true"` trong wrangler.toml yêu cầu đăng nhập cho API sự kiện/cảnh báo. Giữ nguyên toàn bộ secret quản trị hiện có.

### Cảnh báo thiết bị

Trong Phiên gần nhất, bấm **Cảnh báo** dưới mã thiết bị, nhập ghi chú 1–500 ký tự và gửi. Chỉ admin đã đăng nhập mới được gửi (tối đa 20 lần/5 phút). Nội dung hiển thị dưới dạng văn bản, không thực thi HTML. Cảnh báo lưu tối đa 7 ngày; trình duyệt đích kiểm tra 15 giây/lần khi tab hiện, mở hộp thoại và lưu mã đã nhận để tránh lặp sau tải lại. Đây là trạng thái xếp hàng, không xác nhận người dùng đã đọc. Tối đa 20 cảnh báo gần nhất được trả về mỗi lần. Khóa nhận là UUID khách ngẫu nhiên của trình duyệt; không công khai hoặc chia sẻ khóa này. Xóa storage tạo thiết bị khác và không nhận cảnh báo của mã cũ. Khi website đóng, cần Web Push và service worker với quyền thông báo; polling JavaScript hiện tại không chạy lúc đóng trang.

Cả TodoList và trang quản trị đều nhận cảnh báo, kể cả khi admin gửi cho chính thiết bị của mình. Tab nền vẫn thử kiểm tra (trình duyệt có thể trì hoãn); nếu đã cấp quyền Notification thì thử hiện thông báo hệ thống. Khi quay lại tab, hộp thoại trong trang sẽ hiện. Chỉ đánh dấu đã nhận sau khi hộp thoại hiển thị thành công, tránh mất cảnh báo khi trình duyệt không mở được hộp thoại.

Chạy lại schema trước khi deploy Worker để thêm bảng `device_alerts`, giữ nguyên lịch sử hiện có.

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

   `ADMIN_PASSWORD`: mật khẩu riêng dài ít nhất 16 ký tự (lưu trong trình quản lý mật khẩu). `AUTH_SECRET`: chuỗi ngẫu nhiên khác dài ít nhất 32 ký tự. Backend trả 503 nếu thiếu cấu hình. Token quản trị có hạn cố định 10 ngày từ lúc đăng nhập và được lưu trong localStorage của cùng trình duyệt; không lưu mật khẩu. Quay về TodoList hoặc tải lại trang vẫn giữ phiên, không kéo dài thời hạn. Đăng xuất xóa phiên trong trình duyệt và thu hồi token trên máy chủ. Xoay `AUTH_SECRET` vô hiệu hóa mọi token đã cấp. Đổi mật khẩu bằng cách chạy lại lệnh `secret put ADMIN_PASSWORD`.

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

7. Mở TodoList bằng trình duyệt không chặn ghi nhận. Mở `/TodoList/admin.html`, đăng nhập bằng `ADMIN_PASSWORD`. Kiểm tra:
   - Một phiên mới tự xuất hiện khi mở trang, không có nút Đồng ý.
   - Tạo/sửa/hoàn thành/xóa task chỉ hiện **tên thao tác**, không có nội dung task.
   - Lọc theo thiết bị và đăng xuất. Hai bảng chỉ hiển thị tối đa 100 dòng mới nhất; lịch sử không có phân trang.
   - Tab ẩn không gửi heartbeat. Đang thao tác vẫn có thể gửi sự kiện khi ghi nhận đang bật.
   - Tắt chia sẻ trong Cài đặt: không gửi thêm sự kiện.
   - Truy cập API `/admin/events` không có token phải trả 401.

## Kiểm tra mã

```powershell
node --test tests/*.test.cjs
node --check backend/worker.mjs
npx.cmd --yes wrangler@4.162.0 deploy --dry-run --config backend/wrangler.toml
```

Các kiểm thử backend dùng SQLite trong bộ nhớ của Node.js, kiểm tra schema SQL thật, quyền truy cập, token hết hạn, giới hạn thử mật khẩu, CORS, payload, lọc phiên và thời gian lưu. Kiểm thử cục bộ không thay thế kiểm tra Cloudflare/thiết bị thật sau triển khai.

## Bảo vệ trang quản trị

`admin.html` là file công khai nhưng không chứa dữ liệu lịch sử hoặc secret. API mới là nơi kiểm tra quyền đăng nhập. Không bỏ xác thực API chỉ vì trang quản trị ít người biết. Không gắn script quảng cáo/thư viện ngoài vào trang quản trị. Chỉ dùng qua HTTPS. Tài khoản Cloudflare cần bật xác thực hai bước. Không bật log toàn bộ request body.

Ngắt kết nối ghi nhận bằng cách để `apiUrl: ''` và push. Dữ liệu TodoList của người dùng vẫn nằm trong localStorage của họ. Xóa lịch sử D1 và thu hồi quyền hạ tầng là thao tác riêng, không nằm trong nút xóa task/thư mục.
