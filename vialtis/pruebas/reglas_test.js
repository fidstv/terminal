/* Prueba las reglas con el SIMULADOR (rules-eval.js). Uso: node pruebas/reglas_test.js */
const RE=require('../rules-eval.js');
const rules=require('../reglas-firebase.json');
let db={}; const now=Date.now(); let n=0,bad=0;
const write=(label,auth,path,val,expect,commit=true)=>{ const r=RE.canWrite(rules,db,path.split('/'),val,auth,now); const ok=r.ok; n++; if(ok!==expect){ bad++; console.log('❌',label,'→ esperado',expect?'PERMITIDO':'DENEGADO','y fue',ok?'PERMITIDO':'DENEGADO('+r.why+')'); } else console.log('✔ ',label,ok?'(permitido)':'(denegado)'); if(ok&&commit)db=RE.applyWrite(db,path.split('/'),val); return ok; };
const read=(label,auth,path,expect)=>{ const ok=RE.canRead(rules,db,path.split('/'),auth,now); n++; if(ok!==expect){ bad++; console.log('❌',label,'→ esperado',expect,'y fue',ok); } else console.log('✔ ',label,ok?'(puede leer)':'(no puede leer)'); };
require('./casos.js')(write, read, now);
console.log('\nPruebas:',n,'| fallas:',bad);
process.exit(bad?1:0);
