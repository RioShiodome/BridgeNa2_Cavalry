// Render Manager adapter. Runs only inside the isolated renderer.
function createBakeBridge(api, root, background, beforeBake) {
    var pending=null,session=null,last='',replyPath=root+'/bake-response.json';
    function read(p){try{if(!api.filePathExists(p))return '';return api.readFromFile(p).replace(/^\uFEFF/,'');}catch(_){return '';}}
    function write(o){if(!api.writeToFile(replyPath,JSON.stringify(o),true))throw Error('Cannot write bake response');}
    function release(){if(pending){background.cancel(pending.handle);pending=null;}if(!session)return;var s=session;session=null;if(s.queue&&api.layerExists(s.queue)&&api.get(s.queue,'uuid')===s.queueUUID)api.deleteLayer(s.queue);if(s.clone&&api.layerExists(s.clone)&&api.get(s.clone,'uuid')===s.cloneUUID)api.deleteLayer(s.clone);}
    function enumLabels(id,path,d){return (d.enumValues||[]).map(function(v){return {value:v,label:api.getDropdownNiceName(id,path,v)};});}
    function fields(id,scope){
        var out=[];
        function add(path){
            var d=api.getAttributeDefinition(id,path);
            if(d.isArray){var count=api.getArrayCount(id,path);out.push({scope:scope,path:path,label:api.getAttributeNiceName(id,path),type:'array',count:count,readOnly:path==='targets'});for(var i=0;i<count;i++){var base=path+'.'+i;var children=d.children[0].children||[];for(var k=0;k<children.length;k++)add(base+'.'+children[k].attrId);}return;}
            if(d.isCompound){for(var j=0;j<d.children.length;j++)add(path+'.'+d.children[j].attrId);return;}
            // Node connections and status are shown as read-only, never written as values.
            out.push({scope:scope,path:path,label:api.getAttributeNiceName(id,path)||path,type:d.type,value:api.get(id,path),readOnly:!!d.isAttrReadOnly||d.type==='nodeId',enumValues:enumLabels(id,path,d),limits:d.numericInfo||{},multiline:d.multiline});
        }
        api.getAttributes(id).forEach(function(p){add(p);});return out;
    }
    function schema(req){
        var s=session;
        write({id:req.id,phase:'settings',session:s.id,format:api.getCurrentGeneratorType(s.queue,'generator'),formats:s.formats,fields:fields(s.queue,'queue').concat(fields(s.clone,'comp')),version:api.getCavalryVersion(),comp:api.getNiceName(s.source),rangeMode:api.get(s.queue,'frameRangeMode'),range:api.get(s.queue,'frameRange')});
    }
    function open(req,source){
        release();if(!source||!api.layerExists(source))throw Error('请先连接 Cavalry 合成');
        session={id:req.id,source:source,sourceUUID:api.get(source,'uuid'),clone:'',queue:'',compValues:{}};var s=session;
        s.clone=api.duplicate(source,true);if(!s.clone||s.clone===source)throw Error('Cannot duplicate composition');s.cloneUUID=api.get(s.clone,'uuid');api.rename(s.clone,'[BridgeNa2_Cavalry Bake]');s.queue=api.addRenderQueueItem(s.clone);s.queueUUID=api.get(s.queue,'uuid');
        s.formats=[];
        ['PNG','JPEG','WebP','SVG','MP4','Quicktime','ProRes','GIF','WebM','APNG','AudioOnly','SpriteSheet','Lottie'].forEach(function(n){var t='render'+n;api.setGenerator(s.queue,'generator',t);if(api.getCurrentGeneratorType(s.queue,'generator')===t)s.formats.push({type:t,label:n==='Quicktime'?'QuickTime':n==='AudioOnly'?'Audio Only':n==='SpriteSheet'?'Sprite Sheet':n});});
        api.setGenerator(s.queue,'generator','renderPNG');
        api.set(s.queue,{filePath:root+'/Bakes',fileName:'BridgeNa2_Cavalry_Bake',frameRangeMode:0,usePlaybackStep:false,ensureUniqueNames:true,upload:false,canvaUpload:false,preRenderExpression:'',postRenderExpression:'',renderSetupExpression:''});
        if(req.transparent===true){var bg=JSON.parse(JSON.stringify(api.get(s.clone,'backgroundColor')));bg.a=0;api.set(s.clone,{backgroundColor:bg});s.compValues.backgroundColor=bg;}
        if(req.previewRange){
            var a=Number(req.previewRange.first),b=Number(req.previewRange.last);
            if(!isFinite(a)||!isFinite(b)||Math.floor(a)!==a||Math.floor(b)!==b||a>b)throw Error('无效的烘焙起止帧');
            a=Math.max(a,Number(api.get(source,'startFrame')));b=Math.min(b,Number(api.get(source,'endFrame')));
            if(a>b)throw Error('烘焙范围与 Cavalry 合成没有交集');
            api.set(s.queue,{frameRangeMode:2,frameRange:{x:a,y:b}});
        }
        schema(req);
    }
    function equal(a,b){
        if(a===b)return true;if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
        var x=Object.keys(a).sort(),y=Object.keys(b).sort();if(x.join('|')!==y.join('|'))return false;
        for(var i=0;i<x.length;i++)if(!equal(a[x[i]],b[x[i]]))return false;return true;
    }
    function apply(req){
        var s=session;if(req.session!==s.id)throw Error('设置窗口已过期，请重新打开');
        if(req.format){if(!s.formats.some(function(f){return f.type===req.format;}))throw Error('Unsupported render format');api.setGenerator(s.queue,'generator',req.format);}
        (req.values||[]).forEach(function(v){
            var id=v.scope==='queue'?s.queue:v.scope==='comp'?s.clone:'';if(!id)throw Error('Invalid setting scope');
            if(!api.hasAttribute(id,v.path))throw Error('参数已变化，请刷新：'+v.path);
            var d=api.getAttributeDefinition(id,v.path);if(d.isAttrReadOnly||d.type==='nodeId'||d.isArray||d.isCompound)throw Error('只读或结构参数：'+v.path);
            var limits=d.numericInfo||{};
            if(typeof v.value==='number'&&(!isFinite(v.value)||(limits.hardMin!==undefined&&v.value<limits.hardMin)||(limits.hardMax!==undefined&&v.value>limits.hardMax)))throw Error('参数超出范围：'+v.path);
            if(d.type==='enum'&&d.enumValues.indexOf(v.value)<0)throw Error('无效下拉值：'+v.path);
            var o={};o[v.path]=v.value;api.set(id,o);
            if(!equal(api.get(id,v.path),v.value))throw Error('Cavalry 未接受参数：'+v.path);
            if(v.scope==='comp')s.compValues[v.path]=v.value;
        });
    }
    function ensure(p){if(api.filePathExists(p))return;var parent=api.getFolderFromPath(p);if(parent&&parent!==p)ensure(parent);if(!api.makeFolder(p))throw Error('Cannot create '+p);}
    function files(dir){return api.listDirectoryRecursive(dir).filter(function(p){return api.isFile(p);});}
    function render(req){
        if(pending)throw Error('已有后台烘焙任务');
        apply(req);var s=session;
        if(typeof req.transparent==='boolean'){
            var bg=JSON.parse(JSON.stringify(api.get(s.source,'backgroundColor')));
            if(req.transparent)bg.a=0;
            s.compValues.backgroundColor=bg;api.set(s.clone,{backgroundColor:bg});
        }
        if(api.get(s.queue,'frameRangeMode')===2){
            var selected=api.get(s.queue,'frameRange');
            if(!selected||!isFinite(selected.x)||!isFinite(selected.y)||Math.floor(selected.x)!==selected.x||Math.floor(selected.y)!==selected.y||selected.x>selected.y)throw Error('烘焙起始帧须小于或等于末尾帧，且为整数');
            var rangeFirst=Math.max(selected.x,Number(api.get(s.source,'startFrame'))),rangeLast=Math.min(selected.y,Number(api.get(s.source,'endFrame')));
            if(rangeFirst>rangeLast)throw Error('烘焙范围与 Cavalry 合成没有交集');
            api.set(s.queue,{frameRange:{x:rangeFirst,y:rangeLast}});
        }
        if(beforeBake)beforeBake();
        if(!api.layerExists(s.source)||api.get(s.source,'uuid')!==s.sourceUUID)throw Error('连接的原合成已改变，请重新打开烘焙设置');
        // Refresh animation content at Bake click while retaining staged render settings.
        var old=s.clone;s.clone=api.duplicate(s.source,true);if(!s.clone||s.clone===s.source)throw Error('Cannot snapshot animation');s.cloneUUID=api.get(s.clone,'uuid');api.rename(s.clone,'[BridgeNa2_Cavalry Bake]');
        api.set(s.clone,s.compValues);api.connect(s.clone,'id',s.queue,'targets.0.id',true);api.deleteLayer(old);
        var base=api.get(s.queue,'filePath')||root+'/Bakes';ensure(base);
        var dir=base+'/Bake-'+req.id;ensure(dir);api.set(s.queue,{filePath:dir});
        var mode=api.get(s.queue,'frameRangeMode'),range=api.get(s.queue,'frameRange');
        var count=mode===3?1:mode===2?range.y-range.x+1:mode===1?api.get(s.clone,'playbackEnd')-api.get(s.clone,'playbackStart')+1:api.get(s.clone,'endFrame')-api.get(s.clone,'startFrame')+1;
        var fps=api.get(s.clone,'fps');if(api.hasAttribute(s.queue,'targets.0.remapFPS')&&api.get(s.queue,'targets.0.remapFPS'))fps=api.get(s.queue,'targets.0.remapToFPS');
        write({id:req.id,phase:'rendering',directory:dir,total:count,fps:fps,format:api.getCurrentGeneratorType(s.queue,'generator'),started:Date.now()});
        var handle=background.submit(s.queue,{kind:'bake',directory:dir});
        pending={handle:handle,req:req,directory:dir,fps:fps,format:api.getCurrentGeneratorType(s.queue,'generator')};
    }
    function poll(){
        if(!pending)return;
        var p=pending,result=background.poll(p.handle);
        if(result.phase==='cancelled')throw Error('后台烘焙已取消；原图层保留');
        if(result.phase!=='complete')return;
        var outputs=files(p.directory);if(!outputs.length)throw Error('Render Manager 没有输出文件；请检查范围、格式和授权');
        write({id:p.req.id,phase:'complete',directory:p.directory,files:outputs,fps:p.fps,format:p.format});
        pending=null;release();
    }
    function pollResult(){
        try{poll();}catch(e){var id=pending?pending.req.id:last;write({id:id,phase:'error',error:String(e)});release();}
    }
    function dispatch(req,source){
        last=req.id;
        try{
            if(req.action==='open')open(req,source);
            else if(req.action==='close'){if(session&&req.session===session.id)release();}
            else if(!session)throw Error('烘焙设置已关闭，请重新打开');
            else if(req.action==='apply'){apply(req);schema(req);}
            else if(req.action==='array'){
                if(req.session!==session.id||req.scope!=='queue'||req.path!=='metadata')throw Error('仅可增删元数据行');
                if(req.remove)api.removeArrayIndex(session.queue,req.path+'.'+req.index);else api.addArrayIndex(session.queue,req.path);schema(req);
            }else if(req.action==='render')render(req);
        }catch(e){write({id:req.id,phase:'error',error:String(e)});}
    }
    function snapshot(){
        if(!session)return null;
        if(pending)throw Error('Cannot snapshot a running bake');
        var s=session;
        return {id:s.id,sourceNodeId:s.source,sourceUUID:s.sourceUUID,format:api.getCurrentGeneratorType(s.queue,'generator'),fields:fields(s.queue,'queue'),formats:s.formats,compValues:s.compValues};
    }
    function restore(saved,source){
        release();if(!saved)return;
        if(!source||(saved.sourceNodeId&&source!==saved.sourceNodeId)||!api.layerExists(source)||api.get(source,'uuid')!==saved.sourceUUID)throw Error('连接的原合成已改变，请重新打开烘焙设置');
        session={id:saved.id,source:source,sourceUUID:saved.sourceUUID,queue:'',clone:'',compValues:saved.compValues,formats:saved.formats};
        var s=session;s.clone=api.duplicate(source,true);s.cloneUUID=api.get(s.clone,'uuid');
        s.queue=api.addRenderQueueItem(s.clone);s.queueUUID=api.get(s.queue,'uuid');
        api.setGenerator(s.queue,'generator',saved.format);
        if(api.getCurrentGeneratorType(s.queue,'generator')!==saved.format)throw Error('无法恢复后台输出格式');
        // Keep values, not serialized render nodes with dangling connections.
        // Reconstruct array structure before restoring its leaf attributes.
        saved.fields.forEach(function(f){
            if(f.type!=='array'||f.readOnly)return;
            var count=api.getArrayCount(s.queue,f.path);
            while(count<f.count){api.addArrayIndex(s.queue,f.path);count++;}
            while(count>f.count){count--;api.removeArrayIndex(s.queue,f.path+'.'+count);}
        });
        apply({session:s.id,values:saved.fields.filter(function(f){return !f.readOnly&&f.type!=='array';}).map(function(f){return {scope:'queue',path:f.path,value:f.value};})});
        api.set(s.clone,s.compValues);
    }
    return {dispatch:dispatch,poll:pollResult,snapshot:snapshot,restore:restore,tick:function(source){
        pollResult();
        var text=read(root+'/bake-request.json');if(!text||text===last)return;
        var req;try{req=JSON.parse(text);}catch(_){return;}if(!req||req.protocol!==1||!/^b[a-zA-Z0-9]+$/.test(req.id))return;last=text;
        dispatch(req,source);last=text;
    },close:release,shutdown:function(){if(pending){background.cancel(pending.handle);pending=null;}session=null;},isRendering:function(){return !!pending;}};
}
