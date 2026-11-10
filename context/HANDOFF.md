# BridgeNa2_Cavalry 交接上下文

导出日期：2026-11-10（Asia/Shanghai）。对话原名：开发 AE 实时显示 Cavalry 内容扩展。最新程序源码版本 4.6.4；最后一次功能工作为 2026-10-18 的 Windows 黑画面诊断工具 v1。

## 当前状态，必须先知道

用户已经在 Windows 使用插件：先报告点击 Connect / Choose composition 出现 `unable to execute script at line 28`；4.6.4 针对真实 ExtendScript 解析缺陷修复后，用户继续反馈 **Cached 100%，但 AE 预览纯黑**。

黑画面的原因没有确认，也没有修复结论。诊断工具已交付，但截至本次导出，没有收到 Windows 用户的 `Preview-Report.txt`、BMP 结果或 AE JSON 报告。用户没有回复缓存 PNG 本身是否正常。不要把“100%”理解成解码、AE 像素输出、GPU 或全部渲染链路已经通过。

最近一次开发只新增诊断工具，插件仍为 4.6.4，没有 4.6.5。源码中的诊断工具是旧 `Source-v4.6.4.zip` 之后加入的；本仓库从当前工作目录复制，已将它们包含在内。

## 用户已确认的需求

1. AE 中是一条可在时间线上播放的动画图层，不是单张静止帧。
2. 用户可控制动画在 AE 占用的秒数；有源起始帧、末尾帧（含两端）。
3. 接受修改后自动重建整段动画缓存；更新期间仍可显示旧动画，并希望新帧能渐进显示，类似 AE 预览。
4. 停止编辑后即更新，不要求切回 AE。不需要每次手动发送。
5. Cavalry 端只装一个 JS，有自动安装和工作区启动配置；AE 使用原生 `.aex` / `.plugin`。
6. 支持 Windows 10 以上，开发目标具体为 Windows 10/11 x64；Mac 提供 Apple Silicon / Intel 通用版本。
7. 不得因为桥接渲染阻塞 Cavalry 编辑、闪帧、抢播放头、破坏撤销或退出后无法重新打开。
8. 缓存进度、分辨率、透明背景，AE 端调整 Render Manager 参数、烘焙后回填原图层。
9. 多个 BridgeNa2 效果可分别选择当前 Cavalry 工程中的不同合成，不能因为当前激活合成变化而串线。
10. 产品名为 `BridgeNa2_Cavalry`。内部 matchName `Cavalry Native Preview`、安装的 `Cavalry AE Native.js` 文件名和旧参数顺序保持兼容。

对话中短暂讨论了 Rive View Model 和网页/App 的点击事件，没有纳入本插件实现。可见记录保留这些问答。

## 主要设计决定

脚本/CEP 不能直接保证 AE 与 Cavalry 双向逐帧计算。当前使用原生 AE 效果消费磁盘上的 PNG 动画缓存。编辑端只读场景和导出快照，所有 render、预览队列、烘焙参数临时节点都在独立 Cavalry 后台副本中处理。

编辑端不得渲染，不得为同步设置播放头、切换当前合成或创建/删除临时节点。用户确认 4.3 独立进程方案消除了闪动，此后优化应保留此边界。导出复杂工程快照本身仍可能短暂耗时。

后台串行处理多个通道。每个通道独立绑定、范围、质量、透明设置和缓存。AE 播放时冻结当前缓存版本，停止后接收更新，减少 RAM 预览被持续打断。旧完整版本和已发布前缀用于回退。

Mac 使用独立偏好目录启动 Cavalry；Windows 通过系统 64 位 PowerShell、独立桌面、kill-on-close Job 和 Qt 正常 testability 启动入口隔离配置。Cavalry 仍需要有效登录/授权。不得复制用户凭据、绕过验证或退回编辑端渲染。

## 关键文件与数据流

`src/plugin.cpp`：AE 参数、idle 扫描和更新、合成/烘焙脚本入口、普通/Smart Render 回调。

`src/cache.cpp`：缓存清单、不可变快照、文件长度校验、选帧和 stb_image PNG 解码。`include/resample.hpp` 输出 AE 8/16/32 bpc 像素。

`ae/composition-panel.jsx` 选择来源并写绑定；`ae/bake-panel.jsx` 操作后台 Render Manager、导入输出并回填；`tools/bundle.py` 将它们与 JSON/路径助手嵌入 C++ 头文件，同时生成一个完整 Cavalry JS 和创建图层脚本。

`cavalry/worker.js` 发布合成目录并管理通道；`channel.js` 管理单通道预览；`source.js` 精确解析节点；`background.js`、`scheduler.js` 派发快照到后台；`bake-proxy.js` 只负责编辑端的后台请求转发；`bake.js` 在渲染副本中管理参数和队列。

`renderer/host.js` 读取独立快照、精确定位源 comp、分批渲染 PNG 并报告进度。慢帧采用自适应批次，避免每帧重复支付渲染启动成本。

典型缓存根目录为用户主目录下的 `Cavalry AE Native/default`。Windows 原生使用 `FOLDERID_Profile`；4.6.4 的插件脚本入口直接接收原生根路径。`channels/<整数>/` 下有 binding/control/state/preview/complete/snapshots/bake 文件，帧在 `gen-…` 子目录。AE 工程不嵌入 PNG 缓存；跨机器不能只复制 AEP 就认为素材齐全。

## 版本与已知历史问题

