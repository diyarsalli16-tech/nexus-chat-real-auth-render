import React, { useEffect, useMemo, useRef, useState } from "react";

const API = "";
const APP_VERSION = "Orbit Client V18 Media Fix";
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

function fileToDataMessage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("Dosya seçilmedi."));
    if (file.size > 6 * 1024 * 1024) return reject(new Error("Dosya çok büyük. Şimdilik en fazla 6 MB."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.onload = () => {
      const payload = {
        kind: "file",
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: reader.result
      };
      resolve("::file::" + JSON.stringify(payload));
    };
    reader.readAsDataURL(file);
  });
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

  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupDraft, setGroupDraft] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [mentionCount, setMentionCount] = useState(0);
  const [showRightPanel, setShowRightPanel] = useState(false);

  const [groupVoice, setGroupVoice] = useState({
    active: false,
    groupId: null,
    status: "Kapalı",
    muted: false,
    peers: []
  });
  const [groupRemoteStreams, setGroupRemoteStreams] = useState({});
  const [groupLocalVideoOn, setGroupLocalVideoOn] = useState(false);
  const [groupScreenOn, setGroupScreenOn] = useState(false);

  const [rightTab, setRightTab] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("Hazır");
  const [audit, setAudit] = useState([]);
  const [invitePreview, setInvitePreview] = useState(null);

  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);
  const groupVoiceRef = useRef(null);
  const groupVoicePcsRef = useRef(new Map());
  const groupRemoteCombinedStreamsRef = useRef(new Map());
  const groupVoiceLocalStreamRef = useRef(null);
  const groupCameraStreamRef = useRef(null);
  const groupScreenStreamRef = useRef(null);
  const dmUserRef = useRef(null);
  const activeChannelIdRef = useRef(null);
  const activeGroupRef = useRef(null);

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
  const cameraStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenVideoTrackRef = useRef(null);
  const uiAudioCtxRef = useRef(null);
  const ringtoneTimerRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteCombinedStreamRef = useRef(null);
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

  function bindVideoNode(node, stream, muted = false) {
    if (!node) return;

    node.autoplay = true;
    node.playsInline = true;
    node.muted = muted;

    if (node.srcObject !== stream) node.srcObject = stream || null;

    const tryPlay = () => node.play?.().catch(() => {});
    node.onloadedmetadata = tryPlay;

    try {
      stream?.getTracks?.().forEach(track => {
        track.onunmute = tryPlay;
      });
    } catch {}

    tryPlay();
  }

  async function openFullscreen(target) {
    try {
      const el = target?.current || target;
      if (!el) return;
      const box = el.closest?.(".videoTile, .dockVideo, .groupMediaTile") || el.parentElement || el;
      if (box.requestFullscreen) await box.requestFullscreen();
      else if (box.webkitRequestFullscreen) await box.webkitRequestFullscreen();
      else if (box.msRequestFullscreen) await box.msRequestFullscreen();
    } catch (err) {
      setError(err.message || "Tam ekran açılamadı.");
    }
  }

  const soundboardItems = [
    { id: "airhorn", label: "📣 Airhorn" },
    { id: "vine", label: "💥 Boom" },
    { id: "laser", label: "🔫 Lazer" },
    { id: "robot", label: "🤖 Robot" },
    { id: "siren", label: "🚨 Siren" },
    { id: "troll", label: "😂 Troll" }
  ];

  function playSoundboardLocal(id) {
    if (id === "airhorn") {
      playTone(440, .12, "square", .12);
      setTimeout(() => playTone(660, .18, "square", .12), 130);
      setTimeout(() => playTone(880, .20, "sawtooth", .10), 300);
    } else if (id === "vine") {
      playTone(160, .16, "sine", .14);
      setTimeout(() => playTone(90, .25, "sine", .12), 170);
    } else if (id === "laser") {
      for (let i=0;i<6;i++) setTimeout(() => playTone(1200 - i*120, .07, "sawtooth", .07), i*60);
    } else if (id === "robot") {
      [300, 240, 360, 180, 420].forEach((f,i) => setTimeout(() => playTone(f, .08, "square", .07), i*90));
    } else if (id === "siren") {
      for (let i=0;i<8;i++) setTimeout(() => playTone(i % 2 ? 760 : 520, .12, "sine", .08), i*140);
    } else {
      [523, 659, 784, 1046].forEach((f,i) => setTimeout(() => playTone(f, .10, "triangle", .07), i*110));
    }
  }

  function sendDmSound(id) {
    playSoundboardLocal(id);
    if (call.active && call.peerId) socketRef.current?.emit("soundboard:dm", { to: call.peerId, id });
  }

  function sendGroupSound(id) {
    playSoundboardLocal(id);
    if (groupVoice.active && groupVoice.groupId) socketRef.current?.emit("soundboard:group", { groupId: groupVoice.groupId, id });
  }

  function fileToDataMessage(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("Dosya seçilmedi."));
      if (file.size > 6 * 1024 * 1024) return reject(new Error("Dosya çok büyük. Şimdilik en fazla 6 MB."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Dosya okunamadı."));
      reader.onload = () => {
        const payload = {
          kind: "file",
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          dataUrl: reader.result
        };
        resolve("::file::" + JSON.stringify(payload));
      };
      reader.readAsDataURL(file);
    });
  }


  function ensureUiAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!uiAudioCtxRef.current) uiAudioCtxRef.current = new AudioCtx();
    if (uiAudioCtxRef.current.state === "suspended") uiAudioCtxRef.current.resume?.();
    return uiAudioCtxRef.current;
  }

  function playTone(freq = 880, duration = 0.12, type = "sine", volume = 0.08) {
    try {
      const ctx = ensureUiAudio();
      if (!ctx) return;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + duration + 0.02);
    } catch {}
  }

  function playMessageSound() {
    playTone(640, 0.08, "triangle", 0.045);
    window.setTimeout(() => playTone(880, 0.08, "triangle", 0.04), 90);
  }

  function playMentionSound() {
    playTone(1040, 0.12, "sine", 0.075);
    window.setTimeout(() => playTone(1320, 0.13, "sine", 0.07), 120);
    window.setTimeout(() => playTone(1560, 0.16, "sine", 0.065), 250);
  }

  function startRingtone() {
    stopRingtone();
    playTone(740, 0.18, "sine", 0.08);
    window.setTimeout(() => playTone(980, 0.22, "sine", 0.08), 220);
    ringtoneTimerRef.current = window.setInterval(() => {
      playTone(740, 0.18, "sine", 0.08);
      window.setTimeout(() => playTone(980, 0.22, "sine", 0.08), 220);
    }, 1400);
  }

  function stopRingtone() {
    if (ringtoneTimerRef.current) {
      window.clearInterval(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    }
  }

  function containsMention(content, username) {
    if (!content || !username) return false;
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)@${escaped}(?=$|\\s|[.,!?:;])`, "i").test(content);
  }

  function notifyDesktop(title, body, tag = "nexus") {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    try {
      const n = new Notification(title, {
        body,
        tag,
        silent: true,
        icon: "/icon-192.svg",
        badge: "/icon-192.svg"
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {}
  }

  function handleIncomingText({ content, fromName, senderId, context = "message" }) {
    if (!content || senderId === user?.id) return;
    const mentioned = containsMention(content, user?.username);
    const appNotFocused = document.hidden || !document.hasFocus();

    if (mentioned) {
      setMentionCount(c => c + 1);
      playMentionSound();
      notifyDesktop("Orbit Client • Etiketlendin", `${fromName}: ${content}`, `mention-${Date.now()}`);
      show(`@${user?.username} etiketi geldi`);
      return;
    }

    if (appNotFocused) {
      playMessageSound();
      notifyDesktop("Orbit Client", `${fromName}: ${content}`, `msg-${context}`);
    }
  }

  async function enableNotifications() {
    try {
      ensureUiAudio();
      playMessageSound();

      if (typeof Notification === "undefined") {
        setNotificationPermission("unsupported");
        setError("Bu tarayıcı masaüstü bildirimini desteklemiyor.");
        return;
      }

      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      if (result === "granted") {
        notifyDesktop("Orbit Client", "Bildirimler açıldı. Etiket gelince uyarı alacaksın.", "nexus-ready");
        show("Bildirimler açıldı");
      } else {
        setError("Bildirim izni verilmedi.");
      }
    } catch (err) {
      setError(err.message || "Bildirim açılırken hata oldu.");
    }
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
    await loadGroups();
  }

  async function loadFriends() {
    const data = await api("/api/friends");
    setFriends(data);
  }

  async function loadGroups() {
    const data = await api("/api/groups");
    setGroups(data.groups);
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
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true;

    setIsInstalled(Boolean(standalone));
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    document.title = mentionCount > 0 ? `(${mentionCount}) Orbit Client` : "Orbit Client";
  }, [mentionCount]);

  useEffect(() => {
    const clearBadge = () => {
      if (!document.hidden) setMentionCount(0);
    };
    document.addEventListener("visibilitychange", clearBadge);
    window.addEventListener("focus", clearBadge);
    return () => {
      document.removeEventListener("visibilitychange", clearBadge);
      window.removeEventListener("focus", clearBadge);
    };
  }, []);

  useEffect(() => {
    if (token()) loadBootstrap().catch(() => localStorage.removeItem("nexus_token"));
    handleInviteFromUrl();
  }, []);

  useEffect(() => { dmUserRef.current = dmUser; }, [dmUser]);
  useEffect(() => { activeChannelIdRef.current = activeChannelId; }, [activeChannelId]);
  useEffect(() => { activeGroupRef.current = activeGroup; }, [activeGroup]);
  useEffect(() => { groupVoiceRef.current = groupVoice; }, [groupVoice]);

  useEffect(() => {
    if (!user || !token()) return;

    const s = ioFactory("/", { auth: { token: token() } });
    socketRef.current = s;

    s.on("connect", () => show("Canlı bağlantı açıldı"));
    s.on("message:new", msg => {
      setMessages(old => old.some(m => m.id === msg.id) ? old : [...old, msg]);
      handleIncomingText({ content: msg.content, fromName: msg.username, senderId: msg.user_id, context: "channel" });
    });
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
      handleIncomingText({ content: msg.content, fromName: msg.username, senderId: msg.sender_id, context: "dm" });
      show("Yeni DM");
    });

    s.on("soundboard:dm", ({ id, fromName }) => {
      playSoundboardLocal(id);
      show(`${fromName || "Kullanıcı"} ses efekti çaldı`);
    });

    s.on("soundboard:group", ({ id, fromName }) => {
      playSoundboardLocal(id);
      show(`${fromName || "Kullanıcı"} grup ses efekti çaldı`);
    });

    s.on("group:new", group => {
      setGroups(old => old.some(g => g.id === group.id) ? old : [group, ...old]);
      show("Yeni gruba eklendin");
    });

    s.on("group:message:new", msg => {
      const current = activeGroupRef.current;
      if (current && current.id === msg.group_id) {
        setGroupMessages(old => old.some(m => m.id === msg.id) ? old : [...old, msg]);
      }
      handleIncomingText({ content: msg.content, fromName: msg.username, senderId: msg.sender_id, context: "group" });
    });

    s.on("group:voice:users", async ({ groupId, users }) => {
      const gv = groupVoiceRef.current;
      if (!gv?.active || gv.groupId !== groupId) return;

      setGroupVoice(c => ({
        ...c,
        peers: users.map(u => ({ ...u, status: "bağlanıyor" })),
        status: users.length ? `${users.length} kişiyle bağlanılıyor` : "Ses odasındasın"
      }));

      for (const peer of users) {
        await createGroupPeer(peer.socketId, peer, true, groupId);
      }
    });

    s.on("group:voice:user-joined", ({ groupId, socketId, user }) => {
      const gv = groupVoiceRef.current;
      if (!gv?.active || gv.groupId !== groupId) return;

      setGroupVoice(c => ({
        ...c,
        peers: c.peers.some(p => p.socketId === socketId) ? c.peers : [...c.peers, { socketId, ...user, status: "katıldı" }],
        status: `${user.username} katıldı`
      }));
    });

    s.on("group:voice:user-left", ({ groupId, socketId }) => {
      const gv = groupVoiceRef.current;
      if (gv?.groupId !== groupId) return;
      closeGroupPeer(socketId);
      setGroupVoice(c => ({
        ...c,
        peers: c.peers.filter(p => p.socketId !== socketId),
        status: "Bir kullanıcı ayrıldı"
      }));
    });

    s.on("group:rtc:offer", async ({ groupId, from, user, offer }) => {
      const gv = groupVoiceRef.current;
      if (!gv?.active || gv.groupId !== groupId) return;

      const pc = await createGroupPeer(from, { socketId: from, ...user, status: "offer geldi" }, false, groupId);
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit("group:rtc:answer", { to: from, groupId, answer });

      setGroupVoice(c => ({ ...c, status: `${user.username} bağlandı` }));
    });

    s.on("group:rtc:answer", async ({ from, answer }) => {
      const pc = groupVoicePcsRef.current.get(from);
      if (pc && pc.signalingState !== "stable") {
        await pc.setRemoteDescription(answer);
      }
      setGroupVoice(c => ({
        ...c,
        peers: c.peers.map(p => p.socketId === from ? { ...p, status: "bağlandı" } : p),
        status: "Grup sesi bağlı"
      }));
    });

    s.on("group:rtc:candidate", async ({ from, candidate }) => {
      try {
        const pc = groupVoicePcsRef.current.get(from);
        if (pc && candidate) await pc.addIceCandidate(candidate);
      } catch {}
    });

    s.on("dm:call:incoming", payload => {
      startRingtone();
      playMentionSound();
      notifyDesktop("Orbit Client • Gelen arama", `${payload.username} seni arıyor`, "incoming-call");
      setCall(c => ({ ...c, incoming: payload, status: `${payload.username} arıyor` }));
      setRightTab("dm");
    });

    s.on("dm:call:accepted", async ({ from }) => {
      try {
        stopRingtone();
        setCall(c => ({ ...c, status: "Arama kabul edildi" }));
        await createOffer(from);
      } catch (err) {
        console.error("Orbit call offer error", err);
        setError(err.message || "Arama offer gönderemedi.");
        setCall(c => ({ ...c, status: "Offer hatası" }));
      }
    });

    s.on("dm:call:rejected", () => {
      stopRingtone();
      endCall(false);
      show("Arama reddedildi");
    });

    s.on("dm:call:ended", () => {
      stopRingtone();
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
        console.error("Orbit rtc offer error", err);
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
        console.error("Orbit rtc answer error", err);
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
    if (socketRef.current && activeGroup) socketRef.current.emit("group:join", activeGroup.id);
  }, [socket, activeGroup]);

  useEffect(() => {
    bindVideoNode(localVideoRef.current, localStreamRef.current, true);
    bindVideoNode(compactLocalVideoRef.current, localStreamRef.current, true);
    bindRemoteMedia();
    bindVideoNode(screenVideoRef.current, screenStreamRef.current, true);
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

  async function sendMessage(contentOverride = null) {
    const content = (contentOverride ?? draft).trim();
    if (!content || !activeChannel) return;
    if (!contentOverride) setDraft("");

    try {
      await api(`/api/channels/${activeChannel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content })
      });
    } catch (err) {
      setError(err.message);
      if (!contentOverride) setDraft(content);
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

  async function sendDm(contentOverride = null) {
    if (!dmUser) return;

    const content = (contentOverride ?? dmDraft).trim();
    if (!content) return;
    if (!contentOverride) setDmDraft("");

    try {
      const data = await api(`/api/dms/${dmUser.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content })
      });

      setDmMessages(old => old.some(m => m.id === data.message.id) ? old : [...old, data.message]);
    } catch (err) {
      setError(err.message);
      if (!contentOverride) setDmDraft(content);
    }
  }



  async function getGroupVoiceStream() {
    if (groupVoiceLocalStreamRef.current) return groupVoiceLocalStreamRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Mikrofon API yok. HTTPS linkiyle aç.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });

    groupVoiceLocalStreamRef.current = stream;
    return stream;
  }

  async function ensureGroupVideoTrack() {
    if (groupCameraStreamRef.current?.getVideoTracks?.()[0]) return groupCameraStreamRef.current.getVideoTracks()[0];

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    groupCameraStreamRef.current = stream;
    return stream.getVideoTracks()[0];
  }

  async function renegotiateGroupPeers() {
    const groupId = groupVoice.groupId || groupVoiceRef.current?.groupId;
    if (!groupId || !socketRef.current) return;

    for (const [socketId, pc] of groupVoicePcsRef.current.entries()) {
      if (pc.signalingState !== "stable") continue;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit("group:rtc:offer", { to: socketId, groupId, offer });
    }
  }

  async function setGroupOutgoingVideoTrack(track) {
    const base = await getGroupVoiceStream();

    // Siyah ekran düzeltmesi: grup local stream içinde eski video track kalmasın.
    base.getVideoTracks().forEach(oldTrack => {
      if (!track || oldTrack.id !== track.id) {
        try { base.removeTrack(oldTrack); } catch {}
      }
    });

    if (track && !base.getTracks().some(t => t.id === track.id)) {
      base.addTrack(track);
    }

    for (const pc of groupVoicePcsRef.current.values()) {
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(track || null);
      else if (track) pc.addTrack(track, base);
    }

    await renegotiateGroupPeers();
  }

  function addGroupRemoteTrack(socketId, track) {
    if (!socketId || !track) return;

    if (!groupRemoteCombinedStreamsRef.current.has(socketId)) {
      groupRemoteCombinedStreamsRef.current.set(socketId, new MediaStream());
    }

    const combined = groupRemoteCombinedStreamsRef.current.get(socketId);

    if (track.kind === "video") {
      combined.getVideoTracks().forEach(oldTrack => {
        if (oldTrack.id !== track.id) {
          try { combined.removeTrack(oldTrack); } catch {}
        }
      });
    }

    if (track.kind === "audio") {
      combined.getAudioTracks().forEach(oldTrack => {
        if (oldTrack.id !== track.id) {
          try { combined.removeTrack(oldTrack); } catch {}
        }
      });
    }

    if (!combined.getTracks().some(t => t.id === track.id)) {
      combined.addTrack(track);
      track.onended = () => {
        try { combined.removeTrack(track); } catch {}
        setGroupRemoteStreams(old => ({ ...old, [socketId]: combined }));
      };
    }

    setGroupRemoteStreams(old => ({ ...old, [socketId]: combined }));
  }

  async function createGroupPeer(socketId, userInfo, initiator, groupId) {
    if (groupVoicePcsRef.current.has(socketId)) return groupVoicePcsRef.current.get(socketId);

    const pc = new RTCPeerConnection(rtcConfigRef.current);
    groupVoicePcsRef.current.set(socketId, pc);

    // Grup kamera/ekran sonradan açılınca video m-line hazır olsun.
    try { pc.addTransceiver("video", { direction: "sendrecv" }); } catch {}

    const stream = await getGroupVoiceStream();
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = e => {
      if (e.candidate) socketRef.current?.emit("group:rtc:candidate", { to: socketId, groupId, candidate: e.candidate });
    };

    pc.onconnectionstatechange = () => {
      setGroupVoice(c => ({
        ...c,
        peers: c.peers.map(p => p.socketId === socketId ? { ...p, status: pc.connectionState } : p),
        status: `Grup bağlantı: ${pc.connectionState}`
      }));
    };

    pc.ontrack = e => {
      addGroupRemoteTrack(socketId, e.track);
      setGroupVoice(c => ({
        ...c,
        peers: c.peers.some(p => p.socketId === socketId) ? c.peers : [...c.peers, { socketId, ...userInfo, status: "medya geldi" }],
        status: e.track.kind === "video" ? "Grup görüntüsü geldi" : "Grup sesi geldi"
      }));
    };

    setGroupVoice(c => ({
      ...c,
      peers: c.peers.some(p => p.socketId === socketId) ? c.peers : [...c.peers, { socketId, ...userInfo, status: "bağlanıyor" }]
    }));

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit("group:rtc:offer", { to: socketId, groupId, offer });
    }

    return pc;
  }

  function closeGroupPeer(socketId) {
    const pc = groupVoicePcsRef.current.get(socketId);
    pc?.close?.();
    groupVoicePcsRef.current.delete(socketId);
    groupRemoteCombinedStreamsRef.current.delete(socketId);
    setGroupRemoteStreams(old => {
      const next = { ...old };
      delete next[socketId];
      return next;
    });
  }

  async function joinGroupVoice() {
    if (!activeGroup) return setError("Önce grup aç.");
    try {
      await getGroupVoiceStream();
      const next = { active: true, groupId: activeGroup.id, status: "Grup sesine giriliyor", muted: false, peers: [] };
      groupVoiceRef.current = next;
      setGroupVoice(next);
      socketRef.current?.emit("group:voice:join", { groupId: activeGroup.id });
    } catch (err) {
      setError(err.message || "Mikrofon izni verilmedi.");
    }
  }

  function leaveGroupVoice() {
    if (groupVoice.groupId) socketRef.current?.emit("group:voice:leave", { groupId: groupVoice.groupId });
    for (const socketId of groupVoicePcsRef.current.keys()) closeGroupPeer(socketId);

    groupVoiceLocalStreamRef.current?.getTracks().forEach(t => t.stop());
    groupCameraStreamRef.current?.getTracks().forEach(t => t.stop());
    groupScreenStreamRef.current?.getTracks().forEach(t => t.stop());

    groupVoiceLocalStreamRef.current = null;
    groupCameraStreamRef.current = null;
    groupScreenStreamRef.current = null;

    groupRemoteCombinedStreamsRef.current.clear();
    setGroupRemoteStreams({});
    setGroupLocalVideoOn(false);
    setGroupScreenOn(false);
    setGroupVoice({ active: false, groupId: null, status: "Kapalı", muted: false, peers: [] });
  }

  function toggleGroupMute() {
    const next = !groupVoice.muted;
    groupVoiceLocalStreamRef.current?.getAudioTracks().forEach(t => t.enabled = !next);
    setGroupVoice(c => ({ ...c, muted: next }));
  }

  async function toggleGroupCamera() {
    try {
      if (!groupVoice.active) await joinGroupVoice();

      if (groupLocalVideoOn) {
        groupCameraStreamRef.current?.getTracks().forEach(t => t.stop());
        groupCameraStreamRef.current = null;
        setGroupLocalVideoOn(false);

        const screenTrack = groupScreenStreamRef.current?.getVideoTracks?.()[0] || null;
        await setGroupOutgoingVideoTrack(screenTrack);
        return;
      }

      const track = await ensureGroupVideoTrack();
      setGroupLocalVideoOn(true);
      await setGroupOutgoingVideoTrack(track);
    } catch (err) {
      setError(err.message || "Grup kamerası açılamadı.");
    }
  }

  async function toggleGroupScreen() {
    try {
      if (!groupVoice.active) await joinGroupVoice();

      if (groupScreenOn) {
        groupScreenStreamRef.current?.getTracks().forEach(t => t.stop());
        groupScreenStreamRef.current = null;
        setGroupScreenOn(false);

        const cameraTrack = groupCameraStreamRef.current?.getVideoTracks?.()[0] || null;
        await setGroupOutgoingVideoTrack(cameraTrack);
        return;
      }

      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Ekran paylaşımı desteklenmiyor.");

      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];

      track.onended = async () => {
        groupScreenStreamRef.current = null;
        setGroupScreenOn(false);
        const cameraTrack = groupCameraStreamRef.current?.getVideoTracks?.()[0] || null;
        await setGroupOutgoingVideoTrack(cameraTrack);
      };

      groupScreenStreamRef.current = stream;
      setGroupScreenOn(true);
      await setGroupOutgoingVideoTrack(track);
    } catch (err) {
      setError(err.message || "Grup ekran paylaşımı açılamadı.");
    }
  }


  async function installApp() {
    if (installPrompt) {
      try {
        installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        setInstallPrompt(null);
        if (choice?.outcome === "accepted") {
          setIsInstalled(true);
          show("Uygulama kuruluyor");
        }
      } catch {
        setModal("installHelp");
      }
    } else {
      setModal("installHelp");
    }
  }

  async function openGroup(group) {
    setActiveGroup(group);
    setDmUser(null);
    setRightTab("group");
    const data = await api(`/api/groups/${group.id}/messages`);
    setGroupMessages(data.messages);
    socketRef.current?.emit("group:join", group.id);
  }

  async function sendGroupMessage(contentOverride = null) {
    if (!activeGroup) return;
    const content = (contentOverride ?? groupDraft).trim();
    if (!content) return;
    if (!contentOverride) setGroupDraft("");

    try {
      const data = await api(`/api/groups/${activeGroup.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content })
      });
      setGroupMessages(old => old.some(m => m.id === data.message.id) ? old : [...old, data.message]);
    } catch (err) {
      setError(err.message);
      if (!contentOverride) setGroupDraft(content);
    }
  }

  async function createGroup(form) {
    const data = await api("/api/groups", {
      method: "POST",
      body: JSON.stringify(form)
    });
    setGroups(old => old.some(g => g.id === data.group.id) ? old : [data.group, ...old]);
    setModal(null);
    await openGroup(data.group);
  }

  async function joinServerByInput(value) {
    const data = await api("/api/invites/join", {
      method: "POST",
      body: JSON.stringify({ code: value })
    });
    show("Sunucuya katıldın");
    setModal(null);
    await loadBootstrap();
    setActiveServerId(data.server_id);
    setRightTab("members");
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


  function bindRemoteMedia() {
    const stream = remoteStreamRef.current;

    bindVideoNode(remoteVideoRef.current, stream, false);
    bindVideoNode(compactRemoteVideoRef.current, stream, false);

    if (persistentRemoteAudioRef.current) {
      persistentRemoteAudioRef.current.srcObject = stream || null;
      persistentRemoteAudioRef.current.volume = call.remoteVolume / 100;
      persistentRemoteAudioRef.current.play?.().catch(() => {});
    }
  }

  function addRemoteTrack(track) {
    if (!track) return;
    if (!remoteCombinedStreamRef.current) remoteCombinedStreamRef.current = new MediaStream();

    const combined = remoteCombinedStreamRef.current;
    const alreadyExists = combined.getTracks().some(t => t.id === track.id);

    if (!alreadyExists) {
      // Kritik düzeltme: Kamera/ekran gelince remote stream'i komple değiştirmiyoruz.
      // Aynı stream içinde audio + video'yu koruyoruz. Yoksa video track gelince ses kayboluyordu.
      if (track.kind === "video") {
        combined.getVideoTracks().forEach(oldTrack => combined.removeTrack(oldTrack));
      }

      if (track.kind === "audio") {
        combined.getAudioTracks().forEach(oldTrack => combined.removeTrack(oldTrack));
      }

      combined.addTrack(track);
      if (track.kind === "video") setCall(c => ({ ...c, remoteVideo: true }));

      track.onended = () => {
        try { combined.removeTrack(track); } catch {}
        if (track.kind === "video") setCall(c => ({ ...c, remoteVideo: combined.getVideoTracks().length > 0 }));
        bindRemoteMedia();
      };
    }

    remoteStreamRef.current = combined;
    bindRemoteMedia();
  }

  async function ensureOutgoingAudioTrack() {
    if (!pcRef.current) return;

    const stream = await getAudioStream();
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = !call.muted;

    const audioSender = pcRef.current.getSenders().find(sender => sender.track?.kind === "audio");
    if (audioSender) {
      if (audioSender.track !== audioTrack) await audioSender.replaceTrack(audioTrack);
    } else {
      pcRef.current.addTrack(audioTrack, stream);
    }
  }

  async function setOutgoingVideoTrack(track) {
    if (!pcRef.current) return;

    const base = localStreamRef.current || new MediaStream();

    // Siyah ekran düzeltmesi: preview stream içinde eski/bitmiş video track kalmasın.
    base.getVideoTracks().forEach(oldTrack => {
      if (!track || oldTrack.id !== track.id) {
        try { base.removeTrack(oldTrack); } catch {}
      }
    });

    if (track && !base.getTracks().some(t => t.id === track.id)) {
      base.addTrack(track);
    }

    localStreamRef.current = base;
    bindVideoNode(localVideoRef.current, base, true);
    bindVideoNode(compactLocalVideoRef.current, base, true);

    const videoSender = pcRef.current.getSenders().find(sender => sender.track?.kind === "video");

    if (videoSender) {
      await videoSender.replaceTrack(track || null);
      return;
    }

    if (track) {
      pcRef.current.addTrack(track, base);
    }
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

    // Video sonradan açılınca karşı tarafta siyah kalmaması için baştan video m-line hazır.
    try { pc.addTransceiver("video", { direction: "sendrecv" }); } catch {}

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
      console.log("Orbit RTC signaling:", pc.signalingState);
    };

    pc.ontrack = e => {
      addRemoteTrack(e.track);
      setCall(c => ({ ...c, status: e.track.kind === "audio" ? "Ses bağlantısı geldi" : "Görüntü bağlantısı geldi" }));
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
    stopRingtone();
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
    stopRingtone();
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


  async function renegotiate() {
    if (!pcRef.current || !call.peerId || !socketRef.current) return;
    const pc = pcRef.current;
    if (pc.signalingState !== "stable") return;

    await ensureOutgoingAudioTrack();

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current.emit("rtc:offer", { to: call.peerId, offer });
    setCall(c => ({ ...c, status: "Medya güncellendi - ses korunuyor" }));
  }


  function toggleMute() {
    const nextMuted = !call.muted;
    localStreamRef.current?.getAudioTracks().forEach(t => t.enabled = !nextMuted);
    rawMicStreamRef.current?.getAudioTracks().forEach(t => t.enabled = !nextMuted);
    setCall(c => ({ ...c, muted: nextMuted }));
  }

  async function toggleCamera() {
    try {
      await ensureOutgoingAudioTrack();

      if (call.camera) {
        cameraTrackRef.current?.stop();
        cameraStreamRef.current?.getTracks().forEach(t => t.stop());

        if (localStreamRef.current && cameraTrackRef.current) {
          try { localStreamRef.current.removeTrack(cameraTrackRef.current); } catch {}
        }

        cameraTrackRef.current = null;
        cameraStreamRef.current = null;

        // Ekran paylaşımı açıksa video olarak ekran kalsın. Değilse video kapansın.
        await setOutgoingVideoTrack(screenVideoTrackRef.current || null);
        await ensureOutgoingAudioTrack();

        setCall(c => ({ ...c, camera: false, status: "Kamera kapandı - ses korundu" }));
        await renegotiate();
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Tarayıcı kamera API'sini vermiyor. HTTPS linkiyle aç.");
      }

      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const videoTrack = videoStream.getVideoTracks()[0];
      const base = localStreamRef.current || await getAudioStream();

      if (!base.getTracks().some(t => t.id === videoTrack.id)) base.addTrack(videoTrack);

      cameraStreamRef.current = videoStream;
      cameraTrackRef.current = videoTrack;
      localStreamRef.current = base;

      // Ekran paylaşımı yoksa kamerayı gönder. Ekran açıksa ses korunur, video olarak ekran devam eder.
      if (!screenVideoTrackRef.current) await setOutgoingVideoTrack(videoTrack);
      await ensureOutgoingAudioTrack();

      setCall(c => ({ ...c, camera: true, status: "Kamera açıldı - ses korundu" }));
      await renegotiate();
    } catch (err) {
      setError(err.message || "Kamera izni verilmedi veya kamera bulunamadı.");
    }
  }

  async function toggleScreen() {
    try {
      await ensureOutgoingAudioTrack();

      if (call.screen) {
        screenVideoTrackRef.current?.stop();
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
        screenVideoTrackRef.current = null;

        // Ekranı kapatınca kamera açıksa kameraya geri dön, değilse video kapansın. Ses asla değişmez.
        await setOutgoingVideoTrack(cameraTrackRef.current || null);
        await ensureOutgoingAudioTrack();

        setCall(c => ({ ...c, screen: false, status: "Ekran paylaşımı kapandı - ses korundu" }));
        await renegotiate();
        return;
      }

      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Tarayıcı ekran paylaşımı API'sini vermiyor.");
      }

      // Kritik düzeltme: ekran paylaşırken audio:false. Böylece sistem/tab audio mikrofonun yerine geçmez.
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = stream.getVideoTracks()[0];

      screenStreamRef.current = stream;
      screenVideoTrackRef.current = screenTrack;

      screenTrack.onended = async () => {
        screenStreamRef.current = null;
        screenVideoTrackRef.current = null;
        await setOutgoingVideoTrack(cameraTrackRef.current || null);
        await ensureOutgoingAudioTrack();
        setCall(c => ({ ...c, screen: false, status: "Ekran paylaşımı kapandı - ses korundu" }));
        await renegotiate();
      };

      await setOutgoingVideoTrack(screenTrack);
      await ensureOutgoingAudioTrack();

      setCall(c => ({ ...c, screen: true, status: "Ekran paylaşımı açıldı - ses korundu" }));
      await renegotiate();
    } catch (err) {
      setError(err.message || "Ekran paylaşımı iptal edildi.");
    }
  }

  function endCall(sendEvent = true) {
    stopRingtone();
    if (sendEvent && call.peerId && socketRef.current) socketRef.current.emit("dm:call:end", { to: call.peerId });

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    rawMicStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    audioContextRef.current?.close?.();

    localStreamRef.current = null;
    rawMicStreamRef.current = null;
    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    cameraTrackRef.current = null;
    screenVideoTrackRef.current = null;
    remoteStreamRef.current = null;
    remoteCombinedStreamRef.current = null;
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
      remoteVideo: false,
      localVolume: 100,
      remoteVolume: 100
    });
  }

  if (!user) {
    return (
      <div className="authPage">
        <form className="authCard" onSubmit={submitAuth}>
          <div className="brand">O</div>
          <h1>{authMode === "login" ? "Giriş Yap" : "Kaydol"}</h1>
          <p>Orbit Client hesabınla sohbet etmeye başla.</p>
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
    <div className={`app ${showRightPanel ? "rightOpen" : "rightClosed"}`}>
      <aside className="serverRail">
        <button className={`serverIcon ${rightTab === "dashboard" ? "active" : ""}`} onClick={() => setRightTab("dashboard")}>🏠</button>
        <button className={`serverIcon ${rightTab === "groups" || rightTab === "group" ? "active" : ""}`} onClick={() => setRightTab("groups")}>💬</button>
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
          <h1>{rightTab === "dashboard" || rightTab === "friends" || rightTab === "dm" || rightTab === "groups" || rightTab === "group" ? "Orbit" : activeServer?.name}</h1>
          <p>{rightTab === "dashboard" || rightTab === "friends" || rightTab === "dm" || rightTab === "groups" || rightTab === "group" ? "Sohbet, arkadaşlar ve gruplar." : activeServer?.description}</p>
        </div>

        <button className="serverBoost" onClick={() => setRightTab("dashboard")}>🏠 Ana Sayfa</button>
        <button className="serverBoost" onClick={() => setRightTab("friends")}>👥 Arkadaşlar</button>
        <button className="serverBoost" onClick={() => setRightTab("groups")}>💬 Grup DM</button>
        <button className="serverBoost subtleBoost" onClick={() => setModal("settings")}>⚙ Daha Fazla / Ayarlar</button>

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
            <h2>{rightTab === "dm" ? `💬 ${dmUser?.username}` : rightTab === "group" ? `💬 ${activeGroup?.name}` : rightTab === "groups" ? "💬 Grup DM" : rightTab === "dashboard" ? "🏠 Ana Sayfa" : rightTab === "friends" ? "👥 Arkadaşlar" : `${channelIcon(activeChannel?.type)} ${activeChannel?.name}`}</h2>
            <p>{rightTab === "dashboard" ? `Discord benzeri Orbit Client arayüzü.` : rightTab === "groups" ? "Arkadaşlarınla özel grup sohbeti oluştur." : rightTab === "group" ? "Grup mesajlaşması." : rightTab === "friends" ? "Kullanıcı ara, arkadaş ekle, DM aç." : rightTab === "dm" ? "Özel mesaj ve sesli arama." : activeChannel?.topic}</p>
          </div>
          <div className="topActions cleanTopActions">
            <button title="Sağ panel" onClick={() => setShowRightPanel(v => !v)}>{showRightPanel ? "▸" : "◂"}</button>
            <button title="Ayarlar" onClick={() => setModal("settings")}>⚙</button>
          </div>
        </header>

        {rightTab === "dashboard" ? (
          <DashboardPage
            user={user}
            servers={servers}
            friends={friends}
            groups={groups}
            installApp={installApp}
            isInstalled={isInstalled}
            enableNotifications={enableNotifications}
            notificationPermission={notificationPermission}
            mentionCount={mentionCount}
            setRightTab={setRightTab}
            setModal={setModal}
            createInvite={createInvite}
            openDm={openDm}
            openGroup={openGroup}
            activeServer={activeServer}
          />
        ) : rightTab === "friends" ? (
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
        ) : rightTab === "groups" ? (
          <GroupsPage groups={groups} openGroup={openGroup} setModal={setModal} />
        ) : rightTab === "group" ? (
          <GroupChatPage
            activeGroup={activeGroup}
            messages={groupMessages}
            draft={groupDraft}
            setDraft={setGroupDraft}
            send={sendGroupMessage}
            groupVoice={groupVoice}
            groupRemoteStreams={groupRemoteStreams}
            joinGroupVoice={joinGroupVoice}
            leaveGroupVoice={leaveGroupVoice}
            toggleGroupMute={toggleGroupMute}
            toggleGroupCamera={toggleGroupCamera}
            toggleGroupScreen={toggleGroupScreen}
            groupLocalVideoOn={groupLocalVideoOn}
            groupScreenOn={groupScreenOn}
            groupLocalStream={groupVoiceLocalStreamRef.current}
            groupCameraStream={groupCameraStreamRef.current}
            groupScreenStream={groupScreenStreamRef.current}
            soundboardItems={soundboardItems}
            sendGroupSound={sendGroupSound}
            openFullscreen={openFullscreen}
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
            soundboardItems={soundboardItems}
            sendDmSound={sendDmSound}
            openFullscreen={openFullscreen}
          />
        ) : ["voice", "stage"].includes(activeChannel?.type) ? (
          <section className="voiceRoom discordServerVoiceRoom">
            <div className="voiceRoomIcon">{channelIcon(activeChannel.type)}</div>
            <h1>{activeChannel.name}</h1>
            <p>Discord tarzı sunucu ses odası önizlemesi. Aktif çoklu ses sistemi grup DM panelinde çalışır.</p>
            <button className="primary" onClick={() => setError("Sunucu kanalları için tam Discord benzeri çoklu ses için SFU/oda altyapısı gerekir. Mevcut çalışan arama sistemi DM ve Grup DM içinde korunuyor.")}>Ses Odasını Aç</button>
          </section>
        ) : (
          <Chat messages={messages} user={user} activeChannel={activeChannel} draft={draft} setDraft={setDraft} sendMessage={sendMessage} react={react} pin={pin} del={del} edit={edit} onUpload={sendMessage} />
        )}
      </main>

      <aside className="rightPanel">
        <div className="tabs"><button onClick={() => setRightTab("dashboard")}>Home</button><button onClick={() => setRightTab("friends")}>Arkadaş</button><button onClick={() => setRightTab("groups")}>Grup</button><button onClick={() => setRightTab("members")}>Üye</button><button onClick={() => { setRightTab("audit"); loadAudit(); }}>Audit</button></div>
        {rightTab === "members" && serverMembers.map(m => <div className="memberCard" key={m.id}><div className="avatar">{m.avatar}</div><div><b>{m.username}</b><p>{m.role} • {m.status}</p><small>{m.bio}</small></div></div>)}
        {rightTab === "audit" && audit.map(a => <div className="activity" key={a.id}><b>{time(a.created_at)}</b><p>{a.action}</p></div>)}
        {(rightTab === "friends" || rightTab === "dm") && <FriendSidebar friends={friends} openDm={openDm} />}
        {(rightTab === "groups" || rightTab === "group") && <GroupSidebar groups={groups} openGroup={openGroup} />}
      </aside>

      <audio ref={persistentRemoteAudioRef} autoPlay playsInline />

      {groupVoice.active && (
        <GroupVoiceDock
          groupVoice={groupVoice}
          groupRemoteStreams={groupRemoteStreams}
          activeGroup={activeGroup}
          setRightTab={setRightTab}
          toggleGroupMute={toggleGroupMute}
          leaveGroupVoice={leaveGroupVoice}
        />
      )}

      {call.active && !(rightTab === "dm" && dmUser && call.peerId === dmUser.id) && !/aranıyor/i.test(String(call.status || "")) && (
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
          openFullscreen={openFullscreen}
        />
      )}

      {call.incoming && (
        <div className="discordIncomingOverlay">
          <div className="discordIncomingMiniCard">
            <div className="incomingAvatarRing">
              <div className="avatar incomingBigAvatar">{call.incoming.avatar}</div>
            </div>
            <h3>{call.incoming.username}</h3>
            <p>Seni sesli arıyor. Kabul edince tarayıcı mikrofon izni ister ve arama başlar.</p>
            <div className="incomingPermissionActions">
              <button className="incomingReject" onClick={rejectIncomingCall} title="Reddet">✕</button>
              <button className="incomingAccept" onClick={acceptIncomingCall} title="Kabul et">☎</button>
            </div>
          </div>
        </div>
      )}

      <div className="toast">{toast}</div>
      {error && <div className="error floating" onClick={() => setError("")}>{error}</div>}

      {modal === "server" && <ServerModal onClose={() => setModal(null)} onCreate={createServer} />}
      {modal === "channel" && <ChannelModal onClose={() => setModal(null)} onCreate={createChannel} />}
      {modal === "settings" && (
        <SettingsModal
          user={user}
          setUser={setUser}
          onClose={() => setModal(null)}
          installApp={installApp}
          enableNotifications={enableNotifications}
          notificationPermission={notificationPermission}
          setModal={setModal}
          createInvite={createInvite}
          loadAudit={loadAudit}
          setRightTab={setRightTab}
        />
      )}
      {modal === "group" && <CreateGroupModal friends={friends} onClose={() => setModal(null)} onCreate={createGroup} />}
      {modal === "joinServer" && <JoinServerModal onClose={() => setModal(null)} onJoin={joinServerByInput} />}
      {modal === "installHelp" && <InstallHelpModal onClose={() => setModal(null)} />}
      {modal?.type === "inviteCreated" && <InviteCreated modal={modal} onClose={() => setModal(null)} />}
      {modal === "invitePreview" && invitePreview && <InvitePreview invite={invitePreview} user={user} onJoin={() => joinInvite(invitePreview.code)} onClose={() => setModal(null)} />}
    </div>
  );
}




