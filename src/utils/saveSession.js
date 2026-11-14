// đợi session được ghi xuống store xong, tránh trang kế tiếp đọc phải session cũ
module.exports = (req) =>
  new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));