# Firebase & Google OAuth configuration

The app now reads all Firebase and Google OAuth credentials from two places:

1. Environment variables that start with `EXPO_PUBLIC_…` (preferred during local development).
2. `extra.firebase` and `extra.googleOAuth` inside `app.config.js` (automatically populated from the environment when the bundle is built).

## Steps to configure locally

1. Copy `.env.example` to `.env` and paste the real values from the Firebase console and Google Cloud console.
2. Keep the `EXPO_PUBLIC_` prefix – Expo inlines those variables during bundling, and `app.config.js` consumes them as well.
3. Restart Expo (`npx expo start -c`) any time you change `.env` so Metro picks up the updated config.
4. Never commit `.env` – it is ignored via `.gitignore`.

## How the values flow

- `app.config.js` loads `.env` via `dotenv` and injects the credentials into `expo.extra.firebase` and `expo.extra.googleOAuth`.
- `src/services/firebase.ts` first looks at `expo.extra.firebase`, then falls back to runtime env vars, and throws a descriptive error if any required field is missing.
- `src/services/authService.ts` reads the Google OAuth client IDs from the same place, so native builds and OTA updates always embed the right IDs.

If you still see connection issues after updating the secrets, double-check that the Firebase project allows the app’s bundle identifier (`com.anonymous.Lifeband_MAA`) and that the Firestore/Storage APIs are enabled in Google Cloud. Restarting the Expo dev client ensures the refreshed config is shipped to the device.
