(() => {
  const byId = id => document.getElementById(`music-${id}`);
  const audio = document.getElementById('background-music');
  const greetingAudio = document.getElementById('welcome-audio');
  const player = byId('player');
  const track = byId('track');
  const status = byId('status');
  const key = 'focus-list-music-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
  // Mỗi lần vào web bắt đầu ở chế độ tự phát; Tắt nhạc vẫn có tác dụng trong phiên hiện tại.
  let enabled = true;
  let index = 0;
  // Nguồn đầu tiên có sẵn trong HTML để không bỏ lỡ tương tác khi playlist còn đang tải.
  let playlist = [{src:'music/xao-xuyen.mp3',title:'Xao Xuyến (ThahTrung Remix)'}];
  try {
    const initial=JSON.parse(document.getElementById('music-bootstrap')?.textContent || 'null');
    if(Array.isArray(initial) && initial.length)playlist=initial;
  } catch { /* Dùng bài đầu dự phòng. */ }
  function randomIndex(items,previous=saved.index) {
    const choices=items.map((_,i)=>i).filter(i=>items.length===1 || i!==previous);
    return choices[Math.floor(Math.random()*choices.length)];
  }
  index=randomIndex(playlist);
  audio.src=playlist[index].src;
  let interacted = false;
  let waiting = enabled;
  let request = 0;
  let introDone=false;
  let introActive=false;
  let introTimer;
  let introSequence=0;
  let voiceChoice=saved.voiceModeVersion===2 ? saved.voiceURI || 'recorded-vi' : 'recorded-vi';
  const synth=typeof window!=='undefined'?window.speechSynthesis:null;
  function vietnameseVoices() {
    return (synth?.getVoices() || []).filter(voice=>/^vi(?:-|$)/i.test(voice.lang.replace('_','-'))).sort((a,b)=>{
      const score=voice=>(/natural|neural|online/i.test(voice.name)?4:0)+(/google/i.test(voice.name)?2:0);
      return score(b)-score(a);
    });
  }
  function refreshVoices() {
    const voices=vietnameseVoices();
    if(voiceChoice!=='recorded-vi' && !voices.some(voice=>voice.voiceURI===voiceChoice))voiceChoice='recorded-vi';
    byId('voice').replaceChildren(new Option('Giọng Việt có sẵn','recorded-vi'),...voices.map(voice=>new Option(voice.name,voice.voiceURI)));
    byId('voice').value=voiceChoice;byId('voice').hidden=!voices.length;
    byId('voice-note').textContent=voiceChoice==='recorded-vi'?'Lời chào tiếng Việt có sẵn trên web.':voices.find(voice=>voice.voiceURI===voiceChoice)?.name || '';
  }
  refreshVoices();synth?.addEventListener?.('voiceschanged',refreshVoices);
  byId('voice').addEventListener('change',()=>{voiceChoice=byId('voice').value;persist();refreshVoices();});
  byId('greeting-preview').addEventListener('click',()=>{cancelIntro();introDone=false;enabled=true;startExperience(true);});
  byId('close').addEventListener('click',()=>{byId('popover').open=false;byId('disc').focus();});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest?.('#music-popover'))byId('popover').open=false;},true);
  byId('popover').addEventListener('keydown',event=>{if(event.key==='Escape'){byId('popover').open=false;byId('disc').focus();}});
  audio.autoplay = false;
  audio.playsInline = true;
  audio.volume = typeof saved.volume === 'number' && Number.isFinite(saved.volume) && saved.volume > 0 ? Math.min(1, saved.volume) : 0.35;
  const persist = () => {
    try { localStorage.setItem(key, JSON.stringify({ enabled, index, volume: audio.volume,voiceURI:voiceChoice,voiceModeVersion:2 })); } catch {}
  };
  function render() {
    byId('disc').classList.toggle('is-playing',!audio.paused && !audio.muted && !introActive);
    byId('toggle').textContent = enabled ? 'Tắt nhạc' : 'Bật nhạc';
    byId('toggle').setAttribute('aria-pressed', String(enabled));
    byId('play').textContent = introActive ? 'Dừng lời chào' : audio.paused ? 'Phát' : 'Tạm dừng';
    byId('volume').value = Math.round(audio.volume * 100);
    byId('volume-value').value = `${Math.round(audio.volume * 100)}%`;
  }
  function stop() {
    cancelIntro();
    request++;
    enabled = false;
    audio.autoplay = false;
    waiting = false;
    audio.pause();
    status.textContent = 'Đã tắt nhạc.';
    persist();
    render();
  }
  async function play() {
    if (!playlist.length) return;
    if(introActive)cancelIntro();
    enabled = true;
    audio.autoplay = true;
    waiting = false;
    const current = ++request;
    status.textContent = 'Đang tải nhạc…';
    persist();
    render();
    try {
      if (audio.error) audio.load();
      await audio.play();
      if (current !== request) return;
      status.textContent = `Đang phát: ${playlist[index].title}`;
    } catch (error) {
      if (current !== request) return;
      waiting = error.name === 'NotAllowedError' || error.name === 'AbortError';
      status.textContent = waiting ? 'Bấm Phát hoặc tương tác với trang để bật nhạc.' : 'Không phát được bài này. Hãy thử lại hoặc chọn bài khác.';
    }
    render();
  }
  function cancelIntro() {
    introSequence++;introActive=false;introDone=true;clearTimeout(introTimer);audio.muted=false;
    greetingAudio.pause();
    if(typeof window!=='undefined')window.speechSynthesis?.cancel();
  }
  function playRecordedGreeting(gesture=false) {
    introActive=true;waiting=false;audio.autoplay=false;audio.pause();audio.muted=true;
    const sequence=++introSequence;
    if(gesture){try{Promise.resolve(audio.play()).then(()=>{if(introActive && sequence===introSequence)audio.pause();}).catch(()=>{});}catch{ /* Tiếp tục phát lời chào. */ }}
    greetingAudio.currentTime=0;greetingAudio.volume=Math.max(.5,audio.volume);greetingAudio.playbackRate=1;
    function finish(){
      if(sequence!==introSequence || !introActive)return;
      introActive=false;introDone=true;clearTimeout(introTimer);audio.muted=false;greetingAudio.pause();
      if(enabled)void play();
    }
    function failed(error){
      if(sequence!==introSequence || !introActive)return;
      if(error?.name==='NotAllowedError' || error?.name==='AbortError'){
        introActive=false;waiting=true;clearTimeout(introTimer);audio.muted=false;
        status.textContent='Chạm vào trang để nghe lời chào, sau đó nhạc sẽ phát.';render();
      }else{byId('voice-note').textContent='Chưa tải được lời chào. Hãy thử nút Nghe lời chào.';finish();}
    }
    greetingAudio.onended=finish;greetingAudio.onerror=()=>failed();
    introTimer=setTimeout(()=>failed(),30000);
    status.textContent='Đang phát lời chào tiếng Việt…';render();
    try{if(greetingAudio.error)greetingAudio.load();Promise.resolve(greetingAudio.play()).catch(failed);}catch(error){failed(error);}
  }
  function startExperience(gesture=false) {
    if(!enabled || introActive)return;
    if(introDone){if(waiting || audio.paused)void play();return;}
    if(voiceChoice==='recorded-vi'){playRecordedGreeting(gesture);return;}
    const synth=typeof window!=='undefined'?window.speechSynthesis:null;
    if(!synth || typeof SpeechSynthesisUtterance==='undefined'){playRecordedGreeting(gesture);return;}
    const voices=vietnameseVoices();
    if(synth.getVoices().length && !voices.length){playRecordedGreeting(gesture);return;}
    if(!gesture && !(typeof navigator!=='undefined' && navigator.userActivation?.hasBeenActive)){
      waiting=true;status.textContent='Chạm vào trang để nghe lời chào và nhạc nền.';return;
    }
    introActive=true;waiting=false;audio.autoplay=false;audio.muted=true;
    const sequence=++introSequence;
    // Kích hoạt phần tử nhạc trong chính thao tác chạm, nhưng giữ im lặng khi đọc lời chào.
    try {Promise.resolve(audio.play()).then(()=>{if(introActive && sequence===introSequence)audio.pause();}).catch(()=>{});}catch{ /* Vẫn đọc lời chào. */ }
    const text='Chào mừng bạn đến với góc tập trung của Quốc Anh. Chúc bạn một ngày thật hiệu quả. Mời bạn nghe một chút nhạc và bắt đầu nhé!';
    const utterance=new SpeechSynthesisUtterance(text);utterance.lang='vi-VN';utterance.rate=.95;utterance.pitch=1;utterance.volume=Math.max(.5,audio.volume);
    const voice=voices.find(voice=>voice.voiceURI===voiceChoice) || voices[0];
    if(voice)utterance.voice=voice;
    function finish(){
      if(sequence!==introSequence || !introActive)return;
      introActive=false;introDone=true;clearTimeout(introTimer);audio.muted=false;
      if(enabled)void play();
    }
    function fallback(){if(sequence!==introSequence || !introActive)return;introActive=false;clearTimeout(introTimer);playRecordedGreeting();}
    function timeout(){if(sequence===introSequence && introActive){synth.cancel();fallback();}}
    utterance.onend=finish;utterance.onerror=fallback;
    utterance.onstart=()=>{clearTimeout(introTimer);introTimer=setTimeout(timeout,18000);};
    introTimer=setTimeout(timeout,4000);
    status.textContent='Đang đọc lời chào…';
    try{synth.speak(utterance);}catch{fallback();}
  }
  function select(next, start = false) {
    if (!playlist.length) return;
    index = (next + playlist.length) % playlist.length;
    track.value = String(index);
    if (audio.getAttribute('src') !== playlist[index].src) {request++;audio.src = playlist[index].src;}
    byId('seek').value = 0;
    byId('seek').disabled = true;
    byId('current').textContent = '0:00';
    byId('duration').textContent = '0:00';
    persist();
    if (start) {if(introActive)cancelIntro();enabled=true;startExperience(true);}
    else render();
  }
  byId('toggle').addEventListener('click', () => {if(enabled)stop();else {enabled=true;startExperience(true);}});
  byId('play').addEventListener('click', () => {if(introActive || !audio.paused)stop();else {enabled=true;startExperience(true);}});
  byId('prev').addEventListener('click', () => select(index - 1, true));
  byId('next').addEventListener('click', () => select(index + 1, true));
  byId('random').addEventListener('click', () => select(randomIndex(playlist,index),true));
  track.addEventListener('change', () => select(Number(track.value), true));
  byId('volume').addEventListener('input', event => {
    audio.volume = Number(event.target.value) / 100;
    persist();
    render();
  });
  const time = value => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00';
  function progress() {
    const valid = Number.isFinite(audio.duration) && audio.duration > 0;
    byId('seek').disabled = !valid;
    byId('seek').value = valid ? audio.currentTime / audio.duration * 100 : 0;
    byId('current').textContent = time(audio.currentTime);
    byId('duration').textContent = time(audio.duration);
  }
  audio.addEventListener('loadedmetadata', progress);
  audio.addEventListener('timeupdate', progress);
  audio.addEventListener('play', render);
  audio.addEventListener('pause', render);
  audio.addEventListener('ended', () => { if (enabled) select(index + 1, true); });
  audio.addEventListener('error', () => { status.textContent = 'Không tải được bài hát. Hãy chọn bài khác hoặc thử lại.'; render(); });
  byId('seek').addEventListener('input', event => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Number(event.target.value) / 100 * audio.duration;
  });
  function unlock(event) {
    if (event.button > 0) return;
    if (event.type === 'keydown' && (event.repeat || event.ctrlKey || event.altKey || event.metaKey || ['Escape','Shift','Control','Alt','Meta'].includes(event.key))) return;
    if (event.target.closest?.('#music-toggle, #music-play, #music-prev, #music-next, #music-random, #music-track, #music-voice, #music-greeting-preview')) return;
    interacted = true;
    if (enabled && (waiting || audio.paused) && !introActive) startExperience(true);
  }
  document.addEventListener('click', unlock, true);
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('pointerup', unlock, true);
  document.addEventListener('touchend', unlock, {capture:true,passive:true});
  document.addEventListener('keydown', unlock, true);
  track.replaceChildren(...playlist.map((item,i)=>new Option(item.title,String(i))));
  track.value=String(index);
  render();
  persist();
  startExperience();
  fetch('music/playlist.json',{cache:'no-cache'}).then(response => {
    if (!response.ok) throw new Error('Playlist unavailable');
    return response.json();
  }).then(items => {
    if (!Array.isArray(items) || !items.length) throw new Error('Empty playlist');
    const activeSource = playlist[index].src;
    playlist = items;
    track.replaceChildren(...playlist.map((item, i) => new Option(item.title, String(i))));
    const activeIndex=playlist.findIndex(item=>item.src===activeSource);
    const next=activeIndex>=0 ? activeIndex : randomIndex(playlist);
    const sourceChanged=audio.getAttribute('src')!==playlist[next].src;
    select(next);
    if (enabled && !introActive && audio.paused && (sourceChanged || interacted)) startExperience(interacted);
    else if (enabled && !introActive && !audio.paused) status.textContent=`Đang phát: ${playlist[index].title}`;
    else if(!enabled) status.textContent = 'Đã tắt nhạc.';
  }).catch(() => {
    // Bài đầu vẫn phát được và nút tắt vẫn dùng được nếu mạng tải playlist bị lỗi.
    waiting = enabled && audio.paused;
    status.textContent = enabled ? 'Đang dùng bài nhạc có sẵn. Danh sách đầy đủ chưa tải được.' : 'Đã tắt nhạc.';
    render();
  });
})();
