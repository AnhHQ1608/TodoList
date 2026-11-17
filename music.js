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
  const preferredIndex = Number.isInteger(saved.index) ? saved.index : 0;
  let index = 0;
  // Nguồn đầu tiên có sẵn trong HTML để không bỏ lỡ tương tác khi playlist còn đang tải.
  let playlist = [{src:'music/xao-xuyen.mp3',title:'Xao Xuyến (ThahTrung Remix)'}];
  let interacted = false;
  let waiting = enabled;
  let request = 0;
  audio.autoplay = enabled;
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
    if (start) void play();
    else render();
  }
  byId('toggle').addEventListener('click', () => enabled ? stop() : void play());
  byId('play').addEventListener('click', () => !audio.paused ? stop() : void play());
  byId('prev').addEventListener('click', () => select(index - 1, true));
  byId('next').addEventListener('click', () => select(index + 1, true));
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
    if (event.target.closest?.('#music-toggle, #music-play, #music-prev, #music-next, #music-track')) return;
    interacted = true;
    if (enabled && (waiting || audio.paused)) void play();
  }
  document.addEventListener('click', unlock, true);
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('pointerup', unlock, true);
  document.addEventListener('touchend', unlock, {capture:true,passive:true});
  document.addEventListener('keydown', unlock, true);
  track.replaceChildren(...playlist.map((item,i)=>new Option(item.title,String(i))));
  track.value='0';
  render();
  void play();
  fetch('music/playlist.json').then(response => {
    if (!response.ok) throw new Error('Playlist unavailable');
    return response.json();
  }).then(items => {
    if (!Array.isArray(items) || !items.length) throw new Error('Empty playlist');
    const activeSource = playlist[index].src;
    playlist = items;
    track.replaceChildren(...playlist.map((item, i) => new Option(item.title, String(i))));
    const activeIndex=playlist.findIndex(item=>item.src===activeSource);
    const next=(interacted || !audio.paused) && activeIndex>=0 ? activeIndex : preferredIndex>=0 && preferredIndex<playlist.length ? preferredIndex : 0;
    const sourceChanged=audio.getAttribute('src')!==playlist[next].src;
    select(next);
    if (enabled && audio.paused && (sourceChanged || interacted)) void play();
    else if (enabled && !audio.paused) status.textContent=`Đang phát: ${playlist[index].title}`;
    else status.textContent = 'Đã tắt nhạc.';
  }).catch(() => {
    // Bài đầu vẫn phát được và nút tắt vẫn dùng được nếu mạng tải playlist bị lỗi.
    waiting = enabled && audio.paused;
    status.textContent = enabled ? 'Đang dùng bài nhạc có sẵn. Danh sách đầy đủ chưa tải được.' : 'Đã tắt nhạc.';
    render();
  });
})();
