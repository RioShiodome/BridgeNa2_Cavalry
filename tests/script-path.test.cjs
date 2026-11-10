const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),binary=path.join(root,'build/script-path-test');
fs.mkdirSync(path.dirname(binary),{recursive:true});
execFileSync('clang++',['-std=c++17','-I'+path.join(root,'include'),path.join(__dirname,'script_path_test.cpp'),'-o',binary]);
for(const p of ['C:\\Users\\测试 用户 [AE]\\Cavalry AE Native\\default','\\\\server\\用户😀\\cache','/tmp/";throw Error(1);\\\n\u2028/缓存']){
 const source=execFileSync(binary,[p],{encoding:'utf8'}),g={};
 assert(/^[\x00-\x7f]*$/.test(source));
 vm.runInNewContext(source,{$:{global:g}});
 assert.equal(g.BN_NativeCacheRoot,p);
}
console.log('PASS native cache-root script encoding: Unicode, UNC, surrogate pair, quotes, backslashes and line separators round-trip without executing path text');
