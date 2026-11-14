const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const foodRoutes = require('./routes/foodRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (css, js, images)
app.use(express.static(path.join(__dirname, '../public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', foodRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GoCinema Server running at http://localhost:${PORT}/admin/foods`);
});

module.exports = app;