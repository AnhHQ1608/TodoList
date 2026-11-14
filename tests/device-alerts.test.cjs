const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('Device alerts render notes as text, deduplicate reloads and keep a single dialog open',async()=>{
  const storage=new Map([['focus-activity-visitor-v1','device-id']]);
  const items=[{id:'one',message:'<script>unsafe</script>'},{id:'two',message:'Second'}];
  function boot(visibility='visible', failDialog=false){
    const dialogs=[]; let interval;
    const document={visibilityState:visibility,addEventListener(){},body:{append(el){dialogs.push(el);}},createElement(){return {children:[],listeners:{},append(...items){this.children.push(...items);},addEventListener(n,fn){this.listeners[n]=fn;},showModal(){if(failDialog)throw Error('Blocked');this.open=true;},close(){this.open=false;this.listeners.close();},remove(){this.removed=true;}};}};
    const context={window:{TODO_ANALYTICS:{apiUrl:'https://activity.example'}},URL,AbortController,document,
      localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setInterval:fn=>{interval=fn;},setTimeout(){},clearTimeout(){},
      fetch:async()=>({ok:true,json:async()=>({alerts:items})})};
    vm.runInNewContext(fs.readFileSync('device-alerts.js','utf8'),context);
    return {dialogs,poll:()=>interval(),document};
  }
  const app=boot();await new Promise(setImmediate);
  assert.equal(app.dialogs.length,1);
  assert.equal(app.dialogs[0].children[1].textContent,'Second');
  app.dialogs[0].close();
  assert.equal(app.dialogs[1].children[1].textContent,'<script>unsafe</script>');
  await app.poll();assert.equal(app.dialogs.length,2);
  const reload=boot();await new Promise(setImmediate);assert.equal(reload.dialogs.length,0);
  storage.delete('focus-admin-alerts-seen-v1');
  const hidden=boot('hidden');await new Promise(setImmediate);
  assert.equal(hidden.dialogs.length,0);
  assert.equal(storage.has('focus-admin-alerts-seen-v1'),false);
  hidden.document.visibilityState='visible';await hidden.poll();
  assert.equal(hidden.dialogs.length,1);
  storage.delete('focus-admin-alerts-seen-v1');
  const failed=boot('visible',true);await new Promise(setImmediate);
  assert.equal(failed.dialogs[0].removed,true);
  assert.equal(storage.has('focus-admin-alerts-seen-v1'),false);
});

test('Both TodoList and admin load the receiver after backend configuration',()=>{
  for(const name of ['index.html','admin.html']){
    const html=fs.readFileSync(name,'utf8');
    assert.ok(html.indexOf('device-alerts.js')>html.indexOf('telemetry-config.js'));
  }
});
