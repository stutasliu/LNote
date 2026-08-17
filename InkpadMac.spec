# -*- mode: python ; coding: utf-8 -*-
# macOS 打包配置：生成 L.Note.app
# 前置：前端产物 dist-web/ 已生成（Windows 上 npm run build 后拷贝整个仓库到 Mac，
#       或 Mac 上自行 npm install && npm run build）。
# 用法：python3 -m PyInstaller --clean -y InkpadMac.spec
# 说明：target_arch='universal2' 需使用官方 universal2 版 Python；
#       仅打单架构时删除该行（继承当前 Python 架构）。

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('dist-web/index.html', '.'),
        ('compare.html', '.'),
        ('image_viewer.html', '.'),
        ('dist-web/assets', 'assets'),
        ('dist-web/js', 'js'),
        ('dist-web/vendor', 'vendor'),
        ('css', 'css'),
        ('icons', 'icons'),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='L.Note',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,          # macOS 不推荐 upx
    console=False,      # GUI 应用，无终端
    target_arch='universal2',
)

coll = COLLECT(exe, a.binaries, a.datas, name='L.Note')

app = BUNDLE(
    coll,
    name='L.Note.app',
    icon='icons/L.NOTE/icon-L.NOTE.icns',
    bundle_identifier='com.xiansheng.lnote',
    info_plist={
        'CFBundleDisplayName': 'L.Note',
        'CFBundleShortVersionString': '0.20.44',
        'CFBundleVersion': '0.20.44',
        'LSMinimumSystemVersion': '11.0',
        'NSHighResolutionCapable': True,
        'NSRequiresAquaSystemAppearance': False,
    },
)
