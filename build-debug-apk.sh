#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="/home/janelle/.local/share/android-build-tools"
JDK_DIR="$TOOLS_DIR/jdk17"
SDK_DIR="/home/janelle/Android/sdk"

export JAVA_HOME="$JDK_DIR"
export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"
export PATH="$JAVA_HOME/bin:$SDK_DIR/cmdline-tools/latest/bin:$SDK_DIR/platform-tools:$PATH"

echo "=== Building Debug APK (ARM64) ==="
cd "$PROJECT_DIR/android"
chmod +x gradlew
./gradlew assembleDebug --parallel

echo "=== Build Complete! ==="
ls -lh app/build/outputs/apk/debug/app-debug.apk

echo "=== Copying to Downloads Folder ==="
rm -f /home/janelle/Downloads/astra-debug.apk /home/janelle/Downloads/astra-debug-universal.apk
cp app/build/outputs/apk/debug/app-debug.apk /home/janelle/Downloads/app-debug.apk
echo "Debug APK copied to:"
ls -lh /home/janelle/Downloads/app-debug.apk

# Connect to phone wireless ADB if phone is the WiFi gateway
GATEWAY_IP=$(ip route | grep default | awk '{print $3}' | head -n 1)
if [ -n "$GATEWAY_IP" ]; then
  adb connect "$GATEWAY_IP:5555" >/dev/null 2>&1 || true
fi

TARGET_DEVICE=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
if [ -n "$TARGET_DEVICE" ]; then
  echo "=== Installing Debug APK to connected device ($TARGET_DEVICE) ==="
  adb -s "$TARGET_DEVICE" reverse tcp:8081 tcp:8081 || true
  adb -s "$TARGET_DEVICE" install -r app/build/outputs/apk/debug/app-debug.apk || true
  echo "=== Launching Debug App ==="
  adb -s "$TARGET_DEVICE" shell am start -n com.janelle.aicoder/.MainActivity || true
else
  echo "=== No ADB device connected, APK ready in Downloads ==="
fi

echo "=== Done! ==="

