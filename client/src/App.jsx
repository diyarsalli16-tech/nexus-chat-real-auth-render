import React, { useEffect, useMemo, useRef, useState } from "react";

const API = "";
const defaultRtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp"
      ],
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ]
};
const channelIcon = (type) => type === "voice" ? "🔊" : type === "stage" ? "🎙" : type === "announcement" ? "📢" : "#";

function token() { return localStorage.getItem("nexus_token"); }

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

function time(date) {
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

  const [friends, setFriends] = useState({ friends: [], incoming: [], outgoing: [] });
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [dmUser, setDmUser] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [dmDraft, setDmDraft] = useState("");

  const [rightTab, setRightTab] = useState("friends");
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("Hazır");
  const [audit, setAudit] = useState([]);
  const [invitePreview, setInvitePreview] = useState(null);

  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);
  const dmUserRef = useRef(null);
  const activeChannelIdRef = useRef(null);

  const [call, setCall] = useState({
    active: false,
    incoming: null,
    peerId: null,
    peerName: "",
    status: "Kapalı",
    muted: false,
    camera: false,
    screen: false,
    localVolume: 100,
    remoteVolume: 100
  });

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const persistentRemoteAudioRef = useRef(null);
  const compactLocalVideoRef = useRef(null);
  const compactRemoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const rawMicStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const micGainRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const rtcConfigRef = useRef(defaultRtcConfig);

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
    window.clearTimeout(window.__toast);
    window.__toast = window.setTimeout(() => setToast("Hazır"), 2400);
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

    await loadFriends();
  }

  async function loadFriends() {
    const data = await api("/api/friends");
    setFriends(data);
  }

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

  async function handleInviteFromUrl() {
    const match = location.pathname.match(/^\/invite\/([A-Z0-9]+)/i);
    if (!match) return;

    try {
      const data = await fetch(`/api/invites/${match[1].toUpperCase()}`).then(r => r.json());
      if (data.error) throw new Error(data.error);
      setInvitePreview(data.invite);
      setModal("invitePreview");
    } catch (err) {
      setError(err.message || "Davet açılamadı.");
    }
  }

  useEffect(() => {
    fetch("/api/rtc-config")
      .then(r => r.json())
      .then(data => {
        if (data?.iceServers?.length) rtcConfigRef.current = { iceServers: data.iceServers };
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (token()) loadBootstrap().catch(() => localStorage.removeItem("nexus_token"));
    handleInviteFromUrl();
  }, []);

  useEffect(() => { dmUserRef.current = dmUser; }, [dmUser]);
  useEffect(() => { activeChannelIdRef.current = activeChannelId; }, [activeChannelId]);

  useEffect(() => {
    if (!user || !token()) return;

    const s = ioFactory("/", { auth: { token: token() } });
    socketRef.current = s;

    s.on("connect", () => show("Canlı bağlantı açıldı"));
    s.on("message:new", msg => setMessages(old => old.some(m => m.id === msg.id) ? old : [...old, msg]));
    s.on("message:update", msg => setMessages(old => old.map(m => m.id === msg.id ? { ...m, ...msg } : m)));
    s.on("message:delete", ({ id }) => setMessages(old => old.filter(m => m.id !== id)));
    s.on("reaction:update", () => activeChannelIdRef.current && loadMessages(activeChannelIdRef.current, false));
    s.on("channel:new", ch => setChannels(old => old.some(c => c.id === ch.id) ? old : [...old, ch]));

    s.on("friend:request", () => { loadFriends(); show("Yeni arkadaş isteği"); });
    s.on("friend:accepted", () => { loadFriends(); show("Arkadaşlık kabul edildi"); });

    s.on("dm:new", msg => {
      const currentDm = dmUserRef.current;
      if (currentDm && (msg.sender_id === currentDm.id || msg.receiver_id === currentDm.id)) {
        setDmMessages(old => old.some(m => m.id === msg.id) ? old : [...old, msg]);
      }
      show("Yeni DM");
    });

    s.on("dm:call:incoming", payload => {
      setCall(c => ({ ...c, incoming: payload, status: `${payload.username} arıyor` }));
      setRightTab("dm");
    });

    s.on("dm:call:accepted", async ({ from }) => {
      try {
        setCall(c => ({ ...c, status: "Arama kabul edildi" }));
        await createOffer(from);
      } catch (err) {
        console.error("Nexus call offer error", err);
        setError(err.message || "Arama offer gönderemedi.");
        setCall(c => ({ ...c, status: "Offer hatası" }));
      }
    });

    s.on("dm:call:rejected", () => {
      endCall(false);
      show("Arama reddedildi");
    });

    s.on("dm:call:ended", () => {
      endCall(false);
      show("Arama kapandı");
    });

    s.on("rtc:offer", async ({ from, offer }) => {
      try {
        await ensurePeer(from);
        await pcRef.current.setRemoteDescription(offer);
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        s.emit("rtc:answer", { to: from, answer });
        setCall(c => ({ ...c, active: true, peerId: from, status: "Cevap gönderildi" }));
      } catch (err) {
        console.error("Nexus rtc offer error", err);
        setError(err.message || "Gelen arama cevabı oluşturulamadı.");
      }
    });

    s.on("rtc:answer", async ({ answer }) => {
      try {
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(answer);
          setCall(c => ({ ...c, status: "Answer alındı" }));
        }
      } catch (err) {
        console.error("Nexus rtc answer error", err);
        setError(err.message || "Answer işlenemedi.");
      }
    });

    s.on("rtc:candidate", async ({ candidate }) => {
      try {
        if (pcRef.current && candidate) await pcRef.current.addIceCandidate(candidate);
      } catch {}
    });

    setSocket(s);
    return () => {
      if (socketRef.current === s) socketRef.current = null;
      s.disconnect();
    };
  }, [user]);

  useEffect(() => {
    if (activeChannelId) loadMessages(activeChannelId);
  }, [activeChannelId]);

  useEffect(() => {
    if (socketRef.current && activeChannelId) socketRef.current.emit("channel:join", activeChannelId);
  }, [socket, activeChannelId]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    if (compactLocalVideoRef.current) compactLocalVideoRef.current.srcObject = localStreamRef.current;

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play?.().catch(() => {});
    }

    if (compactRemoteVideoRef.current) {
      compactRemoteVideoRef.current.srcObject = remoteStreamRef.current;
      compactRemoteVideoRef.current.play?.().catch(() => {});
    }

    if (persistentRemoteAudioRef.current) {
      persistentRemoteAudioRef.current.srcObject = remoteStreamRef.current;
      persistentRemoteAudioRef.current.volume = call.remoteVolume / 100;
      persistentRemoteAudioRef.current.play?.().catch(() => {});
    }

    if (screenVideoRef.current) screenVideoRef.current.srcObject = screenStreamRef.current;
  }, [call]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.volume = call.remoteVolume / 100;
    if (compactRemoteVideoRef.current) compactRemoteVideoRef.current.volume = call.remoteVolume / 100;
    if (persistentRemoteAudioRef.current) persistentRemoteAudioRef.current.volume = call.remoteVolume / 100;
  }, [call.remoteVolume]);

  useEffect(() => {
    if (micGainRef.current) micGainRef.current.gain.value = call.localVolume / 100;
  }, [call.localVolume]);

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
    location.href = "/";
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
    const data = await api(`/api/messages/${message.id}`, { method: "PATCH", body: JSON.stringify({ content }) });
    setMessages(old => old.map(m => m.id === message.id ? { ...m, ...data.message } : m));
  }

  async function searchUsers() {
    if (userSearch.trim().length < 2) return setSearchResults([]);
    const data = await api(`/api/users/search?q=${encodeURIComponent(userSearch.trim())}`);
    setSearchResults(data.users);
  }

  async function sendFriendRequest(username) {
    try {
      await api("/api/friends/request", { method: "POST", body: JSON.stringify({ username }) });
      await loadFriends();
      show(`${username} kullanıcısına istek gönderildi`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function acceptFriend(id) {
    await api(`/api/friends/${id}/accept`, { method: "POST" });
    await loadFriends();
  }

  async function rejectFriend(id) {
    await api(`/api/friends/${id}/reject`, { method: "POST" });
    await loadFriends();
  }

  async function removeFriend(otherId) {
    await api(`/api/friends/${otherId}`, { method: "DELETE" });
    if (dmUser?.id === otherId) {
      setDmUser(null);
      setDmMessages([]);
    }
    await loadFriends();
  }

  async function openDm(other) {
    setDmUser(other);
    setRightTab("dm");
    const data = await api(`/api/dms/${other.id}/messages`);
    setDmMessages(data.messages);
  }

  async function sendDm() {
    if (!dmUser || !dmDraft.trim()) return;

    const content = dmDraft.trim();
    setDmDraft("");

    try {
      const data = await api(`/api/dms/${dmUser.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content })
      });

      // Socket geç gelse bile gönderen kişi mesajı anında görsün.
      setDmMessages(old => old.some(m => m.id === data.message.id) ? old : [...old, data.message]);
    } catch (err) {
      setError(err.message);
      setDmDraft(content);
    }
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

  async function createInvite() {
    if (!activeServerId) return;
    const data = await api(`/api/servers/${activeServerId}/invites`, { method: "POST", body: JSON.stringify({}) });
    setModal({ type: "inviteCreated", url: data.url, invite: data.invite });
  }

  async function joinInvite(code) {
    const data = await api(`/api/invites/${code}/join`, { method: "POST" });
    show("Sunucuya katıldın");
    setModal(null);
    history.replaceState({}, "", "/");
    await loadBootstrap();
    setActiveServerId(data.server_id);
  }

  async function loadAudit() {
    if (!activeServerId) return;
    const data = await api(`/api/audit/${activeServerId}`);
    setAudit(data.audit);
  }

  async function getAudioStream() {
    if (localStreamRef.current?.getAudioTracks().length) return localStreamRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Tarayıcı mikrofon API'sini vermiyor. HTTPS Render linkiyle aç.");
    }

    const raw = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    rawMicStreamRef.current = raw;

    // Mikrofon ses seviyesi slider'ı gerçekten etki etsin diye WebAudio gain kullanıyoruz.
    const AudioCtx = window.AudioContext || window.webkitAudioContext;

    if (AudioCtx) {
      const ctx = new AudioCtx();
      await ctx.resume?.();
      const source = ctx.createMediaStreamSource(raw);
      const gain = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();

      gain.gain.value = call.localVolume / 100;
      source.connect(gain);
      gain.connect(dest);

      audioContextRef.current = ctx;
      micGainRef.current = gain;
      localStreamRef.current = dest.stream;
    } else {
      localStreamRef.current = raw;
    }

    setCall(c => ({ ...c, status: "Mikrofon hazır" }));
    return localStreamRef.current;
  }

  async function ensurePeer(peerId) {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection(rtcConfigRef.current);
    pcRef.current = pc;

    pc.onicecandidate = e => {
      if (e.candidate && socketRef.current) socketRef.current.emit("rtc:candidate", { to: peerId, candidate: e.candidate });
    };

    pc.oniceconnectionstatechange = () => {
      setCall(c => ({ ...c, status: `ICE: ${pc.iceConnectionState}` }));
    };

    pc.onconnectionstatechange = () => {
      setCall(c => ({ ...c, status: `Bağlantı: ${pc.connectionState}` }));
    };

    pc.onsignalingstatechange = () => {
      console.log("Nexus RTC signaling:", pc.signalingState);
    };

    pc.ontrack = e => {
      remoteStreamRef.current = e.streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
        remoteVideoRef.current.play?.().catch(() => {});
      }
      if (compactRemoteVideoRef.current) {
        compactRemoteVideoRef.current.srcObject = e.streams[0];
        compactRemoteVideoRef.current.play?.().catch(() => {});
      }
      if (persistentRemoteAudioRef.current) {
        persistentRemoteAudioRef.current.srcObject = e.streams[0];
        persistentRemoteAudioRef.current.play?.().catch(() => {});
      }
      setCall(c => ({ ...c, status: "Ses bağlantısı geldi" }));
    };

    const stream = localStreamRef.current || await getAudioStream();
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    return pc;
  }

  async function startDmCall() {
    if (!dmUser || !socketRef.current) {
      setError("Canlı bağlantı hazır değil. Sayfayı yenile.");
      return;
    }
    try {
      await getAudioStream();
      setCall(c => ({
        ...c,
        active: true,
        peerId: dmUser.id,
        peerName: dmUser.username,
        status: `${dmUser.username} aranıyor...`,
        incoming: null
      }));
      socketRef.current.emit("dm:call:invite", { to: dmUser.id });
    } catch (err) {
      setError(err.message || "Mikrofon izni verilmedi.");
    }
  }

  async function acceptIncomingCall() {
    if (!call.incoming || !socketRef.current) {
      setError("Canlı bağlantı hazır değil. Sayfayı yenile.");
      return;
    }
    try {
      await getAudioStream();
      setCall(c => ({
        ...c,
        active: true,
        peerId: c.incoming.from,
        peerName: c.incoming.username,
        status: "Arama kabul edildi",
        incoming: null
      }));
      socketRef.current.emit("dm:call:accept", { to: call.incoming.from });
      await ensurePeer(call.incoming.from);
    } catch (err) {
      setError(err.message || "Mikrofon izni verilmedi.");
    }
  }

  function rejectIncomingCall() {
    if (call.incoming && socketRef.current) socketRef.current.emit("dm:call:reject", { to: call.incoming.from });
    setCall(c => ({ ...c, incoming: null, status: "Kapalı" }));
  }

  async function createOffer(peerId) {
    const pc = await ensurePeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (!socketRef.current) throw new Error("Socket bağlantısı yok; offer gönderilemedi.");
    socketRef.current.emit("rtc:offer", { to: peerId, offer });
    setCall(c => ({ ...c, active: true, peerId, status: "Bağlanıyor..." }));
  }

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !call.muted;
    stream.getAudioTracks().forEach(t => t.enabled = !nextMuted);
    setCall(c => ({ ...c, muted: nextMuted }));
  }

  async function toggleCamera() {
    try {
      if (call.camera) {
        localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
        const audioTracks = localStreamRef.current?.getAudioTracks() || [];
        localStreamRef.current = new MediaStream(audioTracks);
        setCall(c => ({ ...c, camera: false }));
        return;
      }

      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const videoTrack = videoStream.getVideoTracks()[0];
      const base = localStreamRef.current || await getAudioStream();
      base.addTrack(videoTrack);

      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(videoTrack);
        else pcRef.current.addTrack(videoTrack, base);
      }

      localStreamRef.current = base;
      setCall(c => ({ ...c, camera: true }));
    } catch {
      setError("Kamera izni verilmedi veya kamera bulunamadı.");
    }
  }

  async function toggleScreen() {
    try {
      if (call.screen) {
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
        setCall(c => ({ ...c, screen: false }));
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenStreamRef.current = stream;
      setCall(c => ({ ...c, screen: true }));

      const screenTrack = stream.getVideoTracks()[0];
      if (pcRef.current && screenTrack) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(screenTrack);
        else pcRef.current.addTrack(screenTrack, stream);
      }
    } catch {
      setError("Ekran paylaşımı iptal edildi.");
    }
  }

  function endCall(sendEvent = true) {
    if (sendEvent && call.peerId && socketRef.current) socketRef.current.emit("dm:call:end", { to: call.peerId });

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    rawMicStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    audioContextRef.current?.close?.();

    localStreamRef.current = null;
    rawMicStreamRef.current = null;
    screenStreamRef.current = null;
    remoteStreamRef.current = null;
    pcRef.current = null;
    audioContextRef.current = null;
    micGainRef.current = null;

    setCall({
      active: false,
      incoming: null,
      peerId: null,
      peerName: "",
      status: "Kapalı",
      muted: false,
      camera: false,
      screen: false,
      localVolume: 100,
      remoteVolume: 100
    });
  }

  if (!user) {
    return (
      <div className="authPage">
        <form className="authCard" onSubmit={submitAuth}>
          <div className="brand">N</div>
          <h1>{authMode === "login" ? "Giriş Yap" : "Kaydol"}</h1>
          <p>Kayıt gerçek veritabanına gider. Şifre bcrypt ile hashlenir.</p>
          <input value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} placeholder="Kullanıcı adı" />
          <input type="password" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} placeholder="Şifre" />
          {error && <div className="error">{error}</div>}
          <button>{authMode === "login" ? "Giriş Yap" : "Hesap Oluştur"}</button>
          <span onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "Hesabın yok mu? Kaydol" : "Hesabın var mı? Giriş yap"}</span>
          <small>Test: admin/123456 ve nova/123456</small>
        </form>

        {modal === "invitePreview" && invitePreview && (
          <InvitePreview invite={invitePreview} user={user} onJoin={() => setError("Katılmak için önce giriş yap veya kaydol.")} onClose={() => setModal(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="serverRail">
        <button className={`serverIcon ${rightTab === "friends" ? "active" : ""}`} onClick={() => setRightTab("friends")}>🏠</button>
        {servers.map(s => (
          <button key={s.id} className={`serverIcon ${s.id === activeServerId ? "active" : ""}`} style={{ background: s.color }} onClick={() => {
            setActiveServerId(s.id);
            const first = channels.find(c => c.server_id === s.id);
            setActiveChannelId(first?.id);
            setRightTab("members");
          }}>{s.icon}</button>
        ))}
        <button className="serverIcon add" onClick={() => setModal("server")}>+</button>
        <div className="railBottom"><button onClick={() => setModal("settings")}>⚙</button><button onClick={logout}>⏻</button></div>
      </aside>

      <aside className="channelPanel">
        <div className="serverHeader" style={{ background: `linear-gradient(135deg, ${activeServer?.color || "#5865f2"}, #111827)` }}>
          <h1>{rightTab === "friends" || rightTab === "dm" ? "Ana Sayfa" : activeServer?.name}</h1>
          <p>{rightTab === "friends" || rightTab === "dm" ? "Arkadaşlar, istekler, DM ve sesli arama." : activeServer?.description}</p>
        </div>

        <button className="serverBoost" onClick={() => setRightTab("friends")}>👥 Arkadaşlar</button>
        <button className="serverBoost" onClick={createInvite}>🔗 Davet Linki Oluştur</button>
        <button className="serverBoost" onClick={() => { setRightTab("audit"); loadAudit(); }}>🛡 Audit / Sunucu</button>

        <div className="channelScroll">
          {Object.entries(groupedChannels).map(([cat, list]) => (
            <section key={cat}>
              <div className="groupTitle"><span>{cat}</span><button onClick={() => setModal("channel")}>+</button></div>
              {list.map(c => <button key={c.id} className={`channelBtn ${c.id === activeChannelId ? "active" : ""}`} onClick={() => {
                setActiveChannelId(c.id);
                setRightTab(["voice", "stage"].includes(c.type) ? "voice" : "members");
              }}>{channelIcon(c.type)} {c.name}</button>)}
            </section>
          ))}
        </div>

        <div className="userDock"><div className="avatar">{user.avatar}</div><div><b>{user.username}</b><p>{user.status}</p></div></div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h2>{rightTab === "dm" ? `💬 ${dmUser?.username}` : rightTab === "friends" ? "👥 Arkadaşlar" : `${channelIcon(activeChannel?.type)} ${activeChannel?.name}`}</h2>
            <p>{rightTab === "friends" ? "Kullanıcı ara, arkadaş ekle, DM aç." : rightTab === "dm" ? "Özel mesaj ve sesli arama." : activeChannel?.topic}</p>
          </div>
          <div className="topActions">
            <button onClick={() => setRightTab("friends")}>👥</button>
            <button onClick={createInvite}>🔗 Davet</button>
            <button onClick={() => setRightTab("members")}>Sunucu</button>
          </div>
        </header>

        {rightTab === "friends" ? (
          <FriendsPage
            friends={friends}
            userSearch={userSearch}
            setUserSearch={setUserSearch}
            searchUsers={searchUsers}
            searchResults={searchResults}
            sendFriendRequest={sendFriendRequest}
            acceptFriend={acceptFriend}
            rejectFriend={rejectFriend}
            removeFriend={removeFriend}
            openDm={openDm}
          />
        ) : rightTab === "dm" ? (
          <DMPage
            dmUser={dmUser}
            messages={dmMessages}
            draft={dmDraft}
            setDraft={setDmDraft}
            send={sendDm}
            call={call}
            localVideoRef={localVideoRef}
            remoteVideoRef={remoteVideoRef}
            screenVideoRef={screenVideoRef}
            startDmCall={startDmCall}
            acceptIncomingCall={acceptIncomingCall}
            rejectIncomingCall={rejectIncomingCall}
            toggleMute={toggleMute}
            toggleCamera={toggleCamera}
            toggleScreen={toggleScreen}
            endCall={endCall}
            setCall={setCall}
          />
        ) : ["voice", "stage"].includes(activeChannel?.type) ? (
          <section className="voiceRoom">
            <h1>{channelIcon(activeChannel.type)} {activeChannel.name}</h1>
            <p>Sunucu ses odası paneli. DM ses araması için arkadaş DM ekranını kullan.</p>
            <button className="primary" onClick={() => setError("Sunucu odaları için grup WebRTC/SFU gerekir. Şu an DM P2P araması eklendi.")}>Sunucu Ses Paneli</button>
          </section>
        ) : (
          <Chat messages={messages} user={user} activeChannel={activeChannel} draft={draft} setDraft={setDraft} sendMessage={sendMessage} react={react} pin={pin} del={del} edit={edit} />
        )}
      </main>

      <aside className="rightPanel">
        <div className="tabs"><button onClick={() => setRightTab("friends")}>Arkadaş</button><button onClick={() => setRightTab("members")}>Üye</button><button onClick={() => { setRightTab("audit"); loadAudit(); }}>Audit</button></div>
        {rightTab === "members" && serverMembers.map(m => <div className="memberCard" key={m.id}><div className="avatar">{m.avatar}</div><div><b>{m.username}</b><p>{m.role} • {m.status}</p><small>{m.bio}</small></div></div>)}
        {rightTab === "audit" && audit.map(a => <div className="activity" key={a.id}><b>{time(a.created_at)}</b><p>{a.action}</p></div>)}
        {(rightTab === "friends" || rightTab === "dm") && <FriendSidebar friends={friends} openDm={openDm} />}
      </aside>

      <audio ref={persistentRemoteAudioRef} autoPlay playsInline />

      {call.active && (
        <GlobalCallDock
          call={call}
          dmUser={dmUser}
          localVideoRef={compactLocalVideoRef}
          remoteVideoRef={compactRemoteVideoRef}
          setRightTab={setRightTab}
          toggleMute={toggleMute}
          toggleCamera={toggleCamera}
          toggleScreen={toggleScreen}
          endCall={endCall}
        />
      )}

      {call.incoming && (
        <div className="incomingCall">
          <div className="avatar">{call.incoming.avatar}</div>
          <div><b>{call.incoming.username} arıyor</b><p>DM sesli arama</p></div>
          <button onClick={acceptIncomingCall}>Kabul</button>
          <button className="danger" onClick={rejectIncomingCall}>Reddet</button>
        </div>
      )}

      <div className="toast">{toast}</div>
      {error && <div className="error floating" onClick={() => setError("")}>{error}</div>}

      {modal === "server" && <ServerModal onClose={() => setModal(null)} onCreate={createServer} />}
      {modal === "channel" && <ChannelModal onClose={() => setModal(null)} onCreate={createChannel} />}
      {modal === "settings" && <SettingsModal user={user} setUser={setUser} onClose={() => setModal(null)} />}
      {modal?.type === "inviteCreated" && <InviteCreated modal={modal} onClose={() => setModal(null)} />}
      {modal === "invitePreview" && invitePreview && <InvitePreview invite={invitePreview} user={user} onJoin={() => joinInvite(invitePreview.code)} onClose={() => setModal(null)} />}
    </div>
  );
}

function FriendsPage({ friends, userSearch, setUserSearch, searchUsers, searchResults, sendFriendRequest, acceptFriend, rejectFriend, removeFriend, openDm }) {
  return (
    <section className="friendsPage">
      <div className="friendSearch">
        <input value={userSearch} onChange={e => setUserSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchUsers()} placeholder="Kullanıcı ara: admin, nova..." />
        <button onClick={searchUsers}>Ara</button>
      </div>

      <div className="friendGrid">
        <Panel title="Arama Sonuçları">
          {searchResults.map(u => <FriendRow key={u.id} user={u}><button onClick={() => sendFriendRequest(u.username)}>Ekle</button></FriendRow>)}
          {searchResults.length === 0 && <p className="muted">En az 2 harf yaz ve ara.</p>}
        </Panel>

        <Panel title="Gelen İstekler">
          {friends.incoming.map(f => <FriendRow key={f.id} user={f.other}><button onClick={() => acceptFriend(f.id)}>Kabul</button><button onClick={() => rejectFriend(f.id)}>Red</button></FriendRow>)}
          {friends.incoming.length === 0 && <p className="muted">Gelen istek yok.</p>}
        </Panel>

        <Panel title="Arkadaşlar">
          {friends.friends.map(f => <FriendRow key={f.id} user={f.other}><button onClick={() => openDm(f.other)}>DM</button><button onClick={() => removeFriend(f.other.id)}>Sil</button></FriendRow>)}
          {friends.friends.length === 0 && <p className="muted">Henüz arkadaş yok.</p>}
        </Panel>

        <Panel title="Gönderilen İstekler">
          {friends.outgoing.map(f => <FriendRow key={f.id} user={f.other}><button onClick={() => rejectFriend(f.id)}>İptal</button></FriendRow>)}
          {friends.outgoing.length === 0 && <p className="muted">Bekleyen istek yok.</p>}
        </Panel>
      </div>
    </section>
  );
}

function Panel({ title, children }) {
  return <div className="panelCard"><h3>{title}</h3>{children}</div>;
}

function FriendRow({ user, children }) {
  return <div className="friendRow"><div className="avatar">{user.avatar}</div><div><b>{user.username}</b><p>{user.bio || user.status}</p></div>{children}</div>;
}

function FriendSidebar({ friends, openDm }) {
  return <>
    <h3>DM Listesi</h3>
    {friends.friends.map(f => <div className="memberCard" key={f.id}><div className="avatar">{f.other.avatar}</div><div><b>{f.other.username}</b><p>{f.other.status}</p><button onClick={() => openDm(f.other)}>Mesaj</button></div></div>)}
  </>;
}

function DMPage({ dmUser, messages, draft, setDraft, send, call, localVideoRef, remoteVideoRef, screenVideoRef, startDmCall, acceptIncomingCall, rejectIncomingCall, toggleMute, toggleCamera, toggleScreen, endCall, setCall }) {
  if (!dmUser) return <section className="friendsPage"><div className="panelCard"><h3>DM seçilmedi</h3><p className="muted">Arkadaşlar listesinden birini seç.</p></div></section>;

  return (
    <section className="dmLayout">
      <div className="dmChat">
        <div className="messages">
          <div className="channelHero"><div className="heroIcon">💬</div><div><h2>{dmUser.username}</h2><p>Özel mesaj ve sesli arama.</p></div></div>
          {messages.map(m => <article className="message" key={m.id}><div className="avatar">{m.avatar}</div><div className="messageBody"><div className="messageTop"><b>{m.username}</b><span>{time(m.created_at)}</span></div><p>{m.content}</p></div></article>)}
        </div>
        <div className="composer"><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={`${dmUser.username} kullanıcısına mesaj yaz`} /><button onClick={send}>➤</button></div>
      </div>

      <div className="callPanel">
        <div className="callPanelHeader">
          <div><h3>DM Arama Paneli</h3><p>{call.status}</p><small>İki hesap da açık olmalı. Karşı taraf gelen aramayı kabul etmeli.</small></div>
          <button className="danger" onClick={() => endCall()}>Kapat</button>
        </div>

        <div className="videoStack">
          <div className="videoTile"><video ref={remoteVideoRef} autoPlay playsInline /><span>Karşı taraf</span></div>
          <div className="videoTile small"><video ref={localVideoRef} autoPlay muted playsInline /><span>Sen</span></div>
          {call.screen && <div className="videoTile"><video ref={screenVideoRef} autoPlay muted playsInline /><span>Ekran paylaşımı</span></div>}
        </div>

        <div className="callControls">
          {!call.active ? <button onClick={startDmCall}>📞 Sesli Ara</button> : <button onClick={toggleMute}>{call.muted ? "Mikrofon Aç" : "Mikrofon Kapat"}</button>}
          <button onClick={toggleCamera}>{call.camera ? "Kamerayı Kapat" : "Kamera Aç"}</button>
          <button onClick={toggleScreen}>{call.screen ? "Ekranı Kapat" : "Ekran Paylaş"}</button>
          <button className="danger" onClick={() => endCall()}>Aramayı Bitir</button>
        </div>

        <div className="volumeBox">
          <label>Karşı taraf sesi: {call.remoteVolume}%</label>
          <input type="range" min="0" max="100" value={call.remoteVolume} onChange={e => setCall(c => ({ ...c, remoteVolume: Number(e.target.value) }))} />
          <label>Mikrofon seviyesi: {call.localVolume}%</label>
          <input type="range" min="0" max="100" value={call.localVolume} onChange={e => setCall(c => ({ ...c, localVolume: Number(e.target.value) }))} />
        </div>
      </div>
    </section>
  );
}

function Chat({ messages, user, activeChannel, draft, setDraft, sendMessage, react, pin, del, edit }) {
  return <section className="chat"><div className="messages"><div className="channelHero"><div className="heroIcon">{channelIcon(activeChannel?.type)}</div><div><h2>{activeChannel?.name}</h2><p>{activeChannel?.topic}</p></div></div>{messages.map(m => <article className="message" key={m.id}><div className="avatar">{m.avatar}</div><div className="messageBody"><div className="messageTop"><b>{m.username}</b><span>{time(m.created_at)}</span>{m.pinned && <span>📌</span>}</div><p>{m.content}</p><div className="reactions">{Object.entries(m.reactions || {}).map(([e,n]) => <button key={e} onClick={() => react(m,e)}>{e} {n}</button>)}</div><div className="messageActions"><button onClick={() => react(m,"👍")}>👍</button><button onClick={() => react(m,"🔥")}>🔥</button><button onClick={() => pin(m)}>Pin</button>{m.user_id===user.id && <button onClick={() => edit(m)}>Düzenle</button>}<button onClick={() => del(m)}>Sil</button></div></div></article>)}</div><div className="composer"><button>+</button><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()} placeholder="Mesaj yaz" /><button onClick={sendMessage}>➤</button></div></section>;
}

function ServerModal({ onClose, onCreate }) {
  const [f, setF] = useState({ name: "", icon: "S", color: "#5865f2", description: "" });
  return <Modal title="Sunucu Oluştur" onClose={onClose}><Field label="Ad" value={f.name} onChange={v=>setF({...f,name:v})}/><Field label="İkon" value={f.icon} onChange={v=>setF({...f,icon:v})}/><Field label="Renk" type="color" value={f.color} onChange={v=>setF({...f,color:v})}/><Field label="Açıklama" value={f.description} onChange={v=>setF({...f,description:v})}/><button className="primary" onClick={()=>onCreate(f)}>Oluştur</button></Modal>;
}

function ChannelModal({ onClose, onCreate }) {
  const [f, setF] = useState({ name: "", type: "text", category: "YAZI", topic: "" });
  return <Modal title="Kanal Oluştur" onClose={onClose}><Field label="Ad" value={f.name} onChange={v=>setF({...f,name:v})}/><label className="field"><span>Tip</span><select value={f.type} onChange={e=>setF({...f,type:e.target.value})}><option value="text">Yazı</option><option value="announcement">Duyuru</option><option value="voice">Ses</option><option value="stage">Stage</option></select></label><Field label="Kategori" value={f.category} onChange={v=>setF({...f,category:v})}/><Field label="Konu" value={f.topic} onChange={v=>setF({...f,topic:v})}/><button className="primary" onClick={()=>onCreate(f)}>Oluştur</button></Modal>;
}

function SettingsModal({ user, setUser, onClose }) {
  const [bio, setBio] = useState(user.bio || "");
  const [status, setStatus] = useState(user.status || "online");
  async function save() { const data = await api("/api/me", { method: "PATCH", body: JSON.stringify({ bio, status }) }); setUser(data.user); onClose(); }
  return <Modal title="Ayarlar" onClose={onClose}><Field label="Bio" value={bio} onChange={setBio}/><label className="field"><span>Durum</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="online">Çevrimiçi</option><option value="idle">Boşta</option><option value="dnd">Rahatsız etmeyin</option><option value="offline">Görünmez</option></select></label><button className="primary" onClick={save}>Kaydet</button></Modal>;
}

function InviteCreated({ modal, onClose }) {
  return <Modal title="Davet Linki" onClose={onClose}><p className="muted">Bu linki birine at. Açınca sunucu kartı görür ve katılabilir.</p><div className="inviteBox">{modal.url}</div><button className="primary" onClick={() => navigator.clipboard.writeText(modal.url)}>Kopyala</button></Modal>;
}

function InvitePreview({ invite, onJoin, onClose }) {
  return <Modal title="Sunucu Daveti" onClose={onClose}><div className="invitePreview"><div className="serverIcon big" style={{background: invite.server_color}}>{invite.server_icon}</div><h2>{invite.server_name}</h2><p>{invite.server_description}</p><b>{invite.member_count} üye</b></div><button className="primary" onClick={onJoin}>Sunucuya Katıl</button></Modal>;
}

function Field({ label, value, onChange, type="text" }) {
  return <label className="field"><span>{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} /></label>;
}

function Modal({ title, children, onClose }) {
  return <div className="modalBg"><div className="modal"><button className="close" onClick={onClose}>×</button><h2>{title}</h2>{children}</div></div>;
}
