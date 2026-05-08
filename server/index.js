import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Server } from "socket.io";
import dotenv from "dotenv";

import { initDb } from "./schema.js";
import { query } from "./db.js";
import { requireAuth, signToken, socketAuth } from "./auth.js";

dotenv.config();
await initDb();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === "production";

const app = express();
const httpServer = http.createServer(app);
const allowedOrigin = process.env.CLIENT_ORIGIN || (isProd ? undefined : "http://localhost:5173");

app.use(cors({ origin: allowedOrigin || true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/rtc-config", (_, res) => {
  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" }
  ];

  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(",").map(s => s.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  } else {
    // Test için public TURN. Üretimde kendi TURN hesabını ENV ile gir.
    iceServers.push({
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp"
      ],
      username: "openrelayproject",
      credential: "openrelayproject"
    });
  }

  res.json({ iceServers });
});


const io = new Server(httpServer, {
  cors: { origin: allowedOrigin || true, credentials: true }
});

io.use(socketAuth);

io.on("connection", (socket) => {
  socket.join(`user:${socket.user.id}`);

  socket.on("channel:join", (channelId) => socket.join(`channel:${channelId}`));

  socket.on("dm:call:invite", ({ to }) => {
    io.to(`user:${to}`).emit("dm:call:incoming", {
      from: socket.user.id,
      username: socket.user.username,
      avatar: socket.user.avatar
    });
  });

  socket.on("dm:call:accept", ({ to }) => {
    io.to(`user:${to}`).emit("dm:call:accepted", { from: socket.user.id });
  });

  socket.on("dm:call:reject", ({ to }) => {
    io.to(`user:${to}`).emit("dm:call:rejected", { from: socket.user.id });
  });

  socket.on("dm:call:end", ({ to }) => {
    io.to(`user:${to}`).emit("dm:call:ended", { from: socket.user.id });
  });

  socket.on("rtc:offer", ({ to, offer }) => {
    io.to(`user:${to}`).emit("rtc:offer", { from: socket.user.id, offer });
  });

  socket.on("rtc:answer", ({ to, answer }) => {
    io.to(`user:${to}`).emit("rtc:answer", { from: socket.user.id, answer });
  });

  socket.on("rtc:candidate", ({ to, candidate }) => {
    io.to(`user:${to}`).emit("rtc:candidate", { from: socket.user.id, candidate });
  });

  socket.on("voice:join", (channelId) => {
    socket.join(`voice:${channelId}`);
    socket.to(`voice:${channelId}`).emit("voice:user-joined", {
      id: socket.user.id,
      username: socket.user.username,
      avatar: socket.user.avatar
    });
  });

  socket.on("voice:leave", (channelId) => {
    socket.leave(`voice:${channelId}`);
    socket.to(`voice:${channelId}`).emit("voice:user-left", socket.user.id);
  });
});

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    avatar: row.avatar,
    status: row.status,
    bio: row.bio,
    created_at: row.created_at
  };
}

async function requireServerMember(userId, serverId) {
  const r = await query(`SELECT role FROM server_members WHERE user_id=$1 AND server_id=$2`, [userId, serverId]);
  return r.rows[0] || null;
}

async function areFriends(a, b) {
  const r = await query(
    `SELECT id FROM friendships
     WHERE status='accepted' AND
     ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))`,
    [a, b]
  );
  return r.rowCount > 0;
}

