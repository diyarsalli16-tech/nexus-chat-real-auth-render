import jwt from "jsonwebtoken";
import { query } from "./db.js";

const secret = () => process.env.JWT_SECRET || "dev_secret_change_me";

export function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, secret(), { expiresIn: "30d" });
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Giriş gerekli." });

    const payload = jwt.verify(token, secret());
    const result = await query(
      `SELECT id, username, avatar, status, bio, e2ee_public_key, created_at FROM users WHERE id=$1`,
      [payload.id]
    );

    if (result.rowCount === 0) return res.status(401).json({ error: "Kullanıcı bulunamadı." });
    req.user = result.rows[0];
    next();
  } catch {
    return res.status(401).json({ error: "Geçersiz oturum." });
  }
}

export async function socketAuth(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Giriş gerekli."));
    const payload = jwt.verify(token, secret());
    const result = await query(
      `SELECT id, username, avatar, status, bio, e2ee_public_key FROM users WHERE id=$1`,
      [payload.id]
    );
    if (result.rowCount === 0) return next(new Error("Kullanıcı bulunamadı."));
    socket.user = result.rows[0];
    next();
  } catch {
    next(new Error("Geçersiz oturum."));
  }
}
