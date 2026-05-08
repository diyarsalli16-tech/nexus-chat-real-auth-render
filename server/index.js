import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import bcrypt from "bcryptjs";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { initDb } from "./schema.js";
import { query } from "./db.js";
import { requireAuth, signToken, socketAuth } from "./auth.js";
dotenv.config(); await initDb();
const __filename=fileURLToPath(import.meta.url), __dirname=path.dirname(__filename);
const app=express(), httpServer=http.createServer(app), isProd=process.env.NODE_ENV==="production";
const allowedOrigin=process.env.CLIENT_ORIGIN || (isProd?undefined:"http://localhost:5173");
app.use(cors({origin:allowedOrigin||true, credentials:true})); app.use(express.json({limit:"2mb"}));
const io=new Server(httpServer,{cors:{origin:allowedOrigin||true,credentials:true}}); io.use(socketAuth);
io.on("connection", socket=>{
 socket.join(`user:${socket.user.id}`);
 socket.on("channel:join", id=>socket.join(`channel:${id}`));
 socket.on("voice:join", id=>{socket.join(`voice:${id}`); socket.to(`voice:${id}`).emit("voice:user-joined",socket.user)});
 socket.on("voice:leave", id=>{socket.leave(`voice:${id}`); socket.to(`voice:${id}`).emit("voice:user-left",socket.user.id)});
 socket.on("dm:voice-invite", ({to})=>io.to(`user:${to}`).emit("dm:voice-invite",{from:socket.user}));
 socket.on("dm:voice-accept", ({to})=>io.to(`user:${to}`).emit("dm:voice-accept",{from:socket.user}));
 socket.on("dm:voice-decline", ({to})=>io.to(`user:${to}`).emit("dm:voice-decline",{from:socket.user}));
 socket.on("dm:voice-signal", ({to,data})=>io.to(`user:${to}`).emit("dm:voice-signal",{from:socket.user.id,data}));
 socket.on("dm:voice-end", ({to})=>io.to(`user:${to}`).emit("dm:voice-end",{from:socket.user.id}));
});
const pub=u=>({id:u.id,username:u.username,avatar:u.avatar,status:u.status,bio:u.bio,created_at:u.created_at});
async function member(uid,sid){const r=await query(`SELECT role FROM server_members WHERE user_id=$1 AND server_id=$2`,[uid,sid]);return r.rows[0]||null}
async function chServer(cid){const r=await query(`SELECT c.*,s.id server_id FROM channels c JOIN servers s ON s.id=c.server_id WHERE c.id=$1`,[cid]);return r.rows[0]||null}
async function friends(a,b){const r=await query(`SELECT id FROM friendships WHERE ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)) AND status='accepted'`,[a,b]);return r.rowCount>0}

