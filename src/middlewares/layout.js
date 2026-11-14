const { adminMenu, staffMenu } = require('../config/menu');

// express-ejs-layouts đọc `layout` từ res.locals, nên mọi res.render dưới router này
// tự dùng layout dashboard, thành viên không phải truyền gì thêm
const useDashboard = (panel, panelName, menu) => (req, res, next) => {
  res.locals.layout = 'layouts/dashboard';
  res.locals.panel = panel;          // 'admin' | 'staff'
  res.locals.panelName = panelName;  // chữ nhỏ dưới logo
  res.locals.menu = menu;
  next();
};

exports.adminLayout = useDashboard('admin', 'Quản trị', adminMenu);
exports.staffLayout = useDashboard('staff', 'Nhân viên', staffMenu);