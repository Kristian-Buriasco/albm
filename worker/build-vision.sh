#!/usr/bin/env bash
# Compiles the Apple Vision bib OCR helper to worker/bin/vision-bibs (macOS + Xcode command line tools only).
set -euo pipefail
if [ "$(uname)" != "Darwin" ]; then
  echo "build-vision.sh: the Apple Vision helper only builds on macOS" >&2
  exit 1
fi
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$here/bin"
swiftc -O "$here/engines/vision-bibs.swift" -o "$here/bin/vision-bibs"
echo "built $here/bin/vision-bibs"
