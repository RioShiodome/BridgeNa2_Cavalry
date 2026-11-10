# PiPL encoding follows Adobe property definitions and the platform layout
# documented by virtualritz/after-effects (pipl crate), not host C struct layout.
from pathlib import Path
import struct

def generate(out:Path,windows:bool):
 endian='<' if windows else '>'
 def u(n):return struct.pack(endian+'I',n)
 def h(n):return struct.pack(endian+'H',n)
 def cc(s):return s.encode()[::-1] if windows else s.encode()
 def pad(b):return b+b'\0'*((-len(b))%4)
 def pascal(s):
  b=bytes([len(s)])+s.encode();return pad(b) if windows else b
 props=[('kind',cc('eFKT')),('name',pascal('BridgeNa2_Cavalry')),('catg',pascal('Cavalry'))]
 if windows:props.append(('8664',pad(b'EffectMain\0')))
 else:props.extend([('mi64',pascal('EffectMain')),('ma64',pascal('EffectMain'))])
 props.extend([('ePVR',h(2)+h(0)),('eSVR',h(13)+h(27)),('eVER',u(4<<19|6<<15|4<<11|1)),('eINF',u(0) if windows else h(0)),('eGLO',u(0x06000404)),('eGL2',u(0x08001400)),('eMNA',pascal('Cavalry Native Preview')),('aeFL',u(8))])
 b=(b'\x01\x00' if windows else b'')+u(0)+u(len(props))
 for key,value in props:b+=cc('8BIM')+cc(key)+u(0)+u(len(value))+(value if windows else pad(value))
 file=out/('pipl-win.bin' if windows else 'pipl-mac.bin');file.write_bytes(b)
 if windows:
  (out/'plugin.rc').write_text('16000 PiPL "'+str(file)+'"\n1 VERSIONINFO\nFILEVERSION 4,6,4,1\nPRODUCTVERSION 4,6,4,1\nFILEOS 0x40004\nFILETYPE 2\nBEGIN\n BLOCK "StringFileInfo"\n BEGIN\n  BLOCK "040904b0"\n  BEGIN\n   VALUE "ProductName", "BridgeNa2_Cavalry"\n   VALUE "FileDescription", "Cavalry animated cache renderer for After Effects"\n   VALUE "FileVersion", "4.6.4.1"\n  END\n END\n BLOCK "VarFileInfo"\n BEGIN\n  VALUE "Translation", 0x409, 1200\n END\nEND\n')
 else:
  (out/'plugin.r').write_text("data 'PiPL' (16000) {\n"+'\n'.join('$"'+b[i:i+32].hex().upper()+'"' for i in range(0,len(b),32))+'\n};\n')
