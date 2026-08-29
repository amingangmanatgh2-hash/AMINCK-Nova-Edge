# چطور فقط با مرورگر و در چند کلیک فایل APK را بسازید و دانلود کنید

ربات دسترسی ساخت فایل workflow ندارد، ولی **شما** با مرورگر این کار را در ~۲ دقیقه انجام می‌دهید
(نیازی به نصب Android Studio / Gradle نیست — همه‌چیز روی سرور GitHub اجرا می‌شود):

1. روی ریپو به مسیر `.github/workflows/` بروید و فایل جدید بسازید:
   **`Add file → Create new file`**
   نام فایل:
   ```
   .github/workflows/build-apks.yml
   ```
2. کل محتوای فایل `android/CI/android-build-release.yml` (همین‌جا در ریپو) را در آن کپی کنید و
   **`Commit changes`** را بزنید.
3. به تب **Actions** بروید → ورک‌فلو **«Build & Release APKs»** → دکمه **Run workflow** را بزنید
   (یا خودش بعد از کامیت اجرا می‌شود). حدود ۳–۵ دقیقه صبر کنید تا تیک سبز بخورد.
4. بعد از اتمام، دو ریلیز ساخته می‌شوند و APKها مستقیم قابل‌دانلود هستند (صفحه **Releases**):
   - تگ `pixel-sim-latest` → فایل **Pixel10ProMax-Simulator.apk**
   - تگ `novamind-latest` → فایل **NovaMind-LocalAI.apk**

   لینک مستقیم (بعد از ساخته‌شدن):
   - `https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/releases/download/pixel-sim-latest/Pixel10ProMax-Simulator.apk`
   - `https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/releases/download/novamind-latest/NovaMind-LocalAI.apk`

5. فایل APK را روی گوشی Android باز کنید و «Install from unknown sources» را مجاز کنید.

> همان APK در تب Actions → آخرین اجرای ورک‌فلو → بخش **Artifacts → apk-download** هم هست.

## بیلد محلی (اختیاری)
اگر JDK 17 و Android SDK (Platform 34) دارید:
```bash
cd android/pixel-simulator && gradle assembleDebug      # → app/build/outputs/apk/debug/app-debug.apk
cd android/novamind-local-ai && gradle assembleDebug
```
