import jwt from "jsonwebtoken";
import { query } from "./db.js";
const secret=()=>process.env.JWT_SECRET||"dev_secret_change_me";
export const signToken=(u)=>jwt.sign({id:u.id,username:u.username}, secret(), {expiresIn:"30d"});
export async function requireAuth(req,res,next){try{const h=req.headers.authorization||"";const t=h.startsWith("Bearer ")?h.slice(7):null;if(!t)return res.status(401).json({error:"Giriş gerekli."});const p=jwt.verify(t,secret());const r=await query(`SELECT id,username,avatar,status,bio,created_at FROM users WHERE id=$1`,[p.id]);if(!r.rowCount)return res.status(401).json({error:"Kullanıcı bulunamadı."});req.user=r.rows[0];next();}catch{return res.status(401).json({error:"Geçersiz oturum."})}}
export async function socketAuth(socket,next){try{const t=socket.handshake.auth?.token;if(!t)return next(new Error("Giriş gerekli."));const p=jwt.verify(t,secret());const r=await query(`SELECT id,username,avatar,status,bio FROM users WHERE id=$1`,[p.id]);if(!r.rowCount)return next(new Error("Kullanıcı bulunamadı."));socket.user=r.rows[0];next();}catch{next(new Error("Geçersiz oturum."));}}
