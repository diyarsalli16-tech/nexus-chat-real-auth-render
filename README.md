# Nexus Chat V3 Polished

Düzeltilenler:
- DM arama paneli yenilendi.
- DM sesli arama için WebRTC signaling eklendi.
- Mikrofon kapat/aç, kamera aç/kapat, ekran paylaşımı, ses seviyesi paneli eklendi.
- Gelen arama bildirimi eklendi.
- Sunucu davet linki oluşturma ve davet linkinden katılma eklendi.
- /invite/CODE linkleri sunucu kartı gösterir.
- Mobil düzen iyileştirildi.

Kurulum:
1. Dosyaları eski proje klasörünün üstüne kopyala.
2. git add .
3. git commit -m "polish call panel invite and mobile"
4. git push
5. Render redeploy.

Not:
P2P WebRTC bazı ağlarda TURN sunucusu ister. STUN ile çoğu basit durumda çalışır. Eğer iki farklı internet arasında ses yine gitmezse TURN eklemek gerekir.