async function channelWithServer(channelId) {
  const r = await query(
    `SELECT c.*, s.id AS server_id FROM channels c JOIN servers s ON s.id=c.server_id WHERE c.id=$1`,
    [channelId]
  );
  return r.rows[0] || null;
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!/^[a-zA-Z0-9_ğüşöçıİĞÜŞÖÇ.-]{3,24}$/.test(username)) {
      return res.status(400).json({ error: "Kullanıcı adı 3-24 karakter olmalı." });
    }

    if (password.length < 6) return res.status(400).json({ error: "Şifre en az 6 karakter olmalı." });

    const hash = await bcrypt.hash(password, 10);
    const avatar = username[0].toUpperCase();

    const result = await query(
      `INSERT INTO users (username, password_hash, avatar) VALUES ($1,$2,$3)
       RETURNING id, username, avatar, status, bio, created_at`,
      [username, hash, avatar]
    );

    const user = result.rows[0];

    const firstServer = await query(`SELECT id FROM servers ORDER BY id ASC LIMIT 1`);
    if (firstServer.rowCount) {
      await query(
        `INSERT INTO server_members (server_id, user_id, role) VALUES ($1,$2,'Member') ON CONFLICT DO NOTHING`,
        [firstServer.rows[0].id, user.id]
      );
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (String(err.message).includes("duplicate")) return res.status(409).json({ error: "Bu kullanıcı adı alınmış." });
    console.error(err);
    res.status(500).json({ error: "Kayıt sırasında hata oluştu." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  const result = await query(`SELECT * FROM users WHERE username=$1`, [username]);
  if (result.rowCount === 0) return res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı." });

  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı." });

  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/me", requireAuth, async (req, res) => res.json({ user: req.user }));

app.patch("/api/me", requireAuth, async (req, res) => {
  const bio = String(req.body.bio || "").slice(0, 200);
  const status = ["online", "idle", "dnd", "offline"].includes(req.body.status) ? req.body.status : "online";
  const r = await query(
    `UPDATE users SET bio=$1, status=$2 WHERE id=$3 RETURNING id, username, avatar, status, bio, created_at`,
    [bio, status, req.user.id]
  );
  res.json({ user: r.rows[0] });
});

app.get("/api/bootstrap", requireAuth, async (req, res) => {
  const servers = await query(`
    SELECT s.*, sm.role
    FROM servers s
    JOIN server_members sm ON sm.server_id=s.id
    WHERE sm.user_id=$1
    ORDER BY s.id ASC
  `, [req.user.id]);

  const serverIds = servers.rows.map(s => s.id);
  let channels = [];
  let members = [];

  if (serverIds.length) {
    channels = (await query(`SELECT * FROM channels WHERE server_id = ANY($1::int[]) ORDER BY id ASC`, [serverIds])).rows;
    members = (await query(`
      SELECT sm.server_id, sm.role, u.id, u.username, u.avatar, u.status, u.bio
      FROM server_members sm
      JOIN users u ON u.id=sm.user_id
      WHERE sm.server_id = ANY($1::int[])
      ORDER BY sm.role ASC, u.username ASC
    `, [serverIds])).rows;
  }

  res.json({ user: req.user, servers: servers.rows, channels, members });
});

app.get("/api/users/search", requireAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ users: [] });

  const r = await query(`
    SELECT id, username, avatar, status, bio
    FROM users
    WHERE username ILIKE $1 AND id <> $2
    ORDER BY username ASC
    LIMIT 20
  `, [`%${q}%`, req.user.id]);

  res.json({ users: r.rows });
});

app.get("/api/friends", requireAuth, async (req, res) => {
  const r = await query(`
    SELECT f.*,
      requester.username AS requester_username,
      requester.avatar AS requester_avatar,
      requester.status AS requester_status,
      requester.bio AS requester_bio,
      addressee.username AS addressee_username,
      addressee.avatar AS addressee_avatar,
      addressee.status AS addressee_status,
      addressee.bio AS addressee_bio
    FROM friendships f
    JOIN users requester ON requester.id=f.requester_id
    JOIN users addressee ON addressee.id=f.addressee_id
    WHERE f.requester_id=$1 OR f.addressee_id=$1
    ORDER BY f.updated_at DESC, f.created_at DESC
  `, [req.user.id]);

  const friends = [];
  const incoming = [];
  const outgoing = [];

  for (const row of r.rows) {
    const otherIsRequester = row.requester_id !== req.user.id;
    const other = otherIsRequester
      ? { id: row.requester_id, username: row.requester_username, avatar: row.requester_avatar, status: row.requester_status, bio: row.requester_bio }
      : { id: row.addressee_id, username: row.addressee_username, avatar: row.addressee_avatar, status: row.addressee_status, bio: row.addressee_bio };

    const item = { id: row.id, status: row.status, other, created_at: row.created_at, updated_at: row.updated_at };

    if (row.status === "accepted") friends.push(item);
    else if (row.status === "pending" && row.addressee_id === req.user.id) incoming.push(item);
    else if (row.status === "pending" && row.requester_id === req.user.id) outgoing.push(item);
  }

  res.json({ friends, incoming, outgoing });
});

