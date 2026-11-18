// Dùng trình phát chính thức, chỉ tải YouTube khi người nghe chọn bài YouTube.
(() => {
  const dock=document.getElementById('music-video-dock');
  let apiPromise,player=null,generation=0,timer;
  const bridge={onState(){},onBlocked(){},onError(){},onProgress(){}};
  function loadAPI(){
    if(window.YT?.Player)return Promise.resolve();
    if(apiPromise)return apiPromise;
    apiPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      const timeout=setTimeout(()=>fail(),15000);
      function fail(){clearTimeout(timeout);script.remove();apiPromise=null;reject(Error('YouTube unavailable'));}
      window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);resolve();};
      script.src='https://www.youtube.com/iframe_api';script.onerror=fail;
      document.head.append(script);
    });
    return apiPromise;
  }
  bridge.stop=()=>{
    generation++;clearInterval(timer);
    if(player){player.destroy();player=null;}
    dock.hidden=true;
  };
  bridge.play=async(videoId,volume)=>{
    dock.hidden=false;
    document.getElementById('music-video-link').href='https://www.youtube.com/watch?v='+encodeURIComponent(videoId);
    if(player && player.getVideoData()?.video_id===videoId){player.setVolume(volume*100);player.playVideo();return;}
    const current=++generation;
    if(player){player.destroy();player=null;}
    clearInterval(timer);
    await loadAPI();
    if(current!==generation)throw new DOMException('Cancelled','AbortError');
    const host=document.createElement('div');dock.querySelector('.youtube-frame').replaceChildren(host);
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{if(current===generation)generation++;reject(Error('YouTube player timeout'));},15000);
      new window.YT.Player(host,{
        width:'100%',height:'100%',videoId,
        playerVars:{playsinline:1,controls:1,origin:location.origin},
        events:{
          onReady(event){
            clearTimeout(timeout);
            if(current!==generation){event.target.destroy();reject(new DOMException('Cancelled','AbortError'));return;}
            player=event.target;
            const iframe=player.getIframe();iframe.title='YouTube video player';iframe.referrerPolicy='strict-origin-when-cross-origin';
            player.setVolume(volume*100);player.playVideo();
            timer=setInterval(()=>bridge.onProgress(),500);resolve();
          },
          onStateChange(event){if(current===generation)bridge.onState(event.data);},
          onAutoplayBlocked(){if(current===generation)bridge.onBlocked();},
          onError(event){clearTimeout(timeout);if(current===generation)bridge.onError(event.data);reject(Error('YouTube error '+event.data));}
        }
      });
    });
  };
  bridge.pause=()=>{if(player)player.pauseVideo();else generation++;};
  bridge.volume=value=>player?.setVolume(value*100);
  bridge.seek=value=>player?.seekTo(value,true);
  bridge.isPlaying=()=>player?.getPlayerState()===1;
  bridge.duration=()=>player?.getDuration() || 0;
  bridge.currentTime=()=>player?.getCurrentTime() || 0;
  window.todoYouTube=bridge;
})();
