const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');

const env = require('./config/env');
const sessionMiddleware = require('./config/session');
const viewLocals = require('./middlewares/viewLocals');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');

const app = express();

app.disable('x-powered-by');

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Bảo mật (cho phép Bootstrap/Chart.js từ jsDelivr)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:'],
        upgradeInsecureRequests: null,
      },
    },
  }),
);

// Parser và tiện ích
if (!env.isTest) app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, '../public')));

// Session và biến dùng chung cho view
app.use(sessionMiddleware);
app.use(viewLocals);

// Routes
app.use('/api', apiRoutes);
app.use('/', webRoutes);

// Lỗi (luôn đặt cuối)
app.use(notFound);
app.use(errorHandler);

module.exports = app;