# Nexus Chat V17 No E2EE + Fullscreen Media

Bu sürüm:
- E2EE şifreleme ve açılış animasyonu kaldırıldı.
- Mesajlar tekrar normal gönderilir.
- DM sesli aramada kamera ve ekran paylaşımı için tam ekran bakma eklendi.
- Grup aramasında kamera ve ekran paylaşımı kutularına tam ekran bakma eklendi.
- Video kutusuna çift tıklayınca tam ekran açılır.
- Kutudaki "Tam ekran" butonuna basınca tam ekran açılır.
- Dosya/foto/gif mesajları için JSON limit 20 MB yapıldı.
- Mesaj içerik limiti yükseltildi.

Kurulum:
cd /d "%USERPROFILE%\Downloads"
tar -xf nexus-chat-v17-no-e2ee-fullscreen-media.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\nexus-chat-v17-no-e2ee-fullscreen-media\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "remove e2ee and add fullscreen media view"
git push
