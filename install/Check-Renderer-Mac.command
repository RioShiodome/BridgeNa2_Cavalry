#!/bin/zsh
set -eu
LAUNCHER='/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore/CavalryNative/BridgeNa2_Cavalry.plugin/Contents/Resources/launch-mac.js'
CACHE_ROOT="$HOME/Cavalry AE Native/default"
if [[ ! -f "$LAUNCHER" || ! -f "$CACHE_ROOT/renderer-config.json" ]]; then
 print -r -- '请先安装 BridgeNa2_Cavalry，并在 AE 点击一次 Connect。'
 read -r '?按回车关闭窗口。'
 exit 1
fi
print -r -- '正在打开独立后台 Cavalry。若出现登录/授权提示，请在该窗口完成，然后回 AE 点击 Connect。'
print -r -- '不会打开或渲染旧任务。检查窗口最多保留 10 分钟。'
/usr/bin/osascript -l JavaScript "$LAUNCHER" "$CACHE_ROOT" 0 inspect
