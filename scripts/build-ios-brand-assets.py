#!/usr/bin/env python3
"""Deterministic iOS brand derivatives from APPROVED US brand assets.

iOS Store V1 (05/11/2026): the iPhone shows the same icons as Android 1.4.
- AppIcon: the launcher icon of 04/11/2026, the frameless logo
  (us-launcher-symbol-v2) on white.
- AppIcon-Night / AppIcon-Gold / AppIcon-Neon: the Sintonia reward icons,
  the approved background and logo layers of each.
- Launch symbol: BYTE_COPY of the approved Android splash symbol.

Every icon uses ANDROID_ADAPTIVE_VISIBLE_1024_OPAQUE: background and logo layers
composed as an Android adaptive icon (108 dp layers), then the part an Android
launcher shows (the central 72 dp, i.e. 2/3) scaled to 1024x1024, flattened to
opaque RGB (the App Store rejects icons with alpha). It is the framing of the
approved collection tiles (assets/derived/rewards/us-app-icon-*-v1.webp): the
logo spans about 73% of the icon. Only background margin is left out; nothing
is redrawn or recoloured.

Requires Pillow. Writes ios/brand-assets-manifest.json with source and output
hashes; the test suite verifies the committed files against that manifest.
"""
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSET_MANIFEST = json.loads((ROOT / 'assets' / 'ASSET_MANIFEST.json').read_text(encoding='utf-8'))
ANDROID_MANIFEST = json.loads((ROOT / 'android' / 'brand-assets-manifest.json').read_text(encoding='utf-8-sig'))

CATALOG = 'ios/App/App/Assets.xcassets'
ANDROID_SPLASH = 'android/app/src/main/res/drawable-nodpi/us_splash_symbol.png'
SPLASH_OUT = f'{CATALOG}/Splash.imageset/us-launch-symbol@3x.png'
ICON_OPERATION = 'ANDROID_ADAPTIVE_VISIBLE_1024_OPAQUE'
WHITE = '#FFFFFF'
APP_ICON = 'assets/source/brand/app-icon'

# (asset catalog set, background: approved file or a colour, approved logo layer)
ICONS = [
    ('AppIcon', WHITE, f'{APP_ICON}/us-launcher-symbol-v2.png'),
    ('AppIcon-Night', f'{APP_ICON}/us-launcher-background-notte-v1.png', f'{APP_ICON}/us-launcher-symbol-notte-v1.png'),
    ('AppIcon-Gold', f'{APP_ICON}/us-launcher-background-oro-v1.png', f'{APP_ICON}/us-launcher-symbol-oro-v1.png'),
    ('AppIcon-Neon', f'{APP_ICON}/us-launcher-background-neon-v1.png', f'{APP_ICON}/us-launcher-symbol-neon-v1.png'),
]


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


def icon_file(name):
    return f'{CATALOG}/{name}.appiconset/{name}-1024.png'


def build_icon(name, background, foreground):
    with Image.open(ROOT / foreground) as source:
        logo = source.convert('RGBA')
    size = logo.width
    if logo.height != size:
        raise SystemExit(f'Adaptive layer is not square: {foreground}')
    if background == WHITE:
        canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    else:
        with Image.open(ROOT / background) as source:
            canvas = source.convert('RGBA')
        if canvas.size != (size, size):
            raise SystemExit(f'Background and logo layers differ in size: {background}')
    canvas.alpha_composite(logo)
    inset = round(size / 6)  # an adaptive launcher shows the central 72 of 108 dp
    visible = canvas.crop((inset, inset, size - inset, size - inset))
    target = ROOT / icon_file(name)
    target.parent.mkdir(parents=True, exist_ok=True)
    visible.resize((1024, 1024), Image.LANCZOS).convert('RGB').save(target, format='PNG', optimize=True)
    contents = {
        'images': [{'filename': f'{name}-1024.png', 'idiom': 'universal', 'platform': 'ios', 'size': '1024x1024'}],
        'info': {'author': 'xcode', 'version': 1},
    }
    (target.parent / 'Contents.json').write_text(json.dumps(contents, indent=2) + '\n', encoding='utf-8', newline='\n')


def main():
    derivatives = []
    for name, background, foreground in ICONS:
        sources = [foreground] + ([] if background == WHITE else [background])
        for relative in sources:
            assert_approved(relative)
        build_icon(name, background, foreground)
        entry = {
            'path': icon_file(name),
            'sha256': sha256(ROOT / icon_file(name)),
            'operation': ICON_OPERATION,
            'sources': {relative: sha256(ROOT / relative) for relative in sources},
        }
        if background == WHITE:
            entry['background'] = WHITE
        derivatives.append(entry)

    assert_android_derivative(ANDROID_SPLASH)
    (ROOT / SPLASH_OUT).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / ANDROID_SPLASH, ROOT / SPLASH_OUT)
    derivatives.append({'path': SPLASH_OUT, 'sha256': sha256(ROOT / SPLASH_OUT), 'operation': 'BYTE_COPY_ANDROID_SPLASH_SYMBOL',
                        'sources': {ANDROID_SPLASH: sha256(ROOT / ANDROID_SPLASH)}})

    manifest = {
        'schemaVersion': 2,
        'generator': 'scripts/build-ios-brand-assets.py',
        # The launch screen: the default Android splash colour (values/colors.xml us_splash_background).
        'launchBackground': '#26142E',
        'alternateIcons': {'night': 'AppIcon-Night', 'gold': 'AppIcon-Gold', 'neon': 'AppIcon-Neon'},
        'derivatives': derivatives,
    }
    # LF on every system: the same bytes from Windows and macOS.
    (ROOT / 'ios' / 'brand-assets-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('iOS brand derivatives written')


if __name__ == '__main__':
    main()
