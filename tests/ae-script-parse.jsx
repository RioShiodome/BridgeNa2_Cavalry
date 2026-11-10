// Run from AE after tools/bundle.py. Reads source and writes a test report;
// no project, layer, selection, playhead or installed bridge globals are changed.
(function(){
    var project=File($.fileName).parent.parent;
    function read(relative){var f=File(project.fsName+'/'+relative);f.encoding='UTF-8';if(!f.open('r'))throw Error('Cannot read '+relative);var s=f.read();f.close();return s;}
    var report={ae:app.version,engine:$.version,os:$.os,windowsHost:/windows/i.test($.os),usesPathMocks:true,checks:[]};
    var json=read('ae/json-safe.js'),helper=read('ae/cache-root.js');
    function assert(ok,name){if(!ok)throw Error(name);report.checks.push(name);}
    function run(source,kind,nativeRoot){
        var g={BN_NativeCacheRoot:nativeRoot},calls=0,dollar={global:g,os:'Windows 11'};
        if(kind==='empty')dollar.getenv=function(){calls++;return '';};
        if(kind==='throws')dollar.getenv=function(){calls++;throw Error('Injected getenv failure');};
        function MockFolder(path){return {fsName:path};}
        MockFolder.userData={fsName:'C:/Users/Test/AppData/Roaming'};
        (new Function('$','Folder',source))(dollar,MockFolder);
        return {global:g,calls:function(){return calls;}};
    }
    try{
        // Construct the old literal without asking this test's parser to load it.
        var slash=String.fromCharCode(92),legacy='return /^[a-z]:['+slash+slash+'/]/i.test("C:/Users/Test");';
        try{(new Function(legacy))();report.legacyRegexAccepted=true;}catch(e){report.legacyRegexAccepted=false;report.legacyError=String(e);}
        var picker=json+helper+read('ae/composition-panel.jsx'),bake=json+helper+read('ae/bake-panel.jsx');
        var nativeRoot='C:/Users/测试 用户 [AE]/Cavalry AE Native/default',kinds=['empty','throws','missing'];
        for(var i=0;i<kinds.length;i++){
            var c=run(picker,kinds[i],nativeRoot);
            assert(typeof c.global.BN46_Select==='function','picker parses/loads: '+kinds[i]);
            assert(c.global.BN_CacheRoot(12).fsName===nativeRoot+'/channels/12','picker native Unicode path: '+kinds[i]);
            assert(c.calls()===0,'picker does not call getenv: '+kinds[i]);
            var b=run(bake,kinds[i],nativeRoot);
            assert(typeof b.global.CN41_Open==='function'&&b.global.CN41.version===6,'bake parses/loads: '+kinds[i]);
            assert(b.calls()===0,'bake does not call getenv: '+kinds[i]);
            var f=run(picker,kinds[i],null);
            assert(f.global.BN_CacheRoot().fsName==='C:/Users/Test/Cavalry AE Native/default','standalone AppData fallback: '+kinds[i]);
        }
        var standalone=read('ae/创建动画图层.jsx');
        new Function(standalone.substring(standalone.indexOf(String.fromCharCode(10))+1));
        assert(true,'complete create-layer script compiles (not executed)');
        report.passed=true;
    }catch(e){report.passed=false;report.error=String(e);report.line=e.line;}
    var serializer={};(new Function('$',json))({global:serializer});
    var folder=Folder(project.fsName+'/build');if(!folder.exists)folder.create();
    var output=File(folder.fsName+'/ae-script-parse.json');output.encoding='UTF-8';
    if(!output.open('w'))throw Error('Cannot write AE script test report');
    output.write(serializer.JSON.stringify(report));output.close();
})();
