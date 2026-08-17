#!/usr/bin/env python3
"""生成 macOS 应用图标 icon-L.NOTE.icns（macOS 专用，需在 Mac 上运行）。

用法: python3 tools/gen_icns.py
依赖: Pillow（pip install pillow）
"""
import os
import shutil
import subprocess
import tempfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'icons', 'L.NOTE', 'icon-L.NOTE-1024x1024.png')
OUT = os.path.join(ROOT, 'icons', 'L.NOTE', 'icon-L.NOTE.icns')

# iconutil 要求的 iconset 尺寸（10 个）
SIZES = {
    'icon_16x16.png': 16,
    'icon_16x16@2x.png': 32,
    'icon_32x32.png': 32,
    'icon_32x32@2x.png': 64,
    'icon_128x128.png': 128,
    'icon_128x128@2x.png': 256,
    'icon_256x256.png': 256,
    'icon_256x256@2x.png': 512,
    'icon_512x512.png': 512,
    'icon_512x512@2x.png': 1024,
}


def main():
    if not os.path.isfile(SRC):
        raise SystemExit('未找到源图标: ' + SRC)
    if shutil.which('iconutil') is None:
        raise SystemExit('未找到 iconutil（macOS 系统工具）')
    base = Image.open(SRC).convert('RGBA')
    tmp = tempfile.mkdtemp(prefix='lnote-icns-')
    try:
        for name, size in SIZES.items():
            base.resize((size, size), Image.LANCZOS).save(os.path.join(tmp, name))
        subprocess.run(['iconutil', '-c', 'icns', tmp, '-o', OUT], check=True)
    finally:
        shutil.rmtree(tmp)
    print('OK:', OUT)


if __name__ == '__main__':
    main()
