# Dự kiến triển khai quản lý phim, thể loại và suất chiếu

## 1. Yêu cầu chính

Xây dựng chức năng **quản lý phim**, **quản lý thể loại phim** và bổ sung **quản lý suất chiếu** trong trang quản trị GoCinema, tích hợp vào dự án hiện tại. Cần có chức năng hoạt động với MySQL, không chỉ làm giao diện tĩnh. Giao diện phải bám sát thiết kế Figma.

Figma: https://www.figma.com/design/FnBLe6VEHb0o6y0rAIKnPf/gocinema_n5_dacn?node-id=0-1&t=tx4J3w230IvBOfmw-1

## 2. Phạm vi chức năng dự kiến

Các mục dưới đây là phạm vi đề xuất, cần đối chiếu với các màn hình Figma trước khi triển khai:

- **Phim:** xem danh sách, thêm, sửa, xóa; tìm kiếm/lọc/phân trang nếu có trong thiết kế.
- **Thể loại phim:** xem danh sách, thêm, sửa, xóa; kiểm tra tên trùng.
- Gán thể loại cho phim thông qua bảng liên kết `movie_genres`.
- Kiểm tra dữ liệu đầu vào, thông báo thành công/thất bại và xác nhận thao tác xóa.
- Bảo vệ các trang và thao tác bằng quyền `MANAGE_MOVIES`.
- Kiểm tra các dữ liệu liên quan trước khi quyết định cách xóa phim hoặc thể loại; tránh làm mất dữ liệu ngoài ý muốn.

## 3. Thông tin dự án đã biết

- Thư mục dự án: `D:\dncn\gocinema`.
- Công nghệ: Node.js, Express 4, CommonJS, EJS, MySQL 8; tài nguyên giao diện trong `public/`.
- Cấu trúc: `src/routes`, `src/controllers`, `src/models`, `src/validators`, `src/middlewares`, `src/views`.
- Đã có các thư viện: `express-validator`, `multer`, Jest, Supertest. Ưu tiên sử dụng thư viện và quy ước sẵn có.
- `src/config/menu.js` đã có menu `/admin/movies` và `/admin/genres`, cùng yêu cầu quyền `MANAGE_MOVIES`.
- `src/database/schema.sql` đã có các bảng `movies`, `genres`, `movie_genres`.
- `src/models/movieModel.js` đã có truy vấn phim dùng cho phía người xem; cần kiểm tra để tái sử dụng mà không ảnh hưởng chức năng hiện tại.
- `src/config/db.js` cung cấp `query`, `pool`, `withTransaction`.
- Dữ liệu mẫu thể loại và quyền quản lý phim nằm trong `src/database/seed.sql`.

## 4. Môi trường chạy

- Docker MySQL: `localhost:3307`, database `gocinema`; trạng thái gần nhất người dùng cung cấp là **healthy**.
- Adminer: http://localhost:8080.
- MySQL cài riêng trên máy dùng cổng `3306`, không nhầm với MySQL Docker của dự án.
- Cấu hình kết nối và thông tin bí mật giữ trong `.env`, không chép mật khẩu vào tài liệu hoặc mã nguồn.
- Chạy ứng dụng: `npm run dev`, sau đó mở http://localhost:3000.
- Chạy kiểm thử: `npm test`.
- Nếu chưa có tài khoản quản trị, dự án có lệnh `npm run seed:admin -- <email> <password>`.
- Không reset database hay xóa Docker volume khi chưa được người dùng đồng ý.

## 5. Thiết kế đã nhận từ Figma

Đã nhận ảnh rõ của danh sách phim, form phim và quản lý thể loại. Giao diện dùng sidebar xám, mục chọn nền tối, nút chính đỏ. Danh sách phim có tìm kiếm, lọc trạng thái/thể loại và phân trang. Form hai cột gồm thông tin phim, ngày khởi chiếu/kết thúc, tuổi, poster JPG, trailer và nhiều thể loại. Thể loại có thêm, sửa tên trực tiếp trên dòng và số lượng phim; không xóa thể loại đang gắn phim. Phim có suất chiếu cũng được chặn xóa để bảo toàn dữ liệu.