| 版本 | 主要变化与证据边界 |
| --- | --- |
| 早期脚本版 | 从当前帧同步演进为整段动画缓存；发送、安装与 UI 逐步简化 |
| 4.0 | 原生插件；Cavalry 单 JS；Mac 实际动画验证，Windows 交叉编译 |
| 4.1–4.2 | 预览、烘焙、命名改为 BridgeNa2_Cavalry；前台仍受渲染干扰 |
| 4.3 | 独立 Cavalry 渲染，用户确认闪动消失 |
| 4.4 / 4.4.1 | 自适应批次、播放期间冻结版本、按任务确认启动、超时与检查后台/登录；防止旧 ready 状态导致无限启动 |
| 4.5.0 | 起止帧、透明背景、明确烘焙控件，大型工程减少重复启动；单场景片段测试提速不代表所有工程 |
| 4.5.1 | 监控编辑器退出并清理自有后台，避免残留进程阻止重开；部分原生验证受登录阻挡 |
| 4.5.2 | 所有临时场景节点操作移入后台，避免编辑端撤销失效 |
| 4.6.0 | 每个 AE 效果独立选择 Cavalry 合成、独立通道 |
| 4.6.1 | 修复大整数滑块 float32 舍入，新的通道/版本/token 限制到 1–16777215；旧范围保留 |
| 4.6.2 | 复制合成可共用 UUID，改用节点 ID + UUID + 工程身份精确绑定；真实 case5 节点路由验证 |
| 4.6.3 | Windows 目录、大小写/斜杠、安装回滚、64 位 PowerShell、嵌套 Job 和错误原因 |
| 4.6.4 | 修复内嵌选择脚本第 28 行 ExtendScript 正则解析失败，原生路径传入脚本；真实 Mac AE 引擎验证 |
| PreviewCheck v1 | 定位 Windows Cached 100% 但黑画面的只读工具；不是黑画面修复版 |

4.6.2 的现场工程有 11 个 comp 共用 UUID；用户要连接 `case5`，真实节点是 `compNode#11`。必须传递节点 ID，不可取 UUID 的第一个匹配项。保存工程绑定还核对源文件路径；未保存工程使用 owner 会话身份。移动/另存源文件后需重选。

4.6.4 缺陷：旧 `/^[a-z]:[\\/]/` 路径正则可被 Node 接受，但真实 AE ExtendScript 4.5.6 解析失败。曾先怀疑 getenv，随后真实引擎确认语法缺陷；最终代码同时改正正则和路径来源。不要只运行 Node 就认为 ExtendScript 已兼容。

## 最新测试证据及限制

- 完整 JS 与 C++ ASAN/UBSAN、PNG Alpha、并发 LRU、选帧和像素转换回归历史通过，见 `validation/test464.log`。
- Mac Universal 和 Windows x64 4.6.4 编译通过。PE 检查确认入口/架构以及系统 DLL/UCRT 依赖；这不是宿主运行。
- `tests/ae-script-parse.jsx` 在 Mac AE 26.2.1x2 / ExtendScript 4.5.6 执行，使用隔离的 Windows 路径替身；19 项通过。完整创建图层脚本只编译，不创建图层。
- Windows 安装回滚和 PowerShell/C# 检查是在 Mac PowerShell 7 中运行，不证明 Windows PowerShell 5.1、UAC、NTFS 锁或进程 API 实跑。
- PreviewCheck 用生产缓存解析、PNG 解码及转换代码，覆盖纯黑、全透明、正常、损坏 PNG，8/16/32 bpc 和缓存未改变。Windows EXE 交叉编译通过，尚未在 Windows 宿主执行。
- 用户 Windows 已实际加载并使用插件，但仍黑屏；不能宣称 Windows 端到端兼容完成。
- 本机最后明确记录的安装为 Mac 4.6.2。随后 4.6.3/4.6.4 打包未更新本机安装；本次未重新检查安装状态。不要把源码版本等同正在运行的插件版本。

## 黑画面接下来的工作

先取得 Windows 检查工具报告，确定是后台产物、磁盘解析还是 AE 回调显示路径。`Preview-Report.txt` 会检查近 24 个通道和首/中/尾帧；生成的 BMP 用棋盘格呈现透明。若 PNG/BMP 正常，再让用户选中问题 AE 图层运行 `AE-Preview-Report.jsx`，对照 channel、revision、当前时间、图层 offset/duration、位深和实际 snapshot。

AE Cached 100% 只说明清单的已发布帧和文件长度验证通过。它不验证每张 PNG 解码，也不验证 AE 的 Smart Render 输出；代码在 image 为空时输出全透明，查看器可显示黑色。

若有现场证据，再检查 `Store::snapshot`、`chooseFrame`、`ImageCache::get`、render 的时间范围，以及 Smart Pre Render/Smart Render 中的配置、请求矩形与像素格式。Windows 路径、权限、位深、GPU、素材/字体/授权都尚未被确认为原因。曾读过 SDK 类型定义，但没有 ABI 不匹配的结论；不要按猜测修改后宣布修复。

## 交接范围与约束

本仓库包含当前生产源码、诊断工具源码、测试代码、必要第三方头文件与许可证、精选历史验证文件、当前安装包和对话可见消息。编译依赖 Adobe SDK、LLVM-MinGW、PowerShell、Node/Python 需另行准备；不包含用户账号数据、缓存动画帧、源工程、截图或 1.8GB build 工作目录。

历史宿主测试 `tests/host-*`、`probe-host.jsx`、`single.js` 保留供阅读，有本机绝对路径，部分会改工程、退出应用或关闭桥接；只在独立测试工程中按内容使用，不批量执行。自动回归入口与其分开，见 BUILD-AND-TEST.md。

本次用户要求源码与上下文打包，并明确要求创建公开 GitHub 仓库 `BridgeNa2_Cavalry`。没有要求重新安装应用、关闭正在编辑的工程、修改现场动画或清理原缓存。
