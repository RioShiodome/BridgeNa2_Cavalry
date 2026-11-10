const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync((process.env.BRIDGE_TEST_SOURCE||__dirname+'/..')+'/ae/cache-root.js','utf8');
function root(os,profile,channel,options={}){const g={BN_NativeCacheRoot:options.native};const dollar={global:g,os,getenv:k=>k==='USERPROFILE'?profile:'D:/Different HOME'};if(options.missing)delete dollar.getenv;if(options.throws)dollar.getenv=()=>{throw Error('Host API unavailable');};const Folder=p=>({fsName:p});Folder.userData={fsName:options.userData};vm.runInNewContext(source,{$:dollar,Folder});return g.BN_CacheRoot(channel).fsName;}
assert.equal(root('Windows 10 x64','C:\\Users\\测试 用户 [AE]',202),'C:/Users/测试 用户 [AE]/Cavalry AE Native/default/channels/202');
assert.equal(root('Windows 11','D:/用户 Files/'),'D:/用户 Files/Cavalry AE Native/default');
assert.equal(root('Windows','\\\\server\\profiles\\用户',8),'//server/profiles/用户/Cavalry AE Native/default/channels/8');
assert.throws(()=>root('Windows',''),/Windows 用户目录/);assert.throws(()=>root('Windows','relative'),/Windows 用户目录/);
assert.equal(root('Macintosh','ignored'), '~/Cavalry AE Native/default');
for(const options of [{missing:true},{throws:true},{}]){
 assert.equal(root('Windows','',8,{...options,userData:'C:\\Users\\测试 用户 [AE]\\AppData\\Roaming'}),'C:/Users/测试 用户 [AE]/Cavalry AE Native/default/channels/8');
 assert.equal(root('Windows','',8,{...options,userData:'\\\\server\\profiles\\用户\\AppData\\Roaming'}),'//server/profiles/用户/Cavalry AE Native/default/channels/8');
 assert.throws(()=>root('Windows','',8,{...options,userData:'D:/Redirected/Roaming'}),/Choose composition/,'Do not guess the profile from redirected AppData');
 assert.equal(root('Windows','',8,{...options,native:'E:\\Native Profile\\Cavalry AE Native\\default',userData:'D:/Redirected/Roaming'}),'E:/Native Profile/Cavalry AE Native/default/channels/8');
}
assert.equal(root('Windows','C:/Wrong env',0,{native:'//server/用户/Cavalry AE Native/default/'}),'//server/用户/Cavalry AE Native/default');
assert.equal(root('Windows','C:/Users/Good',0,{native:'relative'}),'C:/Users/Good/Cavalry AE Native/default');
console.log('PASS cache root: empty/unavailable/throwing getenv, standard/UNC AppData fallback, native path priority, redirected-folder rejection, Unicode and Mac behavior');
