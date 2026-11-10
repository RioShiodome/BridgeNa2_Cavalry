from pathlib import Path
import subprocess,zipfile,hashlib,shutil
root=Path(__file__).resolve().parents[1]
out=Path.home()/'Desktop/BridgeNa2_Cavalry-Windows-PreviewCheck-v1';out.mkdir(exist_ok=True)
compiler=root/'build/llvm-mingw-20260922-ucrt-macos-universal/bin/x86_64-w64-mingw32-clang++'
subprocess.run([str(compiler),'-std=c++17','-O2','-static','-municode','-DWIN32_LEAN_AND_MEAN','-DNOMINMAX','-I'+str(root/'include'),'-I'+str(root/'vendor'),str(root/'src/cache.cpp'),str(root/'tools/preview_probe.cpp'),'-lshell32','-lole32','-luuid','-o',str(out/'Check-Preview-Windows.exe')],check=True)
cmd=(root/'install/Check-Preview-Windows.cmd').read_text();(out/'Check-Preview-Windows.cmd').write_bytes(cmd.replace('\n','\r\n').encode('utf8'))
jsx='#target aftereffects\n'+(root/'ae/json-safe.js').read_text()+'\n'+(root/'ae/cache-root.js').read_text()+'\n'+(root/'ae/preview-diagnostic.jsx').read_text()
(out/'AE-Preview-Report.jsx').write_bytes(b'\xef\xbb\xbf'+jsx.replace('\n','\r\n').encode('utf8'))
(out/'使用说明.txt').write_text('''BridgeNa2_Cavalry Windows 黑画面诊断 v1

此包用于定位 Cached 100% 但黑画面的问题，不是新的插件版本。
不用安装、无需管理员权限，不重启应用、不渲染、不修改工程或缓存。

1. 完整解压到可写目录，双击 Check-Preview-Windows.cmd。
   它使用与 4.6.4 插件相同的缓存解析、PNG 解码和像素转换代码，读取最近 24 个通道。
   完成后自动打开 Preview-Report 文件夹。查看其中 BMP：棋盘格表示透明，黑色表示源像素为黑。
   把 Preview-Report.txt 发回来。报告会列出合成名称、本机路径及后台状态，不包含源工程内容。

2. 如果 BMP 有正常内容但 AE 仍黑，在 AE 选中问题图层，从 文件 > 脚本 > 运行脚本文件
   运行 AE-Preview-Report.jsx，保存 JSON 报告并发回来。
   这个脚本只读取当前参数、时间、通道与缓存版本；不改图层、不导入素材。

检查期间建议让 AE 停止播放，保持黑画面所在时刻，以便比对。
可分别打开首/中/尾 BMP 判断是否动画本身从黑帧开始。

工具只证明磁盘读取和像素处理，不模拟 AE SDK 渲染回调，也不能证明 Windows AE 完整兼容。
当前原生探针通过 Mac fixture 检查和 Windows x64 交叉编译，尚未在 Windows 宿主实跑。
报告和 BMP 只写在本文件夹下，不上传任何数据。可在检查后删除整个诊断包。
''',encoding='utf-8-sig')
shutil.copy2(root/'THIRD_PARTY.md',out/'THIRD_PARTY.md');shutil.copy2(root/'vendor/STB-LICENSE.txt',out/'STB-LICENSE.txt')
shutil.copytree(root/'licenses',out/'licenses',dirs_exist_ok=True)
files=[p for p in out.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt' and 'Preview-Report' not in p.relative_to(out).parts]
(out/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(out).as_posix()+'\n' for p in sorted(files)))
with zipfile.ZipFile(str(out)+'.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(files+[out/'SHA256SUMS.txt']):z.write(p,out.name+'/'+p.relative_to(out).as_posix())
with zipfile.ZipFile(str(out)+'.zip') as z:assert z.testzip() is None
print(str(out)+'.zip')
