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
