#pragma once
static const char* bakeUI=R"CNBAKE(// ExtendScript releases without a built-in JSON object. No eval is used.
(function(G){
 if(typeof G.JSON!=='undefined')return;
 function quote(s){return '"'+String(s).replace(/["\\\x00-\x1f]/g,function(c){if(c==='"'||c==='\\')return '\\'+c;return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';}
 function stringify(v){
  if(v===null)return 'null';var t=typeof v;if(t==='string')return quote(v);if(t==='number')return isFinite(v)?String(v):'null';if(t==='boolean')return String(v);if(t!=='object')return undefined;
  var parts=[],i,k,value;if(v instanceof Array){for(i=0;i<v.length;i++)parts.push(stringify(v[i])||'null');return '['+parts.join(',')+']';}
  for(k in v)if(Object.prototype.hasOwnProperty.call(v,k)){value=stringify(v[k]);if(value!==undefined)parts.push(quote(k)+':'+value);}return '{'+parts.join(',')+'}';
 }
 function parse(text){
  var s=String(text).replace(/^\uFEFF/,''),i=0,depth=0;
  function bad(){throw new SyntaxError('Invalid JSON at '+i);}
  function space(){while(i<s.length&&/\s/.test(s.charAt(i)))i++;}
  function str(){var out='',c;if(s.charAt(i++)!=='"')bad();while(i<s.length){c=s.charAt(i++);if(c==='"')return out;if(c==='\\'){c=s.charAt(i++);if(c==='u'){var h=s.substr(i,4);if(!/^[0-9a-fA-F]{4}$/.test(h))bad();out+=String.fromCharCode(parseInt(h,16));i+=4;}else {var es={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};if(!Object.prototype.hasOwnProperty.call(es,c))bad();out+=es[c];}}else{if(c.charCodeAt(0)<32)bad();out+=c;}}bad();}
  function value(){space();if(++depth>128)bad();var c=s.charAt(i),v,key,m;if(c==='"')v=str();else if(c==='{'||c==='['){var array=c==='[';i++;v=array?[]:{};space();if(s.charAt(i)===(array?']':'}'))i++;else{while(true){space();if(array)v.push(value());else{key=str();if(key==='__proto__')bad();space();if(s.charAt(i++)!==':')bad();v[key]=value();}space();c=s.charAt(i++);if(c===(array?']':'}'))break;if(c!==',')bad();}}}else if(s.substr(i,4)==='true'){v=true;i+=4;}else if(s.substr(i,5)==='false'){v=false;i+=5;}else if(s.substr(i,4)==='null'){v=null;i+=4;}else {m=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(s.substr(i));if(!m)bad();v=Number(m[0]);if(!isFinite(v))bad();i+=m[0].length;}depth--;return v;}
  var v=value();space();if(i!==s.length)bad();return v;
 }
 G.JSON={parse:parse,stringify:stringify};
})($.global);

// Native panels receive the exact native root. Standalone scripts guard getenv:
// host APIs can be unavailable/throw, and ~ can follow a different custom HOME.
(function(G){
    function absolute(path){return /^[a-z]:\//i.test(path)||/^\/\/[^\/]+\/[^\/]+(?:\/|$)/.test(path);}
    function normalize(path){return typeof path==='string'?path.replace(/\\/g,'/').replace(/\/+$/,''):'';}
    G.BN_CacheRoot=function(channel){
        var base='',home='',data='',value='';
        if(typeof $.os==='string'&&/windows/i.test($.os)){
            base=normalize(G.BN_NativeCacheRoot);
            if(!absolute(base)){
                // Call directly inside try: some ExtendScript host methods do
                // not report typeof === 'function'. Never call a missing API.
                try{if($.getenv)value=$.getenv('USERPROFILE');}catch(_){}
                home=normalize(value);
                if(!absolute(home)){
                    // Only the standard AppData layout identifies a profile.
                    // Redirected folders must use the native effect's picker.
                    try{data=normalize(Folder.userData.fsName);}catch(_){}
                    var m=/^(.*)\/AppData\/Roaming$/i.exec(data);
                    home=m&&absolute(m[1])?m[1]:'';
                }
                if(!home)throw Error('BridgeNa2 4.6.4 无法读取 Windows 用户目录。请先给图层添加 BridgeNa2_Cavalry 效果，并从效果中点击 Choose composition；新版原生插件会直接提供缓存路径。');
                base=home+'/Cavalry AE Native/default';
            }
        }else base='~/Cavalry AE Native/default';
        return Folder(base+(channel?'/channels/'+channel:''));
    };
})($.global);

// Embedded in the native binary. No separate AE script installation is needed.
(function(G){
    if(G.CN41&&G.CN41.version===6)return;
    var ROOT=G.BN_CacheRoot(),MATCH='Cavalry Native Preview';
    function read(name){var f=File(ROOT.fsName+'/'+name);if(!f.exists)return null;f.encoding='UTF-8';if(!f.open('r'))return null;var s=f.read();f.close();try{return JSON.parse(s);}catch(_){return null;}}
    function send(o){o.protocol=1;o.stamp=new Date().getTime();o.id='b'+o.stamp+Math.floor(Math.random()*100000);var f=File(ROOT.fsName+'/bake-request.json');f.encoding='UTF-8';f.lineFeed='Unix';if(!f.open('w'))throw Error('无法写入缓存目录。请在 AE 首选项允许脚本写入文件。');f.write(JSON.stringify(o));f.close();return o.id;}
    function target(layerID,token){
        for(var i=1;i<=app.project.numItems;i++){var c=app.project.item(i);if(!(c instanceof CompItem))continue;for(var j=1;j<=c.numLayers;j++){var l=c.layer(j);if(l.id!==layerID)continue;var es=l.property('ADBE Effect Parade');for(var k=1;k<=es.numProperties;k++){var e=es.property(k);if(e.matchName===MATCH&&e.numProperties>=9&&e.property(9).value===token)return {comp:c,layer:l,effect:e};}}}
        throw Error('原 Cavalry 图层或效果已被删除；烘焙文件仍保留。');
    }
    function groups(paths){
        var result=[],map={};paths.sort();
        for(var i=0;i<paths.length;i++){
            var p=paths[i],m=/^(.*?)[._](-?\d+)\.(png|jpg|jpeg|webp|tif|tiff|exr|svg)$/i.exec(p),ext=/\.([^.]+)$/.exec(p);
            if(!ext||!/^(png|jpg|jpeg|webp|tif|tiff|exr|svg|pdf|mp4|mov|gif|webm|wav|aac|aiff|aif|m4a)$/i.test(ext[1]))continue;
            var key=m?m[1]+'.'+m[3]:p;if(!map[key]){map[key]={path:p,sequence:!!m,count:0,label:File(p).name};result.push(map[key]);}map[key].count++;
        }
        return result;
    }
    function chooseOutput(g){
        if(!g.length)throw Error('输出中没有 AE 可回填的媒体文件。');if(g.length===1)return g[0];
        var d=new Window('dialog','选择回填的渲染结果'),list=d.add('dropdownlist',undefined,[]);list.preferredSize.width=470;
        for(var i=0;i<g.length;i++)list.add('item',decodeURI(g[i].label)+' ('+g[i].count+' 文件)');list.selection=0;
        d.add('statictext',undefined,'动态渲染产生多个结果；所有结果保留在输出目录。');var row=d.add('group');row.add('button',undefined,'回填',{name:'ok'});row.add('button',undefined,'保留文件',{name:'cancel'});return d.show()===1?g[list.selection.index]:null;
    }
    function fill(layerID,token,result,selected){
        var t=target(layerID,token),l=t.layer;if(l.locked)throw Error('原图层已锁定。请解锁后重新点击回填。');
        var g=selected||chooseOutput(groups(result.files));if(!g)return false;
        var opts=new ImportOptions(File(g.path));opts.sequence=g.sequence&&g.count>1;opts.forceAlphabetical=false;
        if(!opts.canImportAs(ImportAsType.FOOTAGE))throw Error('当前 AE 无法导入此格式：'+g.path+'；请在设置里选择 PNG 或 ProRes。');
        // A wrapper preserves the native preview canvas size and duration, so the
        // original layer's masks, transforms, timing, expressions and effects survive.
        app.beginUndoGroup('Cavalry 烘焙回填');
        try{
            var footage=app.project.importFile(opts);if(opts.sequence)footage.mainSource.conformFrameRate=result.fps;
            var length=l.outPoint-l.inPoint,offset=Math.max(0,t.effect.property(7).value),source=l.source,wrapper=app.project.items.addComp('Cavalry 烘焙 · '+decodeURI(File(g.path).name),source.width,source.height,source.pixelAspect,Math.max(1/t.comp.frameRate,offset+length),t.comp.frameRate);
            var media=wrapper.layers.add(footage);media.startTime=offset;if(footage.width>0&&footage.height>0){var fit=100*Math.min(wrapper.width/footage.width,wrapper.height/footage.height);media.property('ADBE Transform Group').property('ADBE Scale').setValue([fit,fit]);}
            if(!footage.hasVideo&&footage.duration>0){media.stretch=100*length/footage.duration;}
            else if(!footage.mainSource.isStill){
                // Endpoint mapping matches the native preview duration control.
                media.timeRemapEnabled=true;var remap=media.property('ADBE Time Remapping');
                var end=Math.max(0,footage.duration-1/footage.frameRate),last=Math.max(0,length-1/wrapper.frameRate);remap.setValueAtTime(offset,0);if(last>0)remap.setValueAtTime(offset+last,end);for(var key=remap.numKeys;key>=1;key--){var kt=remap.keyTime(key);if(Math.abs(kt-offset)>.00001&&Math.abs(kt-offset-last)>.00001)remap.removeKey(key);}
            }
            media.inPoint=offset;media.outPoint=offset+length;
            var start=l.startTime,ip=l.inPoint,op=l.outPoint;
            l.replaceSource(wrapper,false);l.startTime=start;l.inPoint=ip;l.outPoint=op;
            t.effect.enabled=false;t.effect.property(2).setValue(0);
            l.comment+='\nCavalry baked: '+result.directory;
            return true;
        }finally{app.endUndoGroup();}
    }
    G.CN41={version:6,send:send,target:target,fill:fill,groups:groups,current:null};
    G.CN41_Open=function(layerID,token){
        var old=G.CN41.current;if(old&&old.running){alert('已有烘焙任务正在运行。');return;}if(old)old.win.close();
        var bound=target(layerID,token).effect,channel=bound.numProperties>=14?bound.property(14).value:0;
        ROOT=G.BN_CacheRoot(channel);
        var w=new Window('palette','BridgeNa2_Cavalry · Render Manager / 烘焙',undefined,{resizeable:true});w.orientation='column';w.alignChildren='fill';w.spacing=9;
        var top=w.add('group');top.add('statictext',undefined,'输出格式');var formats=top.add('dropdownlist',undefined,[]);formats.preferredSize.width=180;var refresh=top.add('button',undefined,'重新读取');
        var rangeRow=w.add('group');rangeRow.add('statictext',undefined,'烘焙范围');
        var rangeMode=rangeRow.add('dropdownlist',undefined,['整个合成','Cavalry 播放范围','起止帧','当前帧']);rangeMode.selection=0;
        rangeRow.add('statictext',undefined,'起始帧');var firstFrame=rangeRow.add('edittext',undefined,'0');firstFrame.characters=7;
        rangeRow.add('statictext',undefined,'末尾帧（含）');var lastFrame=rangeRow.add('edittext',undefined,'249');lastFrame.characters=7;
        function rangeEnabled(){firstFrame.enabled=lastFrame.enabled=rangeMode.selection&&rangeMode.selection.index===2;}
        rangeMode.onChange=rangeEnabled;rangeEnabled();
        var alphaRow=w.add('group'),transparent=alphaRow.add('checkbox',undefined,'透明背景');alphaRow.add('statictext',undefined,'需选择支持 Alpha 的格式，例如 PNG；MP4 不支持透明。');
        var filter=w.add('group');filter.add('statictext',undefined,'参数');var scope=filter.add('dropdownlist',undefined,['Render Manager','合成 / 运动模糊']);scope.selection=0;var search=filter.add('edittext',undefined,'');search.characters=22;
        var list=w.add('listbox',undefined,[],{numberOfColumns:2,showHeaders:true,columnTitles:['参数','当前值'],columnWidths:[280,250]});list.preferredSize=[600,300];
        var detail=w.add('panel',undefined,'选中参数后编辑');detail.orientation='column';detail.alignChildren='fill';detail.preferredSize.height=135;
        var note=w.add('statictext',undefined,'读取 Cavalry 参数中…',{multiline:true});note.preferredSize=[600,42];
        var progress=w.add('progressbar',undefined,0,100);var buttons=w.add('group');var bake=buttons.add('button',undefined,'烘焙到当前图层'),retry=buttons.add('button',undefined,'回填已完成结果'),folder=buttons.add('button',undefined,'打开输出目录');retry.enabled=false;folder.enabled=false;
        var cancel=buttons.add('button',undefined,'关闭');
        var state={win:w,id:'',session:'',schema:null,running:false,closed:false,layerID:layerID,token:token,previousLive:true,result:null,editor:null,selected:null,started:new Date().getTime(),directory:''};G.CN41.current=state;
        function status(s){note.text=s;}
        function rangeValues(){
            var mode=rangeMode.selection?rangeMode.selection.index:0,values=[{scope:'queue',path:'frameRangeMode',value:mode}];
            if(mode===2){var first=Number(firstFrame.text),last=Number(lastFrame.text);
                if(!firstFrame.text.length||!lastFrame.text.length||!isFinite(first)||!isFinite(last)||Math.floor(first)!==first||Math.floor(last)!==last||first>last)throw Error('请输入有效的整数起止帧，起始帧不能大于末尾帧。');
                values.push({scope:'queue',path:'frameRange',value:{x:first,y:last}});
            }return values;
        }
        function openRequest(){var t=target(layerID,token),e=t.effect,r=null;
            if(e.numProperties>=12&&e.property(10).value>0)r={first:e.property(11).value,last:e.property(12).value};
            transparent.value=e.numProperties>=13&&e.property(13).value>0;
            request({action:'open',previewRange:r,transparent:transparent.value});
        }
        function request(o){o.session=state.session;state.id=send(o);state.started=new Date().getTime();}
        function pretty(v){return typeof v==='string'?v:JSON.stringify(v);}
        function drawList(){var keep=state.selected?state.selected.path:'';list.removeAll();if(!state.schema)return;var f=state.schema.fields,term=search.text.toLowerCase();for(var i=0;i<f.length;i++){var a=f[i];if(a.scope!==(scope.selection.index===0?'queue':'comp'))continue;if((a.label+' '+a.path).toLowerCase().indexOf(term)<0)continue;var row=list.add('item',a.label+(a.readOnly?' [只读]':''));row.subItems[0].text=a.type==='array'?'共 '+a.count+' 项':String(pretty(a.value)).slice(0,85);row.data=a;if(a.path===keep)list.selection=row;}if(!list.selection&&list.items.length)list.selection=0;edit();}
        function edit(){while(detail.children.length)detail.remove(detail.children[0]);state.editor=null;if(!list.selection)return;var a=list.selection.data;state.selected=a;detail.text=a.label+'  ('+a.path+')';
            if(a.type==='array'){
                detail.add('statictext',undefined,'共 '+a.count+' 项；展开的子参数可在列表中编辑。');
                if(a.path==='metadata'){var ar=detail.add('group');var add=ar.add('button',undefined,'添加行'),del=ar.add('button',undefined,'删除最后一行');add.onClick=function(){request({action:'array',scope:a.scope,path:a.path});};del.enabled=a.count>0;del.onClick=function(){request({action:'array',scope:a.scope,path:a.path,remove:true,index:a.count-1});};}detail.layout.layout(true);return;
            }
            var input;if(a.type==='bool'){input=detail.add('checkbox',undefined,'启用');input.value=!!a.value;}
            else if(a.enumValues&&a.enumValues.length){input=detail.add('dropdownlist',undefined,[]);for(var k=0;k<a.enumValues.length;k++){input.add('item',a.enumValues[k].label);if(a.value===a.enumValues[k].value)input.selection=k;}}
            else{input=detail.add('edittext',undefined,pretty(a.value),{multiline:!!a.multiline});input.preferredSize.height=a.multiline?64:25;}
            input.enabled=!a.readOnly;var row=detail.add('group'),apply=row.add('button',undefined,'应用当前参数');apply.enabled=!a.readOnly&&!state.running;
            if(a.type==='string'&&/filePath$/.test(a.path)){var browse=row.add('button',undefined,'选择目录');browse.onClick=function(){var f=Folder.selectDialog('选择烘焙输出目录');if(f)input.text=f.fsName;};}
            if(!a.readOnly&&a.type!=='string'&&a.type!=='bool'&&(!a.enumValues||!a.enumValues.length))row.add('statictext',undefined,typeof a.value==='object'?'使用 JSON，如 {"x":1920,"y":1080}':'输入数值');
            state.editor={attr:a,input:input};apply.onClick=function(){try{request({action:'apply',values:[value()]});status('正在应用参数…');}catch(e){status(String(e));}};detail.layout.layout(true);
        }
        function value(){var a=state.editor.attr,v,input=state.editor.input;if(a.type==='bool')v=input.value;else if(a.enumValues&&a.enumValues.length)v=a.enumValues[input.selection.index].value;else if(a.type==='string')v=input.text;else v=JSON.parse(input.text);return {scope:a.scope,path:a.path,value:v};}
        list.onChange=edit;scope.onChange=drawList;search.onChanging=drawList;
        formats.onChange=function(){if(state.loading||!formats.selection||state.running)return;request({action:'apply',format:state.schema.formats[formats.selection.index].type});status('正在读取格式参数…');};
        refresh.onClick=function(){if(state.running)return;openRequest();};
        bake.onClick=function(){try{var t=target(layerID,token);if(t.layer.locked)throw Error('请先解锁目标图层。');state.previousLive=t.effect.property(2).value>0;var edits=[];if(state.editor&&!state.editor.attr.readOnly)edits=[value()];edits=edits.concat(rangeValues());request({action:'render',values:edits,transparent:transparent.value});state.running=true;transparent.enabled=false;rangeMode.enabled=false;firstFrame.enabled=false;lastFrame.enabled=false;t.effect.property(2).setValue(0);bake.enabled=false;formats.enabled=false;refresh.enabled=false;list.enabled=false;cancel.text='取消回填';status('正在准备独立渲染副本…');}catch(e){status(String(e));}};
        retry.onClick=function(){try{if(fill(layerID,token,state.result))status('烘焙完成，已回填当前图层。');}catch(e){status(String(e));}};
        folder.onClick=function(){if(state.directory)Folder(state.directory).execute();};
        cancel.onClick=function(){w.close();};w.onClose=function(){state.closed=true;if(!state.running&&state.session)send({action:'close',session:state.session});if(state.running){try{target(layerID,token).effect.property(2).setValue(state.previousLive?1:0);}catch(_){}}};
        w.onResizing=w.onResize=function(){this.layout.resize();};
        state.poll=function(){
            if(state.closed)return;
            var r=read('bake-response.json');
            if(r&&r.id===state.id){
                if(r.phase==='settings'&&state.schema!==r){state.schema=r;state.session=r.session;state.loading=true;formats.removeAll();for(var i=0;i<r.formats.length;i++){formats.add('item',r.formats[i].label);if(r.formats[i].type===r.format)formats.selection=i;}state.loading=false;if(typeof r.rangeMode==='number')rangeMode.selection=r.rangeMode;if(r.range){firstFrame.text=String(r.range.x);lastFrame.text=String(r.range.y);}rangeEnabled();drawList();status('参数来自 Cavalry '+r.version+'；修改后点击“应用当前参数”。');state.id='';}
                else if(r.phase==='rendering'){state.directory=r.directory;folder.enabled=true;var elapsed=Math.floor((new Date().getTime()-r.started)/1000),files=Folder(r.directory).getFiles(function(f){return f instanceof File&&/\.(png|jpg|jpeg|webp|svg)$/i.test(f.name);});if(files.length){progress.value=Math.min(99,100*files.length/Math.max(1,r.total));status('已输出 '+files.length+' / '+r.total+' 帧 · '+elapsed+' 秒');}else status('Render Manager 渲染 / 编码中 · '+elapsed+' 秒；视频格式无逐帧进度。');}
                else if(r.phase==='complete'){state.result=r;state.running=false;state.id='';state.directory=r.directory;folder.enabled=true;retry.enabled=true;progress.value=100;cancel.text='关闭';try{if(fill(layerID,token,r))status('已回填原图层；BridgeNa2_Cavalry 效果已关闭，可正常剪辑和导出。');else status('渲染已完成，文件已保留；可点击“回填已完成结果”。');}catch(e){status(String(e));}}
                else if(r.phase==='error'){state.id='';state.running=false;transparent.enabled=true;rangeMode.enabled=true;rangeEnabled();bake.enabled=true;formats.enabled=true;refresh.enabled=true;list.enabled=true;cancel.text='关闭';try{target(layerID,token).effect.property(2).setValue(state.previousLive?1:0);}catch(_){}status('失败：'+r.error);}
            }else if(!state.running&&state.id&&new Date().getTime()-state.started>10000)status('等待 Cavalry 桥接响应；请确认 Cavalry 和桥接标签已打开。');
            app.scheduleTask('$.global.CN41_Poll('+token+')',300,false);
        };
        G.CN41_Poll=function(token){if(G.CN41.current&&G.CN41.current.token===token)G.CN41.current.poll();};
        w.show();openRequest();state.poll();
    };
})($.global);
)CNBAKE";
