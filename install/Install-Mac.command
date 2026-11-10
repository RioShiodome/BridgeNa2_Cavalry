#!/bin/zsh
set -eu
TASK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PACKAGE_DIR="$TASK_DIR/.."
PLUGIN_SRC="$PACKAGE_DIR/plugin/BridgeNa2_Cavalry.plugin"
PLUGIN_ROOT='/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore/CavalryNative'
if [[ ! -d "$PLUGIN_SRC" ]]; then
 print -r -- '缺少插件文件，请完整解压安装包后运行。'
 exit 1
fi
print -r -- '安装 BridgeNa2_Cavalry 4.6.4。插件在 AE 下次启动时载入。'
print -r -- '若 Cavalry 正在运行，请按提示保存并关闭；不会强制关闭应用。'
/usr/bin/codesign --verify --deep --strict "$PLUGIN_SRC"
/usr/bin/osascript -l JavaScript "$TASK_DIR/configure-cavalry.js" "$PACKAGE_DIR/cavalry/Cavalry AE Native.js"
# Stage a verified bundle, then move both historical names out of AE's scan
# directory. Never overwrite the executable mapped by a running AE instance.
BACKUP_DIR="$HOME/Library/Application Support/Cavalry/AE Native Backups/native-$(date +%Y%m%d-%H%M%S)-$$"
/bin/mkdir -p "$BACKUP_DIR"
INSTALL_OP=()
if [[ ! -w "$(dirname "$PLUGIN_ROOT")" && ! -w "$PLUGIN_ROOT" ]]; then
 print -r -- '写入 Adobe 公共插件目录需要管理员密码。'
 INSTALL_OP=(sudo)
fi
"${INSTALL_OP[@]}" /bin/mkdir -p "$PLUGIN_ROOT"
STAGE="$PLUGIN_ROOT/.bridge-install-$$"
"${INSTALL_OP[@]}" /usr/bin/ditto "$PLUGIN_SRC" "$STAGE"
"${INSTALL_OP[@]}" /usr/bin/xattr -dr com.apple.quarantine "$STAGE" 2>/dev/null || true
/usr/bin/codesign --verify --deep --strict "$STAGE"
for OLD_NAME in 'Cavalry Native.plugin' 'BridgeNa2_Cavalry.plugin'; do
 if [[ -e "$PLUGIN_ROOT/$OLD_NAME" ]]; then
  "${INSTALL_OP[@]}" /bin/mv "$PLUGIN_ROOT/$OLD_NAME" "$BACKUP_DIR/$OLD_NAME"
 fi
done
if ! "${INSTALL_OP[@]}" /bin/mv "$STAGE" "$PLUGIN_ROOT/BridgeNa2_Cavalry.plugin"; then
 for OLD_NAME in 'Cavalry Native.plugin' 'BridgeNa2_Cavalry.plugin'; do
  if [[ -e "$BACKUP_DIR/$OLD_NAME" ]]; then
   "${INSTALL_OP[@]}" /bin/mv "$BACKUP_DIR/$OLD_NAME" "$PLUGIN_ROOT/$OLD_NAME"
  fi
 done
 exit 1
fi
/usr/bin/codesign --verify --deep --strict "$PLUGIN_ROOT/BridgeNa2_Cavalry.plugin"
print -r -- '安装完成。正常重启 AE，打开 Cavalry 动画；在 AE 新建纯色层并添加效果 Cavalry > BridgeNa2_Cavalry，然后点 Connect。'
print -r -- '也可以在 AE 运行包内的 创建动画图层.jsx，一次设定秒数并连接。'
read -r '?按回车关闭安装窗口。'
