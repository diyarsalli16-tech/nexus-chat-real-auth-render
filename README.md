# Orbit Client V18 Brand + Media Black Fix

Bu sürüm:
- Site ve uygulama adı Orbit Client yapıldı.
- PWA adı Orbit Client yapıldı.
- Sayfa başlığı Orbit Client yapıldı.
- İkon Orbit Client için O/orbit simgesi olarak değiştirildi.
- DM kamera/ekran paylaşımı siyah görünme ihtimaline karşı video bind sistemi düzeltildi.
- Grup kamera/ekran paylaşımında remote stream track birleştirme düzeltildi.
- Kamera/ekran sonradan açılınca WebRTC video m-line hazır olsun diye transceiver eklendi.
- Local preview içinde eski/bitmiş video track kalıp siyah görüntü vermesin diye temizleme eklendi.

Kurulum:
cd /d "%USERPROFILE%\Downloads"
tar -xf orbit-client-v18-brand-media-blackfix.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\orbit-client-v18-brand-media-blackfix\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "rename to orbit client and fix black media"
git push
