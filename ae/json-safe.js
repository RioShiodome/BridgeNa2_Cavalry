// ExtendScript releases without a built-in JSON object. No eval is used.
(function(G){
 if(typeof G.JSON!=='undefined')return;
 function quote(s){return '"'+String(s).replace(/["\\\x00-\x1f]/g,function(c){if(c==='"'||c==='\\')return '\\'+c;return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';}
 function stringify(v){
  if(v===null)return 'null';var t=typeof v;if(t==='string')return quote(v);if(t==='number')return isFinite(v)?String(v):'null';if(t==='boolean')return String(v);if(t!=='object')return undefined;
  var parts=[],i,k,value;if(v instanceof Array){for(i=0;i<v.length;i++)parts.push(stringify(v[i])||'null');return '['+parts.join(',')+']';}
  for(k in v)if(Object.prototype.hasOwnProperty.call(v,k)){value=stringify(v[k]);if(value!==undefined)parts.push(quote(k)+':'+value);}return '{'+parts.join(',')+'}';
 }
 function parse(text){
  var s=String(text).replace(/^\uFEFF/,''),i=0,depth=0;
  function bad(){throw new SyntaxError('Invalid JSON at '+i);}
  function space(){while(i<s.length&&/\s/.test(s.charAt(i)))i++;}
  function str(){var out='',c;if(s.charAt(i++)!=='"')bad();while(i<s.length){c=s.charAt(i++);if(c==='"')return out;if(c==='\\'){c=s.charAt(i++);if(c==='u'){var h=s.substr(i,4);if(!/^[0-9a-fA-F]{4}$/.test(h))bad();out+=String.fromCharCode(parseInt(h,16));i+=4;}else {var es={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};if(!Object.prototype.hasOwnProperty.call(es,c))bad();out+=es[c];}}else{if(c.charCodeAt(0)<32)bad();out+=c;}}bad();}
  function value(){space();if(++depth>128)bad();var c=s.charAt(i),v,key,m;if(c==='"')v=str();else if(c==='{'||c==='['){var array=c==='[';i++;v=array?[]:{};space();if(s.charAt(i)===(array?']':'}'))i++;else{while(true){space();if(array)v.push(value());else{key=str();if(key==='__proto__')bad();space();if(s.charAt(i++)!==':')bad();v[key]=value();}space();c=s.charAt(i++);if(c===(array?']':'}'))break;if(c!==',')bad();}}}else if(s.substr(i,4)==='true'){v=true;i+=4;}else if(s.substr(i,5)==='false'){v=false;i+=5;}else if(s.substr(i,4)==='null'){v=null;i+=4;}else {m=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(s.substr(i));if(!m)bad();v=Number(m[0]);if(!isFinite(v))bad();i+=m[0].length;}depth--;return v;}
  var v=value();space();if(i!==s.length)bad();return v;
 }
 G.JSON={parse:parse,stringify:stringify};
})($.global);
