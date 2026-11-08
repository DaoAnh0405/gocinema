const env = require('./config/env');
const app = require('./app');
const { pool } = require('./config/db');

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('MySQL: kết nối thành công');
  } catch (err) {
    console.error(`MySQL: không kết nối được (${err.code || err.message})`);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`GoCinema chạy tại http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();