function MessageContent({ text }) {
  const raw = String(text || "");

  if (raw.startsWith("::file::")) {
    try {
      const file = JSON.parse(raw.slice("::file::".length));
      const type = file.type || "";
      const isImage = type.startsWith("image/");
      const isVideo = type.startsWith("video/");
      const isAudio = type.startsWith("audio/");

      return (
        <div className="attachmentCard">
          {isImage && <img src={file.dataUrl} alt={file.name} />}
          {isVideo && <video src={file.dataUrl} controls />}
          {isAudio && <audio src={file.dataUrl} controls />}
          <div className="attachmentInfo">
            <b>{file.name}</b>
            <span>{Math.round((file.size || 0) / 1024)} KB</span>
            <a href={file.dataUrl} download={file.name}>İndir</a>
          </div>
        </div>
      );
    } catch {
      return <span>Dosya gösterilemedi.</span>;
    }
  }

  const parts = raw.split(/(@[a-zA-Z0-9_ğüşöçıİĞÜŞÖÇ.-]{2,32})/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("@")) return <span key={index} className="mentionTag">{part}</span>;
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
}

function AttachmentButton({ onUpload }) {
  const inputRef = useRef(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const content = await fileToDataMessage(file);
      await onUpload(content);
    } catch (err) {
      alert(err.message || "Dosya gönderilemedi.");
    }
  }

  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()}>＋</button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,image/gif,video/*,audio/*,.webp"
        onChange={pick}
        style={{ display: "none" }}
      />
    </>
  );
}

function bindStandaloneVideo(node, stream, muted = false) {
  if (!node) return;
  node.autoplay = true;
  node.playsInline = true;
  node.muted = muted;
  if (node.srcObject !== stream) node.srcObject = stream || null;
  const tryPlay = () => node.play?.().catch(() => {});
  node.onloadedmetadata = tryPlay;
  try { stream?.getTracks?.().forEach(track => { track.onunmute = tryPlay; }); } catch {}
  tryPlay();
}

function RemoteMediaTile({ stream, label, openFullscreen }) {
  const ref = useRef(null);

  useEffect(() => {
    bindStandaloneVideo(ref.current, stream, false);
  }, [stream]);

  const hasVideo = Boolean(stream?.getVideoTracks?.().length);

  return (
    <div className="groupMediaTile mediaCanFullscreen" onDoubleClick={() => openFullscreen(ref)}>
      {hasVideo ? <video ref={ref} autoPlay playsInline /> : <div className="audioOnly">🔊</div>}
      <span>{label}</span>
      {hasVideo && <button className="fullscreenBtn" onClick={() => openFullscreen(ref)}>⛶ Tam ekran</button>}
    </div>
  );
}

function LocalGroupMediaTile({ stream, label, openFullscreen }) {
  const ref = useRef(null);

  useEffect(() => {
    bindStandaloneVideo(ref.current, stream, true);
  }, [stream]);

  if (!stream) return null;

  return (
    <div className="groupMediaTile mediaCanFullscreen" onDoubleClick={() => openFullscreen(ref)}>
      <video ref={ref} autoPlay muted playsInline />
      <span>{label}</span>
      <button className="fullscreenBtn" onClick={() => openFullscreen(ref)}>⛶ Tam ekran</button>
    </div>
  );
}

function Soundboard({ items, onPlay }) {
  return (
    <div className="soundboard">
      {items.map(item => <button key={item.id} onClick={() => onPlay(item.id)}>{item.label}</button>)}
    </div>
  );
}

function DashboardPage({ user, servers, friends, groups, installApp, isInstalled, enableNotifications, notificationPermission, mentionCount, setRightTab, setModal, createInvite, openDm, openGroup, activeServer }) {
  const recentFriends = friends.friends.slice(0, 6);
  const recentGroups = groups.slice(0, 4);

  return (
    <section className="discordHome ultraHome">
      <div className="ultraWelcome">
        <div>
          <p className="eyebrow">{APP_VERSION}</p>
          <h1>Merhaba, {user.username}</h1>
          <p className="muted">Direkt mesajlar, gruplar, bildirimler ve sunucular tek yerde.</p>
        </div>
        <button className="settingsBig" onClick={() => setModal("settings")}>⚙ Ayarlar</button>
      </div>

      <div className="ultraGrid">
        <div className="panelCard homeCard mainHomeCard">
          <div className="homeCardHeader">
            <h3>Direkt Mesajlar</h3>
            <button className="miniLink" onClick={() => setRightTab("friends")}>Arkadaşlar</button>
          </div>
          <div className="homeList">
            {recentFriends.length > 0 ? recentFriends.map(f => (
              <button key={f.id} className="homeListItem" onClick={() => openDm(f)}>
                <div className="avatar">{f.avatar}</div>
                <div className="homeListText">
                  <b>{f.username}</b>
                  <span>{f.status || "online"}</span>
                </div>
                <small>DM</small>
              </button>
            )) : <div className="emptyState"><b>Henüz arkadaş yok</b><span>Arkadaş ekleyince burada görünür.</span></div>}
          </div>
        </div>

        <div className="panelCard homeCard">
          <div className="homeCardHeader">
            <h3>Gruplar</h3>
            <button className="miniLink" onClick={() => setModal("group")}>Yeni</button>
          </div>
          <div className="homeList">
            {recentGroups.length > 0 ? recentGroups.map(g => (
              <button key={g.id} className="homeListItem" onClick={() => openGroup(g)}>
                <div className="avatar">💬</div>
                <div className="homeListText">
                  <b>{g.name}</b>
                  <span>{g.member_count || 1} üye</span>
                </div>
                <small>Aç</small>
              </button>
            )) : <div className="emptyState"><b>Grup yok</b><span>Yeni grup oluştur.</span></div>}
          </div>
        </div>
      </div>

      <div className="ultraShortcutRow">
        <button onClick={() => setRightTab("friends")}>👥 Arkadaşlar</button>
        <button onClick={() => setRightTab("groups")}>💬 Grup DM</button>
        <button onClick={() => setModal("joinServer")}>➕ Sunucuya Katıl</button>
        <button onClick={() => setModal("settings")}>⚙ Ayarlar</button>
      </div>
    </section>
  );
}

function GroupsPage({ groups, openGroup, setModal }) {
  return (
    <section className="friendsPage">
      <div className="friendSearch">
        <div>
          <h2>Grup DM</h2>
          <p className="muted">Arkadaşlarını seçerek özel grup sohbeti oluştur.</p>
        </div>
        <button onClick={() => setModal("group")}>Grup Oluştur</button>
      </div>

      <div className="groupGrid">
        {groups.map(g => (
          <button key={g.id} className="groupCard" onClick={() => openGroup(g)}>
            <div className="groupIcon">💬</div>
            <div><b>{g.name}</b><p>{g.member_count || 1} üye</p><small>{g.last_message || "Henüz mesaj yok"}</small></div>
          </button>
        ))}
        {groups.length === 0 && <div className="panelCard"><h3>Grup yok</h3><p className="muted">Grup oluşturmak için üstteki butona bas.</p></div>}
      </div>
    </section>
  );
}

function GroupChatPage({
  activeGroup,
  messages,
  draft,
  setDraft,
  send,
  groupVoice,
  groupRemoteStreams,
  joinGroupVoice,
  leaveGroupVoice,
  toggleGroupMute,
  toggleGroupCamera,
  toggleGroupScreen,
  groupLocalVideoOn,
  groupScreenOn,
  groupLocalStream,
  groupCameraStream,
  groupScreenStream,
  soundboardItems,
  sendGroupSound,
  openFullscreen
}) {
  if (!activeGroup) return <section className="friendsPage"><div className="panelCard"><h3>Grup seçilmedi</h3><p className="muted">Grup DM listesinden bir grup aç.</p></div></section>;

  const inThisVoice = groupVoice.active && groupVoice.groupId === activeGroup.id;

  return (
    <section className="chat">
      <div className="messages">
        <div className="channelHero groupHero">
          <div className="heroIcon">💬</div>
          <div>
            <h2>{activeGroup.name}</h2>
            <p>{activeGroup.member_count || 1} üyeli grup sohbeti.</p>
          </div>
          <div className="groupVoiceActions">
            {!inThisVoice ? <button onClick={joinGroupVoice}>🔊 Grup Sesine Katıl</button> : <>
              <button onClick={toggleGroupMute}>{groupVoice.muted ? "Mic Aç" : "Mic Kapat"}</button>
              <button onClick={toggleGroupCamera}>{groupLocalVideoOn ? "Kamera Kapat" : "Kamera Aç"}</button>
              <button onClick={toggleGroupScreen}>{groupScreenOn ? "Ekranı Kapat" : "Ekran Paylaş"}</button>
              <button className="danger" onClick={leaveGroupVoice}>Sesten Çık</button>
            </>}
          </div>
        </div>

        {inThisVoice && (
          <div className="groupVoicePanel discordVoicePanel">
            <div className="voiceTopBar">
              <div>
                <span className="voiceStatusPill"><i /> Ses bağlı</span>
                <h3>{activeGroup.name}</h3>
                <p>{groupVoice.status}</p>
              </div>
              <div className="voiceTopActions">
                <button onClick={toggleGroupMute}>{groupVoice.muted ? "🎙 Mic Aç" : "🔇 Mic Kapat"}</button>
                <button onClick={toggleGroupCamera}>{groupLocalVideoOn ? "🎥 Kamera Kapat" : "🎥 Kamera Aç"}</button>
                <button onClick={toggleGroupScreen}>{groupScreenOn ? "🖥 Ekranı Kapat" : "🖥 Ekran Paylaş"}</button>
                <button className="danger" onClick={leaveGroupVoice}>📞 Çık</button>
              </div>
            </div>

            <div className="groupMediaGrid discordStageGrid">
              <LocalGroupMediaTile stream={groupScreenStream || groupCameraStream} label={groupScreenOn ? "Senin ekranın" : "Senin kameran"} openFullscreen={openFullscreen} />
              {!groupScreenStream && !groupCameraStream && <div className="groupMediaTile selfAudioTile"><div className="audioOnly">🎙</div><span>Sen</span></div>}
              {Object.entries(groupRemoteStreams).map(([id, stream]) => {
                const peer = groupVoice.peers.find(p => p.socketId === id);
                return <RemoteMediaTile key={id} stream={stream} label={peer?.username || "Katılımcı"} openFullscreen={openFullscreen} />;
              })}
              {Object.keys(groupRemoteStreams).length === 0 && <div className="groupMediaTile waitingTile"><div className="audioOnly">👥</div><span>Katılımcılar bekleniyor</span></div>}
            </div>

            <div className="voiceParticipants discordParticipants">
              <div className={`voicePill ${groupVoice.muted ? "mutedVoice" : "speakingVoice"}`}>Sen {groupVoice.muted ? "• mikrofon kapalı" : "• konuşuyor"}</div>
              {groupVoice.peers.map(p => <div className="voicePill" key={p.socketId}>{p.username || "Kullanıcı"} • {p.status}</div>)}
            </div>

            <div className="soundboardBox discordSoundboard">
              <div className="panelTitleRow"><h4>Ses Efektleri</h4><small>Grup soundboard</small></div>
              <Soundboard items={soundboardItems} onPlay={sendGroupSound} />
            </div>

            {Object.entries(groupRemoteStreams).map(([id, stream]) => <RemoteAudio key={id} stream={stream} />)}
          </div>
        )}

        {messages.map(m => <article className="message" key={m.id}><div className="avatar">{m.avatar}</div><div className="messageBody"><div className="messageTop"><b>{m.username}</b><span>{time(m.created_at)}</span></div><p><MessageContent text={m.content} /></p></div></article>)}
      </div>
      <div className="composer"><AttachmentButton onUpload={send} /><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={`${activeGroup.name} grubuna mesaj yaz`} /><button onClick={() => send()}>➤</button></div>
    </section>
  );
}

function RemoteAudio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.play?.().catch(() => {});
    }
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

function GroupVoiceDock({ groupVoice, groupRemoteStreams, activeGroup, setRightTab, toggleGroupMute, leaveGroupVoice }) {
  const count = Object.keys(groupRemoteStreams || {}).length + 1;
  return (
    <div className="groupVoiceDock discordBottomDock">
      <div className="dockConnection">
        <span className="dockSignal">▰▰▰</span>
        <div><b>Ses Bağlandı</b><p>{activeGroup?.name || "Grup"} • {count} kişi • {groupVoice.status}</p></div>
      </div>
      <div className="dockButtons discordDockButtons">
        <button onClick={() => setRightTab("group")}>Sohbete Dön</button>
        <button onClick={toggleGroupMute}>{groupVoice.muted ? "🎙" : "🔇"}</button>
        <button className="danger" onClick={leaveGroupVoice}>📞</button>
      </div>
    </div>
  );
}

function GroupSidebar({ groups, openGroup }) {
  return <>
    <h3>Gruplar</h3>
    {groups.slice(0, 8).map(g => <div className="memberCard" key={g.id}><div className="avatar">💬</div><div><b>{g.name}</b><p>{g.member_count || 1} üye</p><button onClick={() => openGroup(g)}>Aç</button></div></div>)}
  </>;
}


function GlobalCallDock({ call, dmUser, localVideoRef, remoteVideoRef, setRightTab, toggleMute, toggleCamera, toggleScreen, endCall, openFullscreen }) {
  return (
    <div className="globalCallDock discordBottomDock activeDmDock">
      <div className="dockVideos">
        <div className="dockVideo mediaCanFullscreen" onDoubleClick={() => openFullscreen(remoteVideoRef)}>
          <video ref={remoteVideoRef} autoPlay playsInline />
          <span>{dmUser?.username || "Karşı taraf"}</span>
          <button className="fullscreenBtn tiny" onClick={() => openFullscreen(remoteVideoRef)}>⛶</button>
        </div>
        {call.camera && (
          <div className="dockVideo small mediaCanFullscreen" onDoubleClick={() => openFullscreen(localVideoRef)}>
            <video ref={localVideoRef} autoPlay muted playsInline />
            <span>Sen</span>
            <button className="fullscreenBtn tiny" onClick={() => openFullscreen(localVideoRef)}>⛶</button>
          </div>
        )}
      </div>
      <div className="dockConnection">
        <span className="dockSignal">▰▰▰</span>
        <div><b>Ses Bağlandı</b><p>{call.peerName || dmUser?.username || "DM"} • {call.status}</p></div>
      </div>
      <div className="dockButtons discordDockButtons">
        <button onClick={() => setRightTab("dm")}>DM</button>
        <button onClick={toggleMute}>{call.muted ? "🎙" : "🔇"}</button>
        <button onClick={toggleCamera}>🎥</button>
        <button onClick={toggleScreen}>🖥</button>
        <button className="danger" onClick={() => endCall()}>📞</button>
      </div>
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

function DMPage({ dmUser, messages, draft, setDraft, send, call, localVideoRef, remoteVideoRef, screenVideoRef, startDmCall, acceptIncomingCall, rejectIncomingCall, toggleMute, toggleCamera, toggleScreen, endCall, setCall, soundboardItems, sendDmSound, openFullscreen }) {
  if (!dmUser) return <section className="friendsPage"><div className="panelCard"><h3>DM seçilmedi</h3><p className="muted">Arkadaşlar listesinden birini seç.</p></div></section>;

  const isThisCall = call.active && (call.peerId === dmUser.id || call.peerName === dmUser.username);
  const isRinging = isThisCall && /aranıyor/i.test(String(call.status || ""));
  const callTitle = isRinging ? `${dmUser.username} aranıyor` : `${dmUser.username} ile aramadasın`;
  const callDescription = isRinging
    ? "Karşı tarafa arama isteği gönderildi. Kabul ederse ses bağlantısı açılacak."
    : (call.status || "Ses bağlantısı açık");

  return (
    <section className={`dmLayout discordDmCall discordDmPermissionMode ${isThisCall ? "dmHasInlineCall" : ""}`}>
      <div className="dmChat">
        <div className="messages dmMessagesWithCenterCall">
          <div className="channelHero dmHero">
            <div className="heroIcon">{dmUser.avatar || "💬"}</div>
            <div>
              <h2>{dmUser.username}</h2>
              <p>Özel mesaj, sesli arama, kamera ve ekran paylaşımı.</p>
            </div>
            <div className="dmHeroActions">
              <button className="callTopBtn" onClick={startDmCall} title="Sesli ara">☎</button>
              <button className="callTopBtn" onClick={toggleCamera} title="Kamera">🎥</button>
              <button className="callTopBtn" onClick={toggleScreen} title="Ekran paylaş">🖥</button>
            </div>
          </div>

          {isThisCall && (
            <div className="discordCallPopArea">
              <div className={`discordPermissionCallCard ${isRinging ? "ringing" : "connected"}`}>
                <div className="permissionCardTop">
                  <div className="permissionAvatarWrap">
                    <div className="avatar permissionAvatar">{dmUser.avatar}</div>
                    <span className="permissionPing" />
                  </div>
                  <h3>{callTitle}</h3>
                  <p>{callDescription}</p>
                </div>

                {!isRinging && (
                  <div className="permissionMediaStage">
                    <div className="permissionVideoTile remote mediaCanFullscreen" onDoubleClick={() => openFullscreen(remoteVideoRef)}>
                      <video ref={remoteVideoRef} autoPlay playsInline />
                      {!call.remoteVideo && <div className="permissionVideoFallback"><div className="avatar">{dmUser.avatar}</div><span>{dmUser.username}</span></div>}
                      <button className="fullscreenBtn tiny" onClick={() => openFullscreen(remoteVideoRef)}>⛶</button>
                    </div>
                    <div className="permissionVideoTile self mediaCanFullscreen" onDoubleClick={() => openFullscreen(localVideoRef)}>
                      <video ref={localVideoRef} autoPlay muted playsInline />
                      {!call.camera && <div className="permissionVideoFallback small"><div className="avatar">Sen</div><span>Kamera kapalı</span></div>}
                      <button className="fullscreenBtn tiny" onClick={() => openFullscreen(localVideoRef)}>⛶</button>
                    </div>
                    {call.screen && (
                      <div className="permissionVideoTile screen mediaCanFullscreen" onDoubleClick={() => openFullscreen(screenVideoRef)}>
                        <video ref={screenVideoRef} autoPlay muted playsInline />
                        <span className="screenLabel">Ekran paylaşımı</span>
                        <button className="fullscreenBtn tiny" onClick={() => openFullscreen(screenVideoRef)}>⛶</button>
                      </div>
                    )}
                  </div>
                )}

                <div className="permissionCallActions">
                  {!isRinging && <button className={`roundCallBtn ${call.muted ? "disabled" : ""}`} onClick={toggleMute} title="Mikrofon">{call.muted ? "🔇" : "🎙"}</button>}
                  {!isRinging && <button className={`roundCallBtn ${call.camera ? "active" : ""}`} onClick={toggleCamera} title="Kamera">🎥</button>}
                  {!isRinging && <button className={`roundCallBtn ${call.screen ? "active" : ""}`} onClick={toggleScreen} title="Ekran paylaş">🖥</button>}
                  <button className="roundCallBtn rejectCall" onClick={() => endCall()} title={isRinging ? "Aramayı iptal et" : "Aramayı bitir"}>✕</button>
                </div>

                {!isRinging && (
                  <div className="permissionExtras">
                    <details>
                      <summary>Ses ayarları ve soundboard</summary>
                      <div className="volumeBox compactVolumeBox">
                        <label>Karşı taraf sesi <b>{call.remoteVolume}%</b></label>
                        <input type="range" min="0" max="100" value={call.remoteVolume} onChange={e => setCall(c => ({ ...c, remoteVolume: Number(e.target.value) }))} />
                        <label>Mikrofon seviyesi <b>{call.localVolume}%</b></label>
                        <input type="range" min="0" max="100" value={call.localVolume} onChange={e => setCall(c => ({ ...c, localVolume: Number(e.target.value) }))} />
                      </div>
                      <div className="soundboardBox compactSoundboard">
                        <Soundboard items={soundboardItems} onPlay={sendDmSound} />
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </div>
          )}

          {messages.map(m => <article className="message" key={m.id}><div className="avatar">{m.avatar}</div><div className="messageBody"><div className="messageTop"><b>{m.username}</b><span>{time(m.created_at)}</span></div><p><MessageContent text={m.content} /></p></div></article>)}
        </div>
        <div className="composer"><AttachmentButton onUpload={send} /><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={`${dmUser.username} kullanıcısına mesaj yaz`} /><button onClick={() => send()}>➤</button></div>
      </div>
    </section>
  );
}

function Chat({ messages, user, activeChannel, draft, setDraft, sendMessage, react, pin, del, edit, onUpload }) {
  return (
    <section className="chat">
      <div className="messages">
        <div className="channelHero"><div className="heroIcon">{channelIcon(activeChannel?.type)}</div><div><h2>{activeChannel?.name}</h2><p>{activeChannel?.topic}</p></div></div>
        {messages.map(m => (
          <article className="message" key={m.id}>
            <div className="avatar">{m.avatar}</div>
            <div className="messageBody">
              <div className="messageTop"><b>{m.username}</b><span>{time(m.created_at)}</span>{m.pinned && <span>📌</span>}</div>
              <p><MessageContent text={m.content} /></p>
              <div className="reactions">{Object.entries(m.reactions || {}).map(([e,n]) => <button key={e} onClick={() => react(m,e)}>{e} {n}</button>)}</div>
              <div className="messageActions"><button onClick={() => react(m,"👍")}>👍</button><button onClick={() => react(m,"🔥")}>🔥</button><button onClick={() => pin(m)}>Pin</button>{m.user_id===user.id && <button onClick={() => edit(m)}>Düzenle</button>}<button onClick={() => del(m)}>Sil</button></div>
            </div>
          </article>
        ))}
      </div>
      <div className="composer"><AttachmentButton onUpload={onUpload} /><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()} placeholder="Mesaj yaz" /><button onClick={() => sendMessage()}>➤</button></div>
    </section>
  );
}


function CreateGroupModal({ friends, onClose, onCreate }) {
  const [name, setName] = useState("Yeni Grup");
  const [selected, setSelected] = useState([]);

  function toggle(id) {
    setSelected(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  }

  return (
    <Modal title="Grup DM Oluştur" onClose={onClose}>
      <Field label="Grup adı" value={name} onChange={setName} />
      <div className="selectList">
        {friends.friends.map(f => (
          <label key={f.other.id} className="checkRow">
            <input type="checkbox" checked={selected.includes(f.other.id)} onChange={() => toggle(f.other.id)} />
            <span>{f.other.username}</span>
          </label>
        ))}
        {friends.friends.length === 0 && <p className="muted">Grup oluşturmak için önce arkadaş ekle.</p>}
      </div>
      <button className="primary" onClick={() => onCreate({ name, member_ids: selected })}>Grubu Oluştur</button>
    </Modal>
  );
}

function JoinServerModal({ onClose, onJoin }) {
  const [value, setValue] = useState("");

  return (
    <Modal title="Sunucuya Katıl" onClose={onClose}>
      <p className="muted">Davet kodunu veya tam davet linkini yapıştır.</p>
      <Field label="Davet kodu / linki" value={value} onChange={setValue} />
      <button className="primary" onClick={() => onJoin(value)}>Katıl</button>
    </Modal>
  );
}

function InstallHelpModal({ onClose }) {
  return (
    <Modal title="Uygulama Olarak Kur" onClose={onClose}>
      <p className="muted">Tarayıcı otomatik kurulum penceresi vermediyse şu yolu kullan:</p>
      <div className="inviteBox">PC Chrome/Edge: adres çubuğundaki yükle simgesi veya menü ⋮ → Sayfayı uygulama olarak yükle.</div>
      <div className="inviteBox">Android Chrome: menü ⋮ → Ana ekrana ekle.</div>
      <p className="muted">iPhone Safari: paylaş butonu → Ana Ekrana Ekle.</p>
    </Modal>
  );
}


function ServerModal({ onClose, onCreate }) {
  const [f, setF] = useState({ name: "", icon: "S", color: "#5865f2", description: "" });
  return <Modal title="Sunucu Oluştur" onClose={onClose}><Field label="Ad" value={f.name} onChange={v=>setF({...f,name:v})}/><Field label="İkon" value={f.icon} onChange={v=>setF({...f,icon:v})}/><Field label="Renk" type="color" value={f.color} onChange={v=>setF({...f,color:v})}/><Field label="Açıklama" value={f.description} onChange={v=>setF({...f,description:v})}/><button className="primary" onClick={()=>onCreate(f)}>Oluştur</button></Modal>;
}

function ChannelModal({ onClose, onCreate }) {
  const [f, setF] = useState({ name: "", type: "text", category: "YAZI", topic: "" });
  return <Modal title="Kanal Oluştur" onClose={onClose}><Field label="Ad" value={f.name} onChange={v=>setF({...f,name:v})}/><label className="field"><span>Tip</span><select value={f.type} onChange={e=>setF({...f,type:e.target.value})}><option value="text">Yazı</option><option value="announcement">Duyuru</option><option value="voice">Ses</option><option value="stage">Stage</option></select></label><Field label="Kategori" value={f.category} onChange={v=>setF({...f,category:v})}/><Field label="Konu" value={f.topic} onChange={v=>setF({...f,topic:v})}/><button className="primary" onClick={()=>onCreate(f)}>Oluştur</button></Modal>;
}

function SettingsModal({ user, setUser, onClose, installApp, enableNotifications, notificationPermission, setModal, createInvite, loadAudit, setRightTab }) {
  const [form, setForm] = useState({
    display_name: user.display_name || "",
    bio: user.bio || "",
    avatar: user.avatar || "🙂",
    status: user.status || "online"
  });

  async function save() {
    const data = await api("/api/me", { method: "PATCH", body: JSON.stringify(form) });
    setUser(data.user);
    onClose();
  }

  return (
    <Modal title="Ayarlar" onClose={onClose}>
      <div className="settingsGrid">
        <section className="settingsSection">
          <h3>Profil</h3>
          <Field label="Görünen ad" value={form.display_name} onChange={v => setForm({ ...form, display_name: v })} />
          <Field label="Bio" value={form.bio} onChange={v => setForm({ ...form, bio: v })} />
          <Field label="Avatar emoji" value={form.avatar} onChange={v => setForm({ ...form, avatar: v })} />
          <Field label="Durum" value={form.status} onChange={v => setForm({ ...form, status: v })} />
          <button className="primary" onClick={save}>Profili Kaydet</button>
        </section>

        <section className="settingsSection">
          <h3>Uygulama</h3>
          <button className="settingsAction" onClick={installApp}>⬇️ Uygulama olarak kur</button>
          <button className="settingsAction" onClick={enableNotifications}>🔔 Bildirimleri aç / test et</button>
          <p className="muted">Bildirim durumu: {notificationPermission}</p>
        </section>

        <section className="settingsSection">
          <h3>Sunucu ve Davet</h3>
          <button className="settingsAction" onClick={() => { onClose(); setModal("joinServer"); }}>➕ Sunucuya katıl</button>
          <button className="settingsAction" onClick={() => { onClose(); createInvite(); }}>🔗 Davet linki oluştur</button>
          <button className="settingsAction" onClick={() => { onClose(); setRightTab("audit"); loadAudit(); }}>🛡 Audit / Sunucu kayıtları</button>
        </section>
      </div>
    </Modal>
  );
}

function InviteCreated({ modal, onClose }) {
  return <Modal title="Resmi Davet Linki" onClose={onClose}><p className="muted">Bu link Orbit Client tarafından oluşturuldu. Birine atınca sunucu kartı açılır.</p><div className="officialInvite"><span>✅ Resmi Orbit daveti</span><b>{modal.invite.code}</b></div><div className="inviteBox">{modal.url}</div><button className="primary" onClick={() => navigator.clipboard.writeText(modal.url)}>Linki Kopyala</button></Modal>;
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
