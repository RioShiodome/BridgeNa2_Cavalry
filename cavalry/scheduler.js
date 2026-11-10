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