app.post("/api/friends/request", requireAuth, async (req, res) => {
  const username = String(req.body.username || "").trim();
  const target = await query(`SELECT id, username, avatar, status, bio FROM users WHERE username=$1`, [username]);
  if (!target.rowCount) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

  const targetUser = target.rows[0];
  if (targetUser.id === req.user.id) return res.status(400).json({ error: "Kendini arkadaş ekleyemezsin." });

  const existing = await query(
    `SELECT * FROM friendships
     WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,
    [req.user.id, targetUser.id]
  );

  if (existing.rowCount) {
    const ex = existing.rows[0];
    if (ex.status === "accepted") return res.status(409).json({ error: "Zaten arkadaşsınız." });
    if (ex.status === "pending") return res.status(409).json({ error: "Zaten bekleyen istek var." });
  }

  await query(
    `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1,$2,'pending')`,
    [req.user.id, targetUser.id]
  );

  io.to(`user:${targetUser.id}`).emit("friend:request", { from: publicUser(req.user) });
  res.json({ ok: true });
});

app.post("/api/friends/:friendshipId/accept", requireAuth, async (req, res) => {
  const id = Number(req.params.friendshipId);
  const f = await query(`SELECT * FROM friendships WHERE id=$1`, [id]);
  if (!f.rowCount) return res.status(404).json({ error: "İstek bulunamadı." });

  const row = f.rows[0];
  if (row.addressee_id !== req.user.id) return res.status(403).json({ error: "Bu istek sana gelmemiş." });

  await query(`UPDATE friendships SET status='accepted', updated_at=NOW() WHERE id=$1`, [id]);
  io.to(`user:${row.requester_id}`).emit("friend:accepted", { by: publicUser(req.user) });
  res.json({ ok: true });
});

app.post("/api/friends/:friendshipId/reject", requireAuth, async (req, res) => {
  const id = Number(req.params.friendshipId);
  const f = await query(`SELECT * FROM friendships WHERE id=$1`, [id]);
  if (!f.rowCount) return res.status(404).json({ error: "İstek bulunamadı." });

  const row = f.rows[0];
  if (row.addressee_id !== req.user.id && row.requester_id !== req.user.id) return res.status(403).json({ error: "Yetki yok." });

  await query(`DELETE FROM friendships WHERE id=$1`, [id]);
  res.json({ ok: true });
});

app.delete("/api/friends/:userId", requireAuth, async (req, res) => {
  const otherId = Number(req.params.userId);
  await query(
    `DELETE FROM friendships WHERE
     ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))`,
    [req.user.id, otherId]
  );
  res.json({ ok: true });
});

app.get("/api/dms/:userId/messages", requireAuth, async (req, res) => {
  const otherId = Number(req.params.userId);
  if (!(await areFriends(req.user.id, otherId))) return res.status(403).json({ error: "DM için önce arkadaş olmalısınız." });

  const r = await query(`
    SELECT dm.*, u.username, u.avatar
    FROM direct_messages dm
    JOIN users u ON u.id=dm.sender_id
    WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)
    ORDER BY dm.id ASC
    LIMIT 200
  `, [req.user.id, otherId]);

  res.json({ messages: r.rows });
});

app.post("/api/dms/:userId/messages", requireAuth, async (req, res) => {
  const otherId = Number(req.params.userId);
  if (!(await areFriends(req.user.id, otherId))) return res.status(403).json({ error: "DM için önce arkadaş olmalısınız." });

  const content = String(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Mesaj boş olamaz." });

  const r = await query(
    `INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES ($1,$2,$3) RETURNING *`,
    [req.user.id, otherId, content.slice(0, 2000)]
  );

  const message = { ...r.rows[0], username: req.user.username, avatar: req.user.avatar };
  io.to(`user:${otherId}`).emit("dm:new", message);
  io.to(`user:${req.user.id}`).emit("dm:new", message);
  res.json({ message });
});

app.post("/api/servers", requireAuth, async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: "Sunucu adı gerekli." });

  const icon = String(req.body.icon || name[0] || "S").slice(0, 2).toUpperCase();
  const color = String(req.body.color || "#5865f2").slice(0, 20);
  const description = String(req.body.description || "").slice(0, 300);

  const s = await query(
    `INSERT INTO servers (name, icon, color, description, owner_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, icon, color, description, req.user.id]
  );

  const server = s.rows[0];

  await query(`INSERT INTO server_members (server_id, user_id, role) VALUES ($1,$2,'Owner')`, [server.id, req.user.id]);

  const ch = await query(
    `INSERT INTO channels (server_id, name, type, category, topic) VALUES
      ($1,'genel','text','YAZI','Genel sohbet kanalı.'),
      ($1,'duyuru','announcement','YAZI','Sunucu duyuruları.'),
      ($1,'sesli-sohbet','voice','SES','Sesli sohbet odası.')
     RETURNING *`,
    [server.id]
  );

  await query(`INSERT INTO audit_logs (server_id, user_id, action) VALUES ($1,$2,$3)`, [server.id, req.user.id, `${req.user.username} sunucuyu oluşturdu.`]);

  res.json({ server, channels: ch.rows });
});

