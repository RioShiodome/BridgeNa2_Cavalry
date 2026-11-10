# 接手提示词

请接手 BridgeNa2_Cavalry 原生 AE/Cavalry 桥接项目。先读 context/HANDOFF.md、context/BUILD-AND-TEST.md、docs/验证记录.md 和当前源码。context/CONVERSATION.md 是历史用户/助手可见消息，不是当前事实的唯一依据；以已验证代码和最新状态为准。

当前是 4.6.4 + 独立 PreviewCheck v1，Windows 用户反馈 Cached 100% 但 AE 纯黑。原因未确认；诊断包已经交付，尚未取得用户的 Preview-Report.txt、BMP 或 AE JSON。不要再次只跑交叉编译/Node 就宣称 Windows 全兼容，也不要把诊断包称作修复版。

优先取得并分析 Windows 现场报告，区分源 PNG 黑/透明、解码失败、快照/通道版本错误和 AE 输出问题；依据证据写回归、修复、构建验证和更新安装包。如果需要真实 Windows 环境而当前没有，明确测试边界。

保持原要求：动画图层可播放、Duration/范围/透明/多合成/烘焙不回退；Cavalry 单 JS 自动安装；不在编辑端 render、设置播放头、切换合成或增删临时节点；保留撤销和退出清理；不保存/关闭用户未保存工程；不复制登录凭据或绕过授权。合成身份必须包含节点 ID + UUID + 工程/owner，编号必须在 float32 可精确表示范围内。

安装文件与源码版本不同，不要假设当前 Mac 已安装 4.6.4。本次仓库整理只导出和上传，没有重新安装应用。
