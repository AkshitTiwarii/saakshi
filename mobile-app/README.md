# Saakshi Mobile (React Native + Expo Scaffold)

This folder contains the first mobile scaffold with 4 premium onboarding/capture-entry screens:
- Safe Entry
- Emotional Check-In
- Capture Method
- Quick Exit

## Run
1. cd mobile-app
2. npm install
3. npm run android  (or npm run ios)

`npm run android` uses Expo Go (recommended stable path for emulator).
If you need native build output, run:
- `npm run android:native`

Notes:
- Android script runs on port 8084 with cache clear to avoid stale Metro/port conflicts.
- Web onboarding now continues without login.

If Android native build fails with `Unsupported class file major version 69`, ensure Java 17 is used.

This project pins Gradle JDK via `android/gradle.properties`:
- `org.gradle.java.home=C:\\Program Files\\Java\\jdk-17`

Quick emulator path (Expo Go, no native compile):
- `npm run android`

## Notes
- This is a product scaffold, not full feature parity with web yet.
- Connect backend APIs and encrypted local storage in the next sprint.
