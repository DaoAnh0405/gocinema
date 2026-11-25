const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = nodemailer.createTransport({
  host: env.mail.host,
  port: env.mail.port,
  secure: env.mail.secure, // true cho cổng 465, false cho 587
  auth: { user: env.mail.user, pass: env.mail.pass },
});

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendMail({ to, subject, html, text, attachments }) {
  if (env.isTest) return;

  if (!env.mail.user || !env.mail.pass) {
    if (env.isProd) throw new Error('Chưa cấu hình MAIL_USER / MAIL_PASS');
    console.warn(`[MAIL CHƯA CẤU HÌNH] Gửi tới ${to} | ${subject}\n${text || ''}`);
    return;
  }
  return transporter.sendMail({ from: env.mail.from, to, subject, html, text, attachments });
}

async function sendPasswordOtpMail(to, otp, ttlMinutes) {
  return sendMail({
    to,
    subject: 'GoCinema – Mã xác nhận đổi mật khẩu',
    text: `Mã OTP đổi mật khẩu của bạn là ${otp}. Mã có hiệu lực trong ${ttlMinutes} phút.`,
    html: `<p>Bạn vừa yêu cầu đổi mật khẩu tài khoản GoCinema.</p>
           <p>Mã xác nhận của bạn:</p>
           <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${otp}</p>
           <p>Mã có hiệu lực trong ${ttlMinutes} phút. Tuyệt đối không chia sẻ mã này cho ai.</p>
           <p>Nếu không phải bạn yêu cầu, hãy bỏ qua email này và đổi mật khẩu ngay.</p>`,
  });
}

async function sendResetPasswordMail(to, resetUrl, ttlMinutes) {
  return sendMail({
    to,
    subject: 'GoCinema – Đặt lại mật khẩu',
    text: `Bạn vừa yêu cầu đặt lại mật khẩu. Mở liên kết sau (có hiệu lực ${ttlMinutes} phút): ${resetUrl}`,
    html: `<p>Bạn vừa yêu cầu đặt lại mật khẩu tài khoản GoCinema.</p>
           <p><a href="${resetUrl}">Bấm vào đây để đặt mật khẩu mới</a></p>
           <p>Liên kết có hiệu lực trong ${ttlMinutes} phút và chỉ dùng được một lần.</p>
           <p>Nếu không phải bạn yêu cầu, hãy bỏ qua email này, mật khẩu của bạn vẫn an toàn.</p>`,
  });
}

async function sendStaffInviteMail(to, fullName, setPasswordUrl, ttlHours) {
  return sendMail({
    to,
    subject: 'GoCinema – Thiết lập mật khẩu tài khoản nhân viên',
    text: `Xin chào ${fullName}, tài khoản nhân viên GoCinema của bạn đã được tạo. Mở liên kết sau để đặt mật khẩu (có hiệu lực ${ttlHours} giờ): ${setPasswordUrl}`,
    html: `<p>Xin chào ${escapeHtml(fullName)},</p>
           <p>Tài khoản nhân viên GoCinema của bạn đã được tạo. Email đăng nhập: <b>${escapeHtml(to)}</b></p>
           <p><a href="${setPasswordUrl}">Bấm vào đây để đặt mật khẩu</a></p>
           <p>Liên kết có hiệu lực trong ${ttlHours} giờ và chỉ dùng được một lần. Nếu hết hạn, hãy nhờ quản trị viên gửi lại.</p>`,
  });
}

module.exports = { sendMail, sendPasswordOtpMail, sendResetPasswordMail, sendStaffInviteMail };