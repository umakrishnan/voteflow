const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
});

// Prevent unhandled exception on unexpected client disconnects
pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err.message);
});

// Run schema on startup — CREATE TABLE IF NOT EXISTS is idempotent
const initSchema = async () => {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
};

// Transaction helper — passes a client to the callback, handles BEGIN/COMMIT/ROLLBACK
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, initSchema, withTransaction };
