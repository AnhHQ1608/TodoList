const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function boot({loaded=true,ready=true}={}){
  const players=[],timers=[],scripts=[];
  const frame={replaceChildren(node){this.child=node;}};
  const dock={hidden:true,querySelector:()=>frame},link={};
  const window={};
  function Player(host,options){
    const iframe={};
    const instance={state:-1,id:options.videoId,options,volume:0,destroyed:false,
      getIframe:()=>iframe,getVideoData:()=>({video_id:instance.id}),
      playVideo(){this.state=1;options.events.onStateChange({data:1,target:this});},
      pauseVideo(){this.state=2;options.events.onStateChange({data:2,target:this});},
      destroy(){this.destroyed=true;},setVolume(value){this.volume=value;},seekTo(value){this.seek=value;},
      getPlayerState(){return this.state;},getDuration:()=>240,getCurrentTime:()=>40,
      ready(){options.events.onReady({target:this});}};
    players.push(instance);if(ready)queueMicrotask(()=>instance.ready());return instance;
  }
  if(loaded)window.YT={Player};
  const context={window,location:{origin:'https://example.com'},DOMException,
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},setInterval:()=>1,clearInterval(){},
    document:{getElementById:id=>id==='music-video-dock'?dock:link,createElement:()=>({remove(){this.removed=true;}}),head:{append:script=>scripts.push(script)}}};
  vm.runInNewContext(fs.readFileSync('youtube.js','utf8'),context);
  return {bridge:window.todoYouTube,players,dock,link,timers,scripts,window,Player};
}

test('YouTube bridge uses the official visible player and supports pause, resume, volume and seek',async()=>{
  const app=boot(),states=[];app.bridge.onState=state=>states.push(state);
  await app.bridge.play('pD80zA6XzgY',.35);
  assert.equal(app.dock.hidden,false);assert.equal(app.link.href,'https://www.youtube.com/watch?v=pD80zA6XzgY');
  assert.equal(app.players[0].options.playerVars.origin,'https://example.com');
  assert.equal(app.players[0].options.playerVars.controls,1);
  assert.equal(app.players[0].getIframe().referrerPolicy,'strict-origin-when-cross-origin');
  assert.equal(app.bridge.isPlaying(),true);app.bridge.pause();assert.equal(app.bridge.isPlaying(),false);
  await app.bridge.play('pD80zA6XzgY',.5);assert.equal(app.players.length,1);assert.deepEqual(states,[1,2,1]);
  app.bridge.volume(.7);assert.equal(app.players[0].volume,70);app.bridge.seek(60);assert.equal(app.players[0].seek,60);
  assert.equal(app.bridge.duration(),240);assert.equal(app.bridge.currentTime(),40);
  app.bridge.stop();assert.equal(app.dock.hidden,true);assert.equal(app.players[0].destroyed,true);
});

test('Switching away while the YouTube API loads never creates a late playing video',async()=>{
  const app=boot({loaded:false});
  const pending=app.bridge.play('pD80zA6XzgY',.35);
  assert.equal(app.scripts[0].src,'https://www.youtube.com/iframe_api');
  app.bridge.stop();app.window.YT={Player:app.Player};app.window.onYouTubeIframeAPIReady();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(app.players.length,0);assert.equal(app.dock.hidden,true);
});

test('Late readiness after stop or timeout does not start playback, and errors reach the UI',async()=>{
  const app=boot({ready:false});let errors=0;app.bridge.onError=()=>errors++;
  const pending=app.bridge.play('pD80zA6XzgY',.35);await new Promise(setImmediate);
  app.bridge.stop();app.players[0].ready();await assert.rejects(pending,{name:'AbortError'});
  assert.equal(app.players[0].destroyed,true);assert.equal(app.bridge.isPlaying(),false);
  const failed=boot({ready:false});failed.bridge.onError=()=>errors++;
  const loading=failed.bridge.play('pD80zA6XzgY',.35);await new Promise(setImmediate);
  failed.players[0].options.events.onError({data:150});await assert.rejects(loading,/YouTube error 150/);assert.equal(errors,1);
  const timed=boot({ready:false}),slow=timed.bridge.play('pD80zA6XzgY',.35);await new Promise(setImmediate);
  timed.timers.at(-1)();await assert.rejects(slow,/timeout/);timed.players[0].ready();assert.equal(timed.players[0].destroyed,true);
});