## 6. Trình tự triển khai

1. Nhận ảnh thiết kế và chốt các trường dữ liệu, thao tác cần có.
2. Đọc cấu trúc quản trị, phân quyền, schema phim, quan hệ dữ liệu và quy ước giao diện. Theo yêu cầu người dùng: chỉ sửa file cục bộ, không sử dụng lệnh Git hoặc thao tác GitHub.
3. Viết model, validation, controller và route theo kiến trúc sẵn có.
4. Xây dựng giao diện EJS và tài nguyên CSS/JS theo Figma; kiểm tra cấu hình bảo mật khi dùng ảnh hoặc tải ảnh lên.
5. Kiểm thử CRUD, dữ liệu không hợp lệ, tên thể loại trùng, phân quyền và các trường hợp xóa có liên kết.
6. Bàn giao đường dẫn sử dụng, hướng dẫn kiểm tra và kết quả kiểm thử thực tế.

## Quản lý suất chiếu

Đã hoàn thành `/admin/showtimes` theo ảnh: lọc ngày/rạp/phim/trạng thái, phân trang, bảng ghế đã bán, hộp thoại tạo/sửa với phòng theo rạp, cập nhật Hoạt động/Đóng/Hủy và xác nhận xóa. Có kiểm tra lịch tương lai, thời gian phát hành phim, phòng/định dạng, trùng lịch gồm 15 phút dọn phòng; tự tạo ghế và chặn sửa lịch/xóa/hủy khi có vé hoặc ghế đang giữ, không tự hoàn tiền. Đã đạt 456/456 ca kiểm thử (gồm phim/thể loại), đọc MySQL thật thành công: 154 suất chiếu, 4 rạp, 8 phòng; chưa thử ghi vào MySQL thật hoặc kiểm tra trực quan trình duyệt. Không thay schema, reset database hay dùng Git/GitHub. Chạy `npm run dev`, đăng nhập ADMIN có quyền `MANAGE_SHOWTIMES`, mở http://localhost:3000/admin/showtimes để sử dụng; sau khi chọn trạng thái trên dòng, nhấn dấu ✓ để lưu.

## Quy ước cập nhật tiến độ

Sau mỗi đầu việc hoàn thành, cập nhật file `dukien.md` bằng một đoạn ngắn: đã làm gì, kết quả kiểm tra (nếu có) và việc tiếp theo hoặc vướng mắc. Giữ nguyên các yêu cầu và thông tin nền còn đúng, không ghi đã hoàn thành khi chưa thực hiện.

## 7. Trạng thái hiện tại

Đã hoàn thành quản lý phim (CRUD, tìm kiếm/lọc, phân trang 7 phim/trang, tải/xem trước poster JPEG tối đa 5 MB, chọn nhiều thể loại) và thể loại (thêm, sửa trực tiếp trên dòng, xóa, đếm phim), có phân quyền và CSRF. Kiểm thử: 203/203 ca đạt, không có lỗi/chú ý từ diagnostics; đọc MySQL thật thành công với 18 phim, 8 thể loại và truy vấn tìm kiếm/lọc/phân trang hợp lệ. Chưa kiểm tra trực quan trong trình duyệt hoặc thao tác ghi trên MySQL thật. Không thay schema, reset database hay dùng Git/GitHub. Tiếp theo: đăng nhập ADMIN để kiểm tra giao diện và luồng sử dụng.

### Cách mở chức năng

Chạy `npm run dev` (nếu ứng dụng chưa chạy), đăng nhập tài khoản ADMIN có quyền `MANAGE_MOVIES`, rồi mở http://localhost:3000/admin/movies hoặc http://localhost:3000/admin/genres. Không cần chạy lại schema/seed hay reset database. Poster tải lên được lưu cục bộ tại `public/images/posters/uploads/` (tự tạo khi tải ảnh đầu tiên); cần giữ thư mục này khi sao lưu dữ liệu.
