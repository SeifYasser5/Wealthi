import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT) || 5432,
  user: process.env.POSTGRES_USER || 'wealthi',
  password: process.env.POSTGRES_PASSWORD || 'wealthi_secret',
  database: process.env.POSTGRES_DB || 'wealthi_db',
});

export default pool;
