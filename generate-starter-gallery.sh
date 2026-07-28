#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
node ./tools/generate-gallery-manifest.mjs
