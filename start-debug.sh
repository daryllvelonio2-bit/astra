#!/usr/bin/env bash

PROJECT_DIR="/home/janelle/Documents/projects/ai-coder"
TOOLS_DIR="/home/janelle/.local/share/android-build-tools"
JDK_DIR="$TOOLS_DIR/jdk17"
SDK_DIR="/home/janelle/Android/sdk"

export JAVA_HOME="$JDK_DIR"
export ANDROID_HOME="$SDK_DIR"
export PATH="$JAVA_HOME/bin:$SDK_DIR/platform-tools:$PATH"

echo "=== Forwarding ADB port 8081 ==="
adb reverse tcp:8081 tcp:8081 || true

echo "=== Launching Metro Development Server in Foot Terminal ==="
if command -v foot >/dev/null 2>&1; then
    setsid foot -H -T "Astra Metro Bundler" "$PROJECT_DIR/metro.sh" >/dev/null 2>&1 &
elif command -v kitty >/dev/null 2>&1; then
    setsid kitty -d "$PROJECT_DIR" --title "Astra Metro Bundler" "$PROJECT_DIR/metro.sh" >/dev/null 2>&1 &
else
    setsid xterm -hold -e "$PROJECT_DIR/metro.sh" >/dev/null 2>&1 &
fi

sleep 2

echo "=== Opening Astra App on Device ==="
adb shell am start -n com.janelle.aicoder/.MainActivity || true

echo "=== Debug Server Started! ==="
