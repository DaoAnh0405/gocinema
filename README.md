# GoCinema

### Chạy dự án

1. Cài Node.js LTS. Chạy `npm ci` trong thư mục chứa `package.json`.
2. Nếu chưa có `.env`, sao chép từ `.env.example` và cấu hình database, `SESSION_SECRET`.
3. Khởi động MySQL theo `.env`. Nếu dùng Docker của dự án, mở Docker Desktop, đặt `DB_PORT=3307`; nếu chưa có `src/database/seed_test.sql`, chạy `Copy-Item src/database/seed.sql src/database/seed_test.sql` trong PowerShell, rồi chạy `npm run db:up`. Nếu dùng MySQL cài trực tiếp, dùng cổng và tài khoản của dịch vụ đó.
4. Trên Windows, mở `chay-du-an.cmd` trong thư mục dự án; hoặc chạy `npm run dev` tại thư mục chứa `package.json`.
5. Giữ terminal mở và truy cập http://localhost:3000. Quản lý rạp và phòng chiếu tại http://localhost:3000/admin/cinemas sau khi đăng nhập ADMIN.

Ứng dụng tự bổ sung các bảng/cột cần thiết cho sơ đồ ghế khi khởi động, giữ dữ liệu hiện có. Không chạy `db:reset` khi chỉ muốn mở lại ứng dụng vì lệnh đó xóa dữ liệu.

Nếu dùng nhiều Git worktree, mỗi thư mục có mã nguồn và `.env` riêng. Commit/push nhánh `phuong` không tự cập nhật mã nguồn của worktree nhánh `main`. Hãy chạy đúng thư mục chứa tính năng cần dùng.

## KHÔNG PUSH VÀO MAIN

### npm
- `npm run dev` | Chạy app với nodemon |
- `npm run db:up` / `db:down` | Bật / tắt MySQL |
- `npm run db:reset` | Xóa sạch DB và nạp lại `schema.sql` + `src/database/seed_test.sql` (file cục bộ được Git bỏ qua; tạo bản sao từ `src/database/seed.sql` nếu chưa có) |
- `npm test` | Chạy test (Jest + Supertest) |

### Commit 
- chore: cấu hình
- feat: thêm tính năng
- fix: sửa lỗi
- docs: tài liệu

### Account test, MK: Demo12345
- Customer: an.nguyen@example.com
- Admin: npm run seed:admin -- <email> '<mật_khẩu>' / admin@gocinema.vn 
- Staff: staff1@gocinema.vn
