# Google Sign-In Setup Guide

## ✅ Implementation Complete

Google Sign-In/Sign-Up has been successfully implemented with the following features:

### Features Implemented:
1. **Sign In with Google** - Existing users can sign in with their Google account
2. **Sign Up with Google** - New users can create an account using Google
3. **Role Selection** - During sign-up, users select their role (Doctor or Patient)
4. **Account Detection** - The app automatically detects if a Google account already exists
5. **Seamless Authentication** - No need to enter email/password when using Google

### How It Works:

#### Sign In Flow:
1. User clicks "Continue with Google" on the Sign In screen
2. Google authentication popup appears
3. If user has an existing account, they're automatically signed in
4. If user is new, they're redirected to Role Selection screen

#### Sign Up Flow:
1. User selects their role (Pregnant Mother or Doctor) on Sign Up screen
2. User clicks "Continue with Google"
3. Google authentication popup appears
4. New account is created with the selected role
5. User proceeds to onboarding

---

## 🔧 Firebase Configuration Required

To enable Google Sign-In, you need to configure Firebase and add the SHA-1 fingerprint.

### Step 1: Get Your SHA-1 Fingerprint

#### For Development (Debug):
Run this command in your project terminal:

```powershell
cd android ; .\gradlew signingReport ; cd ..
```

Look for the **SHA1** fingerprint under `Variant: debug` → `Config: debug`

Example output:
```
Variant: debug
Config: debug
Store: C:\Users\<your-user>\.android\debug.keystore
Alias: androiddebugkey
MD5: XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX
SHA1: XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX  ← Copy this
SHA-256: ...
```

Copy the **SHA1** value.

---

### Step 2: Add SHA-1 to Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the ⚙️ (Settings) icon → **Project Settings**
4. Scroll down to **Your apps** section
5. Find your Android app (or add one if it doesn't exist)
6. Click **Add fingerprint** button
7. Paste your **SHA-1** fingerprint
8. Click **Save**

---

### Step 3: Enable Google Sign-In in Firebase

1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Click on **Google** provider
3. Toggle **Enable**
4. Set a **Project public-facing name** (e.g., "Lifeband MAA")
5. Set a **Support email** (your email)
6. Click **Save**

---

### Step 4: Download Updated google-services.json

After adding the SHA-1 fingerprint:

1. Go back to **Project Settings** → **Your apps**
2. Find your Android app
3. Click **Download google-services.json**
4. Replace the existing file in: `android/app/google-services.json`

---

### Step 5: Configure OAuth Client IDs

You need to add the OAuth Client IDs to your `.env` file or `app.config.js`.

#### Get OAuth Client IDs:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Go to **APIs & Services** → **Credentials**
4. You should see OAuth 2.0 Client IDs created by Firebase:
   - **Web client** (auto-created by Firebase)
   - **Android client** (auto-created by Firebase)

#### Add to .env file:

Create or update your `.env` file with:

```env
# Google OAuth Client IDs
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

**Note:** 
- The `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is the most important one
- Use the **Web client ID** from Firebase (NOT the Android one)
- For Expo, use the same Web client ID for `EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID`

---

### Step 6: Rebuild Your App

After making these changes, rebuild your app:

```powershell
# Stop the current Expo server (Ctrl+C)

# Clear cache and restart
npx expo start --clear
```

For Android development build:
```powershell
npx expo run:android
```

---

## 🧪 Testing Google Sign-In

### Test Sign Up:
1. Open the app
2. Navigate to Sign Up screen
3. Select role (Doctor or Pregnant Mother)
4. Click "Continue with Google"
5. Choose your Google account
6. Verify account is created and you're signed in

### Test Sign In:
1. Sign out from the app
2. Navigate to Sign In screen
3. Click "Continue with Google"
4. Choose your Google account
5. Verify you're automatically signed in

---

## 🔍 Troubleshooting

### Error: "Google sign-in failed"
**Solution:** 
- Verify SHA-1 fingerprint is added to Firebase
- Make sure Google Sign-In is enabled in Firebase Authentication
- Check that `google-services.json` is up to date

### Error: "Missing Google ID token"
**Solution:**
- Verify OAuth Client IDs in `.env` file
- Make sure you're using the **Web client ID**, not Android client ID
- Restart Expo server after changing `.env`

### Error: "Network request failed"
**Solution:**
- Check internet connection
- Verify Firebase project is active
- Check Firebase Authentication quota limits

### Account Shows "This Google account already exists"
**Expected behavior:** The app detects existing accounts and signs you in automatically instead of creating a duplicate.

### ❌ Google Sign-In NOT Working in Production/Release Build
**This is a common issue!** Your production build uses a different fingerprint.

**Quick Fix:**
1. Get your production SHA-1 fingerprint:
   ```powershell
   keytool -list -v -keystore android\app\debug.keystore -alias androiddebugkey -storepass android -keypass android
   ```
   
2. **Your fingerprints are:**
   - **SHA-1:** `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
   - **SHA-256:** `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`

3. Add BOTH fingerprints to Firebase Console (Settings → Project Settings → Your apps → Add fingerprint)
4. Download updated `google-services.json` and replace `android/app/google-services.json`
5. Rebuild your app

**Or run the automated fix script:**
```powershell
.\fix-google-signin.ps1
```

**See:** `FIREBASE_FINGERPRINTS.md` and `PRODUCTION_GOOGLE_SIGNIN_FIX.md` for detailed instructions.

---

## 📱 Platform-Specific Notes

### Android:
- SHA-1 fingerprint is **required**
- Different fingerprints for debug and release builds
- **IMPORTANT:** Your release build currently uses the debug keystore, so you need the debug keystore's SHA-1 in Firebase
- For true production, create a separate release keystore (see `PRODUCTION_GOOGLE_SIGNIN_FIX.md`)

### iOS:
- Requires iOS Client ID from Firebase
- Configure URL schemes in `app.json`
- May need additional setup for production

### Web:
- Uses Web Client ID
- Requires authorized JavaScript origins in Google Cloud Console

---

## 🎉 You're All Set!

Once configured, your users can:
- ✅ Sign up with Google (choosing Doctor or Patient role)
- ✅ Sign in with Google (automatic role detection)
- ✅ Seamlessly authenticate without passwords
- ✅ Have their accounts properly managed in Firebase

The implementation automatically handles:
- New vs. existing user detection
- Role-based navigation
- Profile creation
- Error handling
