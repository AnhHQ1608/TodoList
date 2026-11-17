const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function boot({muted=false,blocked=false}={}){
  const elements={},events={};let plays=0,deny=blocked;
  for(const match of fs.readFileSync('index.html','utf8').matchAll(/id="([^"]+)"/g))elements[match[1]]={listeners:{},value:'',addEventListener(n,fn){this.listeners[n]=fn;},setAttribute(n,v){this[n]=v;},replaceChildren(...items){this.children=items;},contains(){return false;},querySelectorAll(){return [];}};
  const audio=elements['background-music'];audio.paused=true;
  audio.play=async()=>{plays++;if(deny){const error=Error('Blocked');error.name='NotAllowedError';throw error;}audio.paused=false;};
  audio.pause=()=>{audio.paused=true;};
  const context={document:{getElementById:id=>elements[id],addEventListener:(n,fn)=>events[n]=fn},localStorage:{getItem:()=>JSON.stringify({enabled:!muted}),setItem(){}},Option:function(text,value){return {text,value};},fetch:async()=>({ok:true,json:async()=>[{title:'Track',src:'music/test.mp3'}]})};
  vm.runInNewContext(fs.readFileSync('music.js','utf8'),context);
  return {elements,events,plays:()=>plays,allow:()=>{deny=false;}};
}
test('Background music attempts autoplay and retries once on the first user gesture when blocked',async()=>{
  const app=boot({blocked:true});await new Promise(setImmediate);assert.equal(app.plays(),1);
  app.allow();app.events.pointerdown({type:'pointerdown',target:{}});await new Promise(setImmediate);
  assert.equal(app.plays(),2);app.events.click({type:'click',target:{}});assert.equal(app.plays(),2);
});
test('Saved music-off preference is respected until the user enables music',async()=>{
  const app=boot({muted:true});await new Promise(setImmediate);assert.equal(app.plays(),0);
  app.events.pointerdown({type:'pointerdown',target:{}});assert.equal(app.plays(),0);
  app.elements['music-toggle'].listeners.click();await new Promise(setImmediate);assert.equal(app.plays(),1);
});
test('Music player lives inside the collapsed hamburger music section',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.ok(html.indexOf('id="music-player"')>html.indexOf('id="settings-dialog"'));
  assert.match(html, /id="menu-music-panel"[^>]+hidden/);
  assert.ok(html.indexOf('id="menu-music-panel"')<html.indexOf('id="music-player"'));
});
