# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    # 打包资源（Phase 3）：主窗口加载源根 app.html（编辑器壳，原样打包）；
    # js/ vendor/ 取自 Vite 产物 dist-web/（由插件从源根拷贝）。
    # 独立窗口页 compare.html / image_viewer.html 未走 Vite，原样从源根打包。
    # 注意：打包前先执行 `npm run build` 生成 dist-web/。
    datas=[
        ('app.html', '.'),
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
    a.binaries,
    a.datas,
    [],
    name='L.Note',
    icon='icons/L.NOTE/icon-L.NOTE.ico',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
