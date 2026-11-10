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
