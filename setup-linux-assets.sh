#!/usr/bin/env bash
# Fetches Debian bookworm-slim rootfs tarballs (aarch64 + x86_64) from the
# official Docker Hub `library/debian` image into the APK assets dir:
#   android/app/src/main/assets/linux/<arch>/debian-rootfs.tar.gz
# Static proot binaries are already vendored next to them (arch/proot) and
# work for any guest, so this script only refreshes the rootfs.
#
# Usage: ./setup-linux-assets.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/android/app/src/main/assets/linux"
IMAGE="bookworm-slim"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }
need curl
need python3

mkdir -p "$ASSETS_DIR/aarch64" "$ASSETS_DIR/x86_64"

TOKEN=$(curl -fsSL --max-time 30 \
  "https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/debian:pull" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")

# Resolve the multi-arch manifest to per-arch digests.
curl -fsSL --max-time 60 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
  "https://registry-1.docker.io/v2/library/debian/manifests/$IMAGE" \
  -o /tmp/debian-manifest.json

arch_digest() { # $1 = docker arch (arm64/amd64)
  python3 -c "
import json
d = json.load(open('/tmp/debian-manifest.json'))
for m in d.get('manifests', []):
    p = m.get('platform', {})
    if p.get('architecture') == '$1' and p.get('os') == 'linux':
        print(m['digest'])
        break
"
}

layer_digest() { # $1 = arch manifest digest
  curl -fsSL --max-time 60 \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json" \
    "https://registry-1.docker.io/v2/library/debian/manifests/$1" \
    | python3 -c "
import json,sys
d = json.load(sys.stdin)
layers = d.get('layers', [])
assert len(layers) == 1, 'bookworm-slim must be a single layer, got %d' % len(layers)
print(layers[0]['digest'].split(':', 1)[1])
"
}

fetch_arch() { # $1 = docker arch, $2 = asset dir name
  local manifest layer out
  manifest="$(arch_digest "$1")"
  [ -n "$manifest" ] || { echo "no manifest for $1" >&2; exit 1; }
  layer="$(layer_digest "$manifest")"
  out="$ASSETS_DIR/$2/debian-rootfs.tar.gz"
  echo "=== $1 -> $out (layer sha256:$layer) ==="
  curl -fSL --max-time 600 \
    -H "Authorization: Bearer $TOKEN" \
    "https://registry-1.docker.io/v2/library/debian/blobs/sha256:$layer" \
    -o "$out.tmp"
  echo "$layer  $out.tmp" | sha256sum -c -
  mv "$out.tmp" "$out"
  # Sanity: the readiness gate needs these paths inside the tar.
  for need_path in "usr/bin/apt-get" "etc/debian_version" "usr/bin/bash"; do
    tar -tzf "$out" | grep -qE "^(\./)?$need_path$" \
      || { echo "rootfs $1 missing $need_path" >&2; exit 1; }
  done
  echo "OK $out ($(du -h "$out" | cut -f1))"
}

fetch_arch "arm64" "aarch64"
fetch_arch "amd64" "x86_64"

echo "=== Assets ready ==="
ls -la "$ASSETS_DIR/aarch64" "$ASSETS_DIR/x86_64"
