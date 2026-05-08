import { initDb } from "./schema.js";
import { pool } from "./db.js";
await initDb();
console.log("Veritabanı hazır.");
await pool.end();
