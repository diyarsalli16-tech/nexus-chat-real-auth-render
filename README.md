# Nexus Chat V4.1 DM Real Fix

Bu sürüm önceki V4 paketindeki asıl hatayı düzeltir.

Düzeltmeler:
- DM mesajı API cevabıyla anında ekrana düşer.
- Mesaj gönderimi hata verirse yazı input'a geri gelir ve hata gösterilir.
- Mikrofon slider'ı WebAudio gain ile gerçekten mikrofon sesine etki eder.
- Arama kapatılınca mikrofon, raw mic stream, ekran paylaşımı, peer connection ve audio context temizlenir.
- Arama panelinde durum/talimat görünür.

Not:
WebRTC iki farklı ağda hâlâ ses vermiyorsa TURN sunucusu gerekir.
