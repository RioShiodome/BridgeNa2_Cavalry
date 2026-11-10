# 构建、迁移与测试

## 依赖

现有工具链流程在 macOS 上执行：Python 3、Node.js（测试使用较新的 JS 语法，建议 Node 20+）、Xcode Command Line Tools（clang++、lipo、Rez、codesign）、合法取得的 Adobe AE SDK Examples 目录、LLVM-MinGW x64 UCRT 工具链。PowerShell 检查另需 pwsh。

构建前将 `AE_SDK` 设置为 SDK 的 `Examples` 目录，将 `MINGW_BIN` 设置为工具链 `bin` 目录；也可按 `tools/build.py` 中默认 `build/` 路径放置。源码包不含 SDK、编译器、Node/Python 或账户凭据。

## 常用命令

在仓库根目录执行：

```sh
python3 tools/bundle.py
python3 tests/run-tests.py
python3 tests/preview-probe.test.py
node tests/preview-diagnostic.test.cjs
python3 tools/build.py
pwsh -NoProfile -File tests/windows-scripts.test.ps1
pwsh -NoProfile -File tests/windows-installer.test.ps1
python3 tools/package.py
python3 tools/package_preview_probe.py
```

`tools/build.py` 会先重新 bundle，再生成两种 Mac 架构和 Windows x64 AEX / Qt DLL。只修改源 JSX 而不重建 `.aex` 不会更新插件内嵌窗口。

`tools/package.py` 将安装包和旧布局的源码包写入 `~/Desktop`；其中列举测试/工具文件的清单早于诊断工具，所以它生成的 Source ZIP 不等于本交接仓库的完整内容。诊断包由 `package_preview_probe.py` 单独生成。后者当前硬编码 LLVM-MinGW 的 `build/` 默认位置，迁移时需修改这一位置或按相同目录放置工具链。

不要把源码目录下的 `install/Install-*.ps1/.command` 当作完整安装包运行；安装器期望相邻存在 `plugin/`、`cavalry/` 等已打包布局。直接使用 `distributions/` 下完整 ZIP 解压安装。

## 必须有真实 ExtendScript 解析检查

在 AE 中运行 `tests/ae-script-parse.jsx`，输出 `build/ae-script-parse.json`。它读取仓库源码、用模拟 Windows 路径检查选择/烘焙脚本，完整创建图层脚本只编译不执行。

Mac AppleScript 可用 `DoScript` 调用 `$.evalFile(File(绝对路径))`，以便 `$.fileName` 指向测试文件。仅运行 Node 曾遗漏 4.6.3 正则在 ExtendScript 中的解析错误。

## 黑画面诊断

Windows 解压 `distributions/BridgeNa2_Cavalry-Windows-PreviewCheck-v1.zip`，双击 `Check-Preview-Windows.cmd`；无需安装或管理员权限。把输出的 Preview-Report.txt 与 BMP 结果用于判断。它读取原缓存，在诊断包目录写报告和缩略图。

若 BMP 正常，在 AE 选择问题图层，通过“文件 → 脚本 → 运行脚本文件”运行该诊断包内 `AE-Preview-Report.jsx` 并保存 JSON。它读取参数和快照，不修改工程。

这些报告包含合成/图层名称与本机路径；收到后在公开 issue 中粘贴前按需要去除个人路径。现有 `validation/` 是开发期的证据，不是用户 Windows 实机诊断。

## 历史脚本

`tests/host-*` 等历史宿主联调脚本有硬编码路径，可能新建/删除测试图层、改变位深或退出应用。它们未包含在 `tests/run-tests.py` 自动入口。请阅读后，只在自有独立测试工程运行，不要对用户正在编辑的工程批量执行。
