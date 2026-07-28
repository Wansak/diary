#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

echo "Pink Promise - Finalize Video Migration"
echo "This does not delete local video files."
node ./tools/generate-gallery-manifest.mjs
mkdir -p assets/gallery/videos/vlogs assets/gallery/videos/normal-videos
touch assets/gallery/videos/vlogs/.gitkeep assets/gallery/videos/normal-videos/.gitkeep
if [ ! -d .git ]; then
  echo "No .git folder found. Run this from the repository root." >&2
  exit 1
fi
git rm -r --cached --ignore-unmatch assets/gallery/videos >/dev/null 2>&1 || true
git add .gitignore starter-gallery.js tools/generate-gallery-manifest.mjs tools/generate-gallery-manifest.ps1 \
  assets/gallery/videos/vlogs/.gitkeep assets/gallery/videos/normal-videos/.gitkeep
git status --short
