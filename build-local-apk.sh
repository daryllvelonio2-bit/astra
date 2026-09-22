#!/usr/bin/env bash
set -e

PROJECT_DIR="/home/janelle/Documents/projects/ai-coder"
TOOLS_DIR="/home/janelle/.local/share/android-build-tools"
JDK_DIR="$TOOLS_DIR/jdk17"
SDK_DIR="/home/janelle/Android/sdk"

mkdir -p "$TOOLS_DIR" "$SDK_DIR"

# 1. Download & Setup Portable OpenJDK 17
if [ ! -f "$JDK_DIR/bin/javac" ]; then
  echo "=== Downloading Portable OpenJDK 17 ==="
  mkdir -p "$JDK_DIR"
  curl -fSL "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.12%2B7/OpenJDK17U-jdk_x64_linux_hotspot_17.0.12_7.tar.gz" -o "$TOOLS_DIR/jdk17.tar.gz"
  tar -xzf "$TOOLS_DIR/jdk17.tar.gz" -C "$JDK_DIR" --strip-components=1
  rm -f "$TOOLS_DIR/jdk17.tar.gz"
fi

export JAVA_HOME="$JDK_DIR"
export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"
export PATH="$JAVA_HOME/bin:$SDK_DIR/cmdline-tools/latest/bin:$SDK_DIR/platform-tools:$PATH"

echo "=== Java Version ==="
"$JAVA_HOME/bin/java" -version

# 2. Setup Android Commandline Tools & SDK packages
if [ ! -f "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "=== Downloading Android Command-line Tools ==="
  mkdir -p "$SDK_DIR/cmdline-tools"
  curl -fSL "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -o "$TOOLS_DIR/cmdline-tools.zip"
  unzip -q "$TOOLS_DIR/cmdline-tools.zip" -d "$SDK_DIR/cmdline-tools"
  rm -rf "$SDK_DIR/cmdline-tools/latest"
  mv "$SDK_DIR/cmdline-tools/cmdline-tools" "$SDK_DIR/cmdline-tools/latest"
  rm -f "$TOOLS_DIR/cmdline-tools.zip"
fi

echo "=== Accepting Android SDK Licenses ==="
yes | "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null 2>&1 || true

echo "=== Installing Android Build Tools & Platforms (API 34) ==="
"$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" "platforms;android-34" "build-tools;34.0.0" "platform-tools"

echo "=== Pre-provisioning Gradle 8.14.3 ==="
GRADLE_HASH_DIR="/home/janelle/.gradle/wrapper/dists/gradle-8.14.3-bin/cv11ve7ro1n3o1j4so8xd9n66"
mkdir -p "$GRADLE_HASH_DIR"
if [ ! -f "$GRADLE_HASH_DIR/gradle-8.14.3-bin.zip.ok" ]; then
  echo "Downloading Gradle 8.14.3 via curl..."
  curl -fSL "https://services.gradle.org/distributions/gradle-8.14.3-bin.zip" -o "$GRADLE_HASH_DIR/gradle-8.14.3-bin.zip"
  unzip -qo "$GRADLE_HASH_DIR/gradle-8.14.3-bin.zip" -d "$GRADLE_HASH_DIR"
  touch "$GRADLE_HASH_DIR/gradle-8.14.3-bin.zip.ok"
  rm -f "$GRADLE_HASH_DIR/gradle-8.14.3-bin.zip.part"
fi

echo "=== Pre-provisioning Android NDK 27.1 ==="
NDK_TARGET="$SDK_DIR/ndk/27.1.12297006"
if [ ! -f "$NDK_TARGET/source.properties" ]; then
  echo "Downloading Android NDK r27b via high-speed curl with auto-resume..."
  mkdir -p "$SDK_DIR/ndk"
  curl -C - --retry 15 --retry-delay 3 --retry-all-errors -fSL "https://dl.google.com/android/repository/android-ndk-r27b-linux.zip" -o "$TOOLS_DIR/ndk-r27b.zip"
  echo "Extracting Android NDK..."
  unzip -qo "$TOOLS_DIR/ndk-r27b.zip" -d "$SDK_DIR/ndk/"
  rm -rf "$NDK_TARGET"
  mv "$SDK_DIR/ndk/android-ndk-r27b" "$NDK_TARGET"
  rm -f "$TOOLS_DIR/ndk-r27b.zip"
  rm -rf "$SDK_DIR/.temp"
fi

# 3. Build the Standalone APK
echo "=== Building Standalone Release APK ==="
cd "$PROJECT_DIR/android"
chmod +x gradlew
./gradlew assembleRelease --no-daemon --stacktrace

echo "=== Build Complete! ==="
ls -lh app/build/outputs/apk/release/

echo "=== Copying to Downloads Folder ==="
mkdir -p /home/janelle/Downloads
cp app/build/outputs/apk/release/app-release.apk /home/janelle/Downloads/astra-release.apk
cp app/build/outputs/apk/release/app-release.apk /home/janelle/Downloads/astra.apk
cp app/build/outputs/apk/release/app-release.apk /home/janelle/Downloads/app-release.apk
echo "Release APK copied to:"
ls -lh /home/janelle/Downloads/astra-release.apk /home/janelle/Downloads/astra.apk /home/janelle/Downloads/app-release.apk
