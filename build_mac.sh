#!/bin/bash
# L.Note macOS 一键构建脚本
# 用法: bash build_mac.sh [skip-deps] [skip-sign]
#   skip-deps: 跳过 pip 安装依赖（已装过时用）
#   skip-sign: 跳过签名与公证（未配置证书时用）
# 注意: 必须在一台 macOS 机器上执行；需要 Apple Developer 证书时才签名。
set -e
cd "$(dirname "$0")"

if [ "$1" != "skip-deps" ]; then
  echo "==> 安装依赖"
  python3 -m pip install --upgrade pip
  python3 -m pip install pyinstaller pywebview pyobjc-framework-Cocoa pyobjc-framework-WebKit pillow
fi

echo "==> 生成 .icns 图标"
python3 tools/gen_icns.py

echo "==> PyInstaller 打包 .app"
python3 -m PyInstaller --clean -y InkpadMac.spec

APP="dist/L.Note.app"
[ -d "$APP" ] || { echo "打包失败：未找到 $APP"; exit 1; }

if [ "$1" != "skip-sign" ] && [ "$2" != "skip-sign" ]; then
  # 若已配置 Developer ID 证书，则签名 + 公证 + 盖章
  if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
    echo "==> 代码签名"
    codesign --force --deep --sign "Developer ID Application" --options runtime "$APP"
    echo "==> 公证（notarytool）"
    if [ -n "$APPLE_ID" ] && [ -n "$TEAM_ID" ] && [ -n "$APPLE_PASSWORD" ]; then
      xcrun notarytool submit "$APP" --apple-id "$APPLE_ID" --team-id "$TEAM_ID" --password "$APPLE_PASSWORD" --wait
      xcrun stapler staple "$APP"
      echo "==> 公证完成"
    else
      echo "==> 跳过公证：未设置 APPLE_ID / TEAM_ID / APPLE_PASSWORD 环境变量"
    fi
  else
    echo "==> 跳过签名：本机无 Developer ID Application 证书"
  fi
fi

echo ""
echo "==> 完成：$APP"
echo "==> 分发时可用: hdiutil create -volname 'L.Note' -srcfolder $APP -ov -format UDZO dist/L.Note-0.20.44-macos.dmg"
