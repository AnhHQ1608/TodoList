(() => {
  const byId = id => document.getElementById(`music-${id}`);
  const audio = document.getElementById('background-music');
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
  audio.autoplay = false;
  audio.playsInline = true;
  audio.volume = typeof saved.volume === 'number' && Number.isFinite(saved.volume) && saved.volume > 0 ? Math.min(1, saved.volume) : 0.35;
  const persist = () => {
    try { localStorage.setItem(key, JSON.stringify({ enabled, index, volume: audio.volume })); } catch {}
  };
  function render() {
    byId('toggle').textContent = enabled ? 'Tắt nhạc' : 'Bật nhạc';
    byId('toggle').setAttribute('aria-pressed', String(enabled));
    byId('play').textContent = audio.paused ? 'Phát' : 'Tạm dừng';
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
    if(typeof window!=='undefined')window.speechSynthesis?.cancel();
  }
  function startExperience(gesture=false) {
    if(!enabled || introActive)return;
    if(introDone){if(waiting || audio.paused)void play();return;}
    const synth=typeof window!=='undefined'?window.speechSynthesis:null;
    if(!synth || typeof SpeechSynthesisUtterance==='undefined'){introDone=true;void play();return;}
    if(!gesture && !(typeof navigator!=='undefined' && navigator.userActivation?.hasBeenActive)){
      waiting=true;status.textContent='Chạm vào trang để nghe lời chào và nhạc nền.';return;
    }
    introActive=true;waiting=false;audio.autoplay=false;audio.muted=true;
    const sequence=++introSequence;
    // Kích hoạt phần tử nhạc trong chính thao tác chạm, nhưng giữ im lặng khi đọc lời chào.
    try {Promise.resolve(audio.play()).then(()=>{if(introActive && sequence===introSequence)audio.pause();}).catch(()=>{});}catch{ /* Vẫn đọc lời chào. */ }
    const text='Chào mừng bạn đến với Focus List. Chúc bạn một ngày thật hiệu quả. Mời bạn nghe nhạc và cùng bắt đầu nhé!';
    const utterance=new SpeechSynthesisUtterance(text);utterance.lang='vi-VN';utterance.rate=1;utterance.pitch=1;utterance.volume=Math.max(.5,audio.volume);
    const voice=synth.getVoices().find(voice=>voice.lang.toLowerCase().startsWith('vi'));
    if(voice)utterance.voice=voice;
    function finish(){
      if(sequence!==introSequence || !introActive)return;
      introActive=false;introDone=true;clearTimeout(introTimer);audio.muted=false;
      if(enabled)void play();
    }
    function timeout(){if(sequence===introSequence && introActive){synth.cancel();finish();}}
    utterance.onend=finish;utterance.onerror=finish;
    utterance.onstart=()=>{clearTimeout(introTimer);introTimer=setTimeout(timeout,18000);};
    introTimer=setTimeout(timeout,4000);
    status.textContent='Đang đọc lời chào…';
    try{synth.speak(utterance);}catch{finish();}
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
    if (event.target.closest?.('#music-toggle, #music-play, #music-prev, #music-next, #music-random, #music-track')) return;
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
