(function(){
var base='/Users/moonshot/cavalry-ae-native/build/script-root464/';
function read(name){var f=File(base+name);f.encoding='UTF-8';if(!f.open('r'))throw Error(name);var s=f.read();f.close();return s;}
var report={ae:app.version,engine:$.version,os:$.os,windowsHost:false,checks:[]};
var old=read('old.jsx'),picker=read('picker.jsx'),bake=read('bake.jsx'),prefix=read('prefix.js');
function assert(ok,name){if(!ok)throw Error(name);report.checks.push(name);}
function run(source,kind){
 var g={},dollar={global:g,os:'Windows 11'},calls=0;
 if(kind==='empty')dollar.getenv=function(){calls++;return '';};
 if(kind==='throws')dollar.getenv=function(){calls++;throw Error('Injected unavailable getenv');};
 function MockFolder(path){return {fsName:path};}
 MockFolder.userData={fsName:'C:/Users/Test/AppData/Roaming'};
 (new Function('$','Folder',source))(dollar,MockFolder);
 return {global:g,calls:calls};
}
try{
 var failed=false;try{run(old,'empty');}catch(e){failed=true;report.oldError=String(e);report.oldLine=e.line;}
 assert(failed,'4.6.3 picker fails when USERPROFILE is empty');
 var kinds=['empty','throws','missing'];
 for(var i=0;i<kinds.length;i++){
  var c=run(prefix+picker,kinds[i]);
  assert(typeof c.global.BN46_Select==='function','new picker loaded: '+kinds[i]);
  assert(c.global.BN_CacheRoot(12).fsName==='C:/Users/测试 用户 [AE]/Cavalry AE Native/default/channels/12','native Unicode profile: '+kinds[i]);
  assert(c.calls===0,'native picker getenv calls = 0: '+kinds[i]);
  var b=run(prefix+bake,kinds[i]);
  assert(typeof b.global.CN41_Open==='function'&&b.global.CN41.version===6,'new bake loaded: '+kinds[i]);
  assert(b.calls===0,'native bake getenv calls = 0: '+kinds[i]);
 }
 var standalone=run(picker,'empty');
 assert(standalone.global.BN_CacheRoot().fsName==='C:/Users/Test/Cavalry AE Native/default','standalone standard AppData fallback');
 report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.line=e.line;}
var serializer={};var sourceFile=File('/Users/moonshot/cavalry-ae-native/ae/json-safe.js');sourceFile.open('r');var jsonSource=sourceFile.read();sourceFile.close();
(new Function('$',jsonSource))({global:serializer});
var output=File(base+'ae-result.json');output.encoding='UTF-8';if(!output.open('w'))throw Error('Cannot write test result');output.write(serializer.JSON.stringify(report));output.close();
})();
