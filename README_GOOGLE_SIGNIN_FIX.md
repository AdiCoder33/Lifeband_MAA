# ✅ Google Sign-In Production Fix - QUICK START

## The Problem
Google Sign-In works in development but **NOT in production builds** because Firebase doesn't have the production SHA-1 fingerprint.

---

## The Solution (5 Minutes)

### Your SHA Fingerprints:
```
SHA-1:   5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
SHA-256: FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

---

## Steps:

### 1️⃣ Add to Firebase (2 minutes)
1. Open: https://console.firebase.google.com/
2. Select your project → ⚙️ Settings → Project Settings
3. Find your Android app under "Your apps"
4. Click **"Add fingerprint"** → Paste SHA-1 → Save
5. Click **"Add fingerprint"** → Paste SHA-256 → Save

### 2️⃣ Download Updated Config (1 minute)
1. In same page, click **"Download google-services.json"**
2. Replace file: `android/app/google-services.json`

### 3️⃣ Verify Web Client ID (1 minute)
1. Firebase Console → Authentication → Sign-in method → Google
2. Copy the **Web client ID**
3. Add to your `.env` file:
   ```env
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
   ```

### 4️⃣ Rebuild (1 minute)
```powershell
# Clean build
cd android
.\gradlew clean
cd ..

# Rebuild
npx expo run:android --variant release
# OR
eas build --platform android
```

---

## Alternative: Run Automated Script

```powershell
.\fix-google-signin.ps1
```

This script will guide you through all the steps interactively.

---

## ✅ Done!

Google Sign-In will now work in production builds!

---

## Need More Help?

- Full guide: `PRODUCTION_GOOGLE_SIGNIN_FIX.md`
- Your fingerprints: `FIREBASE_FINGERPRINTS.md`
- Original setup: `GOOGLE_SIGNIN_SETUP.md`
