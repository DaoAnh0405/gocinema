# GoCinema

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
