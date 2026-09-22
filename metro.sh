#!/usr/bin/env bash
cd /home/janelle/Documents/projects/ai-coder
export JAVA_HOME="/home/janelle/.local/share/android-build-tools/jdk17"
export ANDROID_HOME="/home/janelle/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/usr/local/bin:/usr/bin:$PATH"

echo "=== Forwarding ADB port 8081 ==="
adb reverse tcp:8081 tcp:8081 || true

echo "=== Starting Astra Metro Dev Server ==="
npx expo start --dev-client --clear
