// BridgeNa2_Cavalry 4.6.4 — one installed runtime.
// A duplicated Cavalry composition can retain its parent's uuid attribute.
// A source is the exact node in the selected scene, never the first UUID match.
function bridgeSceneKey(path){
    var p=String(path||'').replace(/\\/g,'/');
    return /^[a-z]:\//i.test(p)||p.indexOf('//')===0?p.toLowerCase():p;
}
function bridgeSource(api,identity){
    var comps=api.getComps(),matches=[];
    if(!identity||typeof identity.uuid!=='string'||!identity.uuid)throw Error('合成绑定无效，请重新选择合成。');
    for(var i=0;i<comps.length;i++){
        if(identity.nodeId&&comps[i]!==identity.nodeId)continue;
        if(api.get(comps[i],'uuid')===identity.uuid)matches.push(comps[i]);
    }
    if(matches.length===1)return matches[0];
    if(matches.length>1){var error=Error('多个 Cavalry 合成使用相同 UUID，旧绑定无法区分。请在 AE 重新选择合成。');error.ambiguousSource=true;throw error;}
    throw Error('所选 Cavalry 合成不在当前工程中，请打开原工程或重新选择合成。');
}

// Executed only in the launcher's private Cavalry profile. No editor code runs here.
function runRendererHost(api,ui,role){
    var root=String(role.root).replace(/\\/g,'/').replace(/\/+$/,''),last=role.ignoreJobId||'',busy=false,job=null,closed=false,beat=0,bake=null,bakeStates={};
    function pathKey(p){return bridgeSceneKey(p).replace(/\/+$/,'');}
    function replyRoot(req){
        var path=pathKey(req.responseRoot||root),base=pathKey(root),prefix=base+'/channels/';
        if(path===base)return root;
        if(path.indexOf(prefix)===0&&/^[1-9][0-9]{0,9}$/.test(path.slice(prefix.length)))return root+'/channels/'+path.slice(prefix.length);
        throw Error('Invalid channel response path');
    }
    function read(p){try{if(!api.filePathExists(p))return null;return JSON.parse(api.readFromFile(p));}catch(_){return null;}}
    function write(p,x){if(!api.writeToFile(p,JSON.stringify(x),true))throw Error('Cannot write renderer result');}
    function status(phase,extra){var out={session:role.session,id:job?job.id:last,phase:phase,stamp:Date.now()};if(job&&job.source){out.sourceNodeId=job.source;out.sourceUUID=job.sourceUUID;out.sourceName=job.sourceName;}if(extra)for(var k in extra)out[k]=extra[k];write(root+'/renderer-result.json',out);}
    function cancelled(){var c=read(root+'/renderer-cancel.json'),next=read(root+'/renderer-job.json');return (c&&job&&c.id===job.id)||(next&&job&&next.id!==job.id);}
    function file(frame){return job.directory+'/frame.'+(frame<0?'-':'')+('000000'+Math.abs(frame)).slice(frame<0?-5:-6)+'.png';}
    function load(req){
        if(!/^[a-zA-Z0-9-]+$/.test(req.id)||pathKey(req.scene)!==pathKey(root+'/requests/'+req.id+'.cv'))throw Error('Invalid renderer request');
        var previous=read(root+'/renderer-result.json');
        if(bake)bake.close();
        job=req;job.done=0;job.sizes=[];job.batch=2;job.started=Date.now();job.renderMs=0;job.batches=0;job.firstFrameMs=0;
        if((req.kind==='bake'||req.kind==='bake-control')&&previous&&previous.id===req.id&&previous.phase==='complete'){status('complete');job=null;return;}
        if(req.kind==='preview'&&previous&&previous.id===req.id&&previous.sizes&&previous.done>=0&&previous.done<=req.count&&previous.done===previous.sizes.length){job.done=previous.done;job.sizes=previous.sizes;}
        // Acknowledge before any API that may enter a modal event loop.
        job.loading=true;job.loadedAt=Date.now();status('loading',{done:job.done,total:job.count||0,sizes:job.sizes});
        if(req.project)api.setProject(req.project);else if(req.project==='')api.clearProject();
        api.openScene(req.scene,true);
    }
    function loaded(){
        var req=job,queue='',source='';
        if(pathKey(api.getSceneFilePath())===pathKey(req.scene)){
            if(req.protocol===3||req.protocol===2){
                if(req.protocol===3&&(!req.sourceNodeId||typeof req.sourceNodeId!=='string'))throw Error('后台请求缺少合成节点 ID，请更新两端并重新选择合成。');
                try{source=bridgeSource(api,{uuid:req.sourceUUID,nodeId:req.protocol===3?req.sourceNodeId:undefined});}catch(e){if(e.ambiguousSource||Date.now()-req.loadedAt>45000)throw e;return false;}
                job.source=source;job.sourceName=api.getNiceName(source);
            }else{
                // Accept a queued 4.5.1 request during an upgrade.
                var queues=api.getRenderQueueItems();
                for(var qi=0;qi<queues.length;qi++)if(api.get(queues[qi],'uuid')===req.queueUUID){if(queue)throw Error('旧后台队列 UUID 不唯一，请重新连接。');queue=queues[qi];}
            }
        }
        if(!queue&&!source){
            if(Date.now()-req.loadedAt>45000)throw Error('后台未能打开快照，请检查 Cavalry 的启动/授权状态。旧动画已保留。');
            // openScene can load assets asynchronously. Reopening every two
            // seconds races an in-flight load on large projects. Wait for this
            // one load; explicit reconnect retries after an authentication error.
            return false;
        }
        if(req.kind==='bake-control'){
            var responseRoot=replyRoot(req);
            bake=createBakeBridge(api,responseRoot,{submit:function(q){api.render(q);return {};},poll:function(){return {phase:cancelled()?'cancelled':'complete'};},cancel:function(){}});
            var br=req.bakeRequest;
            if(!br||br.protocol!==1||!/^b[a-zA-Z0-9]+$/.test(br.id))throw Error('Invalid bake request');
            if(br.action!=='open'){
                var saved=bakeStates[responseRoot];if(!saved||saved.id!==br.session)throw Error('后台烘焙设置已过期，请重新打开');
                bake.restore(saved,source);
            }
            status('rendering',{kind:'bake-control'});
            bake.dispatch(br,source);bake.poll();
            bakeStates[responseRoot]=bake.snapshot();bake.close();
            status('complete');job=null;return false;
        }
        if(source){
            // This scene is already an isolated copy. All preview mutations
            // happen here, never in the editing application's undo history.
            if(req.transparent){var bg=JSON.parse(JSON.stringify(api.get(source,'backgroundColor')));bg.a=0;api.set(source,{backgroundColor:bg});}
            queue=api.addRenderQueueItem(source);api.setGenerator(queue,'generator','renderPNG');
            if(api.getCurrentGeneratorType(queue,'generator')!=='renderPNG')throw Error('当前 Cavalry 不支持 PNG 渲染');
            api.set(queue,{filePath:req.directory,fileName:'frame',padding:6,frameRangeMode:2,resolutionScale:req.scale,ensureUniqueNames:false,usePlaybackStep:false,respectViewportFiltering:true,dynamicRender:false,upload:false,canvaUpload:false,enableMetadata:false,preRenderExpression:'',postRenderExpression:'',renderSetupExpression:'','targets.0.retimeRender':false,'generator.compression':1,'generator.pngFilter':0});
        }else if(req.directory)api.set(queue,{filePath:req.directory});
        job.queue=queue;job.loading=false;job.loadMs=Date.now()-job.loadedAt;
        if(job.kind==='preview'&&job.done===job.count){status('complete',{done:job.done,total:job.count,sizes:job.sizes});job=null;return false;}
        status('rendering',{done:job.done,total:job.count||0,sizes:job.sizes});return true;
    }
    function render(){
        var j=job;
        if(j.kind==='bake'){
            status('rendering',{kind:'bake'});
            api.render(j.queue);
            if(cancelled()){status('cancelled');job=null;return;}
            status('complete');job=null;return;
        }
        // Keep the first response small. Large scenes pay substantial setup cost
        // for every api.render call; retain a short continuous run instead of
        // falling back to one-frame renders. Extremely slow frames stay bounded.
        var end=Math.min(j.count,j.done+(j.done===0?2:j.batch)),first=j.first+j.done,lastFrame=j.first+end-1,started=Date.now();
        var name=end-j.done===1?'frame.'+(first<0?'-':'')+('000000'+Math.abs(first)).slice(first<0?-5:-6):'frame';
        api.set(j.queue,{fileName:name,frameRangeMode:2,frameRange:{x:first,y:lastFrame}});
        api.render(j.queue);
        if(cancelled()){status('cancelled');job=null;return;}
        for(var i=j.done;i<end;i++){
            var path=file(j.first+i);if(!api.filePathExists(path))throw Error('Missing rendered frame '+(j.first+i));
            var bytes=Math.round(api.getFileSize(path)*1024);if(bytes<45)throw Error('Incomplete PNG');j.sizes.push(String(bytes));
        }
        var elapsed=Math.max(1,Date.now()-started),frames=end-j.done;
        var perFrame=elapsed/frames;
        // At most ~6 seconds of predicted work for slow scenes. This is a
        // throughput/refresh tradeoff; editing remains in the other process.
        var floor=Math.max(1,Math.min(4,Math.floor(6000/perFrame)));
        j.batch=Math.max(floor,Math.min(64,Math.round(frames*600/elapsed),Math.max(16,j.batch*2)));
        j.renderMs+=elapsed;j.batches++;
        if(!j.firstFrameMs)j.firstFrameMs=Date.now()-j.started;
        j.done=end;status(end===j.count?'complete':'rendering',{done:end,total:j.count,sizes:j.sizes,batchMs:elapsed,elapsedMs:Date.now()-j.started,loadMs:j.loadMs,renderMs:j.renderMs,firstFrameMs:j.firstFrameMs,batches:j.batches,renderFps:1000*end/Math.max(1,j.renderMs)});
        if(end===j.count)job=null;
    }
    function tick(){
        if(closed||busy)return;
        busy=true;
        try{
            if(Date.now()-beat>500){write(root+'/renderer-heartbeat.json',{session:role.session,stamp:Date.now(),preferences:api.getPreferencesFolder()});beat=Date.now();}
            var req=read(root+'/renderer-job.json');
            if(req&&req.id!==last){last=req.id;var cancellation=read(root+'/renderer-cancel.json');if(!cancellation||cancellation.id!==req.id)load(req);}
            if(job){if(cancelled()){status('cancelled');job=null;}else if(!job.loading||loaded())render();}
        }catch(e){if(job&&job.kind==='bake-control'&&job.bakeRequest){try{write(replyRoot(job)+'/bake-response.json',{id:job.bakeRequest.id,phase:'error',error:String(e)});}catch(_){}}status('error',{error:String(e)});job=null;}
        finally{busy=false;}
    }
    var expected=role.profile.replace(/\\/g,'/').toLowerCase()+'/',actual=api.getPreferencesFolder().replace(/\\/g,'/').toLowerCase()+'/';
    var isolated=role.preferences?pathKey(api.getPreferencesFolder())===pathKey(role.preferences)&&pathKey(api.getAppDataFolder())===pathKey(role.appData):actual.indexOf(expected)===0;
    if(!isolated){write(root+'/renderer-heartbeat.json',{session:role.session,stamp:Date.now(),error:'Cavalry did not use an isolated preference profile. Foreground rendering is disabled.'});return;}
    ui.setTitle('BridgeNa2_Cavalry Renderer');ui.setCallbacksActive(true);
    var timer=new api.Timer({onTimeout:tick});timer.setRepeating(true);timer.setInterval(10);timer.start();
    ui.onClose=function(){closed=true;timer.stop();};tick();
}

