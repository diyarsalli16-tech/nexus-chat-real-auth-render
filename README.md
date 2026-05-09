# Nexus Chat V13 Clean Discord Dashboard

Bu sürüm:
- Dashboard'ı sadeleştirir.
- Discord benzeri daha temiz bir ana sayfa düzeni verir.
- Sağ panelde dashboard için gereksiz arkadaş/grup listelerini kaldırır.
- Hızlı Başlat, Son DM'ler, Gruplar ve Sunucular blokları ekler.
- Büyük karışık kartları kaldırır.

Kurulum:
cd /d "%USERPROFILE%\Downloads"
tar -xf nexus-chat-v13-clean-discord-dashboard.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\nexus-chat-v13-clean-discord-dashboard\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "clean dashboard make it more discord-like"
git push