app.post("/api/servers/:serverId/channels", requireAuth, async (req, res) => {
  const serverId = Number(req.params.serverId);
  const member = await requireServerMember(req.user.id, serverId);
  if (!member) return res.status(403).json({ error: "Bu sunucuda değilsin." });

  const name = String(req.body.name || "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 80);
  if (!name) return res.status(400).json({ error: "Kanal adı gerekli." });

  const type = ["text", "announcement", "forum", "voice", "stage"].includes(req.body.type) ? req.body.type : "text";
  const category = String(req.body.category || (type === "voice" ? "SES" : "YAZI")).slice(0, 40);
  const topic = String(req.body.topic || "").slice(0, 300);

  const r = await query(
    `INSERT INTO channels (server_id, name, type, category, topic) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [serverId, name, type, category, topic]
  );

  await query(`INSERT INTO audit_logs (server_id, user_id, action) VALUES ($1,$2,$3)`, [serverId, req.user.id, `${req.user.username} #${name} kanalını oluşturdu.`]);
  io.emit("channel:new", r.rows[0]);
  res.json({ channel: r.rows[0] });
});

app.post("/api/servers/:serverId/invites", requireAuth, async (req, res) => {
  const serverId = Number(req.params.serverId);
  const member = await requireServerMember(req.user.id, serverId);
  if (!member) return res.status(403).json({ error: "Bu sunucuda değilsin." });

  const code = crypto.randomBytes(5).toString("hex").toUpperCase();
  const maxUses = req.body.max_uses ? Number(req.body.max_uses) : null;
  const expiresHours = req.body.expires_hours ? Number(req.body.expires_hours) : null;

  const expiresAt = expiresHours ? new Date(Date.now() + expiresHours * 60 * 60 * 1000) : null;

  const r = await query(
    `INSERT INTO server_invites (server_id, creator_id, code, max_uses, expires_at)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [serverId, req.user.id, code, maxUses, expiresAt]
  );

  await query(`INSERT INTO audit_logs (server_id, user_id, action) VALUES ($1,$2,$3)`, [serverId, req.user.id, `${req.user.username} davet linki oluşturdu.`]);

  const origin = req.headers.origin || "";
  res.json({ invite: r.rows[0], url: `${origin}/invite/${code}` });
});

app.get("/api/invites/:code", async (req, res) => {
  const code = String(req.params.code || "").toUpperCase();

  const r = await query(`
    SELECT i.*, s.name AS server_name, s.icon AS server_icon, s.color AS server_color, s.description AS server_description,
      (SELECT COUNT(*)::int FROM server_members sm WHERE sm.server_id=s.id) AS member_count
    FROM server_invites i
    JOIN servers s ON s.id=i.server_id
    WHERE i.code=$1
  `, [code]);

  if (!r.rowCount) return res.status(404).json({ error: "Davet bulunamadı." });

  const invite = r.rows[0];

  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: "Davet süresi dolmuş." });
  }

  if (invite.max_uses && invite.uses >= invite.max_uses) {
    return res.status(410).json({ error: "Davet kullanım limiti dolmuş." });
  }

  res.json({ invite });
});

app.post("/api/invites/:code/join", requireAuth, async (req, res) => {
  const code = String(req.params.code || "").toUpperCase();

  const r = await query(`SELECT * FROM server_invites WHERE code=$1`, [code]);
  if (!r.rowCount) return res.status(404).json({ error: "Davet bulunamadı." });

  const invite = r.rows[0];

  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: "Davet süresi dolmuş." });
  }

  if (invite.max_uses && invite.uses >= invite.max_uses) {
    return res.status(410).json({ error: "Davet kullanım limiti dolmuş." });
  }

  await query(
    `INSERT INTO server_members (server_id, user_id, role) VALUES ($1,$2,'Member') ON CONFLICT DO NOTHING`,
    [invite.server_id, req.user.id]
  );

  await query(`UPDATE server_invites SET uses=uses+1 WHERE id=$1`, [invite.id]);

  await query(`INSERT INTO audit_logs (server_id, user_id, action) VALUES ($1,$2,$3)`, [invite.server_id, req.user.id, `${req.user.username} davetle sunucuya katıldı.`]);

  res.json({ ok: true, server_id: invite.server_id });
});

app.get("/api/channels/:channelId/messages", requireAuth, async (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = await channelWithServer(channelId);
  if (!channel) return res.status(404).json({ error: "Kanal bulunamadı." });

  const member = await requireServerMember(req.user.id, channel.server_id);
  if (!member) return res.status(403).json({ error: "Bu sunucuda değilsin." });

  const result = await query(`
    SELECT m.*, u.username, u.avatar,
      COALESCE(json_object_agg(r.emoji, r.count) FILTER (WHERE r.emoji IS NOT NULL), '{}') AS reactions
    FROM messages m
    JOIN users u ON u.id=m.user_id
    LEFT JOIN (
      SELECT message_id, emoji, COUNT(*)::int AS count
      FROM reactions
      GROUP BY message_id, emoji
    ) r ON r.message_id=m.id
    WHERE m.channel_id=$1
    GROUP BY m.id, u.username, u.avatar
    ORDER BY m.id ASC
    LIMIT 200
  `, [channelId]);

  res.json({ messages: result.rows });
});

app.post("/api/channels/:channelId/messages", requireAuth, async (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = await channelWithServer(channelId);
  if (!channel) return res.status(404).json({ error: "Kanal bulunamadı." });

  const member = await requireServerMember(req.user.id, channel.server_id);
  if (!member) return res.status(403).json({ error: "Bu sunucuda değilsin." });

  const content = String(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Mesaj boş olamaz." });

  const r = await query(
    `INSERT INTO messages (channel_id, user_id, content) VALUES ($1,$2,$3) RETURNING *`,
    [channelId, req.user.id, content.slice(0, 2000)]
  );

  const message = { ...r.rows[0], username: req.user.username, avatar: req.user.avatar, reactions: {} };
  io.to(`channel:${channelId}`).emit("message:new", message);
  res.json({ message });
});

app.patch("/api/messages/:messageId", requireAuth, async (req, res) => {
  const id = Number(req.params.messageId);
  const content = String(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Mesaj boş olamaz." });

  const own = await query(`SELECT * FROM messages WHERE id=$1 AND user_id=$2`, [id, req.user.id]);
  if (!own.rowCount) return res.status(403).json({ error: "Sadece kendi mesajını düzenleyebilirsin." });

  const r = await query(`UPDATE messages SET content=$1, edited_at=NOW() WHERE id=$2 RETURNING *`, [content.slice(0, 2000), id]);
  io.to(`channel:${r.rows[0].channel_id}`).emit("message:update", r.rows[0]);
  res.json({ message: r.rows[0] });
});

app.delete("/api/messages/:messageId", requireAuth, async (req, res) => {
  const id = Number(req.params.messageId);

  const msg = await query(
    `SELECT m.*, c.server_id FROM messages m JOIN channels c ON c.id=m.channel_id WHERE m.id=$1`,
    [id]
  );

  if (!msg.rowCount) return res.status(404).json({ error: "Mesaj yok." });

  const row = msg.rows[0];
  const member = await requireServerMember(req.user.id, row.server_id);

  if (!member || (row.user_id !== req.user.id && !["Owner", "Admin", "Mod"].includes(member.role))) {
    return res.status(403).json({ error: "Silme yetkin yok." });
  }

  await query(`DELETE FROM messages WHERE id=$1`, [id]);
  io.to(`channel:${row.channel_id}`).emit("message:delete", { id });
  res.json({ ok: true });
});

app.post("/api/messages/:messageId/pin", requireAuth, async (req, res) => {
  const id = Number(req.params.messageId);
  const r = await query(`UPDATE messages SET pinned = NOT pinned WHERE id=$1 RETURNING *`, [id]);
  if (!r.rowCount) return res.status(404).json({ error: "Mesaj yok." });
  io.to(`channel:${r.rows[0].channel_id}`).emit("message:update", r.rows[0]);
  res.json({ message: r.rows[0] });
});

app.post("/api/messages/:messageId/react", requireAuth, async (req, res) => {
  const id = Number(req.params.messageId);
  const emoji = String(req.body.emoji || "👍").slice(0, 16);

  await query(
    `INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1,$2,$3)
     ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
    [id, req.user.id, emoji]
  );

  const msg = await query(`SELECT channel_id FROM messages WHERE id=$1`, [id]);
  if (msg.rowCount) io.to(`channel:${msg.rows[0].channel_id}`).emit("reaction:update", { messageId: id });
  res.json({ ok: true });
});

app.get("/api/audit/:serverId", requireAuth, async (req, res) => {
  const serverId = Number(req.params.serverId);
  const member = await requireServerMember(req.user.id, serverId);
  if (!member) return res.status(403).json({ error: "Bu sunucuda değilsin." });

  const r = await query(`
    SELECT a.*, u.username
    FROM audit_logs a
    LEFT JOIN users u ON u.id=a.user_id
    WHERE a.server_id=$1
    ORDER BY a.id DESC
    LIMIT 50
  `, [serverId]);

  res.json({ audit: r.rows });
});

if (isProd) {
  const dist = path.join(__dirname, "..", "client", "dist");
  app.use(express.static(dist));
  app.get("*", (_, res) => res.sendFile(path.join(dist, "index.html")));
}

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => {
  console.log(`Nexus Chat V3 running on port ${PORT}`);
});
