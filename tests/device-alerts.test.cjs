const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('Device alerts render notes as text, deduplicate reloads and keep a single dialog open',async()=>{
  const storage=new Map([['focus-activity-visitor-v1','device-id']]);
  const items=[{id:'one',message:'<script>unsafe</script>'},{id:'two',message:'Second'}];
  function boot(){
    const dialogs=[]; let interval;
    const document={visibilityState:'visible',addEventListener(){},body:{append(el){dialogs.push(el);}},createElement(){return {children:[],listeners:{},append(...items){this.children.push(...items);},addEventListener(n,fn){this.listeners[n]=fn;},showModal(){this.open=true;},close(){this.open=false;this.listeners.close();},remove(){this.removed=true;}};}};
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
});
