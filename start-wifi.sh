#!/usr/bin/env bash

PROJECT_DIR="/home/janelle/Downloads/ai-coder-extracted"
TOOLS_DIR="/home/janelle/.local/share/android-build-tools"
JDK_DIR="$TOOLS_DIR/jdk17"
SDK_DIR="/home/janelle/Android/sdk"

export JAVA_HOME="$JDK_DIR"
export ANDROID_HOME="$SDK_DIR"
export PATH="$JAVA_HOME/bin:$SDK_DIR/platform-tools:$PATH"

LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | sed -n 's/.*src \([0-9.]*\).*/\1/p')

echo "=== Astra WiFi Debug Mode ==="
echo "=== PC LAN IP: ${LAN_IP:-unknown} ==="
echo "=== Phone + PC must be on same WiFi ==="
echo ""
echo "=== Launching Metro (WiFi/LAN) in Dedicated Terminal ==="
if command -v foot >/dev/null 2>&1; then
    setsid foot -H -T "Astra Metro Bundler (WiFi)" "$PROJECT_DIR/metro-wifi.sh" >/dev/null 2>&1 &
elif command -v kitty >/dev/null 2>&1; then
    setsid kitty -d "$PROJECT_DIR" --title "Astra Metro Bundler (WiFi)" "$PROJECT_DIR/metro-wifi.sh" >/dev/null 2>&1 &
else
    setsid xterm -hold -e "$PROJECT_DIR/metro-wifi.sh" >/dev/null 2>&1 &
fi

sleep 1

echo ""
echo "=== On phone (Expo dev-client app com.janelle.aicoder): ==="
echo "  1. Open Dev Menu (shake device)"
echo "  2. Set Debug server host & port to: $LAN_IP:8081"
echo "  3. Reload"
echo ""
echo "=== Optional: ADB over WiFi (no cable for install/logs): ==="
echo "  Phone: Developer Options > Wireless debugging > ON > Pair with pairing code"
echo "  Then: adb pair PHONE_IP:PAIR_PORT"
echo "        adb connect PHONE_IP:CONNECT_PORT"
echo "        adb install -r $PROJECT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "=== NOTE: adb reverse does NOT work over WiFi — use $LAN_IP:8081 above ==="
echo "=== Debug Server Starting! ==="
