from pathlib import Path
import hashlib,struct,zlib,subprocess,tempfile,re
root=Path(__file__).resolve().parents[1]
binary=root/'build/preview-probe-test'
subprocess.run(['clang++','-std=c++17','-O1','-g','-fsanitize=address,undefined','-I'+str(root/'include'),'-I'+str(root/'vendor'),str(root/'src/cache.cpp'),str(root/'tools/preview_probe.cpp'),'-o',str(binary)],check=True)
def png(pixel):
 def chunk(k,d):return struct.pack('>I',len(d))+k+d+struct.pack('>I',zlib.crc32(k+d))
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',4,2,8,6,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+bytes(pixel)*4)*2))+chunk(b'IEND',b'')
with tempfile.TemporaryDirectory(prefix='BridgeNa2 测试 [AE] ') as temp:
 cache=Path(temp)/'cache';out=Path(temp)/'report'
 cases={'101':((0,0,0,255),'PNG_VISIBLE_PIXELS_BLACK'),'102':((255,20,70,0),'PNG_FULLY_TRANSPARENT'),'103':((50,100,200,128),'PNG_HAS_VISIBLE_CONTENT'),'104':(None,'PNG_DECODE_FAILED')}
 for channel,(color,_) in cases.items():
  p=cache/'channels'/channel;gen=p/'gen-check-1';gen.mkdir(parents=True)
  manifest='CAVALRY_NATIVE_4\ngen-check-1\n3\n4\n2\n25\n-2\n50\n0\nDiagnostic\nrCheck\n3\nDOT\nEND\n'
  (p/'complete.txt').write_text(manifest);(p/'preview.txt').write_text('CAVALRY_NATIVE_4\nIDLE\nrCheck\nEND\n')
  (p/'snapshots').mkdir();(p/'snapshots/42.txt').write_text('CNSNAPSHOT4\nNONE\n===\n'+manifest+'DONE\n')
  for f in range(-2,1):(gen/f'frame.{f:06d}.png').write_bytes(png(color) if color else b'broken')
 before={str(f.relative_to(cache)):hashlib.sha256(f.read_bytes()).hexdigest() for f in cache.rglob('*') if f.is_file()}
 subprocess.run([str(binary),'--root',str(cache),'--out',str(out)],check=True)
 report=(out/'Preview-Report.txt').read_text(encoding='utf-8-sig')
 for channel,(_,expected) in cases.items():
  block=report.split('========== CHANNEL '+channel+' ==========')[1].split('========== CHANNEL')[0]
  assert block.count(expected)==4,(channel,block)
  assert 'LATEST_SNAPSHOT revision=42 readable=1' in block
  if channel=='103':
   for a,b,c in re.findall(r'8bpc=(\d+) 16bpc=(\d+) 32bpc=(\d+)',block): assert int(a)>0 and int(a)==int(b)==int(c)
  if channel!='104':
   bitmap=(out/(channel+'_first.bmp')).read_bytes();assert bitmap[:2]==b'BM'
   assert struct.unpack_from('<I',bitmap,2)[0]==len(bitmap)
 assert before=={str(f.relative_to(cache)):hashlib.sha256(f.read_bytes()).hexdigest() for f in cache.rglob('*') if f.is_file()},'Cache was modified'
 assert not list(out.glob('104_*.bmp'))
print('PASS read-only probe: production snapshot/PNG paths, negative frames, opaque black, transparent, colored, corrupt PNG, 8/16/32-bit conversion, BMP output and unchanged cache hashes')
