(function(){
 var names=[],available=app.effects,match='Cavalry Native Preview';
 for(var i=0;i<available.length;i++)if(available[i].matchName===match)names.push(available[i].displayName);
 if(names.length!==1||names[0]!=='BridgeNa2_Cavalry')throw Error('Registration failed: '+names.join(','));
 if(app.project.numItems)throw Error('Expected empty isolated project');
 var comp=app.project.items.addComp('BridgeNa2 4.2 verification',320,180,1,2,25),layer=comp.layers.addSolid([0,0,0],'BridgeNa2 4.2 test layer',320,180,1,2);
 var effect=layer.property('ADBE Effect Parade').addProperty(match);effect.property(3).setValue(2);
 var f=new File('/Users/moonshot/cavalry-ae-native/build/ae42-name.json');f.open('w');f.write(JSON.stringify({names:names,effectName:effect.name,matchName:effect.matchName,parameters:effect.numProperties,seconds:effect.property(3).value}));f.close();
})();
