# Nexus Chat V6 SocketRef Call Fix

Bu sürüm DM sesli aramada Bağlanıyor... takılmasını hedefler.

Düzeltmeler:
- WebRTC offer/candidate gönderirken stale React socket state yerine socketRef kullanılır.
- Socket, DM değişince gereksiz reconnect olmaz.
- RTC offer/answer hataları artık ekranda hata olarak görünür.
- DM mesajları ve TURN config önceki sürümden korunur.

Kurulum:
1. Zip'i Desktop'a aç.
2. İçeriği nexus-chat-real-auth-render klasörünün üstüne kopyala.
3. git add .
4. git commit -m "fix webrtc stale socket call signaling"
5. git push
6. Render Manual Deploy > Deploy latest commit.
