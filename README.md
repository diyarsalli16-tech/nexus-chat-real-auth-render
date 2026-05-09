# Nexus Chat V15 Group Video + Soundboard + Uploads

Bu sürüm:
- Grup aramasına kamera açma ekler.
- Grup aramasına ekran paylaşımı ekler.
- Birden fazla kişinin kamera/ekran açabilmesi için grup WebRTC mesh video track desteği ekler.
- DM ve grup aramalarına troll ses paneli ekler.
- Ses efektleri diğer tarafa/grup ses odasına gönderilir.
- DM, grup ve kanal mesajlarına fotoğraf/gif/video/audio dosyası gönderme ekler.
- Dosyalar dataURL olarak mesaj içine kaydedilir. Şimdilik maksimum 6 MB önerilir.

Kurulum:
cd /d "%USERPROFILE%\Downloads"
tar -xf nexus-chat-v15-group-video-soundboard-uploads.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\nexus-chat-v15-group-video-soundboard-uploads\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "add group video screen soundboard and uploads"
git push
