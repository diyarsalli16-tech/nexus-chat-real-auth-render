# Nexus Chat V9 Real Groups + Install + Media

Bu sürüm V8.1'de görünmeyen özellikleri gerçekten görünür hale getirir:

- Dashboard ekranında açık "Uygulama Kur" butonu
- Grup DM listesi
- Grup DM oluşturma modalı
- Grup mesajlaşma
- Sunucuya davet kodu/linkiyle katılma modalı
- Kamera açma ve ekran paylaşımı için WebRTC renegotiation
- Dashboard'da V9 sürüm etiketi
- Service worker cache adı V9 yapıldı

Kurulum:
cd /d "%USERPROFILE%\Downloads"
tar -xf nexus-chat-v9-real-groups-install-media.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\nexus-chat-v9-real-groups-install-media\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "add real groups install button and media sharing"
git push
