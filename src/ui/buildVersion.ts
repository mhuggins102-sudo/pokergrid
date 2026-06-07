// Build-version metadata + a tiny check against the server's
// /build-version.json. On Cloudflare Pages the version string is the
// commit SHA injected at build time by scripts/build-web.sh and
// embedded in the JS bundle as process.env.EXPO_PUBLIC_BUILD_VERSION.
// At runtime the StaleVersionBanner fetches /build-version.json
// (uncached) and compares — when they differ, the PWA is serving an
// outdated bundle and needs a reload.

import { Platform } from 'react-native';

// The version this JS bundle was built with. 'dev' = local dev or a
// build that didn't run scripts/build-web.sh; we skip the check then.
export const BUILT_VERSION: string =
  process.env.EXPO_PUBLIC_BUILD_VERSION ?? 'dev';

// Fetches the server's current version with cache-busting headers.
// Returns null on any failure so the caller can quietly skip the
// check rather than show false-positive "outdated" banners.
export const fetchServerVersion = async (): Promise<string | null> => {
  if (Platform.OS !== 'web') return null;
  try {
    const res = await fetch('/build-version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
};
