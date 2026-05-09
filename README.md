# Nexus Chat V11 Media Audio Stability

Bu sürüm kamera/ekran açınca DM sesinin kaybolmasını düzeltir.

Düzeltmeler:
- Remote audio ve video artık tek stream gelince birbirini ezmiyor.
- Ekran paylaşımı audio:false ile açılır; mikrofonun yerine sistem sesi geçmez.
- Kamera/ekran açma-kapama öncesi ve sonrası outgoing audio sender tekrar sabitlenir.
- Kamera kapanınca ses track'i korunur.
- Ekran kapanınca kamera varsa kameraya, yoksa sadece sese döner.
- Ekran/kamera kapandıktan sonra sesin tamamen gitmesi bug'ı giderildi.

Kurulum:
cd /d "%USERPROFILE%\Downloads"
tar -xf nexus-chat-v11-media-audio-stability.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\nexus-chat-v11-media-audio-stability\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "fix audio after camera and screen share"
git push