// Stable edit fingerprint: never changes time, active composition or the scene.
function editFingerprint(api, comp, assetRevision) {
    var data=JSON.parse(api.serialise([comp],true)),byId={},masked={};
    var nodes=data.nodes||[],connections=data.connections||[];
    for(var i=0;i<nodes.length;i++)byId[nodes[i].nodeId]=nodes[i];
    for(i=0;i<connections.length;i++){
        var s=connections[i].to,cut=s.indexOf('.');
        if(cut<0)continue;
        var id=s.substring(0,cut),parts=s.substring(cut+1).split('.'),root=parts.shift(),key=id+'.'+root;
        if(!masked[key])masked[key]={id:id,root:root,paths:[]};
        masked[key].paths.push(parts);
    }
    var components={};
    function erase(value,parts){
        if(!parts.length)return undefined;
        if(value===null||typeof value!=='object')return value;
        var field=parts[0];
        if(parts.length===1)delete value[field];
        else if(value[field]!==undefined)value[field]=erase(value[field],parts.slice(1));
        return value;
    }
    for(var key in masked)if(Object.prototype.hasOwnProperty.call(masked,key)){
        var m=masked[key],node=byId[m.id];if(!node)continue;
        var all=false;
        for(i=0;i<m.paths.length;i++)if(!m.paths[i].length)all=true;
        // Reading a compound fills default unconnected components even when
        // serialisation omits the whole attribute at a default-valued frame.
        if(!all){
            var value=api.get(m.id,m.root);
            if(value!==null&&typeof value==='object'){
                value=JSON.parse(JSON.stringify(value));
                for(i=0;i<m.paths.length;i++)value=erase(value,m.paths[i]);
                components[key]=value;
            }
        }
        if(node.attributes)delete node.attributes[m.root];
    }
    var ids={};
    for(i=0;i<nodes.length;i++){
        var n=nodes[i];ids[n.nodeId]=true;
        var attrs=n.attributes||{};
        delete attrs.selected;
        if(n.nodeType==='compNode'){delete attrs.time;delete attrs.uiTime;delete attrs.inTime;delete attrs.playbackStart;delete attrs.playbackEnd;delete attrs.activeAnimationLayer;}
        for(var a in attrs)if(/^out[A-Z]|^out$/.test(a))delete attrs[a];
    }
    nodes.sort(function(a,b){return a.nodeId<b.nodeId?-1:a.nodeId>b.nodeId?1:0;});
    connections.sort(function(a,b){var x=a.from+'>'+a.to,y=b.from+'>'+b.to;return x<y?-1:x>y?1:0;});
    var meta=(data.nodeMeta||[]).filter(function(n){return !!ids[n.nodeId];});
    meta.sort(function(a,b){return a.nodeId<b.nodeId?-1:a.nodeId>b.nodeId?1:0;});
    function stable(x){
        if(x===null||typeof x!=='object')return JSON.stringify(x);
        if(Array.isArray(x))return '['+x.map(stable).join(',')+']';
        var keys=Object.keys(x).sort(),pairs=[];
        for(var k=0;k<keys.length;k++)pairs.push(JSON.stringify(keys[k])+':'+stable(x[keys[k]]));
        return '{'+pairs.join(',')+'}';
    }
    return stable({nodes:nodes,connections:connections,meta:meta,components:components,assets:assetRevision||0});
}

