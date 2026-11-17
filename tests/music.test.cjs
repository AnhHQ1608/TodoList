const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function boot({muted=false,blocked=false,delayed=false,speech=false,bootstrap,previousIndex,voices=[{lang:'vi-VN',name:'Vietnamese',voiceURI:'vi-default'}],savedVoice,autoGreeting=true,greetingBlocked=false,random=Math.random}={}){
  const elements={},events={};let plays=0,deny=blocked;
  for(const match of fs.readFileSync('index.html','utf8').matchAll(/id="([^"]+)"/g))elements[match[1]]={listeners:{},classList:{toggle(name,value){this[name]=value;}},focus(){},value:'',addEventListener(n,fn){this.listeners[n]=fn;},setAttribute(n,v){this[n]=v;},replaceChildren(...items){this.children=items;},contains(){return false;},querySelectorAll(){return [];}};
  const audio=elements['background-music'];audio.paused=true;
  audio.src='music/track-04.mp3';audio.getAttribute=()=>audio.src;
  audio.play=async()=>{plays++;if(deny){const error=Error('Blocked');error.name='NotAllowedError';throw error;}audio.paused=false;};
  audio.pause=()=>{audio.paused=true;};
  const greeting=elements['welcome-audio'];greeting.paused=true;let greetingPlays=0,greetingDenied=greetingBlocked;
  greeting.play=async()=>{greetingPlays++;if(greetingDenied){const error=Error('Blocked');error.name='NotAllowedError';throw error;}greeting.paused=false;if(autoGreeting)queueMicrotask(()=>{greeting.paused=true;greeting.onended?.();});};
  greeting.pause=()=>{greeting.paused=true;};
  if(bootstrap)elements['music-bootstrap'].textContent=JSON.stringify(bootstrap);
  const spoken=[],timers=[];
  const synth={getVoices:()=>voices,speak:utterance=>spoken.push(utterance),cancel(){}};
  let release;
  const ready=new Promise(resolve=>release=resolve);
  const nativeVoice=savedVoice || voices.filter(v=>/^vi/i.test(v.lang)).sort((a,b)=>Number(/natural/i.test(b.name))-Number(/natural/i.test(a.name)))[0]?.voiceURI || 'recorded-vi';
  const context={window:speech?{speechSynthesis:synth}:{},navigator:{userActivation:{hasBeenActive:false}},...(speech?{SpeechSynthesisUtterance:function(text){this.text=text;}}:{}),setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},document:{getElementById:id=>elements[id],addEventListener:(n,fn)=>events[n]=fn},localStorage:{getItem:()=>JSON.stringify({enabled:!muted,index:previousIndex,voiceURI:speech?nativeVoice:'recorded-vi',voiceModeVersion:2}),setItem(){}},Option:function(text,value){return {text,value};},fetch:async()=>{if(delayed)await ready;return {ok:true,json:async()=>bootstrap || [{title:'Track',src:'music/track-04.mp3'}]};}};
  context.Math=Object.create(Math);context.Math.random=random;
  vm.runInNewContext(fs.readFileSync('music.js','utf8'),context);
  return {elements,events,plays:()=>plays,allow:()=>{deny=false;greetingDenied=false;},release,spoken,timers,greetingPlays:()=>greetingPlays};
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
test('Music uses a separate logo disc next to hamburger and preserves random playback',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.ok(html.indexOf('id="music-disc"')<html.indexOf('id="open-settings"'));
  assert.ok(!html.includes('id="menu-music-tab"'));
  assert.match(html,/class="vinyl-record"/);
});

