/* Simulador de las reglas de seguridad de Firebase (Realtime Database).
   Sirve para PROBAR las reglas sin Firebase: se usa en el modo demostración y en las pruebas.
   No es el validador real de Firebase: si Firebase marca una línea en rojo, esa es la que manda. */
(function(root,factory){ if(typeof module==='object'&&module.exports)module.exports=factory(); else root.RulesEval=factory(); })(typeof self!=='undefined'?self:this,function(){
  if(!String.prototype.matches){
    Object.defineProperty(String.prototype,'matches',{value:function(re){ return re.test(String(this)); },configurable:true});
    Object.defineProperty(String.prototype,'contains',{value:function(s){ return String(this).indexOf(s)!==-1; },configurable:true});
    Object.defineProperty(String.prototype,'beginsWith',{value:function(s){ return String(this).indexOf(s)===0; },configurable:true});
    Object.defineProperty(String.prototype,'endsWith',{value:function(s){ const t=String(this); return t.slice(-s.length)===s; },configurable:true});
  }
  const getAt=function(o,path){ for(const k of path){ if(o==null||typeof o!=='object')return undefined; o=o[k]; } return o; };
  const clone=function(o){ return o===undefined?undefined:JSON.parse(JSON.stringify(o)); };
  function makeSnap(rootObj,path){
    const v=getAt(rootObj,path);
    const cp=function(p){ if(p==null)throw new Error('child(null)'); return String(p).split('/').filter(Boolean); };
    return {
      val:function(){ return v===undefined?null:v; },
      exists:function(){ return v!==undefined&&v!==null; },
      child:function(p){ return makeSnap(rootObj,path.concat(cp(p))); },
      parent:function(){ return makeSnap(rootObj,path.slice(0,-1)); },
      hasChild:function(p){ const c=getAt(v,cp(p)); return c!==undefined&&c!==null; },
      hasChildren:function(a){ if(v==null||typeof v!=='object')return false; if(!a)return Object.keys(v).length>0; return a.every(function(k){ return v[k]!==undefined&&v[k]!==null; }); },
      isString:function(){ return typeof v==='string'; }, isNumber:function(){ return typeof v==='number'; }, isBoolean:function(){ return typeof v==='boolean'; },
      getPriority:function(){ return null; }
    };
  }
  function applyWrite(rootObj,path,value){
    const r=clone(rootObj)||{};
    if(!path.length)return value==null?{}:clone(value);
    let o=r; const stack=[];
    for(let i=0;i<path.length-1;i++){ const k=path[i]; if(o[k]==null||typeof o[k]!=='object')o[k]={}; stack.push([o,k]); o=o[k]; }
    const last=path[path.length-1];
    if(value==null)delete o[last]; else o[last]=clone(value);
    for(let i=stack.length-1;i>=0;i--){ const p=stack[i][0],k=stack[i][1]; if(p[k]&&typeof p[k]==='object'&&!Object.keys(p[k]).length)delete p[k]; }
    return r;
  }
  function evalExpr(ex,ctx){
    if(typeof ex==='boolean')return ex;
    const names=Object.keys(ctx.vars);
    try{
      const f=new Function('auth','data','newData','root','now',...names,'"use strict"; return ('+ex+');');
      return f(ctx.auth,ctx.data,ctx.newData,ctx.root,ctx.now,...names.map(function(n){ return ctx.vars[n]; }))===true;
    }catch(e){ return false; }
  }
  const child=function(node,k,vars){
    if(node[k]!==undefined&&typeof node[k]==='object'&&k[0]!=='.')return {node:node[k],vars:vars};
    const wk=Object.keys(node).find(function(x){ return x[0]==='$'; });
    if(wk){ const nv=Object.assign({},vars); nv[wk]=k; return {node:node[wk],vars:nv}; }
    return null;
  };
  function ctxFor(rootObj,newRoot,cur,vars,auth,now){
    return {auth:auth,data:makeSnap(rootObj,cur),newData:makeSnap(newRoot,cur),root:makeSnap(rootObj,[]),now:now,vars:vars};
  }
  function canRead(rules,rootObj,path,auth,now){
    let node=rules.rules, vars={}, cur=[];
    now=now||Date.now();
    if(evalExpr(node['.read'],ctxFor(rootObj,rootObj,cur,vars,auth,now)))return true;
    for(const k of path){
      const c=child(node,k,vars); if(!c)return false; node=c.node; vars=c.vars; cur=cur.concat(k);
      if(evalExpr(node['.read'],ctxFor(rootObj,rootObj,cur,vars,auth,now)))return true;
    }
    return false;
  }
  function validateTree(node,cur,vars,rootObj,newRoot,auth,now){
    const val=getAt(newRoot,cur);
    if(val===undefined||val===null)return true;
    if(node['.validate']!==undefined&&!evalExpr(node['.validate'],ctxFor(rootObj,newRoot,cur,vars,auth,now)))return false;
    if(typeof val==='object'){
      for(const k of Object.keys(val)){
        const c=child(node,k,vars); if(!c)continue;
        if(!validateTree(c.node,cur.concat(k),c.vars,rootObj,newRoot,auth,now))return false;
      }
    }
    return true;
  }
  function canWrite(rules,rootObj,path,value,auth,now){
    now=now||Date.now();
    const newRoot=applyWrite(rootObj,path,value);
    let node=rules.rules, vars={}, cur=[], granted=false; const chain=[{node:node,cur:[],vars:{}}];
    if(evalExpr(node['.write'],ctxFor(rootObj,newRoot,cur,vars,auth,now)))granted=true;
    for(const k of path){
      const c=child(node,k,vars); if(!c)break; node=c.node; vars=c.vars; cur=cur.concat(k); chain.push({node:node,cur:cur,vars:vars});
      if(evalExpr(node['.write'],ctxFor(rootObj,newRoot,cur,vars,auth,now)))granted=true;
    }
    if(!granted)return {ok:false,why:'permiso denegado'};
    for(const c of chain){ if(c.node['.validate']!==undefined&&getAt(newRoot,c.cur)!=null&&!evalExpr(c.node['.validate'],ctxFor(rootObj,newRoot,c.cur,c.vars,auth,now)))return {ok:false,why:'validación'}; }
    const last=chain[chain.length-1];
    if(value!=null&&!validateTree(last.node,last.cur,last.vars,rootObj,newRoot,auth,now))return {ok:false,why:'validación'};
    return {ok:true};
  }
  return {canRead:canRead,canWrite:canWrite,applyWrite:applyWrite};
});
