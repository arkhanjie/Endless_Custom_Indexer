import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Helper to query the DB
export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

export default pool;
