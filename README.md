# Nexus Chat Real Social

Bu sürüm gerçek sosyal sistem ekler:

- Kullanıcı arama
- Arkadaşlık isteği gönderme
- Gelen isteği kabul/reddet
- Gönderilen isteği iptal
- Arkadaş silme
- Arkadaşlar arasında DM
- DM mesajları PostgreSQL'e kaydolur
- DM mesajları Socket.io ile canlı gelir
- Test hesapları: admin/123456 ve nova/123456

## Mevcut Render projesine yükleme

Bu zipin içindeki dosyaları eski `nexus-chat-real-auth-render` klasörünün üzerine kopyala.

Sonra CMD:

```cmd
git add .
git commit -m "add real friends and dm"
git push
```

Render otomatik redeploy eder. Environment Variables aynı kalacak:

- NODE_ENV=production
- JWT_SECRET=...
- DATABASE_URL=postgresql://...
