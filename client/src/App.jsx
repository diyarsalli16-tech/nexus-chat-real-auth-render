import React, { useEffect, useMemo, useRef, useState } from "react";

const API = "";
const channelIcon = (type) => type === "voice" ? "🔊" : type === "stage" ? "🎙" : type === "announcement" ? "📢" : "#";

function token() {
  return localStorage.getItem("nexus_token");
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "İstek başarısız.");
  return data;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export default function App({ ioFactory }) {
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [user, setUser] = useState(null);
  const [servers, setServers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [members, setMembers] = useState([]);
  const [activeServerId, setActiveServerId] = useState(null);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [rightTab, setRightTab] = useState("members");
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("Hazır");
  const [socket, setSocket] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [audit, setAudit] = useState([]);
  const [threadFor, setThreadFor] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadDraft, setThreadDraft] = useState("");
  const videoRef = useRef(null);
  const screenRef = useRef(null);

  const activeServer = servers.find(s => s.id === activeServerId);
  const serverChannels = channels.filter(c => c.server_id === activeServerId);
  const activeChannel = channels.find(c => c.id === activeChannelId);
  const serverMembers = members.filter(m => m.server_id === activeServerId);

  const groupedChannels = useMemo(() => {
    const groups = {};
    serverChannels.forEach(c => {
      groups[c.category] ??= [];
      groups[c.category].push(c);
    });
    return groups;
  }, [serverChannels]);

  function show(msg) {
    setToast(msg);
    window.clearTimeout(window.__t);
    window.__t = window.setTimeout(() => setToast("Hazır"), 2200);
  }

  async function loadBootstrap() {
    const data = await api("/api/bootstrap");
    setUser(data.user);
    setServers(data.servers);
    setChannels(data.channels);
    setMembers(data.members);
    if (data.servers[0]) {
      const srv = data.servers[0];
      setActiveServerId(srv.id);
      const first = data.channels.find(c => c.server_id === srv.id);
      if (first) setActiveChannelId(first.id);
    }
  }

  useEffect(() => {
    if (token()) loadBootstrap().catch(() => localStorage.removeItem("nexus_token"));
  }, []);

  useEffect(() => {
    if (!user || !token()) return;
    const s = ioFactory("/", { auth: { token: token() } });
    s.on("connect", () => show("Canlı bağlantı açıldı"));
    s.on("message:new", (msg) => setMessages(old => old.some(m => m.id === msg.id) ? old : [...old, msg]));
    s.on("message:update", (msg) => setMessages(old => old.map(m => m.id === msg.id ? { ...m, ...msg } : m)));
    s.on("message:delete", ({ id }) => setMessages(old => old.filter(m => m.id !== id)));
    s.on("reaction:update", async ({ messageId }) => {
      if (activeChannelId) loadMessages(activeChannelId, false);
    });
    s.on("channel:new", (ch) => setChannels(old => old.some(c => c.id === ch.id) ? old : [...old, ch]));
    setSocket(s);
    return () => s.disconnect();
  }, [user]);

  useEffect(() => {
    if (activeChannelId) loadMessages(activeChannelId);
  }, [activeChannelId]);

  useEffect(() => {
    if (socket && activeChannelId) socket.emit("channel:join", activeChannelId);
  }, [socket, activeChannelId]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (screenRef.current) screenRef.current.srcObject = screenStream;
  }, [screenStream]);

  async function loadMessages(channelId, quiet = true) {
    const ch = channels.find(c => c.id === channelId);
    if (ch && ["voice", "stage"].includes(ch.type)) {
      setMessages([]);
      return;
    }
    try {
      const data = await api(`/api/channels/${channelId}/messages`);
      setMessages(data.messages);
    } catch (err) {
      if (quiet) setError(err.message);
    }
  }

  async function submitAuth(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await api(authMode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: JSON.stringify(authForm)
      });
      localStorage.setItem("nexus_token", data.token);
      setUser(data.user);
      await loadBootstrap();
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    localStorage.removeItem("nexus_token");
    window.location.reload();
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || !activeChannel) return;
    setDraft("");
    try {
      await api(`/api/channels/${activeChannel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content })
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function react(message, emoji) {
    await api(`/api/messages/${message.id}/react`, { method: "POST", body: JSON.stringify({ emoji }) });
    await loadMessages(activeChannelId, false);
  }

  async function pin(message) {
    const data = await api(`/api/messages/${message.id}/pin`, { method: "POST" });
    setMessages(old => old.map(m => m.id === message.id ? { ...m, ...data.message } : m));
  }

  async function del(message) {
    await api(`/api/messages/${message.id}`, { method: "DELETE" });
    setMessages(old => old.filter(m => m.id !== message.id));
  }

  async function edit(message) {
    const content = prompt("Yeni mesaj:", message.content);
    if (!content) return;
    const data = await api(`/api/messages/${message.id}`, {
      method: "PATCH",
      body: JSON.stringify({ content })
    });
    setMessages(old => old.map(m => m.id === message.id ? { ...m, ...data.message } : m));
  }

  async function openThread(message) {
    setThreadFor(message);
    setRightTab("thread");
    const data = await api(`/api/messages/${message.id}/thread`);
    setThreadMessages(data.messages);
  }

  async function sendThread() {
    if (!threadFor || !threadDraft.trim()) return;
    const data = await api(`/api/messages/${threadFor.id}/thread`, {
      method: "POST",
      body: JSON.stringify({ content: threadDraft })
    });
    setThreadMessages(old => [...old, data.message]);
    setThreadDraft("");
  }

  async function createServer(form) {
    const data = await api("/api/servers", { method: "POST", body: JSON.stringify(form) });
    setServers(old => [...old, data.server]);
    setChannels(old => [...old, ...data.channels]);
    setActiveServerId(data.server.id);
    setActiveChannelId(data.channels[0]?.id);
    setModal(null);
  }

  async function createChannel(form) {
    const data = await api(`/api/servers/${activeServerId}/channels`, { method: "POST", body: JSON.stringify(form) });
    setChannels(old => [...old, data.channel]);
    setActiveChannelId(data.channel.id);
    setModal(null);
  }

  async function loadAudit() {
    if (!activeServerId) return;
    const data = await api(`/api/audit/${activeServerId}`);
    setAudit(data.audit);
  }

  async function joinVoice() {
    if (!activeChannel) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setLocalStream(stream);
      setVoiceJoined(true);
      socket?.emit("voice:join", activeChannel.id);
      show("Mikrofon izni alındı, ses odasına katıldın");
    } catch {
      setError("Mikrofon izni verilmedi veya cihaz bulunamadı.");
    }
  }

  async function toggleCamera() {
    try {
      if (localStream?.getVideoTracks().length) {
        localStream.getVideoTracks().forEach(t => t.stop());
        const audioTracks = localStream.getAudioTracks();
        const onlyAudio = new MediaStream(audioTracks);
        setLocalStream(onlyAudio);
        return;
      }
      const video = await navigator.mediaDevices.getUserMedia({ video: true, audio: voiceJoined });
      setLocalStream(video);
      show("Kamera izni alındı");
    } catch {
      setError("Kamera izni verilmedi veya kamera yok.");
    }
  }

  async function toggleScreen() {
    try {
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        setScreenStream(null);
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setScreenStream(stream);
      show("Ekran paylaşımı başladı");
    } catch {
      setError("Ekran paylaşımı iptal edildi.");
    }
  }

  function leaveVoice() {
    localStream?.getTracks().forEach(t => t.stop());
    screenStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setScreenStream(null);
    setVoiceJoined(false);
    socket?.emit("voice:leave", activeChannel?.id);
  }

  if (!user) {
    return (
      <div className="authPage">
        <form className="authCard" onSubmit={submitAuth}>
          <div className="brand">N</div>
          <h1>{authMode === "login" ? "Giriş Yap" : "Kaydol"}</h1>
          <p>Bu ekran simülasyon değil. Kullanıcı PostgreSQL veritabanına kaydedilir, şifre bcrypt ile hashlenir.</p>
          <input value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} placeholder="Kullanıcı adı" />
          <input type="password" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} placeholder="Şifre" />
          {error && <div className="error">{error}</div>}
          <button>{authMode === "login" ? "Giriş Yap" : "Hesap Oluştur"}</button>
          <span onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
            {authMode === "login" ? "Hesabın yok mu? Kaydol" : "Hesabın var mı? Giriş yap"}
          </span>
          <small>İlk kurulum demo hesabı: admin / 123456</small>
        </form>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="serverRail">
        {servers.map(s => <button key={s.id} className={`serverIcon ${s.id === activeServerId ? "active" : ""}`} style={{ background: s.color }} onClick={() => { setActiveServerId(s.id); const first = channels.find(c => c.server_id === s.id); setActiveChannelId(first?.id); }}>{s.icon}</button>)}
        <button className="serverIcon add" onClick={() => setModal("server")}>+</button>
        <div className="railBottom"><button onClick={() => setModal("settings")}>⚙</button><button onClick={logout}>⏻</button></div>
      </aside>

      <aside className="channelPanel">
        <div className="serverHeader" style={{ background: `linear-gradient(135deg, ${activeServer?.color || "#5865f2"}, #111827)` }}>
          <h1>{activeServer?.name}</h1>
          <p>{activeServer?.description}</p>
        </div>
        <button className="serverBoost" onClick={() => { setRightTab("audit"); loadAudit(); }}>🛡 Audit / Sunucu</button>
        <div className="channelScroll">
          {Object.entries(groupedChannels).map(([cat, list]) => (
            <section key={cat}>
              <div className="groupTitle"><span>{cat}</span><button onClick={() => setModal("channel")}>+</button></div>
              {list.map(c => <button key={c.id} className={`channelBtn ${c.id === activeChannelId ? "active" : ""}`} onClick={() => { setActiveChannelId(c.id); setRightTab(["voice", "stage"].includes(c.type) ? "voice" : "members"); }}>{channelIcon(c.type)} {c.name}</button>)}
            </section>
          ))}
        </div>
        <div className="userDock"><div className="avatar">{user.avatar}</div><div><b>{user.username}</b><p>{user.status}</p></div></div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div><h2>{channelIcon(activeChannel?.type)} {activeChannel?.name}</h2><p>{activeChannel?.topic}</p></div>
          <div className="topActions">
            <button onClick={() => setRightTab("pins")}>📌</button>
            <button onClick={() => setRightTab("members")}>👥</button>
          </div>
        </header>

        {["voice", "stage"].includes(activeChannel?.type) ? (
          <section className="voiceRoom">
            <h1>{channelIcon(activeChannel.type)} {activeChannel.name}</h1>
            <p>{activeChannel.topic}</p>
            <div className="mediaGrid">
              <div className="mediaTile"><video ref={videoRef} autoPlay muted playsInline />{!localStream && <span>Kamera/Mikrofon kapalı</span>}</div>
              <div className="mediaTile"><video ref={screenRef} autoPlay muted playsInline />{!screenStream && <span>Ekran paylaşımı kapalı</span>}</div>
            </div>
            <div className="callBar">
              {!voiceJoined ? <button onClick={joinVoice}>Ses Kanalına Katıl</button> : <button onClick={leaveVoice}>Çık</button>}
              <button onClick={toggleCamera}>Kamera Aç/Kapat</button>
              <button onClick={toggleScreen}>Ekran Paylaş</button>
            </div>
          </section>
        ) : (
          <section className="chat">
            <div className="messages">
              <div className="channelHero"><div className="heroIcon">{channelIcon(activeChannel?.type)}</div><div><h2>{activeChannel?.name}</h2><p>{activeChannel?.topic}</p></div></div>
              {messages.map(m => (
                <article className="message" key={m.id}>
                  <div className="avatar">{m.avatar}</div>
                  <div className="messageBody">
                    <div className="messageTop"><b>{m.username}</b><span>{formatTime(m.created_at)}</span>{m.pinned && <span>📌</span>}</div>
                    <p>{m.content}</p>
                    <div className="reactions">{Object.entries(m.reactions || {}).map(([e, n]) => <button key={e} onClick={() => react(m, e)}>{e} {n}</button>)}</div>
                    <div className="messageActions">
                      <button onClick={() => react(m, "👍")}>👍</button>
                      <button onClick={() => react(m, "🔥")}>🔥</button>
                      <button onClick={() => pin(m)}>Pin</button>
                      <button onClick={() => openThread(m)}>Thread</button>
                      {m.user_id === user.id && <button onClick={() => edit(m)}>Düzenle</button>}
                      <button onClick={() => del(m)}>Sil</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="composer"><button>+</button><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="Mesaj yaz" /><button onClick={sendMessage}>➤</button></div>
          </section>
        )}
      </main>

      <aside className="rightPanel">
        <div className="tabs"><button onClick={() => setRightTab("members")}>Üye</button><button onClick={() => { setRightTab("audit"); loadAudit(); }}>Audit</button><button onClick={() => setRightTab("thread")}>Thread</button></div>
        {rightTab === "members" && serverMembers.map(m => <div className="memberCard" key={m.id}><div className="avatar">{m.avatar}</div><div><b>{m.username}</b><p>{m.role} • {m.status}</p><small>{m.bio}</small></div></div>)}
        {rightTab === "pins" && messages.filter(m => m.pinned).map(m => <div className="activity" key={m.id}><b>{m.username}</b><p>{m.content}</p></div>)}
        {rightTab === "audit" && audit.map(a => <div className="activity" key={a.id}><b>{formatTime(a.created_at)}</b><p>{a.action}</p></div>)}
        {rightTab === "thread" && threadFor && <>
          <h3>Thread</h3>
          <div className="activity"><b>{threadFor.username}</b><p>{threadFor.content}</p></div>
          {threadMessages.map(tm => <div className="memberCard" key={tm.id}><div className="avatar">{tm.avatar}</div><div><b>{tm.username}</b><p>{tm.content}</p></div></div>)}
          <div className="threadInput"><input value={threadDraft} onChange={e => setThreadDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && sendThread()} placeholder="Thread mesajı" /><button onClick={sendThread}>➤</button></div>
        </>}
      </aside>

      <div className="toast">{toast}</div>
      {error && <div className="error floating" onClick={() => setError("")}>{error}</div>}

      {modal === "server" && <ServerModal onClose={() => setModal(null)} onCreate={createServer} />}
      {modal === "channel" && <ChannelModal onClose={() => setModal(null)} onCreate={createChannel} />}
      {modal === "settings" && <SettingsModal user={user} setUser={setUser} onClose={() => setModal(null)} />}
    </div>
  );
}

function ServerModal({ onClose, onCreate }) {
  const [f, setF] = useState({ name: "", icon: "S", color: "#5865f2", description: "" });
  return <Modal title="Sunucu Oluştur" onClose={onClose}><Field label="Ad" value={f.name} onChange={v => setF({ ...f, name: v })} /><Field label="İkon" value={f.icon} onChange={v => setF({ ...f, icon: v })} /><Field label="Renk" type="color" value={f.color} onChange={v => setF({ ...f, color: v })} /><Field label="Açıklama" value={f.description} onChange={v => setF({ ...f, description: v })} /><button className="primary" onClick={() => onCreate(f)}>Oluştur</button></Modal>;
}

function ChannelModal({ onClose, onCreate }) {
  const [f, setF] = useState({ name: "", type: "text", category: "YAZI", topic: "" });
  return <Modal title="Kanal Oluştur" onClose={onClose}><Field label="Ad" value={f.name} onChange={v => setF({ ...f, name: v })} /><label className="field"><span>Tip</span><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="text">Yazı</option><option value="announcement">Duyuru</option><option value="voice">Ses</option><option value="stage">Stage</option></select></label><Field label="Kategori" value={f.category} onChange={v => setF({ ...f, category: v })} /><Field label="Konu" value={f.topic} onChange={v => setF({ ...f, topic: v })} /><button className="primary" onClick={() => onCreate(f)}>Oluştur</button></Modal>;
}

function SettingsModal({ user, setUser, onClose }) {
  const [bio, setBio] = useState(user.bio || "");
  const [status, setStatus] = useState(user.status || "online");
  async function save() {
    const data = await api("/api/me", { method: "PATCH", body: JSON.stringify({ bio, status }) });
    setUser(data.user);
    onClose();
  }
  return <Modal title="Ayarlar" onClose={onClose}><Field label="Bio" value={bio} onChange={setBio} /><label className="field"><span>Durum</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="online">Çevrimiçi</option><option value="idle">Boşta</option><option value="dnd">Rahatsız etmeyin</option><option value="offline">Görünmez</option></select></label><button className="primary" onClick={save}>Kaydet</button></Modal>;
}

function Field({ label, value, onChange, type = "text" }) {
  return <label className="field"><span>{label}</span><input type={type} value={value} onChange={e => onChange(e.target.value)} /></label>;
}

function Modal({ title, children, onClose }) {
  return <div className="modalBg"><div className="modal"><button className="close" onClick={onClose}>×</button><h2>{title}</h2>{children}</div></div>;
}
