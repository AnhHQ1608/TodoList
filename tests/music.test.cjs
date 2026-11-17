const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function boot({muted=false,blocked=false,delayed=false,speech=false,bootstrap,previousIndex}={}){
  const elements={},events={};let plays=0,deny=blocked;
  for(const match of fs.readFileSync('index.html','utf8').matchAll(/id="([^"]+)"/g))elements[match[1]]={listeners:{},value:'',addEventListener(n,fn){this.listeners[n]=fn;},setAttribute(n,v){this[n]=v;},replaceChildren(...items){this.children=items;},contains(){return false;},querySelectorAll(){return [];}};
  const audio=elements['background-music'];audio.paused=true;
  audio.src='music/xao-xuyen.mp3';audio.getAttribute=()=>audio.src;
  audio.play=async()=>{plays++;if(deny){const error=Error('Blocked');error.name='NotAllowedError';throw error;}audio.paused=false;};
  audio.pause=()=>{audio.paused=true;};
  if(bootstrap)elements['music-bootstrap'].textContent=JSON.stringify(bootstrap);
  const spoken=[],timers=[];
  const synth={getVoices:()=>[{lang:'vi-VN',name:'Vietnamese'}],speak:utterance=>spoken.push(utterance),cancel(){}};
  let release;
  const ready=new Promise(resolve=>release=resolve);
  const context={window:speech?{speechSynthesis:synth}:{},navigator:{userActivation:{hasBeenActive:false}},...(speech?{SpeechSynthesisUtterance:function(text){this.text=text;}}:{}),setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},document:{getElementById:id=>elements[id],addEventListener:(n,fn)=>events[n]=fn},localStorage:{getItem:()=>JSON.stringify({enabled:!muted,index:previousIndex}),setItem(){}},Option:function(text,value){return {text,value};},fetch:async()=>{if(delayed)await ready;return {ok:true,json:async()=>bootstrap || [{title:'Track',src:'music/xao-xuyen.mp3'}]};}};
  vm.runInNewContext(fs.readFileSync('music.js','utf8'),context);
  return {elements,events,plays:()=>plays,allow:()=>{deny=false;},release,spoken,timers};
}
test('Background music attempts autoplay and retries once on the first user gesture when blocked',async()=>{
  const app=boot({blocked:true});await new Promise(setImmediate);assert.equal(app.plays(),1);
  app.allow();app.events.pointerdown({type:'pointerdown',target:{}});await new Promise(setImmediate);
  assert.equal(app.plays(),2);app.events.click({type:'click',target:{}});assert.equal(app.plays(),2);
});
test('Each visit retries autoplay despite old disabled preference, but stopping music prevents gesture restart',async()=>{
  const app=boot({muted:true});await new Promise(setImmediate);assert.equal(app.plays(),1);
  app.elements['music-toggle'].listeners.click();
  app.events.pointerdown({type:'pointerdown',target:{}});assert.equal(app.plays(),1);
  app.elements['music-toggle'].listeners.click();await new Promise(setImmediate);assert.equal(app.plays(),2);
});
test('First gesture can start music before playlist response arrives without restarting the track',async()=>{
  const app=boot({blocked:true,delayed:true});await new Promise(setImmediate);
  app.allow();app.events.pointerup({type:'pointerup',target:{}});await new Promise(setImmediate);assert.equal(app.plays(),2);
  app.release();await new Promise(setImmediate);assert.equal(app.plays(),2);
});
test('Music player lives inside the collapsed hamburger music section',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.ok(html.indexOf('id="music-player"')>html.indexOf('id="settings-dialog"'));
  assert.match(html, /id="menu-music-panel"[^>]+hidden/);
  assert.ok(html.indexOf('id="menu-music-panel"')<html.indexOf('id="music-player"'));
});
test('Welcome speech runs once before audible music and repeat gestures do not repeat greeting',async()=>{
  const app=boot({speech:true});await new Promise(setImmediate);assert.equal(app.plays(),0);
  app.events.pointerdown({type:'pointerdown',target:{}});await new Promise(setImmediate);
  assert.equal(app.spoken.length,1);assert.equal(app.spoken[0].lang,'vi-VN');assert.match(app.spoken[0].text,/Mời bạn nghe nhạc/);
  assert.equal(app.elements['background-music'].muted,true);assert.equal(app.elements['background-music'].paused,true);
  app.events.click({type:'click',target:{}});assert.equal(app.spoken.length,1);
  app.spoken[0].onend();await new Promise(setImmediate);
  assert.equal(app.elements['background-music'].muted,false);assert.equal(app.elements['background-music'].paused,false);
  assert.equal(app.spoken.length,1);
});
test('Stopping welcome prevents music from starting; speech failure falls back to music',async()=>{
  const stopped=boot({speech:true});stopped.events.pointerup({type:'pointerup',target:{}});await new Promise(setImmediate);
  stopped.elements['music-toggle'].listeners.click();stopped.spoken[0].onend();await new Promise(setImmediate);
  assert.equal(stopped.elements['background-music'].paused,true);
  const failed=boot({speech:true});failed.events.pointerup({type:'pointerup',target:{}});await new Promise(setImmediate);failed.spoken[0].onerror();await new Promise(setImmediate);
  assert.equal(failed.elements['background-music'].paused,false);
});
test('New visit selects a random track different from the previous one and keeps it after playlist load',async()=>{
  const playlist=[{title:'A',src:'music/a.mp3'},{title:'B',src:'music/b.mp3'},{title:'C',src:'music/c.mp3'}];
  const app=boot({speech:true,bootstrap:playlist,previousIndex:1});const initial=app.elements['background-music'].src;assert.notEqual(initial,'music/b.mp3');
  await new Promise(setImmediate);assert.equal(app.elements['background-music'].src,initial);
});
test('Selecting another track after stopping starts music without repeating the welcome',async()=>{
  const app=boot({speech:true});app.events.pointerup({type:'pointerup',target:{}});await new Promise(setImmediate);
  app.elements['music-toggle'].listeners.click();app.elements['music-next'].listeners.click();await new Promise(setImmediate);
  assert.equal(app.elements['background-music'].paused,false);assert.equal(app.spoken.length,1);
});