// The editing process exports immutable snapshots; it never calls api.render.
function createBackgroundRenderer(api,root){
    var serial=0,active=null,lastDemand=0,prepared=false,inspectionDemandUntil=0;
    function ensure(p){if(api.filePathExists(p))return;var parent=api.getFolderFromPath(p);if(parent&&parent!==p)ensure(parent);if(!api.makeFolder(p))throw Error('Cannot create '+p);}
    function write(p,x){if(!api.writeToFile(p,JSON.stringify(x),true))throw Error('Cannot write '+p);}
    function read(p){try{if(!api.filePathExists(p))return null;return JSON.parse(api.readFromFile(p));}catch(_){return null;}}
    function demand(){if(Date.now()-lastDemand<500)return;lastDemand=Date.now();api.writeToFile(root+'/renderer-demand.txt',String(Date.now()),true);}
    function submit(source,options){
        ensure(root+'/requests');
        var id='job-'+String(api.uuid()).replace(/[^a-zA-Z0-9]/g,'')+'-'+(++serial),scene=root+'/requests/'+id+'.cv';
        var snapshotStarted=Date.now(),beforeFile=api.getSceneFilePath(),beforeDirty=api.sceneHasUnsavedChanges();
        if(!api.exportSceneAs(scene))throw Error('无法导出后台渲染快照，请确认 Cavalry 已完成登录/授权并可正常导出；旧动画已保留');
        if(api.getSceneFilePath()!==beforeFile||api.sceneHasUnsavedChanges()!==beforeDirty)throw Error('Cavalry 快照导出改变了工程状态，已停止同步');
        var snapshotMs=Date.now()-snapshotStarted;
        var config={root:root,preferences:api.getPreferencesFolder(),appData:api.getAppDataFolder(),assets:api.getAppAssetsPath(),script:api.getAppDataFolder()+'/Scripts/Cavalry AE Native.js'};
        write(root+'/renderer-config.json',config);
        var req={protocol:3,id:id,scene:scene,sourceNodeId:source,sourceUUID:api.get(source,'uuid'),project:api.getProjectPath(),kind:options.kind,snapshotMs:snapshotMs};
        for(var k in options)req[k]=options[k];
        write(root+'/renderer-job.json',req);prepared=true;active={id:id,snapshotMs:snapshotMs,prepareMs:options.prepareMs,fingerprintMs:options.fingerprintMs,started:Date.now(),lastProgress:Date.now(),done:-1};demand();return active;
    }
    function poll(handle){
        demand();if(handle.cached&&Date.now()-handle.polledAt<100)return handle.cached;handle.polledAt=Date.now();var health=read(root+'/renderer-health.json');
        if(health&&health.phase==='error'&&health.stamp>=handle.started)throw Error('后台渲染器：'+health.error);
        var result=read(root+'/renderer-result.json');
        if(result&&result.id===handle.id){
            if(result.phase==='error')throw Error(result.error);
            // Receiving a loading acknowledgement is not successful startup.
            // Modal login dialogs can keep a process alive indefinitely.
            if((result.phase==='loading'||result.phase==='starting')&&Date.now()-handle.started>60000)throw Error('后台未能加载动画，可能正在等待 Cavalry 登录/授权。请点“检查后台 / 登录”，处理提示后重新连接；旧动画已保留。');
            if(result.done!==handle.done){handle.done=result.done;handle.lastProgress=Date.now();}
            if(result.phase==='complete'||result.phase==='cancelled'){
                if(active===handle)active=null;
                if(result.phase==='complete'&&!handle.reported){
                    handle.reported=true;
                    // Diagnostics only: reporting must never break completed work.
                    try{write(root+'/performance.json',{id:handle.id,snapshotMs:handle.snapshotMs,prepareMs:handle.prepareMs,fingerprintMs:handle.fingerprintMs,loadMs:result.loadMs,renderMs:result.renderMs,firstFrameMs:result.firstFrameMs,elapsedMs:Date.now()-handle.started,frames:result.done,batches:result.batches,renderFps:result.renderFps,stamp:Date.now()});}catch(_){}
                }
            }
            handle.cached=result;return result;
        }
        // A supervisor's ready flag never proves that this request was accepted.
        // In 4.3 a dead child's cached NSRunningApplication kept ready true forever.
        if(Date.now()-handle.started>45000)throw Error('后台未响应当前任务。请点“检查后台 / 登录”，确认后台 Cavalry 已就绪后重新连接；旧动画已保留。');
        return {phase:'starting',done:0};
    }
    return {submit:submit,poll:poll,keepAlive:function(connected){if((connected!==false&&prepared)||Date.now()<inspectionDemandUntil)demand();},inspect:function(){inspectionDemandUntil=Date.now()+30000;ensure(root);write(root+'/renderer-show.json',{id:String(api.uuid()),stamp:Date.now()});lastDemand=0;demand();},cancel:function(h){if(h)write(root+'/renderer-cancel.json',{id:h.id});if(active===h)active=null;}};
}

