#!/bin/zsh
set -eu
print -r -- '新开 Cavalry 编辑窗口；不会强制关闭现有进程或保存工程。'
# -n bypasses the older hidden renderer's Launch Services application identity.
exec /usr/bin/open -n -b com.scenegroup.cavalry
