require('./environment');
const { Pool } = require('pg');
const localMode = process.env.DEPLOYMENT_MODE === 'local';
const host = process.env.DB_HOST || '127.0.0.1';
if (localMode && !['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error('Local deployment requires a loopback database host. Cloud connection refused.');
}
const pool = new Pool({
  host, port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: localMode || process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: true },
  connectionTimeoutMillis: 10000,
});
pool.on('error', err => console.error('Database connection error:', err.message));
module.exports = pool;
