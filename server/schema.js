import { query } from "./db.js";
import bcrypt from "bcryptjs";

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(32) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar VARCHAR(4) NOT NULL DEFAULT 'U',
      status VARCHAR(20) NOT NULL DEFAULT 'online',
      bio TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS servers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      icon VARCHAR(4) NOT NULL DEFAULT 'S',
      color VARCHAR(20) NOT NULL DEFAULT '#5865f2',
      description TEXT NOT NULL DEFAULT '',
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS server_members (
      server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(30) NOT NULL DEFAULT 'Member',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (server_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS channels (
      id SERIAL PRIMARY KEY,
      server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
      name VARCHAR(80) NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'text',
      category VARCHAR(40) NOT NULL DEFAULT 'YAZI',
      topic TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      edited_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id SERIAL PRIMARY KEY,
      message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      emoji VARCHAR(16) NOT NULL,
      UNIQUE(message_id, user_id, emoji)
    );

    CREATE TABLE IF NOT EXISTS thread_messages (
      id SERIAL PRIMARY KEY,
      parent_message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const users = await query(`SELECT id FROM users LIMIT 1`);
  if (users.rowCount === 0) {
    const hash = await bcrypt.hash("123456", 10);
    const admin = await query(
      `INSERT INTO users (username, password_hash, avatar, bio) VALUES ($1,$2,$3,$4) RETURNING id`,
      ["admin", hash, "A", "Kurucu hesap"]
    );
    const adminId = admin.rows[0].id;

    const server = await query(
      `INSERT INTO servers (name, icon, color, description, owner_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      ["Nexus Hub", "N", "#5865f2", "Gerçek kayıt/giriş ve veritabanı kullanan chat sunucusu.", adminId]
    );
    const serverId = server.rows[0].id;

    await query(`INSERT INTO server_members (server_id, user_id, role) VALUES ($1,$2,$3)`, [serverId, adminId, "Owner"]);

    const genel = await query(
      `INSERT INTO channels (server_id, name, type, category, topic) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [serverId, "genel", "text", "YAZI", "Genel sohbet kanalı."]
    );
    await query(
      `INSERT INTO channels (server_id, name, type, category, topic) VALUES ($1,$2,$3,$4,$5)`,
      [serverId, "duyuru", "announcement", "YAZI", "Sunucu duyuruları."]
    );
    await query(
      `INSERT INTO channels (server_id, name, type, category, topic) VALUES ($1,$2,$3,$4,$5)`,
      [serverId, "sesli-sohbet", "voice", "SES", "Kamera, mikrofon ve ekran paylaşımı için gerçek tarayıcı izni kullanır."]
    );

    await query(
      `INSERT INTO messages (channel_id, user_id, content, pinned) VALUES ($1,$2,$3,$4)`,
      [genel.rows[0].id, adminId, "Nexus Chat kuruldu. Demo hesap: admin / 123456", true]
    );
  }
}
