# 🔑 Your SHA Fingerprints for Firebase

## ⚠️ IMPORTANT: Add These to Firebase Console NOW

### SHA-1 Fingerprint:
```
5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
```

### SHA-256 Fingerprint:
```
FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

---

## 📋 Steps to Fix Google Sign-In (5 minutes):

### 1. Add Fingerprints to Firebase

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click ⚙️ **Settings** → **Project Settings**
4. Scroll to **Your apps** → Find your Android app
5. Click **"Add fingerprint"**
6. Paste the **SHA-1** above
7. Click **Save**
8. Click **"Add fingerprint"** again
9. Paste the **SHA-256** above
10. Click **Save**

### 2. Download Updated google-services.json

1. Stay in **Project Settings** → **Your apps**
2. Click **"Download google-services.json"**
3. Replace the file in: `android/app/google-services.json`

### 3. Verify Web Client ID

1. In Firebase Console → **Authentication** → **Sign-in method**
2. Click on **Google** provider
3. Copy the **Web client ID** (ends with `.apps.googleusercontent.com`)
4. In your `.env` file, verify this line:
   ```
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<paste-your-web-client-id-here>
   ```

### 4. Rebuild Your App

```powershell
# Clean build
cd android
.\gradlew clean
cd ..

# Test locally
npx expo run:android --variant release

# OR build for production
eas build --platform android
```

---

## ✅ That's It!

Google Sign-In should now work in production builds!

If it still doesn't work:
- Make sure Google Sign-In is **enabled** in Firebase Authentication
- Clear app data and reinstall
- Check that `google-services.json` was replaced correctly
