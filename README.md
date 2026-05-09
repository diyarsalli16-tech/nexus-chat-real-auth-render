# Nexus Chat V16.1 E2EE Device Fix

Bu sürüm V16'daki şu hatayı düzeltir:
- Mesajlarda sürekli "[Bu mesaj senin cihazın için şifrelenmemiş.]" çıkması.
- E2EE çözme sırasında kullanıcı ID'si geç yüklenirse mesajın yanlış cihaz gibi algılanması.
- Şifreleme sırasında yeni oluşturulan public key'in hemen kullanılmaması.

Ek:
- Ayarlar > Uygulama içinde "Bu cihazın E2EE anahtarını yenile" butonu eklendi.
- Bu buton sadece yeni mesajlarda anahtar karıştıysa kullanılmalı.
- Eski şifreli mesajlar eski cihaz anahtarıyla şifreliyse yeni anahtarla açılamaz.

Kurulum:
cd /d "%USERPROFILE%\Downloads"
tar -xf nexus-chat-v16-1-e2ee-device-fix.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\nexus-chat-v16-1-e2ee-device-fix\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "fix e2ee device key message decrypt"
git push
