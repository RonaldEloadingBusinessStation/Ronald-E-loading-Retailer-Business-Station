# Ronald E-Loading Android App (source project)

Ito ang Android Studio source project ng WebView app na nagbubukas sa existing retailer portal.

## Pagbuo ng APK
1. Buksan ang `android-app` folder sa Android Studio (recent version).
2. Hintaying matapos ang Gradle sync.
3. Piliin ang **Build > Build APK(s)**.
4. Ang debug APK ay karaniwang nasa `app/build/outputs/apk/debug/app-debug.apk`.
5. Para maging live ang DOWNLOAD APP button, i-upload ang built APK sa website repository sa path na `downloads/ronald-e-loading.apk`, pagkatapos ay i-deploy ang website.

Ang ZIP na ito ay may Android source project; hindi pa kasama ang compiled APK. Push notifications are not implemented in this basic WebView app.

## Custom app logo
Ginagamit ng Android source project ang `eloading.jpg` bilang launcher icon sa `app/src/main/res/mipmap-*`. Kapag binago ang `eloading.jpg` sa root, gumawa muli ng mga mipmap icon at i-build ulit ang APK. Ang kasalukuyang APK files sa ZIP ay hindi awtomatikong nagbabago kapag source files lang ang pinalitan.


PAALALA SA ICON: Na-update ang ic_launcher.png files gamit ang eloading.jpg. Kailangang i-build ulit ang APK sa Android Studio/Gradle bago makita ang icon sa naka-install na app. Ang APK files na nasa ZIP ay hindi pa rebuilt.