// All channels share one isolated renderer. FIFO dispatch prevents one layer
// from overwriting another layer's in-flight request or starving its update.
function createRenderScheduler(api,root){
    var backend=createBackgroundRenderer(api,root),waiting=[],active=null,serial=0,aliveUntil=0;
    function now(){return Date.now();}
    function tick(){
        if(active){
            try{active.result=backend.poll(active.native);}catch(e){active.result={phase:'error',error:String(e)};}
            if(/^(complete|cancelled|error)$/.test(active.result.phase))active=null;
        }
        if(!active){
            while(waiting.length&&waiting[0].cancelled)waiting.shift();
            if(waiting.length){
                active=waiting.shift();
                try{
                    if(!api.layerExists(active.source)||api.get(active.source,'uuid')!==active.uuid)throw Error('排队的合成已改变，请重新连接');
                    active.native=backend.submit(active.source,active.options);active.result={phase:'starting',done:0};
                }catch(e){active.result={phase:'error',error:String(e)};active=null;}
            }
        }
        backend.keepAlive(!!active||waiting.length>0||now()<aliveUntil);
    }
    function channel(path){return {
        submit:function(source,options){
            var copy={};for(var k in options)copy[k]=options[k];copy.responseRoot=path;
            var h={id:'queued-'+(++serial),source:source,uuid:api.get(source,'uuid'),options:copy,result:{phase:'queued',done:0}};
            waiting.push(h);return h;
        },
        poll:function(h){if(h.cancelled)return {phase:'cancelled'};if(h.result.phase==='error')throw Error(h.result.error);return h.result;},
        cancel:function(h){if(!h||h.cancelled)return;h.cancelled=true;if(active===h&&h.native)backend.cancel(h.native);else h.result={phase:'cancelled'};},
        keepAlive:function(connected){if(connected)aliveUntil=now()+1500;},
        inspect:backend.inspect
    };}
    return {tick:tick,channel:channel,inspect:backend.inspect,shutdown:function(){waiting.forEach(function(h){h.cancelled=true;});waiting=[];if(active&&active.native)backend.cancel(active.native);active=null;}};
}

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

