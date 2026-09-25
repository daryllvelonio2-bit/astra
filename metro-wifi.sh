#!/usr/bin/env bash
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export JAVA_HOME="/home/janelle/.local/share/android-build-tools/jdk17"
export ANDROID_HOME="/home/janelle/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/usr/local/bin:/usr/bin:$PATH"

LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | sed -n 's/.*src \([0-9.]*\).*/\1/p')
echo "=== Starting Astra Metro Dev Server (WiFi/LAN mode) ==="
echo "=== LAN IP: ${LAN_IP:-unknown} :8081 ==="
echo "=== On phone set Debug server host to $LAN_IP:8081 ==="
cd "$PROJECT_DIR"
npx expo start --dev-client --lan --port 8081 2>&1 | tee /tmp/astra-metro-wifi.log
