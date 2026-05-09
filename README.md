# Nexus Chat V8 Persistent Call + PWA

Bu sürüm:
- DM ekranından çıksan bile sesli aramanın devam etmesi için global arama dock'u ekler.
- Remote sesi gizli/persistent audio elementine bağlar.
- Sekme odağı değişip geri dönünce audio/video play'i tekrar tetikler.
- Kamera/ekran aktifken küçük overlay gösterir.
- Siteyi uygulama gibi kurmak için PWA manifest + service worker ekler.
- Android/Chrome ve masaüstü Chrome'da "Install app" desteği gelir.

Kurulum:
tar -xf nexus-chat-v8-persistent-call-pwa.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\nexus-chat-v8-persistent-call-pwa\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "add persistent call dock and pwa app"
git push
