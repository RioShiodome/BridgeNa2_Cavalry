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
