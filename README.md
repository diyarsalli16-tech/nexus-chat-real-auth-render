# Nexus Chat V4 DM Fix

Bu sürüm DM sorunlarını düzeltir:

- DM mesajı socket gecikse bile anında ekrana düşer.
- DM mesajı hata verirse input geri gelir ve hata gösterilir.
- Mikrofon ses seviyesi slider'ı gerçekten WebAudio gain ile çalışır.
- Arama panelinde durum/talimat gösterir.
- Arama kapanınca mikrofon, kamera, ekran ve peer connection temizlenir.

Not:
WebRTC ses için iki kullanıcı aynı anda online olmalı ve aramayı karşı taraf kabul etmelidir.
Farklı ağlarda hâlâ ses gitmezse TURN sunucusu gerekir.