function inviteCode(){return Math.random().toString(36).slice(2,8).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase();}
app.post("/api/auth/register",async(req,res)=>{try{const username=String(req.body.username||"").trim(), password=String(req.body.password||""); if(!/^[a-zA-Z0-9_ğüşöçıİĞÜŞÖÇ.-]{3,24}$/.test(username))return res.status(400).json({error:"Kullanıcı adı 3-24 karakter olmalı."}); if(password.length<6)return res.status(400).json({error:"Şifre en az 6 karakter."}); const hash=await bcrypt.hash(password,10); const r=await query(`INSERT INTO users(username,password_hash,avatar) VALUES($1,$2,$3) RETURNING id,username,avatar,status,bio,created_at`,[username,hash,username[0].toUpperCase()]); const u=r.rows[0]; const s=await query(`SELECT id FROM servers ORDER BY id LIMIT 1`); if(s.rowCount) await query(`INSERT INTO server_members(server_id,user_id,role) VALUES($1,$2,'Member') ON CONFLICT DO NOTHING`,[s.rows[0].id,u.id]); res.json({token:signToken(u),user:pub(u)});}catch(e){if(String(e.message).includes("duplicate"))return res.status(409).json({error:"Bu kullanıcı adı alınmış."}); console.error(e); res.status(500).json({error:"Kayıt hatası."})}});
app.post("/api/auth/login",async(req,res)=>{const username=String(req.body.username||"").trim(), password=String(req.body.password||""); const r=await query(`SELECT * FROM users WHERE username=$1`,[username]); if(!r.rowCount)return res.status(401).json({error:"Kullanıcı adı veya şifre hatalı."}); const u=r.rows[0]; if(!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:"Kullanıcı adı veya şifre hatalı."}); res.json({token:signToken(u),user:pub(u)});});
app.get("/api/me",requireAuth,(req,res)=>res.json({user:req.user}));
app.patch("/api/me",requireAuth,async(req,res)=>{const bio=String(req.body.bio||"").slice(0,200), status=["online","idle","dnd","offline"].includes(req.body.status)?req.body.status:"online"; const r=await query(`UPDATE users SET bio=$1,status=$2 WHERE id=$3 RETURNING id,username,avatar,status,bio,created_at`,[bio,status,req.user.id]); res.json({user:r.rows[0]});});
app.get("/api/bootstrap",requireAuth,async(req,res)=>{const servers=(await query(`SELECT s.*,sm.role FROM servers s JOIN server_members sm ON sm.server_id=s.id WHERE sm.user_id=$1 ORDER BY s.id`,[req.user.id])).rows; const ids=servers.map(s=>s.id); let channels=[],members=[]; if(ids.length){channels=(await query(`SELECT * FROM channels WHERE server_id=ANY($1::int[]) ORDER BY id`,[ids])).rows; members=(await query(`SELECT sm.server_id,sm.role,u.id,u.username,u.avatar,u.status,u.bio FROM server_members sm JOIN users u ON u.id=sm.user_id WHERE sm.server_id=ANY($1::int[]) ORDER BY u.username`,[ids])).rows;} res.json({user:req.user,servers,channels,members});});
app.get("/api/users/search",requireAuth,async(req,res)=>{const q=String(req.query.q||"").trim(); if(q.length<2)return res.json({users:[]}); const r=await query(`SELECT id,username,avatar,status,bio FROM users WHERE username ILIKE $1 AND id<>$2 ORDER BY username LIMIT 20`,[`%${q}%`,req.user.id]); res.json({users:r.rows});});
app.get("/api/friends",requireAuth,async(req,res)=>{const r=await query(`SELECT f.*, r.username requester_username,r.avatar requester_avatar,r.status requester_status,r.bio requester_bio, a.username addressee_username,a.avatar addressee_avatar,a.status addressee_status,a.bio addressee_bio FROM friendships f JOIN users r ON r.id=f.requester_id JOIN users a ON a.id=f.addressee_id WHERE f.requester_id=$1 OR f.addressee_id=$1 ORDER BY f.updated_at DESC`,[req.user.id]); const friends=[],incoming=[],outgoing=[]; for(const x of r.rows){const other=x.requester_id===req.user.id?{id:x.addressee_id,username:x.addressee_username,avatar:x.addressee_avatar,status:x.addressee_status,bio:x.addressee_bio}:{id:x.requester_id,username:x.requester_username,avatar:x.requester_avatar,status:x.requester_status,bio:x.requester_bio}; const item={id:x.id,status:x.status,other}; if(x.status==='accepted')friends.push(item); else if(x.addressee_id===req.user.id)incoming.push(item); else outgoing.push(item);} res.json({friends,incoming,outgoing});});
app.post("/api/friends/request",requireAuth,async(req,res)=>{const username=String(req.body.username||"").trim(); const t=await query(`SELECT id,username,avatar,status,bio FROM users WHERE username=$1`,[username]); if(!t.rowCount)return res.status(404).json({error:"Kullanıcı bulunamadı."}); const u=t.rows[0]; if(u.id===req.user.id)return res.status(400).json({error:"Kendini ekleyemezsin."}); const ex=await query(`SELECT * FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,[req.user.id,u.id]); if(ex.rowCount)return res.status(409).json({error:ex.rows[0].status==='accepted'?"Zaten arkadaşsınız.":"Zaten bekleyen istek var."}); await query(`INSERT INTO friendships(requester_id,addressee_id,status) VALUES($1,$2,'pending')`,[req.user.id,u.id]); io.to(`user:${u.id}`).emit("friend:request",pub(req.user)); res.json({ok:true});});
app.post("/api/friends/:id/accept",requireAuth,async(req,res)=>{const r=await query(`SELECT * FROM friendships WHERE id=$1`,[Number(req.params.id)]); if(!r.rowCount)return res.status(404).json({error:"İstek yok."}); const f=r.rows[0]; if(f.addressee_id!==req.user.id)return res.status(403).json({error:"Bu istek sana gelmemiş."}); await query(`UPDATE friendships SET status='accepted',updated_at=NOW() WHERE id=$1`,[f.id]); io.to(`user:${f.requester_id}`).emit("friend:accepted",pub(req.user)); res.json({ok:true});});
app.post("/api/friends/:id/reject",requireAuth,async(req,res)=>{await query(`DELETE FROM friendships WHERE id=$1 AND (requester_id=$2 OR addressee_id=$2)`,[Number(req.params.id),req.user.id]); res.json({ok:true});});
app.delete("/api/friends/:uid",requireAuth,async(req,res)=>{await query(`DELETE FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,[req.user.id,Number(req.params.uid)]); res.json({ok:true});});
app.get("/api/dms/:uid/messages",requireAuth,async(req,res)=>{const uid=Number(req.params.uid); if(!(await friends(req.user.id,uid)))return res.status(403).json({error:"DM için önce arkadaş olmalısınız."}); const r=await query(`SELECT dm.*,u.username,u.avatar FROM direct_messages dm JOIN users u ON u.id=dm.sender_id WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1) ORDER BY dm.id LIMIT 200`,[req.user.id,uid]); res.json({messages:r.rows});});
app.post("/api/dms/:uid/messages",requireAuth,async(req,res)=>{const uid=Number(req.params.uid); if(!(await friends(req.user.id,uid)))return res.status(403).json({error:"DM için önce arkadaş olmalısınız."}); const content=String(req.body.content||"").trim(); if(!content)return res.status(400).json({error:"Mesaj boş."}); const r=await query(`INSERT INTO direct_messages(sender_id,receiver_id,content) VALUES($1,$2,$3) RETURNING *`,[req.user.id,uid,content.slice(0,2000)]); const msg={...r.rows[0],username:req.user.username,avatar:req.user.avatar}; io.to(`user:${uid}`).emit("dm:new",msg); io.to(`user:${req.user.id}`).emit("dm:new",msg); res.json({message:msg});});

