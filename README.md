# Nexus Chat V16 E2EE Messages + Files

Bu sürüm:
- DM mesajlarını tarayıcıda RSA-OAEP + AES-GCM ile şifreler.
- Grup mesajlarını tarayıcıda RSA-OAEP + AES-GCM ile şifreler.
- Kanal mesajlarını da şifreli göndermeye çalışır.
- Fotoğraf / gif / video / ses dosyaları önce dataURL olur, sonra mesajla birlikte şifrelenir.
- Server ve database içerikte sadece ::e2ee:: şifreli zarf görür.
- Kullanıcı public key serverda tutulur, private key cihazda localStorage içinde kalır.
- Site açılırken 2 saniye "YENİ SÜRÜMDE HERŞEY ARTIK ŞİFRELİ" animasyonu geçer.

Önemli:
- Bir kullanıcı yeni V16 ile en az 1 kez giriş yapmadan public key oluşmaz.
- Bir kullanıcıya/gruba şifreli mesaj göndermek için herkesin bir kez yeni sürüme girmesi gerekir.
- Private key cihazda durduğu için farklı cihazda eski şifreli mesajlar açılamayabilir. Bu V17/V18'de key backup ile geliştirilebilir.

Kurulum:
cd /d "%USERPROFILE%\Downloads"
tar -xf nexus-chat-v16-e2ee-messages-files.zip -C "%USERPROFILE%\Desktop"
xcopy /E /Y /I "%USERPROFILE%\Desktop\nexus-chat-v16-e2ee-messages-files\*" "%USERPROFILE%\Desktop\nexus-chat-real-auth-render\"
cd /d "%USERPROFILE%\Desktop\nexus-chat-real-auth-render"
git add .
git commit -m "add e2ee messages files and encryption splash"
git push
