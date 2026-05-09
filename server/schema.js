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

    CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      requester_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      addressee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT no_self_friend CHECK (requester_id <> addressee_id)
    );

    CREATE TABLE IF NOT EXISTS direct_messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      edited_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS server_invites (
      id SERIAL PRIMARY KEY,
      server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
      creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      code VARCHAR(32) UNIQUE NOT NULL,
      max_uses INTEGER,
      uses INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS group_chats (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS group_chat_members (
      group_id INTEGER REFERENCES group_chats(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS group_messages (
      id SERIAL PRIMARY KEY,
      group_id INTEGER REFERENCES group_chats(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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

    const nova = await query(
      `INSERT INTO users (username, password_hash, avatar, bio) VALUES ($1,$2,$3,$4) RETURNING id`,
      ["nova", hash, "N", "Test kullanıcı"]
    );

    const adminId = admin.rows[0].id;
    const novaId = nova.rows[0].id;

    const server = await query(
      `INSERT INTO servers (name, icon, color, description, owner_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      ["Nexus Hub", "N", "#5865f2", "Gerçek arkadaş, DM, ses araması ve davet sistemi.", adminId]
    );

    const serverId = server.rows[0].id;

    await query(
      `INSERT INTO server_members (server_id, user_id, role) VALUES ($1,$2,'Owner'),($1,$3,'Member')`,
      [serverId, adminId, novaId]
    );

    const genel = await query(
      `INSERT INTO channels (server_id, name, type, category, topic) VALUES ($1,'genel','text','YAZI','Genel sohbet kanalı.') RETURNING id`,
      [serverId]
    );

    await query(
      `INSERT INTO channels (server_id, name, type, category, topic) VALUES
       ($1,'duyuru','announcement','YAZI','Sunucu duyuruları.'),
       ($1,'sesli-sohbet','voice','SES','Sesli sohbet odası.')`,
      [serverId]
    );

    await query(
      `INSERT INTO messages (channel_id, user_id, content, pinned) VALUES ($1,$2,$3,true)`,
      [genel.rows[0].id, adminId, "Nexus Chat V3 hazır. Test hesapları: admin/123456 ve nova/123456"]
    );

    await query(
      `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1,$2,'accepted')`,
      [adminId, novaId]
    );

    await query(
      `INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES ($1,$2,$3),($2,$1,$4)`,
      [adminId, novaId, "Selam Nova, DM yazışması çalışıyor.", "Evet, şimdi DM arama paneli de düzgün."]
    );

    const group = await query(
      `INSERT INTO group_chats (name, owner_id) VALUES ($1,$2) RETURNING id`,
      ["Test Grup", adminId]
    );

    await query(
      `INSERT INTO group_chat_members (group_id, user_id) VALUES ($1,$2),($1,$3) ON CONFLICT DO NOTHING`,
      [group.rows[0].id, adminId, novaId]
    );

    await query(
      `INSERT INTO group_messages (group_id, sender_id, content) VALUES ($1,$2,$3)`,
      [group.rows[0].id, adminId, "Grup sohbeti de hazır."]
    );
  }
}