app.post("/api/servers/:sid/invites", requireAuth, async(req,res)=>{
 const sid=Number(req.params.sid);
 const m=await member(req.user.id,sid);
 if(!m)return res.status(403).json({error:"Bu sunucuda değilsin."});
 const code=inviteCode();
 const max_uses=Number(req.body.max_uses||0);
 const hours=Number(req.body.hours||0);
 const exp=hours>0?`NOW() + INTERVAL '${Math.min(hours,720)} hours'`:null;
 const sql=exp
  ? `INSERT INTO server_invites(server_id,creator_id,code,max_uses,expires_at) VALUES($1,$2,$3,$4,${exp}) RETURNING *`
  : `INSERT INTO server_invites(server_id,creator_id,code,max_uses) VALUES($1,$2,$3,$4) RETURNING *`;
 const r=await query(sql,[sid,req.user.id,code,max_uses]);
 await query(`INSERT INTO audit_logs(server_id,user_id,action) VALUES($1,$2,$3)`,[sid,req.user.id,`${req.user.username} davet linki oluşturdu.`]);
 res.json({invite:r.rows[0], url:`/invite/${code}`});
});

app.get("/api/invites/:code", requireAuth, async(req,res)=>{
 const code=String(req.params.code||"").toUpperCase();
 const r=await query(`SELECT i.*,s.name,s.icon,s.color,s.description FROM server_invites i JOIN servers s ON s.id=i.server_id WHERE i.code=$1`,[code]);
 if(!r.rowCount)return res.status(404).json({error:"Davet bulunamadı."});
 const inv=r.rows[0];
 if(inv.expires_at && new Date(inv.expires_at)<new Date())return res.status(410).json({error:"Davet süresi bitmiş."});
 if(inv.max_uses>0 && inv.uses>=inv.max_uses)return res.status(410).json({error:"Davet kullanım hakkı dolmuş."});
 res.json({invite:inv});
});

