# Nexus Chat - gerçek kayıt/giriş + PostgreSQL + Socket.io

Bu proje sadece görsel simülasyon değildir:

- Kaydolma ve giriş gerçek backend ile çalışır.
- Şifreler bcrypt ile hashlenir.
- JWT oturum sistemi vardır.
- Kullanıcılar, sunucular, kanallar, mesajlar, reaksiyonlar ve thread mesajları PostgreSQL'e yazılır.
- Mesajlar Socket.io ile canlı gelir.
- Kamera, mikrofon ve ekran paylaşımı için gerçek tarayıcı izinleri kullanılır.
- Render üzerinde tek Web Service + Render Postgres ile yayınlanır.

## Yerel çalıştırma

Bilgisayarında PostgreSQL kurulu olmalı veya bir PostgreSQL URL kullanmalısın.

```cmd
copy .env.example .env
notepad .env
npm install
npm run build
npm run db:init
npm start
```

Sonra:
http://localhost:10000

İlk kurulum hesabı:
admin / 123456

## Render yayınlama

1. Bu klasörü GitHub reposuna yükle.
2. Render Dashboard > New > Blueprint seç.
3. GitHub reposunu bağla.
4. `render.yaml` dosyasını algılayacak.
5. Apply seç.
6. Render otomatik olarak:
   - Web service oluşturur.
   - Postgres database oluşturur.
   - DATABASE_URL değişkenini bağlar.
   - JWT_SECRET üretir.
7. Deploy bitince Render URL'sini aç.

Alternatif manuel:
- New > Postgres oluştur.
- New > Web Service oluştur.
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Environment Variables:
  - `DATABASE_URL`: Postgres Internal Database URL
  - `JWT_SECRET`: uzun rastgele bir şifre
  - `NODE_ENV`: production

## Not

Gerçek Discord düzeyi ses/video yayını için WebRTC mesh veya SFU gerekir. Bu projede kamera/mikrofon/ekran izinleri ve local media gerçektir; canlı mesaj ve veritabanı gerçektir.