// Editing process: only read scene data and pass immutable requests to the
// isolated renderer. Never create a render item in the user's undo history.
function createBakeProxy(api,root,background,beforeBake){
    var last='',session=null,pending=null;
    function write(o){if(!api.writeToFile(root+'/bake-response.json',JSON.stringify(o),true))throw Error('Cannot write bake response');}
    function read(path){try{return api.filePathExists(path)?api.readFromFile(path):'';}catch(_){return '';}}
    function response(){try{return JSON.parse(read(root+'/bake-response.json'));}catch(_){return null;}}
    function close(){var old=pending;pending=null;session=null;if(old)background.cancel(old.handle);}
    function fail(id,e){write({id:id,phase:'error',error:String(e)});}
    last=read(root+'/bake-request.json'); // Never replay a previous session's bake on startup.
    // A newly selected channel may be discovered just after the settings
    // window sent its first open request. Accept that recent open, never a
    // render/apply request from an earlier session.
    try{var initial=JSON.parse(last);if(initial.action==='open'&&typeof initial.stamp==='number'&&Math.abs(Date.now()-initial.stamp)<10000)last='';}catch(_){}
    return {tick:function(source){
        if(pending){
            try{
                var result=background.poll(pending.handle);
                if(result.phase==='cancelled')throw Error('后台烘焙操作已取消；原图层保留');
                var reply=response();
                if(reply&&reply.id===pending.req.id&&(reply.phase==='settings'||reply.phase==='complete'||reply.phase==='error'))pending=null;
                else if(result.phase==='complete'){
                    if(!pending.finishedAt)pending.finishedAt=Date.now();
                    if(Date.now()-pending.finishedAt>3000)throw Error('后台未返回烘焙结果，请重新打开烘焙设置');
                }
            }catch(e){var failed=pending;pending=null;fail(failed?failed.req.id:'',e);}
        }
        // Staged Render Manager settings live in this renderer session. Keep
        // it alive while the panel is open, including when AE preview is paused.
        if(session&&background.keepAlive)background.keepAlive(true);
        var text=read(root+'/bake-request.json');if(!text||text===last)return;
        var req;try{req=JSON.parse(text);}catch(_){return;}
        if(!req||req.protocol!==1||!/^b[a-zA-Z0-9]+$/.test(req.id))return;last=text;
        try{
            if(req.action==='close'){if(session&&req.session===session.id)close();return;}
            if(req.action==='open'){
                close();if(typeof source==='function')source=source();if(!source||!api.layerExists(source))throw Error('请先连接 Cavalry 合成');
                session={id:req.id,source:source,uuid:api.get(source,'uuid')};
            }else if(!session||req.session!==session.id)throw Error('设置窗口已过期，请重新打开');
            if(!api.layerExists(session.source)||api.get(session.source,'uuid')!==session.uuid)throw Error('连接的原合成已改变，请重新打开烘焙设置');
            if(pending)throw Error('正在处理上一条烘焙操作，请稍候');
            if(beforeBake)beforeBake();
            write({id:req.id,phase:'loading'});
            pending={req:req,handle:background.submit(session.source,{kind:'bake-control',bakeRequest:req})};
        }catch(e){fail(req.id,e);}
    },close:close,shutdown:close,isRendering:function(){return !!pending;}};
}