app.post("/api/invites/:code/join", requireAuth, async(req,res)=>{
 const code=String(req.params.code||"").toUpperCase();
 const r=await query(`SELECT * FROM server_invites WHERE code=$1`,[code]);
 if(!r.rowCount)return res.status(404).json({error:"Davet bulunamadı."});
 const inv=r.rows[0];
 if(inv.expires_at && new Date(inv.expires_at)<new Date())return res.status(410).json({error:"Davet süresi bitmiş."});
 if(inv.max_uses>0 && inv.uses>=inv.max_uses)return res.status(410).json({error:"Davet kullanım hakkı dolmuş."});
 await query(`INSERT INTO server_members(server_id,user_id,role) VALUES($1,$2,'Member') ON CONFLICT DO NOTHING`,[inv.server_id,req.user.id]);
 await query(`UPDATE server_invites SET uses=uses+1 WHERE id=$1`,[inv.id]);
 await query(`INSERT INTO audit_logs(server_id,user_id,action) VALUES($1,$2,$3)`,[inv.server_id,req.user.id,`${req.user.username} davet linki ile katıldı.`]);
 res.json({ok:true,server_id:inv.server_id});
});

app.post("/api/servers",requireAuth,async(req,res)=>{const name=String(req.body.name||"").trim().slice(0,80); if(!name)return res.status(400).json({error:"Sunucu adı gerekli."}); const icon=String(req.body.icon||name[0]||"S").slice(0,2).toUpperCase(), color=String(req.body.color||"#5865f2").slice(0,20), description=String(req.body.description||"").slice(0,300); const s=await query(`INSERT INTO servers(name,icon,color,description,owner_id) VALUES($1,$2,$3,$4,$5) RETURNING *`,[name,icon,color,description,req.user.id]); const server=s.rows[0]; await query(`INSERT INTO server_members(server_id,user_id,role) VALUES($1,$2,'Owner')`,[server.id,req.user.id]); const ch=(await query(`INSERT INTO channels(server_id,name,type,category,topic) VALUES($1,'genel','text','YAZI','Genel sohbet'),($1,'sesli-sohbet','voice','SES','Sesli sohbet') RETURNING *`,[server.id])).rows; res.json({server,channels:ch});});
app.post("/api/servers/:sid/channels",requireAuth,async(req,res)=>{const sid=Number(req.params.sid); if(!(await member(req.user.id,sid)))return res.status(403).json({error:"Bu sunucuda değilsin."}); const name=String(req.body.name||"").trim().toLowerCase().replace(/\s+/g,"-").slice(0,80); if(!name)return res.status(400).json({error:"Kanal adı gerekli."}); const type=["text","announcement","voice","stage"].includes(req.body.type)?req.body.type:"text", category=String(req.body.category||(type==='voice'?'SES':'YAZI')).slice(0,40), topic=String(req.body.topic||"").slice(0,300); const r=await query(`INSERT INTO channels(server_id,name,type,category,topic) VALUES($1,$2,$3,$4,$5) RETURNING *`,[sid,name,type,category,topic]); io.emit("channel:new",r.rows[0]); res.json({channel:r.rows[0]});});
app.get("/api/channels/:cid/messages",requireAuth,async(req,res)=>{const cid=Number(req.params.cid), ch=await chServer(cid); if(!ch)return res.status(404).json({error:"Kanal yok."}); if(!(await member(req.user.id,ch.server_id)))return res.status(403).json({error:"Bu sunucuda değilsin."}); const r=await query(`SELECT m.*,u.username,u.avatar,COALESCE(json_object_agg(x.emoji,x.count) FILTER (WHERE x.emoji IS NOT NULL),'{}') reactions FROM messages m JOIN users u ON u.id=m.user_id LEFT JOIN (SELECT message_id,emoji,COUNT(*)::int count FROM reactions GROUP BY message_id,emoji) x ON x.message_id=m.id WHERE m.channel_id=$1 GROUP BY m.id,u.username,u.avatar ORDER BY m.id LIMIT 200`,[cid]); res.json({messages:r.rows});});
app.post("/api/channels/:cid/messages",requireAuth,async(req,res)=>{const cid=Number(req.params.cid), ch=await chServer(cid); if(!ch)return res.status(404).json({error:"Kanal yok."}); if(!(await member(req.user.id,ch.server_id)))return res.status(403).json({error:"Bu sunucuda değilsin."}); const content=String(req.body.content||"").trim(); if(!content)return res.status(400).json({error:"Mesaj boş."}); const r=await query(`INSERT INTO messages(channel_id,user_id,content) VALUES($1,$2,$3) RETURNING *`,[cid,req.user.id,content.slice(0,2000)]); const msg={...r.rows[0],username:req.user.username,avatar:req.user.avatar,reactions:{}}; io.to(`channel:${cid}`).emit("message:new",msg); res.json({message:msg});});
app.patch("/api/messages/:id",requireAuth,async(req,res)=>{const id=Number(req.params.id), content=String(req.body.content||"").trim(); const own=await query(`SELECT * FROM messages WHERE id=$1 AND user_id=$2`,[id,req.user.id]); if(!own.rowCount)return res.status(403).json({error:"Sadece kendi mesajın."}); const r=await query(`UPDATE messages SET content=$1,edited_at=NOW() WHERE id=$2 RETURNING *`,[content.slice(0,2000),id]); io.to(`channel:${r.rows[0].channel_id}`).emit("message:update",r.rows[0]); res.json({message:r.rows[0]});});
app.delete("/api/messages/:id",requireAuth,async(req,res)=>{const id=Number(req.params.id); const m=await query(`SELECT * FROM messages WHERE id=$1`,[id]); if(!m.rowCount)return res.status(404).json({error:"Mesaj yok."}); await query(`DELETE FROM messages WHERE id=$1 AND user_id=$2`,[id,req.user.id]); io.to(`channel:${m.rows[0].channel_id}`).emit("message:delete",{id}); res.json({ok:true});});
app.post("/api/messages/:id/pin",requireAuth,async(req,res)=>{const r=await query(`UPDATE messages SET pinned=NOT pinned WHERE id=$1 RETURNING *`,[Number(req.params.id)]); if(!r.rowCount)return res.status(404).json({error:"Mesaj yok."}); io.to(`channel:${r.rows[0].channel_id}`).emit("message:update",r.rows[0]); res.json({message:r.rows[0]});});
app.post("/api/messages/:id/react",requireAuth,async(req,res)=>{const emoji=String(req.body.emoji||"👍").slice(0,16), id=Number(req.params.id); await query(`INSERT INTO reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[id,req.user.id,emoji]); const m=await query(`SELECT channel_id FROM messages WHERE id=$1`,[id]); if(m.rowCount)io.to(`channel:${m.rows[0].channel_id}`).emit("reaction:update",{messageId:id}); res.json({ok:true});});
app.get("/api/audit/:sid",requireAuth,async(req,res)=>{const sid=Number(req.params.sid); if(!(await member(req.user.id,sid)))return res.status(403).json({error:"Bu sunucuda değilsin."}); const r=await query(`SELECT a.*,u.username FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.server_id=$1 ORDER BY a.id DESC LIMIT 50`,[sid]); res.json({audit:r.rows});});
if(isProd){const dist=path.join(__dirname,"..","client","dist"); app.use(express.static(dist)); app.get("*",(_,res)=>res.sendFile(path.join(dist,"index.html")));}
const PORT=process.env.PORT||10000; httpServer.listen(PORT,()=>console.log(`Nexus social running ${PORT}`));