test('Welcome speech runs once before audible music and repeat gestures do not repeat greeting',async()=>{
  const app=boot({speech:true});await new Promise(setImmediate);assert.equal(app.plays(),0);
  app.events.pointerdown({type:'pointerdown',target:{}});await new Promise(setImmediate);
  assert.equal(app.spoken.length,1);assert.equal(app.spoken[0].lang,'vi-VN');assert.match(app.spoken[0].text,/Mời bạn nghe/);
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

test('Each visit shuffles the whole playlist, keeps its order after fetch and plays every track before looping',async()=>{
  const playlist=['A','B','C','D'].map(title=>({title,src:`music/${title}.mp3`}));
  const app=boot({bootstrap:playlist,delayed:true,random:()=>0});
  const order=()=>Array.from(app.elements['music-track'].children,item=>item.text);
  const shuffled=order();
  assert.notDeepEqual(shuffled,playlist.map(item=>item.title));
  assert.deepEqual([...shuffled].sort(),['A','B','C','D']);
  app.release();await new Promise(setImmediate);assert.deepEqual(order(),shuffled);
  const heard=[];
  for(let i=0;i<playlist.length;i++){
    heard.push(app.elements['background-music'].src);
    app.elements['background-music'].listeners.ended();await new Promise(setImmediate);
  }
  assert.equal(new Set(heard).size,4);
  assert.equal(app.elements['background-music'].src,heard[0]);
  const another=boot({bootstrap:playlist,random:()=>.99});
  assert.notDeepEqual(order(),Array.from(another.elements['music-track'].children,item=>item.text));
});

test('Track 04 always opens the visit, while remaining songs shuffle without duplicates',async()=>{
  const playlist=JSON.parse(fs.readFileSync('music/playlist.json','utf8'));
  const first=boot({bootstrap:playlist,previousIndex:playlist.findIndex(item=>item.src==='music/track-04.mp3'),random:()=>0,delayed:true});
  assert.equal(first.elements['background-music'].src,'music/track-04.mp3');
  const order=Array.from(first.elements['music-track'].children,item=>item.text);
  assert.equal(order[0],'track-04');
  assert.equal(new Set(order).size,playlist.length);
  first.release();await new Promise(setImmediate);
  assert.equal(first.elements['background-music'].src,'music/track-04.mp3');
  assert.deepEqual(Array.from(first.elements['music-track'].children,item=>item.text),order);
  first.elements['music-next'].listeners.click();await new Promise(setImmediate);
  assert.notEqual(first.elements['background-music'].src,'music/track-04.mp3');
  const second=boot({bootstrap:playlist,random:()=>.99});
  assert.equal(second.elements['background-music'].src,'music/track-04.mp3');
  assert.notDeepEqual(Array.from(second.elements['music-track'].children,item=>item.text).slice(1),order.slice(1));
});
test('Selecting another track after stopping starts music without repeating the welcome',async()=>{
  const app=boot({speech:true});app.events.pointerup({type:'pointerup',target:{}});await new Promise(setImmediate);
  app.elements['music-toggle'].listeners.click();app.elements['music-next'].listeners.click();await new Promise(setImmediate);
  assert.equal(app.elements['background-music'].paused,false);assert.equal(app.spoken.length,1);
});
test('Random song button always picks a different track and starts playback',async()=>{
  const playlist=[{title:'A',src:'music/a.mp3'},{title:'B',src:'music/b.mp3'},{title:'C',src:'music/c.mp3'}];
  const app=boot({bootstrap:playlist});await new Promise(setImmediate);
  for(let i=0;i<10;i++){
    const previous=app.elements['background-music'].src;app.elements['music-random'].listeners.click();await new Promise(setImmediate);
    assert.notEqual(app.elements['background-music'].src,previous);assert.equal(app.elements['background-music'].paused,false);
  }
});
test('Welcome prefers natural Vietnamese voices, honors voice choice and never chooses English voices',async()=>{
  const voices=[{lang:'en-US',name:'English Natural',voiceURI:'en'},{lang:'vi-VN',name:'Microsoft An',voiceURI:'an'},{lang:'vi-VN',name:'HoaiMy Natural',voiceURI:'natural'}];
  const preferred=boot({speech:true,voices});preferred.events.pointerup({type:'pointerup',target:{}});assert.equal(preferred.spoken[0].voice.voiceURI,'natural');
  const saved=boot({speech:true,voices,savedVoice:'an'});saved.events.pointerup({type:'pointerup',target:{}});assert.equal(saved.spoken[0].voice.voiceURI,'an');
  const englishOnly=boot({speech:true,voices:[voices[0]]});await new Promise(setImmediate);assert.equal(englishOnly.spoken.length,0);assert.equal(englishOnly.elements['background-music'].paused,false);
});
test('Disc rotates only during audible music; closing player does not pause music',async()=>{
  const app=boot();await new Promise(setImmediate);assert.equal(app.elements['music-disc'].classList['is-playing'],true);
  app.elements['music-popover'].open=true;app.elements['music-close'].listeners.click();assert.equal(app.elements['music-popover'].open,false);assert.equal(app.elements['background-music'].paused,false);
  app.elements['music-toggle'].listeners.click();assert.equal(app.elements['music-disc'].classList['is-playing'],false);
});
test('Recorded Vietnamese welcome works without installed voices and music waits until it ends',async()=>{
  const app=boot({autoGreeting:false});await new Promise(setImmediate);
  assert.equal(app.greetingPlays(),1);assert.equal(app.plays(),0);
  assert.match(app.elements['music-voice-note'].textContent,/có sẵn/);
  app.elements['welcome-audio'].onended();await new Promise(setImmediate);assert.equal(app.plays(),1);
});
test('Blocked recorded welcome retries on gesture and stopping it never starts music',async()=>{
  const app=boot({autoGreeting:false,greetingBlocked:true});await new Promise(setImmediate);assert.equal(app.plays(),0);
  app.allow();app.events.pointerup({type:'pointerup',target:{}});await new Promise(setImmediate);
  assert.equal(app.greetingPlays(),2);assert.equal(app.elements['background-music'].paused,true);
  app.elements['music-toggle'].listeners.click();app.elements['welcome-audio'].onended();await new Promise(setImmediate);assert.equal(app.elements['background-music'].paused,true);
});
