import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL eksik. .env dosyası oluştur veya Render'da Environment Variable ekle.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

export async function query(text, params) {
  return pool.query(text, params);
}
