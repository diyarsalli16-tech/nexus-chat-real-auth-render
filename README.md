# Nexus Chat V7 Discord UI + Groups

Bu sürüm:
- Dashboard'u Discord benzeri kartlı hale getirir.
- Grup DM oluşturma ve grup mesajlaşma ekler.
- Sunucuya davet linki/koduyla katılma modalı ekler.
- Davet linki modalını "Resmi Nexus daveti" olarak gösterir.
- Kamera açma ve ekran paylaşımı için WebRTC renegotiation ekler.
- Kamera/ekran paylaşımı açıldıktan sonra karşı tarafa track göndermeyi düzeltir.
- Mobil ve panel CSS iyileştirmesi ekler.

Kurulum:
tar -xf nexus-chat-v7-discord-ui-groups.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\nexus-chat-v7-discord-ui-groups\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "add discord dashboard groups and media renegotiation"
git push
