# Depth of Field Lab for Android

The Android app is a native Kotlin Activity that displays the existing web app in a WebView. The bundled HTML, CSS, JavaScript, and images live in `app/src/main/assets`, so the calculator itself works offline. Google Fonts still need an internet connection to load.

## Orientation

The app is locked to landscape (manifest `android:screenOrientation="landscape"`, also set at runtime) — it does not rotate into portrait and does not follow the device's auto-rotate setting. The in-scene "Close" button (top-right, level with the lens/sensor/subject pickers) closes the Activity; it's wired through a small `window.AndroidApp` JS bridge (`MainActivity.AppBridge`, exposed via `addJavascriptInterface`) that only exists inside this app, so the same `index.html` shown on the web never renders that button.

## Build

Open this directory in Android Studio and build the `app` configuration, or run `gradle assembleDebug` with Android SDK Platform 35 installed.
