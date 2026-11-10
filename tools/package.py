from pathlib import Path
import shutil,zipfile,hashlib,subprocess,json
root=Path(__file__).resolve().parents[1];desktop=Path.home()/'Desktop'
def copy(src,dst,windows=False):
 dst.parent.mkdir(parents=True,exist_ok=True)
 if windows and src.suffix in ['.ps1','.js','.jsx','.cmd']:
  text=src.read_text(encoding='utf-8-sig').replace('\r\n','\n');b=text.replace('\n','\r\n').encode('utf-8');dst.write_bytes((b'' if src.suffix=='.cmd' else b'\xef\xbb\xbf')+b)
 else:shutil.copy2(src,dst)
def archive(out):
 sums=[]
 for p in sorted(out.rglob('*')):
  if p.is_file() and p.name!='SHA256SUMS.txt':sums.append(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(out)))
 (out/'SHA256SUMS.txt').write_text('\n'.join(sums)+'\n')
 zpath=out.parent/(out.name+'.zip')
 with zipfile.ZipFile(zpath,'w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(out.rglob('*')):
   if p.is_file() and p.name!='.DS_Store':z.write(p,out.name+'/'+str(p.relative_to(out)))
 with zipfile.ZipFile(zpath) as z:
  assert z.testzip() is None
  assert all(not n.startswith('/') and '..' not in n.split('/') for n in z.namelist())
 print(zpath,zpath.stat().st_size,'bytes')
for platform in ['Mac','Windows']:
 out=desktop/('BridgeNa2_Cavalry-'+platform+'-v4.6.4');out.mkdir(exist_ok=True)
 for src,dest in [('README.md','README.md'),('docs/验证记录.md','验证记录.md'),('THIRD_PARTY.md','THIRD_PARTY.md'),('vendor/STB-LICENSE.txt','STB-LICENSE.txt'),('cavalry/Cavalry AE Native.js','cavalry/Cavalry AE Native.js'),('ae/创建动画图层.jsx','创建动画图层.jsx')]:copy(root/src,out/dest,platform=='Windows')
 shutil.copytree(root/'licenses',out/'licenses',dirs_exist_ok=True)
 if platform=='Windows':
  copy(root/'install/Check-Compatibility-Windows.cmd',out/'Check-Compatibility-Windows.cmd',True)
  copy(root/'install/Check-Compatibility-Windows.ps1',out/'install/Check-Compatibility-Windows.ps1',True)
  copy(root/'install/Check-Renderer-Windows.cmd',out/'Check-Renderer-Windows.cmd',True)
  copy(root/'build/out/BridgeNa2_Cavalry.aex',out/'plugin/BridgeNa2_Cavalry.aex')
  copy(root/'renderer/launch-windows.ps1',out/'plugin/renderer/launch-windows.ps1',True)
  copy(root/'build/out/qttestability.dll',out/'plugin/renderer/qttestability.dll')
  for name in ['Install-Windows.cmd','Install-Windows.ps1']:copy(root/'install'/name,out/'install'/name,True)
  (out/'Install-Windows.cmd').write_bytes(b'@echo off\r\ncall "%~dp0install\\Install-Windows.cmd"\r\n')
 else:
  shutil.copytree(root/'build/out/BridgeNa2_Cavalry.plugin',out/'plugin/BridgeNa2_Cavalry.plugin',dirs_exist_ok=True)
  copy(root/'install/Check-Renderer-Mac.command',out/'检查后台-Mac.command')
  copy(root/'install/Open-Cavalry-Mac.command',out/'打开Cavalry-Mac.command')
  for name in ['Install-Mac.command','configure-cavalry.js']:copy(root/'install'/name,out/'install'/name)
  (out/'Install-Mac.command').write_text('#!/bin/zsh\nset -eu\nTASK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec "$TASK_DIR/install/Install-Mac.command"\n');(out/'Install-Mac.command').chmod(0o755)
  subprocess.run(['codesign','--verify','--deep','--strict',str(out/'plugin/BridgeNa2_Cavalry.plugin')],check=True)
 assert len(list((out/'cavalry').glob('*.js')))==1
 archive(out)
out=desktop/'BridgeNa2_Cavalry-Source-v4.6.4';out.mkdir(exist_ok=True)
for directory in ['src','include','cavalry','install','ae','licenses','renderer']:
 for p in (root/directory).rglob('*'):
  if p.is_file():copy(p,out/directory/p.relative_to(root/directory))
for name in ['build.py','resources.py','package.py','bundle.py']:copy(root/'tools'/name,out/'tools'/name)
for name in ['cache_test.cpp','cache-root.test.cjs','script-path.test.cjs','script_path_test.cpp','ae-script-parse.jsx','windows-installer.test.ps1','windows-scripts.test.ps1','source.test.cjs','source-channel.test.cjs','worker.test.cjs','multicomp.test.cjs','scheduler.test.cjs','fingerprint.test.cjs','background.test.cjs','renderer-host.test.cjs','bake.test.cjs','bake-proxy.test.cjs','bake-panel.test.cjs','composition-panel.test.cjs','json-safe.test.cjs','resample_test.cpp','run-tests.py']:copy(root/'tests'/name,out/'tests'/name)
for name in ['README.md','THIRD_PARTY.md','vendor/stb_image.h','vendor/STB-LICENSE.txt','docs/BUILD.md','docs/验证记录.md']:copy(root/name,out/name)
archive(out)
