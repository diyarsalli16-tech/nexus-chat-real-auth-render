# Nexus Chat V12 Mentions + Sounds + Notifications

Bu sürüm:
- @username etiketlerini mesaj içinde renklendirir.
- @kullanici ile etiketlenince bildirim sesi çalar.
- Bildirim izni verilirse Windows/Chrome masaüstü bildirimi gösterir.
- Mention sayacı ile başlıkta (1), (2), (3) gösterir.
- Gelen arama sesi/ringtone ekler.
- Gelen arama masaüstü bildirimi gösterir.
- Mesaj ve panel animasyonları ekler.
- Kamera/video alanını büyütür.
- Service worker cache V12 olur.

Kurulum:
cd /d "%USERPROFILE%\Downloads"
tar -xf nexus-chat-v12-mentions-sounds-notifications.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\nexus-chat-v12-mentions-sounds-notifications\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "add mentions sounds notifications and larger camera"
git push