// One isolated preview stream. The editor API remains read-only.
function createPreviewChannel(api,root,background,owner,isOwner){
    var MAGIC='CAVALRY_NATIVE_4',generationOwner=owner+String(api.uuid()).replace(/[^a-zA-Z0-9]/g,'');
    function sourceError(message){var e=Error(message);e.sourceUnavailable=true;return e;}
    function resolveComp(){
        var text=read(root+'/binding.json');
        if(!text){if(/\/channels\/[0-9]+$/.test(root))throw sourceError('合成绑定不存在，请在 AE 点击 Connect / Resync 重新选择合成');return api.getActiveComp();} // legacy channel 0 only
        var binding;try{binding=JSON.parse(text);}catch(_){throw sourceError('合成绑定文件不完整，请在 AE 重新选择合成');}
        if(binding.protocol===2){
            if(!binding.nodeId)throw sourceError('合成节点绑定缺失，请在 AE 重新选择合成。');
            if(binding.scene?bridgeSceneKey(binding.scene)!==bridgeSceneKey(api.getSceneFilePath()):binding.owner!==owner)
                throw sourceError('当前 Cavalry 工程与绑定工程不同，请打开原工程或重新选择合成。');
        }
        try{return bridgeSource(api,binding);}catch(e){throw sourceError(String(e));}
    }
    var request='',enabled=false,busy=false,comp='',compUUID='';
    var job=null,revision=0,signature='',publishedSignature='',assetRevision=0,dirty=true,lastCheck=0,lastEdit=Date.now(),beatAt=0,lastUserFrame=0;
    var lastLabel='',lastRetire=0,lastIO=0,probeInterval=150,fingerprintMs=0;
    var scale=50,lastCommand='',error='',phase='paused',stopped=false,requestedRange=null,transparentBackground=false,awaitingSource=false,lastSourceProbe=0;
    function now(){return Date.now();}
    function ensure(path){if(api.filePathExists(path))return;var parent=api.getFolderFromPath(path);if(parent&&parent!==path)ensure(parent);if(!api.makeFolder(path))throw new Error('无法创建缓存目录：'+path);}
    function write(path,text){if(!api.writeToFile(path,text,true))throw new Error('无法写入：'+path);}
    function read(path){try{if(!api.filePathExists(path))return '';return api.readFromFile(path).replace(/^\uFEFF/,'').replace(/\r/g,'');}catch(_){return '';}}
    function own(){return isOwner();}
    function status(){
        if(!own())return;
        var name=comp&&api.layerExists(comp)?api.getNiceName(comp):'';
        write(root+'/state.txt',[MAGIC,owner,request,String(now()),phase,job?String(job.index):'0',job?String(job.count):'0',encodeURIComponent(error),encodeURIComponent(name),job?String(job.scale):'0','END',''].join('\n'));
        beatAt=now();
    }
    function discard(){
        // AE may still reference any published chunk. Keep immutable files,
        // including on cancellation; only revoke the stream publication.
        releaseJob();
        if(own())write(root+'/preview.txt',[MAGIC,'IDLE',request,'END',''].join('\n'));
    }
    function releaseJob(completed){
        var j=job;job=null;if(!j)return;
        if(j.handle&&!completed)background.cancel(j.handle);
    }
    function change(layer,attr){
        if(stopped||busy||!enabled)return;
        if(attr==='time'||attr==='uiTime'||attr==='selected'||attr==='activeAnimationLayer')return;
        dirty=true;
    }
    function detect(){
        if(!comp||!api.layerExists(comp)||api.get(comp,'uuid')!==compUUID)throw sourceError('连接的合成已关闭。打开原工程后自动恢复，或在 AE 重新选择合成。');
        var probeStarted=now(),next=editFingerprint(api,comp,assetRevision);
        fingerprintMs=now()-probeStarted;probeInterval=Math.max(150,Math.min(1000,fingerprintMs*4));
        lastCheck=now();dirty=false;
        if(next!==signature){signature=next;lastEdit=now();if(job)discard();}
    }
    function command(){
        var text=read(root+'/control.txt');if(!text||text===lastCommand)return;
        var a=text.split('\n');if((a.length!==8&&a.length!==11&&a.length!==12)||a[0]!==MAGIC||a[a.length-2]!=='END'||a[a.length-1]!=='')return;
        if(a.length>=11&&(!/^[01]$/.test(a[6])||!/^[-]?\d+$/.test(a[7])||!/^[-]?\d+$/.test(a[8])))return;
        if(!/^[A-Za-z0-9]+$/.test(a[1])||!/^\d+$/.test(a[4]))return;
        lastCommand=text;request=a[1];
        transparentBackground=a.length===12&&a[9]==='1';
        if(a.length===12&&!/^[01]$/.test(a[9]))return;
        requestedRange=a.length>=11&&a[6]==='1'?{first:Number(a[7]),last:Number(a[8])}:null;
        if(requestedRange&&(requestedRange.first>requestedRange.last||requestedRange.first< -1000000||requestedRange.last>1000000))throw Error('起始帧须小于或等于末尾帧，范围需在 ±1000000 内。');
        if(a[2]==='pause'){enabled=false;awaitingSource=false;discard();phase='paused';error='';status();return;}
        if(a[2]!=='connect')return;
        discard();awaitingSource=false;scale=Number(a[3])===100?100:Number(a[3])===25?25:50;activate();
    }
    function activate(){
        lastSourceProbe=now();comp=resolveComp();
        if(!comp||!api.layerExists(comp))throw sourceError('所选 Cavalry 合成不存在，请重新选择合成。');
        compUUID=api.get(comp,'uuid');
        awaitingSource=false;enabled=true;dirty=true;signature='';publishedSignature='';error='';phase='waiting';lastEdit=now();lastUserFrame=0;
        status();
    }
    function begin(){
        var first=Number(api.get(comp,'startFrame')),last=Number(api.get(comp,'endFrame')),fps=Number(api.get(comp,'fps')),size=api.get(comp,'resolution');
        if(requestedRange){first=Math.max(first,requestedRange.first);last=Math.min(last,requestedRange.last);}
        var count=last-first+1;
        if(count<1)throw Error('所选起止帧与 Cavalry 合成范围没有交集。');
        if(!isFinite(first)||!isFinite(last)||Math.floor(first)!==first||Math.floor(last)!==last||count<1||count>100000||!isFinite(fps)||fps<=0||fps>99)throw new Error('合成帧范围或帧率不受支持。');
        var gen='gen-'+generationOwner+'-'+(++revision),dir=root+'/'+gen;ensure(dir);
        // Never create/delete even temporary nodes in the editing scene: those
        // API calls can invalidate Cavalry's undo and redo history.
        job={gen:gen,dir:dir,first:first,count:count,index:0,fps:fps,width:size.x,height:size.y,scale:scale,sig:signature,sizes:[],chunks:[],chunkStart:0,chunkEnd:Math.min(2,count),published:0,started:now(),batch:2};
        phase='rendering';status();
    }
    function unchanged(){
        // Share the edit probe with tick and publication. Large scenes should
        // not be serialised three times for the same completed batch.
        if(dirty){if(now()-lastCheck<probeInterval)return false;detect();}
        else if(now()-lastCheck>=Math.max(1500,probeInterval))detect();
        if(!job){phase='waiting';return false;}return signature===job.sig;
    }
    function fields(j,prefix){return [MAGIC,j.gen,String(j.count),String(j.width),String(j.height),String(j.fps),String(j.first),String(j.scale),String(now()),encodeURIComponent(api.getNiceName(comp)),request,String(prefix),'DOT','END',''];}
    function publishChunk(){
        if(!unchanged())return;
        var j=job;
        // Frame files never change once published. Native AE reads them directly.
        write(j.dir+'/ready-'+j.index+'.txt',j.sizes.join('\n')+'\nEND\n');
        j.published=j.index;
        write(root+'/preview.txt',fields(j,j.index).join('\n'));
        if(j.index===j.count){finish();return;}
        j.chunkStart=j.index;j.chunkEnd=Math.min(j.count,j.index+j.batch);status();
    }
    function finish(){
        var j=job;
        write(root+'/complete.txt',fields(j,j.count).join('\n'));
        publishedSignature=signature;releaseJob(true);phase='ready';status();
    }
    function renderBatch(){
        var j=job;
        if(!j.handle){
            j.handle=background.submit(comp,{kind:'preview',directory:j.dir,first:j.first,count:j.count,scale:j.scale,transparent:transparentBackground,prepareMs:now()-j.started,fingerprintMs:fingerprintMs});
        }
        var result=background.poll(j.handle);
        if(result.phase==='cancelled'){discard();lastEdit=now();phase='waiting';return;}
        if(result.phase==='queued'){phase='queued';return;}
        if(result.phase==='starting'){phase='starting';return;}
        if(result.phase==='loading'){phase='loading';return;}
        if(result.renderFps)j.renderFps=result.renderFps;
        if(result.done>j.index){
            if(!result.sizes||result.done>j.count||result.sizes.length!==result.done)throw Error('后台缓存清单不完整');
            j.index=result.done;j.sizes=result.sizes;
        }
        // A throttled edit probe can defer publication even after rendering
        // finishes. Retry the pending prefix without requiring more frames.
        if(job&&j.index>j.published)publishChunk();
    }
    function tick(){
        if(stopped||busy)return;
        try{
            if(now()-lastIO>=100){
                lastIO=now();
                if(!own()){shutdown();return;}
                command();
                if(awaitingSource&&now()-lastSourceProbe>=1000)activate();
                // Resolve a source only when a bake request actually needs it.
                // A missing preview binding must not block error replies or pause.
                if(typeof bakeBridge!=='undefined'){busy=true;try{bakeBridge.tick(resolveComp);}finally{busy=false;}}
            }
            if(background.keepAlive)background.keepAlive(enabled);
            if(enabled&&(!bakeBridge||!bakeBridge.isRendering())){
                if(!comp)comp=resolveComp();
                if(comp){
                if(dirty&&now()-lastCheck>=probeInterval)detect();
                if(now()-lastEdit<450){phase='waiting';}
                else if(signature!==publishedSignature){if(!job)begin();phase='rendering';renderBatch();}
                else phase='ready';
                }else phase='awaitingScene';
            }
            if(bakeBridge&&bakeBridge.isRendering())phase='baking';
            if(now()-beatAt>=350)status();
        }catch(e){enabled=false;discard();awaitingSource=!!e.sourceUnavailable;if(awaitingSource){comp='';lastSourceProbe=now();}phase=awaitingSource?'missingSource':'error';error=String(e);try{write(root+'/last-error.txt',new Date().toISOString()+'\n'+error);status();}catch(_){} }
    }
    function assetChanged(){if(enabled&&!busy){assetRevision++;dirty=true;}}
    var callbacks={onAttrChanged:change,onLayerAdded:change,onLayerRemoved:change,onAttrConnected:change,onAttrDisconnected:change,onAssetAdded:assetChanged,onAssetRemoved:assetChanged,onAssetUpdated:assetChanged,onAssetAsyncLoadFinished:assetChanged,
        onAppStateChanged:function(){if(enabled)dirty=true;},
        onSceneChanged:function(){if(stopped)return;if(bakeBridge)bakeBridge.close();var reconnect=enabled||awaitingSource;enabled=false;discard();comp='';awaitingSource=reconnect;lastSourceProbe=now();phase=reconnect?'missingSource':'paused';error=reconnect?'正在等待所选 Cavalry 合成，打开原工程后自动恢复。':'';try{status();}catch(_){} }
    };
    ensure(root);
    var bakeBridge=typeof createBakeProxy==='function'?createBakeProxy(api,root,background,function(){discard();dirty=true;}):undefined;
    function shutdown(offline){
        stopped=true;enabled=false;awaitingSource=false;busy=true;phase=offline===false?'paused':'offline';
        try{if(own()){
            write(root+'/state.txt',[MAGIC,owner,request,String(now()),phase,'0','0','','','0','END',''].join('\n'));
            write(root+'/preview.txt',[MAGIC,'IDLE',request,'END',''].join('\n'));
        }}catch(_){}
        try{if(job&&job.handle)background.cancel(job.handle);}catch(_){}job=null;
        try{if(bakeBridge)bakeBridge.shutdown();}catch(_){}
    }
    status();
    return {tick:tick,callbacks:callbacks,shutdown:shutdown,phase:function(){return phase;},enabled:function(){return enabled;}};
}

