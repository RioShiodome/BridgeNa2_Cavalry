from pathlib import Path
import subprocess,struct,zlib
root=Path(__file__).resolve().parents[1];work=root/'build/test-cache';work.mkdir(parents=True,exist_ok=True)
def chunk(k,d):return struct.pack('>I',len(d))+k+d+struct.pack('>I',zlib.crc32(k+d))
b=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',2,2,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(bytes([0,255,0,0,0,255,0,0,128,0,0,255,0,255,0,0,255,255])))+chunk(b'IEND',b'')
(work/'tiny.png').write_bytes(b)
for name in ['cache-root.test.cjs','script-path.test.cjs','source.test.cjs','source-channel.test.cjs','worker.test.cjs','multicomp.test.cjs','scheduler.test.cjs','fingerprint.test.cjs','background.test.cjs','renderer-host.test.cjs','bake.test.cjs','bake-proxy.test.cjs','bake-panel.test.cjs','composition-panel.test.cjs','json-safe.test.cjs']:subprocess.run(['node',str(root/'tests'/name)],check=True)
subprocess.run(['clang++','-std=c++17','-O1','-g','-fsanitize=address,undefined','-I'+str(root/'include'),'-I'+str(root/'vendor'),str(root/'src/cache.cpp'),str(root/'tests/cache_test.cpp'),'-o',str(root/'build/cache-test')],check=True)
subprocess.run([str(root/'build/cache-test'),str(work)],check=True)

subprocess.run(['clang++','-std=c++17','-O2','-I'+str(root/'include'),str(root/'tests/resample_test.cpp'),'-o',str(root/'build/resample-test')],check=True)
subprocess.run([str(root/'build/resample-test')],check=True)
