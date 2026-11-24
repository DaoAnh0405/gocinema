const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');

// config
const env = require('./config/env');
const sessionMiddleware = require('./config/session');
const refreshSession = require('./middlewares/refreshSession');

// middlewares
const viewLocals = require('./middlewares/viewLocals');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

// routes
const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');

const app = express();

// app configuration
app.disable('x-powered-by');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ejs layout
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:'],
        frameSrc: ["'self'", 'https://www.youtube-nocookie.com', 'https://www.youtube.com'],
        mediaSrc: ["'self'", 'https:'],
        upgradeInsecureRequests: null,
        formAction: ["'self'", 'https://pay-sandbox.sepay.vn', 'https://pay.sepay.vn' ],
      },
    },
  }),
);

// logging
if (!env.isTest) {
  app.use(morgan('dev'));
}

// body parsing và method override
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(methodOverride('_method'));

// static file
app.use(express.static(path.join(__dirname, '../public')));

// session và view locals
app.use(sessionMiddleware);
app.use(refreshSession);
app.use(viewLocals);

// routes
app.use('/api', apiRoutes);
app.use('/', webRoutes);

// error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
