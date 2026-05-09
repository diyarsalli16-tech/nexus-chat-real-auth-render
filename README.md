# Nexus Chat V8.1 Black Screen Fix

Bu sürüm V8 siyah ekran hatasını düzeltir.

Sebep:
- App.jsx içinde GlobalCallDock render ediliyordu ama component tanımlı değildi.
- Sesli arama aktif olunca React hata verip ekranı karartıyordu.

Düzeltme:
- GlobalCallDock component'i eklendi.
- DM dışına çıkınca altta arama paneli görünecek.
- PWA dosyaları korunur.

Kurulum:
tar -xf nexus-chat-v8-1-black-screen-call-dock-fix.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\nexus-chat-v8-1-black-screen-call-dock-fix\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "fix black screen call dock"
git push
