#!/usr/bin/env python3
"""Deterministic iOS brand derivatives from APPROVED US brand assets.

Same operations the Android generator uses (scripts/build-android-brand-assets.ps1):
- AppIcon 1024x1024: FIT_CENTER_DARK_08040E of assets/source/brand/us-symbol-master-v1.png,
  flattened to opaque RGB (App Store rejects icons with alpha).
- Launch symbol: BYTE_COPY of the approved Android splash symbol derivative.

Nothing is redrawn, recoloured or cropped. Requires Pillow. Writes
ios/brand-assets-manifest.json with source and output hashes; the test suite
verifies the committed files against that manifest.
"""
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSET_MANIFEST = json.loads((ROOT / 'assets' / 'ASSET_MANIFEST.json').read_text(encoding='utf-8'))
ANDROID_MANIFEST = json.loads((ROOT / 'android' / 'brand-assets-manifest.json').read_text(encoding='utf-8-sig'))

SYMBOL = 'assets/source/brand/us-symbol-master-v1.png'
ANDROID_SPLASH = 'android/app/src/main/res/drawable-nodpi/us_splash_symbol.png'
ICON_OUT = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png'
SPLASH_OUT = 'ios/App/App/Assets.xcassets/Splash.imageset/us-launch-symbol@3x.png'
BACKGROUND = (8, 4, 14)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def assert_approved(relative):
    entry = next((a for a in ASSET_MANIFEST['assets'] if a['path'] == relative), None)
    if not entry or entry.get('status') != 'APPROVED' or entry.get('immutable') is not True:
        raise SystemExit(f'Approved source missing from manifest: {relative}')
    if sha256(ROOT / relative) != entry['sha256']:
        raise SystemExit(f'Approved source hash mismatch: {relative}')


def assert_android_derivative(relative):
    entry = next((d for d in ANDROID_MANIFEST['derivatives'] if d['path'] == relative), None)
    if not entry or sha256(ROOT / relative) != entry['sha256']:
        raise SystemExit(f'Android derivative missing or changed: {relative}')


def build_icon():
    size = 1024
    with Image.open(ROOT / SYMBOL) as source:
        symbol = source.convert('RGBA')
    scale = min(size / symbol.width, size / symbol.height)
    width, height = round(symbol.width * scale), round(symbol.height * scale)
    resized = symbol.resize((width, height), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), BACKGROUND + (255,))
    canvas.alpha_composite(resized, ((size - width) // 2, (size - height) // 2))
    target = ROOT / ICON_OUT
    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert('RGB').save(target, format='PNG', optimize=True)


def main():
    assert_approved(SYMBOL)
    assert_android_derivative(ANDROID_SPLASH)
    build_icon()
    (ROOT / SPLASH_OUT).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / ANDROID_SPLASH, ROOT / SPLASH_OUT)
    manifest = {
        'schemaVersion': 1,
        'generator': 'scripts/build-ios-brand-assets.py',
        'background': '#08040E',
        'derivatives': [
            {'path': ICON_OUT, 'sha256': sha256(ROOT / ICON_OUT), 'operation': 'FIT_CENTER_DARK_08040E_OPAQUE',
             'sources': {SYMBOL: sha256(ROOT / SYMBOL)}},
            {'path': SPLASH_OUT, 'sha256': sha256(ROOT / SPLASH_OUT), 'operation': 'BYTE_COPY_ANDROID_SPLASH_SYMBOL',
             'sources': {ANDROID_SPLASH: sha256(ROOT / ANDROID_SPLASH)}},
        ],
    }
    (ROOT / 'ios' / 'brand-assets-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print('iOS brand derivatives written')


if __name__ == '__main__':
    main()
