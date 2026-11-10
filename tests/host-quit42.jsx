(function(){
 for(var i=1;i<=app.project.numItems;i++){var n=app.project.item(i).name;if(n!=='Solids'&&n.indexOf('BridgeNa2 4.2')!==0)throw Error('Unexpected item; leaving isolated AE open: '+n);}
 app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.quit();
})();
