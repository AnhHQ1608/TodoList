const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const vm=require('node:vm');
const origin='https://anhhq1608.github.io';
function environment(){
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('backend/schema.sql','utf8'));
  function prepare(sql){let args=[];const stmt={bind(...values){args=values;return stmt;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){db.prepare(sql).run(...args);return {success:true};}};return stmt;}
  return {sqlite:db,DB:{prepare,batch:async statements=>{db.exec('BEGIN');try{const result=await Promise.all(statements.map(s=>s.run()));db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}},ALLOWED_ORIGIN:origin,ADMIN_PASSWORD:'test-only-admin-password',AUTH_SECRET:'test-only-secret-at-least-thirty-two-characters',PASSWORD_PEPPER:'test-only-password-pepper-at-least-thirty-two-characters',REQUIRE_ACCOUNT:'true'};
}
async function setup(){
  const {default:worker}=await import('../backend/worker.mjs');const env=environment();
  const call=async(path,body,token,source=origin)=>worker.fetch(new Request('https://api.example'+path,{method:body?'POST':'GET',headers:{Origin:source,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  const register=async username=>{const response=await call('/auth/register',{username,password:'Test-password-12345'});assert.equal(response.status,201);return response.json();};
  return {worker,env,call,register};
}
test('Accounts normalize names, hash passwords with unique salts and issue revocable 10-day sessions',async()=>{
  const {env,call,register}=await setup();const first=await register('Test.User');const second=await register('another');
  assert.equal(first.user.username,'test.user');
  assert.ok(Math.abs(first.expiresAt-Date.now()-864000000)<2000);
  const rows=env.sqlite.prepare('SELECT * FROM users').all();assert.notEqual(rows[0].password_hash,'Test-password-12345');assert.notEqual(rows[0].password_hash,rows[1].password_hash);assert.notEqual(rows[0].password_salt,rows[1].password_salt);
  assert.ok(!JSON.stringify(rows).includes('Test-password-12345'));
  assert.ok(!JSON.stringify(env.sqlite.prepare('SELECT * FROM user_sessions').all()).includes(first.token));
  assert.equal((await call('/auth/register',{username:'TEST.USER',password:'Test-password-12345'})).status,409);
  const login=await call('/auth/login',{username:'TEST.USER',password:'Test-password-12345'});assert.equal(login.status,200);
  assert.equal((await call('/auth/login',{username:'test.user',password:'wrong-password'})).status,401);
  assert.equal((await call('/auth/me',null,first.token)).status,200);
  assert.equal((await call('/auth/logout',{},first.token)).status,200);
  assert.equal((await call('/auth/me',null,first.token)).status,401);
  assert.equal((await call('/auth/me',null,second.token)).status,200);
  env.sqlite.exec('UPDATE user_sessions SET expires_at=0');
  assert.equal((await call('/account/data',null,second.token)).status,401);
});
test('Account data is private, synchronized by version and protected from stale overwrites',async()=>{
  const {call,register}=await setup();const a=await register('alice'),b=await register('bob');
  const data={tasks:[{id:'task-1',text:'Private',completed:false,deadline:null}],folders:[]};
  assert.equal((await call('/account/data')).status,401);
  assert.equal((await call('/account/data',{version:0,data},a.token)).status,200);
  assert.equal((await call('/account/data',{version:0,data:{tasks:[],folders:[]}},a.token)).status,409);
  const saved=await (await call('/account/data',null,a.token)).json();assert.deepEqual(saved.data,data);assert.equal(saved.version,1);
  const other=await (await call('/account/data',null,b.token)).json();assert.equal(other.data.tasks.length,0);
  assert.equal((await call('/account/data',{version:1,data:{tasks:[{id:'x',text:1}],folders:[]}},a.token)).status,400);
  assert.equal((await call('/account/data',{version:1,data},a.token,'https://evil.example')).status,403);
  assert.equal((await call('/admin/sessions',null,a.token)).status,401);
  assert.equal((await call('/admin/users',null,a.token)).status,401);
});
test('Logged-in activities attach account names and alert delivery checks device ownership',async()=>{
  const {call,register,env}=await setup();const a=await register('alice'),b=await register('bob');
  const event={eventId:crypto.randomUUID(),visitorId:crypto.randomUUID(),sessionId:crypto.randomUUID(),action:'visit',browser:'Other',os:'Other',device:'desktop'};
  assert.equal((await call('/events',event)).status,401);
  assert.equal((await call('/events',event,a.token)).status,202);
  assert.equal((await call('/events',{...event,eventId:crypto.randomUUID()},b.token)).status,403);
  const admin=await (await call('/admin/login',{password:env.ADMIN_PASSWORD})).json();
  const users=await (await call('/admin/users',null,admin.token)).json();
  assert.equal(users.users.length,2);
  assert.ok(users.users.some(user=>user.username==='bob' && user.device_count===0));
  assert.ok(!JSON.stringify(users).includes('password'));
  const sessions=await (await call('/admin/sessions',null,admin.token)).json();assert.equal(sessions.sessions[0].username,'alice');
  const history=await (await call('/admin/events',null,admin.token)).json();assert.equal(history.events[0].username,'alice');
  assert.equal((await call('/admin/alerts',{deviceNo:sessions.sessions[0].device_no,message:'Hello'},admin.token)).status,202);
  assert.equal((await call('/device/alerts',{visitorId:event.visitorId},a.token)).status,200);
  assert.equal((await call('/device/alerts',{visitorId:event.visitorId},b.token)).status,403);
  assert.equal((await call('/device/alerts',{visitorId:event.visitorId})).status,401);
});
test('Registration rejects weak or malformed input and login throttling blocks guessing',async()=>{
  const {call}=await setup();
  for(const body of [{username:'ab',password:'long-enough-password'},{username:'user',password:'short'},{username:'<img>',password:'long-enough-password'},null]){
    assert.equal((await call('/auth/register',body||{})).status,400);
  }
  let response;for(let i=0;i<16;i++)response=await call('/auth/login',{username:'unknown',password:'wrong-password'});
  assert.equal(response.status,429);
});

function frontend({session=true,failMe=false,storage=new Map(),conflict=false}={}){
  const endpoint='https://api.example',redirects=[],requests=[],scripts=[],timers=[];
  if(session)storage.set('focus-user-session-v1',JSON.stringify({token:'user-token',user:{id:'user-one',username:'alice'},expiresAt:Date.now()+86400000,endpoint}));
  const elements={};for(const match of fs.readFileSync('index.html','utf8').matchAll(/id="([^"]+)"/g))elements[match[1]]={hidden:true,listeners:{},addEventListener(n,fn){this.listeners[n]=fn;}};
  const context={URL,Blob,crypto,AbortController,window:{TODO_ANALYTICS:{apiUrl:endpoint},addEventListener(){}},location:{replace:p=>redirects.push(p),reload(){}},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    document:{getElementById:id=>elements[id],documentElement:{classList:{remove(){}}},createElement:()=>({}),head:{append(script){scripts.push(script.src);script.onload();}}},
    setTimeout:(fn,ms)=>{if(ms===700)timers.push(fn);return 1;},clearTimeout(){},
    fetch:async(url,options)=>{requests.push({url,options});if(url.endsWith('/auth/me'))return {status:failMe?401:200,ok:!failMe,json:async()=>({user:{id:'user-one',username:'alice'}})};
      if(options.method==='POST')return {status:conflict?409:200,ok:!conflict,json:async()=>conflict?{error:'Conflict'}:{version:3}};
      return {ok:true,status:200,json:async()=>({version:2,data:{tasks:[{id:'remote',text:'Private',completed:false}],folders:[]}})};}};
  vm.runInNewContext(fs.readFileSync('auth.js','utf8'),context);
  return {context,elements,redirects,requests,scripts,storage,timers};
}
test('TodoList requires a server-verified session before loading scripts or account data',async()=>{
  const guest=frontend({session:false});assert.deepEqual(guest.redirects,['login.html']);assert.equal(guest.scripts.length,0);
  const invalid=frontend({failMe:true});await new Promise(setImmediate);assert.equal(invalid.scripts.length,0);assert.deepEqual(invalid.redirects,['login.html']);
  const app=frontend();await new Promise(setImmediate);assert.equal(app.scripts.length,3);assert.equal(app.context.window.todoAccount.storageKey,'focus-list-tasks-v1:user-one');
  assert.equal(app.storage.has('focus-list-tasks-v1'),false);assert.match(app.storage.get('focus-list-tasks-v1:user-one'),/Private/);
});
test('Cloud saving sends only account data, retains legacy tasks and preserves edits on conflicts',async()=>{
  const storage=new Map([['focus-list-tasks-v1',JSON.stringify([{id:'old',text:'Keep me',completed:false}])]]);
  const app=frontend({storage,conflict:true});await new Promise(setImmediate);
  assert.equal(app.elements['account-import'].hidden,false);
  app.context.window.todoAccount.save();await app.timers.at(-1)();
  const sent=app.requests.at(-1);assert.equal(JSON.parse(sent.options.body).version,2);
  assert.equal(sent.options.headers.Authorization,'Bearer user-token');
  assert.ok(storage.has('focus-user-pending-v1:user-one'));assert.match(storage.get('focus-list-tasks-v1'),/Keep me/);
  storage.set('focus-list-tasks-v1:user-one',JSON.stringify([{id:'new',text:'Changed after conflict',completed:false}]));
  app.context.window.todoAccount.save();assert.match(storage.get('focus-user-pending-v1:user-one'),/Changed after conflict/);
});
