# Nexus Chat V14 Ultra Clean Discord UI

Bu sürüm:
- Dashboard'u daha da sadeleştirir.
- Sağ üstteki kalabalık butonları kaldırır.
- Kur, bildirim, davet, katıl, audit gibi şeyleri Ayarlar modalına taşır.
- Sol panelde sadece Ana Sayfa / Arkadaşlar / Grup DM / Ayarlar kalır.
- Ana sayfada sadece Direkt Mesajlar, Gruplar ve kısa butonlar kalır.

Kurulum:
cd /d "%USERPROFILE%\Downloads"
tar -xf nexus-chat-v14-ultra-clean-discord-ui.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\nexus-chat-v14-ultra-clean-discord-ui\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "move clutter into settings and clean dashboard"
git push
