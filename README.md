# Nexus Chat V5 TURN + Debug

Bu sürüm DM ses aramasında "Bağlanıyor..." kalma sorununu hedefler.

Eklenenler:
- WebRTC için TURN fallback eklendi.
- /api/rtc-config endpoint'i eklendi.
- İstersen kendi TURN bilgilerini Render Environment Variables'a ekleyebilirsin:
  - TURN_URL=turn:senin-turn-hostun:3478
  - TURN_USERNAME=...
  - TURN_CREDENTIAL=...
- Arama panelinde ICE / connection state görünür.
- Remote audio/video geldiğinde video elementine zorla bağlanır.
- Mikrofon API yoksa net hata verir.

Not:
İki cihaz farklı ağdaysa TURN zorunlu olabilir. Public TURN test içindir; gerçek ürün için kendi TURN sunucunu kullan.
