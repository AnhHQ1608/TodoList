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
  const register=async username=>{const response=await call('/auth/register',{username,fullName:'Hoàng Quốc Anh',password:'Test-password-12345'});assert.equal(response.status,201);return response.json();};
  return {worker,env,call,register};
}
test('Accounts normalize names, hash passwords with unique salts and issue revocable 10-day sessions',async()=>{
  const {env,call,register}=await setup();const first=await register('Test.User');const second=await register('another');
  assert.equal(first.user.username,'test.user');
  assert.ok(Math.abs(first.expiresAt-Date.now()-864000000)<2000);
  const rows=env.sqlite.prepare('SELECT * FROM users').all();assert.notEqual(rows[0].password_hash,'Test-password-12345');assert.notEqual(rows[0].password_hash,rows[1].password_hash);assert.notEqual(rows[0].password_salt,rows[1].password_salt);
  assert.ok(!JSON.stringify(rows).includes('Test-password-12345'));
  assert.ok(!JSON.stringify(env.sqlite.prepare('SELECT * FROM user_sessions').all()).includes(first.token));
  assert.equal((await call('/auth/register',{username:'TEST.USER',fullName:'Hoàng Quốc Anh',password:'Test-password-12345'})).status,409);
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
test('Weekly routines sync privately, validate dates/weekdays and survive saves from old clients',async()=>{
  const {call,register}=await setup();const a=await register('weeklyuser'),b=await register('otherweekly');
  const routine={id:'r1',text:'Exercise',startDate:'2026-11-16',weekdays:[1,3,5],deadlineTime:'18:30',excludedDates:['2026-11-16']};
  const data={tasks:[{id:'one',text:'One off',completed:false,scheduledDate:'2026-11-18'}],folders:[],routines:[routine]};
  assert.equal((await call('/account/data',{version:0,data},a.token)).status,200);
  const saved=await (await call('/account/data',null,a.token)).json();assert.deepEqual(saved.data,data);
  assert.equal((await (await call('/account/data',null,b.token)).json()).data.routines,undefined);
  for(const bad of [{...routine,weekdays:[0,8]},{...routine,startDate:'2026-02-30'},{...routine,deadlineTime:'25:00'}]){
    assert.equal((await call('/account/data',{version:1,data:{...data,routines:[bad]}},a.token)).status,400);
  }
  assert.equal((await call('/account/data',{version:1,data:{tasks:[],folders:[]}},a.token)).status,200);
  assert.deepEqual((await (await call('/account/data',null,a.token)).json()).data.routines,[routine]);
});

test('Registration rejects weak or malformed input and login throttling blocks guessing',async()=>{
  const {call}=await setup();
  for(const body of [{username:'ab',password:'long-enough-password'},{username:'user',password:'short'},{username:'<img>',password:'long-enough-password'},null]){
    assert.equal((await call('/auth/register',body||{})).status,400);
  }
  let response;for(let i=0;i<16;i++)response=await call('/auth/login',{username:'unknown',password:'wrong-password'});
  assert.equal(response.status,429);
});

test('Vietnamese full names are required for registration and legacy profiles update only the signed-in user',async()=>{
  const {normalizeFullName}=await import('../backend/accounts.mjs');
  assert.equal(normalizeFullName('  Hoa\u0300ng   Quo\u0302\u0301c Anh  '),'Hoàng Quốc Anh');
  for(const value of [undefined,'','A','  ','x'.repeat(81),'<img src=x>','Nguyễn 123','An\u0000B','An\u202eB'])assert.equal(normalizeFullName(value),null);
  const {call,register,env}=await setup();
  assert.equal((await call('/auth/register',{username:'noname',password:'Test-password-12345'})).status,400);
  const first=await register('nameduser'),other=await register('otheruser');
  assert.equal(first.user.fullName,'Hoàng Quốc Anh');
  env.sqlite.prepare('DELETE FROM user_profiles WHERE user_id=?').run(first.user.id);
  assert.equal((await (await call('/auth/me',null,first.token)).json()).user.fullName,'');
  const response=await call('/auth/profile',{fullName:'  Nguyễn   Văn An  ',userId:other.user.id},first.token);
  assert.equal(response.status,200);assert.equal((await response.json()).user.fullName,'Nguyễn Văn An');
  assert.equal((await (await call('/auth/me',null,other.token)).json()).user.fullName,'Hoàng Quốc Anh');
  assert.equal((await call('/auth/profile',{fullName:'<script>alert(1)</script>'},first.token)).status,400);
  assert.equal((await call('/auth/profile',{fullName:'Nguyễn Văn An'})).status,401);
  const login=await (await call('/auth/login',{username:'nameduser',password:'Test-password-12345'})).json();
  assert.equal(login.user.fullName,'Nguyễn Văn An');
  const admin=await (await call('/admin/login',{password:env.ADMIN_PASSWORD})).json();
  const users=await (await call('/admin/users',null,admin.token)).json();
  assert.equal(users.users.find(user=>user.id===first.user.id).fullName,'Nguyễn Văn An');
  await call('/events',{eventId:crypto.randomUUID(),visitorId:crypto.randomUUID(),sessionId:crypto.randomUUID(),action:'visit',browser:'Other',os:'Other',device:'desktop'},first.token);
  assert.equal((await (await call('/admin/sessions',null,admin.token)).json()).sessions[0].fullName,'Nguyễn Văn An');
  assert.equal((await (await call('/admin/events',null,admin.token)).json()).events[0].fullName,'Nguyễn Văn An');
  env.sqlite.exec(fs.readFileSync('backend/schema.sql','utf8'));
  assert.equal(env.sqlite.prepare('SELECT full_name FROM user_profiles WHERE user_id=?').get(first.user.id).full_name,'Nguyễn Văn An');
});

function frontend({session=true,failMe=false,storage=new Map(),conflict=false,remoteRoutines=[],remoteHistory=[]}={}){
  const endpoint='https://api.example',redirects=[],requests=[],scripts=[],timers=[];
  if(session)storage.set('focus-user-session-v1',JSON.stringify({token:'user-token',user:{id:'user-one',username:'alice'},expiresAt:Date.now()+86400000,endpoint}));
  const elements={};for(const match of fs.readFileSync('index.html','utf8').matchAll(/id="([^"]+)"/g))elements[match[1]]={hidden:true,listeners:{},setAttribute(name,value){this[name]=value;},focus(){},addEventListener(n,fn){this.listeners[n]=fn;}};
  const context={URL,Blob,crypto,AbortController,window:{TODO_ANALYTICS:{apiUrl:endpoint},addEventListener(){}},location:{replace:p=>redirects.push(p),reload(){}},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    document:{getElementById:id=>elements[id],documentElement:{classList:{remove(){}}},createElement:()=>({}),head:{append(script){scripts.push(script.src);script.onload();}}},
    setTimeout:(fn,ms)=>{if(ms===700)timers.push(fn);return 1;},clearTimeout(){},
    fetch:async(url,options)=>{requests.push({url,options});if(url.endsWith('/auth/me'))return {status:failMe?401:200,ok:!failMe,json:async()=>({user:{id:'user-one',username:'alice'}})};
      if(url.endsWith('/auth/profile'))return {status:200,ok:true,json:async()=>({user:{id:'user-one',username:'alice',fullName:JSON.parse(options.body).fullName}})};
      if(options.method==='POST')return {status:conflict?409:200,ok:!conflict,json:async()=>conflict?{error:'Conflict'}:{version:3}};
      return {ok:true,status:200,json:async()=>({version:2,data:{tasks:[{id:'remote',text:'Private',completed:false}],folders:[],routines:remoteRoutines,overdueHistory:remoteHistory}})};}};
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
test('Legacy account can add a full name without logging out or changing tasks',async()=>{
  const app=frontend();await new Promise(setImmediate);
  assert.equal(app.elements['account-profile-form'].hidden,false);
  const tasks=app.storage.get('focus-list-tasks-v1:user-one');
  app.elements['account-fullname'].value='Nguyễn Văn An';
  await app.elements['account-profile-form'].listeners.submit({preventDefault(){}});
  assert.equal(app.elements['account-name'].textContent,'Nguyễn Văn An');
  assert.equal(app.elements['account-profile-form'].hidden,true);
  assert.equal(JSON.parse(app.storage.get('focus-user-session-v1')).user.fullName,'Nguyễn Văn An');
  assert.equal(app.storage.get('focus-list-tasks-v1:user-one'),tasks);
  assert.equal(app.redirects.length,0);
});
test('Pending edits from an old app preserve cloud recurring schedules during upgrade',async()=>{
  const routine={id:'weekly',text:'Keep schedule',startDate:'2026-11-16',weekdays:[1],excludedDates:['2026-11-16']};
  const storage=new Map([['focus-user-pending-v1:user-one',JSON.stringify({version:2,data:{tasks:[],folders:[]}})]]);
  const app=frontend({storage,remoteRoutines:[routine]});await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(storage.get('focus-list-routines-v1:user-one')),[routine]);
  const sent=app.requests.find(request=>request.url.endsWith('/account/data') && request.options.method==='POST');
  assert.deepEqual(JSON.parse(sent.options.body).data.routines,[routine]);
});
test('Overdue history is private, validated, synchronized and preserved for older clients',async()=>{
  const {call,register}=await setup();const a=await register('historyuser'),b=await register('otherhistory');
  const entry={id:'task1:old',task:{id:'task1',text:'Recover me',completed:false,deadline:new Date(Date.now()-86400000).toISOString()},recordedAt:Date.now(),restoredAt:null};
  const data={tasks:[],folders:[],overdueHistory:[entry]};
  assert.equal((await call('/account/data',{version:0,data},a.token)).status,200);
  assert.deepEqual((await (await call('/account/data',null,a.token)).json()).data.overdueHistory,[entry]);
  assert.equal((await (await call('/account/data',null,b.token)).json()).data.overdueHistory,undefined);
  assert.equal((await call('/account/data',{version:1,data:{...data,overdueHistory:[{...entry,task:{...entry.task,deadline:'bad'}}]}},a.token)).status,400);
  assert.equal((await call('/account/data',{version:1,data:{tasks:[],folders:[]}},a.token)).status,200);
  assert.deepEqual((await (await call('/account/data',null,a.token)).json()).data.overdueHistory,[entry]);
});
test('Upgrading pending edits preserves overdue history fetched from the account',async()=>{
  const entry={id:'old',task:{id:'one',text:'Kept',completed:false,deadline:new Date(Date.now()-86400000).toISOString()},recordedAt:Date.now()};
  const storage=new Map([['focus-user-pending-v1:user-one',JSON.stringify({version:2,data:{tasks:[],folders:[]}})]]);
  const app=frontend({storage,remoteHistory:[entry]});await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(storage.get('focus-list-overdue-history-v1:user-one')),[entry]);
  const sent=app.requests.find(request=>request.url.endsWith('/account/data') && request.options.method==='POST');
  assert.deepEqual(JSON.parse(sent.options.body).data.overdueHistory,[entry]);
});
test('History retention filters reads/writes and cron removes expired records without deleting tasks',async()=>{
  const {pruneOverdueHistory}=await import('../backend/accounts.mjs');
  const now=Math.floor(Date.now()/1000)*1000;
  const make=(id,age)=>({id,task:{id,text:'Keep task',completed:false,deadline:new Date(now-age).toISOString()},recordedAt:now});
  const old=make('old',10*86400000),recent=make('recent',86400000);
  assert.deepEqual(pruneOverdueHistory({overdueHistory:[old,make('boundary',10*86400000-1)]},now).overdueHistory.map(entry=>entry.id),['boundary']);
  const {call,register,env,worker}=await setup();const user=await register('retentionuser');
  const data={tasks:[old.task],folders:[],overdueHistory:[old,recent]};
  assert.equal((await call('/account/data',{version:0,data},user.token)).status,200);
  assert.equal(JSON.parse(env.sqlite.prepare('SELECT data FROM user_data WHERE user_id=?').get(user.user.id).data).overdueHistory.length,1);
  env.sqlite.prepare('UPDATE user_data SET data=? WHERE user_id=?').run(JSON.stringify(data),user.user.id);
  assert.equal((await (await call('/account/data',null,user.token)).json()).data.overdueHistory.length,1);
  await worker.scheduled({},env);
  const saved=env.sqlite.prepare('SELECT data,version FROM user_data WHERE user_id=?').get(user.user.id);
  assert.equal(JSON.parse(saved.data).overdueHistory.length,1);assert.deepEqual(JSON.parse(saved.data).tasks,[old.task]);assert.equal(saved.version,2);
});
