# SK Science Android app

This project creates an Android app wrapper for the existing SK Science website using Capacitor. Android Studio is not required on your computer; GitHub Actions builds the APK in the cloud.

## App identity
- App name: SK Science
- Android application ID: `com.skscience.learning`
- Website/backend: existing SK Science Vercel site and Supabase project

## Build the APK without Android Studio

1. Create a new GitHub repository named `sk-science-android`.
2. Upload all files and folders from this project to the repository root.
3. Open the repository's **Actions** tab.
4. Select **Build SK Science Android APK**.
5. Click **Run workflow** (or push to the `main` branch).
6. When the workflow succeeds, open the run and download the `SK-Science-debug-APK` artifact.
7. Extract the ZIP and install `app-debug.apk` on an Android device. You may need to allow installation from your browser/files app.

## Notes
- The workflow downloads the latest production HTML from `https://classroom-online-learning.vercel.app/` at build time, then bundles it into the app.
- Supabase authentication, courses and video storage still require an internet connection.
- This first workflow creates a debug APK for testing. A signed release APK and Google Play AAB require a private signing key and GitHub Actions secrets; do not commit the keystore or passwords.
- Test login, navigation, video playback, file uploads and payment flows on real devices before public release. Razorpay setup remains deferred until its credentials and webhook are configured.
- The website is not changed by this Android build.
