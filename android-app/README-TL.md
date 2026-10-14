# Ronald E-Loading Android App (source project)

Ito ang Android Studio source project ng WebView app na nagbubukas sa existing retailer portal.

## Pagbuo ng APK
1. Buksan ang `android-app` folder sa Android Studio (recent version).
2. Hintaying matapos ang Gradle sync.
3. Piliin ang **Build > Build APK(s)**.
4. Ang debug APK ay karaniwang nasa `app/build/outputs/apk/debug/app-debug.apk`.
5. Para maging live ang DOWNLOAD APP button, i-upload ang built APK sa website repository sa path na `downloads/ronald-e-loading.apk`, pagkatapos ay i-deploy ang website.

Ang ZIP na ito ay may Android source project; hindi pa kasama ang compiled APK. Push notifications are not implemented in this basic WebView app.
