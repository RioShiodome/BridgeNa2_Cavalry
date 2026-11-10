from pathlib import Path
import os,subprocess,shutil,plistlib
from resources import generate
from bundle import bundle
root=Path(__file__).resolve().parents[1]
bundle(root)
sdk=Path(os.environ.get('AE_SDK',str(root/'build/sdk/Examples')))
headers=[sdk/'Headers',sdk/'Headers/SP',sdk/'Util',root/'include',root/'vendor']
src=[root/'src/plugin.cpp',root/'src/cache.cpp']
def run(args):print(' '.join(map(str,args)),flush=True);subprocess.run(list(map(str,args)),check=True)
common=['-std=c++17','-O2','-fvisibility=hidden','-Wno-deprecated-declarations','-Wno-multichar','-Wno-pragma-pack']+['-I'+str(p) for p in headers]
out=root/'build/out';out.mkdir(parents=True,exist_ok=True)
for arch in ['arm64','x86_64']:
 run(['/usr/bin/clang++',*common,'-arch',arch,'-mmacosx-version-min=12.0','-bundle',*src,'-o',out/('CavalryNative-'+arch)])
bundle=out/'BridgeNa2_Cavalry.plugin';(bundle/'Contents/MacOS').mkdir(parents=True,exist_ok=True);(bundle/'Contents/Resources').mkdir(exist_ok=True)
run(['lipo','-create',out/'CavalryNative-arm64',out/'CavalryNative-x86_64','-output',bundle/'Contents/MacOS/CavalryNative'])
(bundle/'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleExecutable':'CavalryNative','CFBundleIdentifier':'local.cavalry.native.preview','CFBundleName':'BridgeNa2_Cavalry','CFBundlePackageType':'eFKT','CFBundleSignature':'FXTC','CFBundleVersion':'4.6.4','CFBundleShortVersionString':'4.6.4','LSMinimumSystemVersion':'12.0'}))
generate(out,False)
run(['Rez','-useDF',out/'plugin.r','-o',bundle/'Contents/Resources/CavalryNative.rsrc'])
run(['xattr','-cr',bundle])
shutil.copy2(root/'renderer/launch-mac.js',bundle/'Contents/Resources/launch-mac.js')
run(['codesign','--force','--sign','-',bundle])
mingw=Path(os.environ.get('MINGW_BIN',str(root/'build/llvm-mingw-20260922-ucrt-macos-universal/bin')))
generate(out,True)
run([mingw/'x86_64-w64-mingw32-windres','-i',out/'plugin.rc','-o',out/'plugin.res','-O','coff'])
run([mingw/'x86_64-w64-mingw32-clang++',*common,'-DWIN32','-D_WINDOWS','-DWIN32_LEAN_AND_MEAN','-DNOMINMAX','-shared','-static','-static-libgcc','-static-libstdc++',*src,out/'plugin.res','-lshell32','-lole32','-luuid','-o',out/'BridgeNa2_Cavalry.aex'])
run([mingw/'x86_64-w64-mingw32-clang++','-O2','-static','-shared',root/'renderer/qt-bootstrap-windows.cpp','-o',out/'qttestability.dll'])
