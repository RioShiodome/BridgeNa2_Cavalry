# BridgeNa2_Cavalry

把 Cavalry 动画作为 After Effects 图层预览。Cavalry 修改后，独立后台进程重建动画缓存，AE 分段读取新帧；每个效果可以选择不同的 Cavalry 合成，并调整时长、帧范围、分辨率和透明背景，也可烘焙回填图层。

**当前源码：4.6.4 + PreviewCheck v1。Windows 版仍有未解决的黑画面反馈：Cached 100%，但 AE 预览纯黑。不要把本仓库或此前构建通过理解为 Windows 完整兼容已经验证。**

这是 2026-11-10 的源码与对话交接快照，附 2026-10-18 生成的安装包和诊断包。本次整理没有改动插件运行代码或重新安装应用。

## 先读这些文件

- [交接上下文：需求、架构、决策、版本、未解决问题](context/HANDOFF.md)
- [接手开发提示词](context/NEXT-AGENT.md)
- [用户与助手的可见对话记录](context/CONVERSATION.md) / [JSON](context/conversation.json)
- [4.6.4 原始使用说明](docs/README-4.6.4.md)
- [构建说明](docs/BUILD.md) / [迁移与测试](context/BUILD-AND-TEST.md)
- [历史验证记录](docs/验证记录.md) / [保存的日志与报告](validation)

## 已生成的安装包

- [Windows 10/11 x64 4.6.4（测试版）](distributions/BridgeNa2_Cavalry-Windows-v4.6.4.zip)
- [Mac Universal 4.6.4（arm64 / x86_64）](distributions/BridgeNa2_Cavalry-Mac-v4.6.4.zip)
- [Windows 黑画面诊断 v1](distributions/BridgeNa2_Cavalry-Windows-PreviewCheck-v1.zip)

安装包完整解压后运行其 `Install-Windows.cmd` 或 `Install-Mac.command`。源码目录下的安装脚本依赖安装包目录布局，不应脱离完整包直接运行。更新前自行保存并关闭 AE 和 Cavalry。

目标为 Windows 10/11 x64、macOS 12+，并须满足使用的 AE / Cavalry 版本自己的系统要求。开发时的真实宿主为 Apple 芯片 Mac、AE 26.2.1x2、Cavalry 2.7.2；Windows 全流程尚未实测。

## 源码结构

| 目录 | 内容 |
| --- | --- |
| `src/`, `include/` | AE 原生插件、缓存读帧、像素转换、启动器与嵌入 UI |
| `ae/` | 合成选择、创建图层、烘焙、路径/JSON 辅助和黑画面参数报告 |
| `cavalry/` | 编辑端监听、合成身份、独立通道、调度、烘焙代理；发布为一个 JS |
| `renderer/` | 隔离 Cavalry 渲染进程、Mac / Windows 启动器、Qt 启动 DLL |
| `install/` | 自动安装、回滚和诊断命令 |
| `tools/` | 打包、构建、资源生成以及原生黑画面检查工具 |
| `tests/` | 自动回归与历史宿主测试脚本；运行前见其说明 |
| `context/` | 对话、交接说明、源码快照清单 |
| `validation/` | 历史测试证据；时间和覆盖范围见各报告 |

编译需要 C++17、Adobe AE SDK、macOS Command Line Tools 和 LLVM-MinGW；这些开发依赖不随仓库分发。安装现成二进制包不需要 Node/Python。构建流程目前在 Mac 上生成两个平台的插件，尚没有经过验证的纯 Windows 本地构建脚本。

第三方说明见 [THIRD_PARTY.md](THIRD_PARTY.md) 与 [licenses](licenses)。本次整理未替项目新增开源许可证。
