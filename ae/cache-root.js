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
