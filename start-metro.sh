#!/usr/bin/env bash
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -n 1)
if [ -z "$IP" ]; then
  IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "$IP" ]; then
  IP="192.168.43.106"
fi

echo "=========================================================="
echo " Starting Metro Dev Server for Wi-Fi Fast Refresh"
echo " Host IP: $IP:8081"
echo " In the app: Settings -> General -> Dev Menu -> Set host to $IP:8081"
echo "=========================================================="

npx expo start --lan --port 8081
