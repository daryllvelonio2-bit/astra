#!/usr/bin/env bash

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="/home/janelle/.local/share/android-build-tools"
JDK_DIR="$TOOLS_DIR/jdk17"
SDK_DIR="/home/janelle/Android/sdk"

export JAVA_HOME="$JDK_DIR"
export ANDROID_HOME="$SDK_DIR"
export PATH="$JAVA_HOME/bin:$SDK_DIR/platform-tools:$PATH"

LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | sed -n 's/.*src \([0-9.]*\).*/\1/p')

echo "=== Astra WiFi Debug Mode ==="
echo "=== PC LAN IP: ${LAN_IP:-unknown} ==="
echo "=== Phone + PC must be on same WiFi / Hotspot ==="
echo ""
echo "=== Launching Metro (WiFi/LAN) in Dedicated Terminal ==="
if command -v kitty >/dev/null 2>&1; then
    setsid kitty -d "$PROJECT_DIR" --title "Astra Metro Bundler (WiFi)" "$PROJECT_DIR/metro.sh" >/dev/null 2>&1 &
elif command -v foot >/dev/null 2>&1; then
    setsid foot -H -T "Astra Metro Bundler (WiFi)" "$PROJECT_DIR/metro.sh" >/dev/null 2>&1 &
else
    setsid xterm -hold -e "$PROJECT_DIR/metro.sh" >/dev/null 2>&1 &
fi

sleep 1
echo "=== Dedicated terminal launched for Metro! ==="
