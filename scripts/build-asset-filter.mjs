// What of assets/ the web (Cloudflare Pages) and native (Capacitor) builds
// copy. Both used to copy the whole folder, masters included: 34 MB of
// assets/source in every APK and on the site (audit 27/11/2026).
//
// These stay in the repository, unshipped:
// - assets/source/: the approved masters; the app loads only their derivatives.
// - APPROVED assets the app no longer shows (AGENTS.md: approved files are
//   never deleted): the companions (retired, progression.js), the Settings
//   gear (redesign D6) and the Stories icon (Stories retired).
// - the star catalogue of Il vostro cielo, no longer loaded (sky.js stays in
//   the repository, unloaded; docs/missions/premi-oggi.md).
export const UNSHIPPED_ASSETS = Object.freeze([
  'assets/source/',
  'assets/derived/pet/',
  'assets/derived/runtime/us-icon-settings-128-v1.png',
  'assets/derived/runtime/us-icon-stories-128-v1.png',
  'assets/data/stars-bsc5-v1.json'
]);

// `relative` is a path under the repository root, with / or \ separators.
export function shipsAsset(relative) {
  const file = String(relative).split('\\').join('/').replace(/^\.\//, '');
  return !UNSHIPPED_ASSETS.some((entry) => (entry.endsWith('/')
    ? file === entry.slice(0, -1) || file.startsWith(entry)
    : file === entry));
}

// A filter for fs.cp over ROOT/assets.
export function assetCopyFilter(root) {
  const base = root.split('\\').join('/').replace(/\/+$/, '');
  return (source) => {
    const file = source.split('\\').join('/');
    if (!file.startsWith(`${base}/`)) return true;
    return shipsAsset(file.slice(base.length + 1));
  };
}
