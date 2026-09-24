# AfiyetSesli — Mobile app (bare React Native)

Bare **React Native CLI 0.81.4** app (migrated off Expo, same stack as `polimetreApp`).
Same product as the old `customer/` Expo app: role-based login (restaurant / admin),
talks directly to Supabase.

## Stack
- React Native 0.81.4 (CLI, no Expo)
- `@supabase/supabase-js` — direct to Supabase (auth + RLS-scoped reads)
- `@react-native-async-storage/async-storage` — session persistence
- `react-native-vector-icons` (Feather) — icons (was `@expo/vector-icons`)
- `react-native-safe-area-context`, `react-native-url-polyfill`
- Custom role-based tab navigation in `App.js` (no react-navigation needed)

## Prerequisites
- Node ≥ 20
- Android Studio + JDK 17 + an emulator or a device (USB debugging on)

## Run (Android)
```bash
cd END-TO-END-SIS/mobile
npm install
# Terminal 1 — Metro bundler
npm start
# Terminal 2 — build & install on emulator/device
npm run android
```

## Build a release APK (installable, no store)
```bash
cd android
./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

## Login (test accounts)
- Restaurant: `lezzet@afiyet.com` / `Afiyet2026!`
- Admin: `admin@afiyet.com` / `Afiyet2026!`

## Config
Supabase URL + anon key live in `src/config.js` (the anon key is public by design —
Row-Level Security enforces access). No `.env` / Expo env inlining.

## Notes vs the old Expo app
- Icons: `@expo/vector-icons` → `react-native-vector-icons/Feather`
  (fonts bundled via `apply from: .../react-native-vector-icons/fonts.gradle` in
  `android/app/build.gradle`).
- Entry: `index.js` registers `App` and imports `react-native-url-polyfill/auto`.
- `metro.config.js` shims the Node `ws` package to RN's global WebSocket (Supabase realtime).
- The voice/mic demo pieces (expo-audio/expo-file-system) were dropped — phone calls
  run through LiveKit + the `agent/`, not in-app audio.
