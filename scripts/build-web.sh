#!/usr/bin/env bash
# Wraps `expo export --platform web` to inject a build-version string
# the client can compare against the server's /build-version.json.
#
# On Cloudflare Pages, CF_PAGES_COMMIT_SHA is set automatically per
# deploy. Locally we fall back to a timestamp so every dev build
# differs.
set -e

VERSION="${CF_PAGES_COMMIT_SHA:-local-$(date +%s)}"
echo "[build] Web build version: $VERSION"

mkdir -p public
printf '{"version":"%s"}\n' "$VERSION" > public/build-version.json

EXPO_PUBLIC_BUILD_VERSION="$VERSION" expo export --platform web
