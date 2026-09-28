#!/usr/bin/env bash
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export JAVA_HOME="/home/janelle/.local/share/android-build-tools/jdk17"
export ANDROID_HOME="/home/janelle/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/usr/local/bin:/usr/bin:$PATH"

LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | sed -n 's/.*src \([0-9.]*\).*/\1/p')
if [ -z "$LAN_IP" ]; then
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi

GATEWAY_IP=$(ip route | grep default | awk '{print $3}' | head -n 1)

echo "=== Astra Metro Server (WiFi / USB) ==="
echo "=== Host LAN IP: ${LAN_IP:-unknown} ==="

# Attempt wireless ADB to phone hotspot gateway if reachable
if [ -n "$GATEWAY_IP" ]; then
  echo "=== Connecting to wireless ADB at $GATEWAY_IP:5555 ==="
  adb connect "$GATEWAY_IP:5555" 2>/dev/null || true
fi

# Configure all connected ADB devices (forward port 8081 & set debug_http_host in app prefs)
DEVICES=$(adb devices | awk 'NR>1 && $2=="device" {print $1}')
if [ -n "$DEVICES" ]; then
  for dev in $DEVICES; do
    echo "=== Configuring device $dev ==="
    adb -s "$dev" reverse tcp:8081 tcp:8081 2>/dev/null || true
    if [ -n "$LAN_IP" ]; then
      adb -s "$dev" shell "run-as com.janelle.aicoder sh -c 'echo \"<?xml version=\\\"1.0\\\" encoding=\\\"utf-8\\\" standalone=\\\"yes\\\" ?>\n<map>\n    <string name=\\\"debug_http_host\\\">$LAN_IP:8081</string>\n</map>\" > /data/data/com.janelle.aicoder/shared_prefs/com.janelle.aicoder_preferences.xml'" 2>/dev/null || true
    fi
  done
else
  echo "=== No ADB devices attached. Make sure phone is on the same WiFi/Hotspot ==="
  echo "=== App debug server host should be set to: ${LAN_IP:-<host-ip>}:8081 ==="
fi

# Kill any stale Metro server on port 8081
STALE_PIDS=$(lsof -ti :8081 2>/dev/null || true)
if [ -n "$STALE_PIDS" ]; then
  echo "=== Killing stale process on port 8081 ($STALE_PIDS) ==="
  kill -9 $STALE_PIDS 2>/dev/null || true
  sleep 1
fi

export REACT_NATIVE_PACKAGER_HOSTNAME="$LAN_IP"

echo "=== Starting Metro on LAN ($LAN_IP:8081) ==="
npx expo start --dev-client --lan --clear --port 8081
