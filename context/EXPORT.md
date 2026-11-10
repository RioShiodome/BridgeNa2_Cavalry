# 导出记录

日期：2026-11-10（Asia/Shanghai）。用户先要求打包本对话上下文与源码，随后明确要求新建公开 GitHub 仓库 `BridgeNa2_Cavalry`。

仓库：https://github.com/RioShiodome/BridgeNa2_Cavalry

对话通过当前聊天历史接口分页读取，共 27 轮、231 条原有用户/助手可见消息；另补记上传 GitHub 和选择公开仓库两条用户指示。JSON 保留角色、消息 ID、阶段及轮次时间；Markdown 将澄清问答转成易读文字。对话导出不含系统/开发者指令、内部推理或工具调用。公开对话中的原用户主目录路径替换为 `<LOCAL_HOME>`，历史链接不保证可在新电脑打开。原源码和历史验证文件中的机器路径为可追溯性保留，迁移时按构建说明调整。

当前生产源文件、诊断工具和测试源码共 101 个文件与原工作目录逐字节比对一致；原版 README 移至 docs/README-4.6.4.md，新增根 README 和 context 文档。context/SOURCE-SNAPSHOT.json 保存复制时的哈希；PACKAGED-SHA256SUMS.txt 校验最终交接文件。没有重建、替换已安装插件或改变用户工程。

在导出副本重新执行：

- `python3 tests/run-tests.py`：通过，含 JS、C++ ASAN/UBSAN、缓存/透明/通道/原生路径和像素转换回归。
- `python3 tests/preview-probe.test.py`：通过，诊断工具测试、BMP 和缓存只读验证。
- `node tests/preview-diagnostic.test.cjs`：通过，AE 参数报告与取消路径验证。
- 已附安装/诊断 ZIP 的完整性和内含 SHA-256 清单：通过。
- 对即将上传的文本文件检查常见访问令牌/私钥标记：未匹配；未包含账户目录、用户工程、动画缓存、工具链或 SDK。

本次没有 Windows AE/Cavalry 宿主测试，也没有新的黑画面根因证据。validation 中标注 2026-10 的内容是历史证据；本次测试日志带 `export-…-2026-11-10`。

源码不是来自已存在的 Git 仓库，本次首次创建提交，不具有此前各版本的 Git 提交历史。版本演进保存在交接说明、对话记录和原始验证文档中。