(function(){
    var rolePath=api.getPreferencesFolder()+'/BridgeNa2-renderer.json';
    if(api.filePathExists(rolePath)){runRendererHost(api,ui,JSON.parse(api.readFromFile(rolePath)));return;}
    var root=api.getHomeFolder()+'/Cavalry AE Native/default',owner=String(api.uuid()).replace(/[^a-zA-Z0-9]/g,''),channels={},stopped=false,busy=false,lastIO=0,lastCatalog=0,lastLabel='',catalogDirty=true;
    function read(p){try{return api.filePathExists(p)?api.readFromFile(p).replace(/^\uFEFF/,'').replace(/\r/g,''):'';}catch(_){return '';}}
    function ensure(p){if(api.filePathExists(p))return;var parent=api.getFolderFromPath(p);if(parent&&parent!==p)ensure(parent);if(!api.makeFolder(p))throw Error('Cannot create '+p);}
    function write(p,s){if(!api.writeToFile(p,s,true))throw Error('Cannot write '+p);}
    function own(){return read(root+'/owner.txt')===owner;}
    ensure(root);ensure(root+'/channels');write(root+'/owner.txt',owner);
    var scheduler=createRenderScheduler(api,root);
    ui.setTitle('BridgeNa2_Cavalry');ui.setMinimumWidth(380);
    var label=new ui.Label('BridgeNa2_Cavalry：在 AE 选择 Cavalry 合成');ui.add(label);
    var inspect=new ui.Button('检查后台 / 登录');inspect.onClick=function(){scheduler.inspect();};ui.add(inspect);ui.show();
    function catalog(){
        var entries=api.getComps().map(function(id){return {nodeId:id,uuid:api.get(id,'uuid'),name:api.getNiceName(id),resolution:api.get(id,'resolution'),fps:api.get(id,'fps'),first:api.get(id,'startFrame'),last:api.get(id,'endFrame')};});
        write(root+'/compositions.json',JSON.stringify({protocol:2,owner:owner,stamp:Date.now(),scene:api.getSceneFilePath(),compositions:entries}));lastCatalog=Date.now();catalogDirty=false;
    }
    function activeChannels(){
        var a=read(root+'/active-channels.txt').split('\n');
        if(a[0]!=='CNCHANNELS1')return ['0']; // compatibility with an already loaded older AE binary
        if(a[a.length-2]!=='END'||a[a.length-1]!==''||!/^\d+$/.test(a[1]))return null; // partial write: retain prior set
        if(Math.abs(Date.now()-Number(a[1]))>7000)return [];
        return a.slice(2,-2).filter(function(id){return /^(0|[1-9][0-9]{0,9})$/.test(id)&&Number(id)<=2000000001;});
    }
    function syncChannels(){
        var ids=activeChannels();if(ids===null)return;
        var needed={};ids.forEach(function(id){needed[id]=true;if(!channels[id]){var path=id==='0'?root:root+'/channels/'+id;ensure(path);channels[id]=createPreviewChannel(api,path,scheduler.channel(path),owner,own);}});
        Object.keys(channels).forEach(function(id){if(!needed[id]){channels[id].shutdown(id!=='0');delete channels[id];}});
    }
    function heartbeat(offline){
        var ids=Object.keys(channels),enabled=0,queued=0,rendering=0,errors=0;
        ids.forEach(function(id){var c=channels[id];if(c.enabled())enabled++;var p=c.phase();if(p==='queued')queued++;if(/^(rendering|loading|starting|baking)$/.test(p))rendering++;if(p==='error'||p==='missingSource')errors++;});
        // Global state belongs to process lifecycle; individual streams have
        // their own status and cache manifests under channels/<id>.
        if(offline||!channels['0'])write(root+'/state.txt',['CAVALRY_NATIVE_4',owner,'',String(Date.now()),offline?'offline':'ready','0','0','','','0','END',''].join('\n'));
        if(!offline){var text='已连接 '+enabled+' 个合成 · 更新 '+rendering+' · 排队 '+queued+(errors?' · 错误 '+errors:'');if(text!==lastLabel){label.setText(text);lastLabel=text;}}
    }
    function broadcast(name,args){if(stopped)return;catalogDirty=true;Object.keys(channels).forEach(function(id){var fn=channels[id].callbacks[name];if(fn)fn.apply(null,args);});}
    var callbacks={};['onAttrChanged','onLayerAdded','onLayerRemoved','onAttrConnected','onAttrDisconnected','onAssetAdded','onAssetRemoved','onAssetUpdated','onAssetAsyncLoadFinished','onAppStateChanged','onSceneChanged'].forEach(function(name){callbacks[name]=function(){broadcast(name,arguments);};});ui.addCallbackObject(callbacks);
    function shutdown(){if(stopped)return;stopped=true;timer.stop();Object.keys(channels).forEach(function(id){channels[id].shutdown();});try{scheduler.shutdown();}catch(_){}try{if(own()){heartbeat(true);write(root+'/renderer-demand.txt','0');}}catch(_){} }
    function tick(){
        if(stopped||busy)return;busy=true;
        try{
            if(!own()){shutdown();return;}
            var now=Date.now();
            if(now-lastIO>=250){syncChannels();lastIO=now;}
            if(now-lastCatalog>1000||(catalogDirty&&now-lastCatalog>500))catalog();
            Object.keys(channels).forEach(function(id){channels[id].tick();});scheduler.tick();
            if(now-lastIO<34)heartbeat(false);
        }catch(e){try{write(root+'/last-error.txt',String(e));label.setText('桥接错误：'+e);}catch(_){} }
        finally{busy=false;}
    }
    var timer=new api.Timer({onTimeout:tick});timer.setRepeating(true);timer.setInterval(33);timer.start();ui.onClose=shutdown;tick();
})();
