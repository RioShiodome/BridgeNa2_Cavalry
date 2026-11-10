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
