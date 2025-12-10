# 🔧 Production Google Sign-In Fix Guide

## Problem
Google Sign-In doesn't work in production builds because the production APK/AAB is signed with the debug keystore, but Firebase Console only has the debug SHA-1 fingerprint registered.

## Solution: Add Production SHA-1 Fingerprint to Firebase

### Step 1: Get Your SHA-1 Fingerprint

Since your production build is currently using the **debug keystore**, you need to get the SHA-1 from that keystore:

**Run this command:**
```powershell
keytool -list -v -keystore android\app\debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**Look for these values:**
- **SHA1**: `XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX`
- **SHA256**: `XX:XX:XX:...`

**Copy both the SHA-1 and SHA-256 fingerprints.**

---

### Step 2: Add Fingerprints to Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **Lifeband_MAA**
3. Click ⚙️ **Settings** → **Project Settings**
4. Scroll to **Your apps** section
5. Find your Android app (`com.anonymous.Lifeband_MAA`)
6. Click **"Add fingerprint"** button
7. Paste your **SHA-1** fingerprint
8. Click **Save**
9. Click **"Add fingerprint"** again
10. Paste your **SHA-256** fingerprint
11. Click **Save**

---

### Step 3: Download Updated google-services.json

1. In Firebase Console, stay in **Project Settings** → **Your apps**
2. Find your Android app
3. Click **"Download google-services.json"**
4. Replace the file in: `android/app/google-services.json`

---

### Step 4: Verify OAuth Client IDs

Make sure your `.env` file has the correct **Web Client ID** from Firebase:

1. Go to Firebase Console → **Authentication** → **Sign-in method**
2. Click on **Google** provider
3. Expand the **"Web SDK configuration"** section
4. Copy the **Web client ID**
5. In your `.env` file, set:
```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

---

### Step 5: Rebuild Your App

After updating Firebase:

```powershell
# Clean the build
cd android
.\gradlew clean
cd ..

# For local testing
npx expo run:android --variant release

# For production build (EAS)
eas build --platform android --profile production
```

---

## 🔒 Optional: Create Production Keystore (Recommended for Production)

**For production apps, you should create a proper release keystore instead of using the debug keystore.**

### 1. Generate a Production Keystore

```powershell
keytool -genkeypair -v -storetype PKCS12 -keystore android/app/release.keystore -alias lifebandmaa-key -keyalg RSA -keysize 2048 -validity 10000
```

**You'll be prompted to enter:**
- Keystore password (choose a strong password)
- Key password (choose a strong password)
- Your name, organization, etc.

**⚠️ IMPORTANT: Save these passwords securely! You'll need them for every production build.**

### 2. Get Production SHA-1 Fingerprint

```powershell
keytool -list -v -keystore android/app/release.keystore -alias lifebandmaa-key
```

### 3. Add Production SHA-1 to Firebase

Follow **Step 2** above, but use the SHA-1 from your production keystore.

### 4. Configure Gradle to Use Production Keystore

Edit `android/gradle.properties` and add:

```properties
LIFEBANDMAA_RELEASE_STORE_FILE=release.keystore
LIFEBANDMAA_RELEASE_KEY_ALIAS=lifebandmaa-key
LIFEBANDMAA_RELEASE_STORE_PASSWORD=your_keystore_password
LIFEBANDMAA_RELEASE_KEY_PASSWORD=your_key_password
```

Then update `android/app/build.gradle` to use it (see below).

---

## 📝 Quick Fix Summary

**If you just want Google Sign-In to work NOW:**
1. Run: `keytool -list -v -keystore android\app\debug.keystore -alias androiddebugkey -storepass android -keypass android`
2. Copy the SHA-1 and SHA-256
3. Add them to Firebase Console (Settings → Your apps → Add fingerprint)
4. Download updated `google-services.json`
5. Replace `android/app/google-services.json`
6. Rebuild your app

**That's it! Google Sign-In should now work in production.**

---

## 🐛 Troubleshooting

### Error: "Developer Error" or "Sign-in Failed"
- Make sure SHA-1 fingerprint is added to Firebase
- Verify `google-services.json` is updated
- Check that Google Sign-In is enabled in Firebase Authentication

### Error: "Missing webClientId"
- Verify `.env` has `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- Make sure the Web Client ID is from Firebase Console → Authentication → Google provider

### Still not working?
- Clear app data and cache
- Uninstall and reinstall the app
- Check Firebase Console → Authentication → Users to see if sign-in attempts are being logged
