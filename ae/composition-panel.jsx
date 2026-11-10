// Embedded source picker. Selection and cache identity persist in each effect.
(function(G){
    var ROOT=null,MATCH='Cavalry Native Preview',MAX_ID=16777215;
    function read(path){var f=File(path);if(!f.exists)return null;f.encoding='UTF-8';if(!f.open('r'))return null;var t=f.read();f.close();try{return JSON.parse(t);}catch(_){return null;}}
    function sameComp(a,b){return a&&b&&typeof a.nodeId==='string'&&a.nodeId===b.nodeId&&a.uuid===b.uuid;}
    function write(path,text){var f=File(path);f.encoding='UTF-8';f.lineFeed='Unix';if(!f.open('w'))throw Error('无法写入连接配置，请在 AE 首选项允许脚本写入文件。');try{if(f.write(text)===false)throw Error('连接配置写入失败，请检查缓存目录权限和剩余空间。');}finally{f.close();}}
    function target(layerID,token){
        for(var i=1;i<=app.project.numItems;i++){var c=app.project.item(i);if(!(c instanceof CompItem))continue;for(var j=1;j<=c.numLayers;j++){var l=c.layer(j);if(l.id!==layerID)continue;var es=l.property('ADBE Effect Parade');for(var k=1;k<=es.numProperties;k++){var e=es.property(k);if(e.matchName===MATCH&&e.numProperties>=16&&e.property(16).value===token)return {layer:l,effect:e};}}}
        throw Error('目标 BridgeNa2 图层已删除。');
    }
    function bind(layerID,token,item,selectedCatalog){
        ROOT=G.BN_CacheRoot();
        var t=target(layerID,token),data=read(ROOT.fsName+'/compositions.json'),found=false;
        if(!data||Math.abs(new Date().getTime()-data.stamp)>7000)throw Error('Cavalry 连接已过期，请确认桥接标签已加载，再刷新列表。');
        if(data.protocol!==2)throw Error('Cavalry 桥接仍是旧版本，请保存并正常重启 Cavalry 后刷新列表。');
        if(selectedCatalog&&(data.scene!==selectedCatalog.scene||data.owner!==selectedCatalog.owner))throw Error('Cavalry 工程已切换，请刷新列表后重新选择。');
        for(var i=0;i<(data.compositions||[]).length;i++)if(sameComp(data.compositions[i],item)){item=data.compositions[i];found=true;break;}
        if(!found)throw Error('所选合成已不在当前 Cavalry 工程中，请刷新列表后重新选择。');
        var base=Folder(ROOT.fsName+'/channels');if(!ROOT.parent.exists)ROOT.parent.create();if(!ROOT.exists)ROOT.create();if(!base.exists&&!base.create())throw Error('无法创建缓存目录');
        var bake=G.CN41&&G.CN41.current;
        if(bake&&bake.layerID===layerID&&t.effect.property(9).value===bake.token){if(bake.running)throw Error('这个效果正在烘焙，请完成或取消后再切换合成。');bake.win.close();}
        // AE integer sliders may round through float32. IDs must survive a
        // host round-trip exactly, including the channel directory name.
        var id=new Date().getTime()%MAX_ID+1,initial=id,dir;
        do{dir=Folder(base.fsName+'/'+id);if(!dir.exists)break;id=id%MAX_ID+1;if(id===initial)throw Error('可用连接编号已用尽。');}while(true);
        if(!dir.create())throw Error('无法创建合成缓存目录');
        write(dir.fsName+'/binding.json',JSON.stringify({protocol:2,nodeId:item.nodeId,uuid:item.uuid,name:item.name,scene:data.scene,owner:data.owner}));
        var saved=read(dir.fsName+'/binding.json');if(!sameComp(saved,item)||saved.scene!==data.scene||saved.owner!==data.owner)throw Error('无法验证连接配置，原连接已保留，请检查缓存目录。');
        app.beginUndoGroup('选择 Cavalry 合成');
        try{var e=t.effect,previous=e.property(14).value;e.property(14).setValue(id);if(e.property(14).value!==id){e.property(14).setValue(previous);throw Error('AE 未能准确保存连接编号，原连接已恢复。');}e.property(6).setValue(0);e.property(5).setValue(0);e.property(2).setValue(1);e.name='BridgeNa2_Cavalry · '+item.name;}finally{app.endUndoGroup();}
        return id;
    }
    G.BN46_Bind=bind;
    G.BN46_Select=function(layerID,token){
        try{
            ROOT=G.BN_CacheRoot();
            var t=target(layerID,token),channel=t.effect.property(14).value,bound=channel?read(ROOT.fsName+'/channels/'+channel+'/binding.json'):null;
            var win=new Window('dialog','选择 Cavalry 合成');win.orientation='column';win.alignChildren='fill';
            win.add('statictext',undefined,'选择当前 Cavalry 工程中的合成；每个 BridgeNa2 图层独立连接。');
            var list=win.add('listbox',undefined,[]);list.preferredSize=[560,260];
            var note=win.add('statictext',undefined,'',{multiline:true});note.preferredSize=[560,44];
            var row=win.add('group'),refresh=row.add('button',undefined,'刷新列表'),ok=row.add('button',undefined,'连接所选合成'),cancel=row.add('button',undefined,'取消',{name:'cancel'}),items=[],selectedCatalog=null;
            function reload(){
                var data=read(ROOT.fsName+'/compositions.json');list.removeAll();items=[];ok.enabled=false;
                if(!data||Math.abs(new Date().getTime()-data.stamp)>7000){note.text='请打开 Cavalry，并确认 BridgeNa2 桥接标签已加载，再点击刷新列表。';return;}
                if(data.protocol!==2){note.text='Cavalry 桥接仍是旧版本，请保存并正常重启 Cavalry 后刷新列表。';return;}
                selectedCatalog={scene:data.scene,owner:data.owner};
                items=data.compositions||[];
                for(var i=0;i<items.length;i++){var c=items[i],size=c.resolution||{};list.add('item',c.name+'  ·  '+size.x+' × '+size.y+'  ·  '+c.fps+' fps  ·  '+c.first+'–'+c.last+' 帧  ['+c.nodeId+']');if(sameComp(bound,c)&&bound.scene===data.scene&&(data.scene||bound.owner===data.owner))list.selection=i;}
                if(!list.selection&&items.length)list.selection=0;ok.enabled=items.length>0;note.text=items.length?'连接后，修改该合成会自动更新对应图层。其他合成可继续编辑。':'当前工程还没有可用合成。';
            }
            refresh.onClick=reload;ok.onClick=function(){try{if(!list.selection)return;bind(layerID,token,items[list.selection.index],selectedCatalog);win.close(1);}catch(e){alert(String(e));}};
            list.onDoubleClick=ok.onClick;reload();win.show();
        }catch(e){alert(String(e));}
    };
})($.global);
