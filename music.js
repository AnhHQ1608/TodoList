(() => {
  const byId = id => document.getElementById(`music-${id}`);
  const audio = document.getElementById('background-music');
  const player = byId('player');
  const track = byId('track');
  const status = byId('status');
  const key = 'focus-list-music-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
  let enabled = saved.enabled !== false;
  let index = Number.isInteger(saved.index) ? saved.index : 0;
  let playlist = [];
  let waiting = enabled;
  let request = 0;
  audio.autoplay = enabled;
  audio.playsInline = true;
  audio.volume = typeof saved.volume === 'number' && Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.35;
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
    waiting = false;
    audio.pause();
    status.textContent = 'Đã tắt nhạc.';
    persist();
    render();
  }
  async function play() {
    if (!playlist.length) return;
    enabled = true;
    waiting = false;
    const current = ++request;
    status.textContent = 'Đang tải nhạc…';
    persist();
    render();
    try {
      await audio.play();
      if (current !== request) return;
      status.textContent = `Đang phát: ${playlist[index].title}`;
    } catch (error) {
      if (current !== request) return;
      waiting = error.name === 'NotAllowedError';
      status.textContent = waiting ? 'Bấm Phát hoặc tương tác với trang để bật nhạc.' : 'Không phát được bài này. Hãy thử lại hoặc chọn bài khác.';
    }
    render();
  }
  function select(next, start = false) {
    if (!playlist.length) return;
    request++;
    index = (next + playlist.length) % playlist.length;
    track.value = String(index);
    audio.src = playlist[index].src;
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
    if (event.type === 'keydown' && (event.repeat || event.ctrlKey || event.altKey || event.metaKey || ['Escape','Shift','Control','Alt','Meta'].includes(event.key))) return;
    if (player.contains(event.target)) return;
    if (enabled && waiting && playlist.length) void play();
  }
  document.addEventListener('click', unlock);
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  render();
  fetch('music/playlist.json').then(response => {
    if (!response.ok) throw new Error('Playlist unavailable');
    return response.json();
  }).then(items => {
    if (!Array.isArray(items) || !items.length) throw new Error('Empty playlist');
    playlist = items;
    track.replaceChildren(...playlist.map((item, i) => new Option(item.title, String(i))));
    select(index >= 0 && index < playlist.length ? index : 0);
    if (enabled) void play();
    else status.textContent = 'Đã tắt nhạc.';
  }).catch(() => {
    waiting = false;
    status.textContent = 'Không tải được danh sách nhạc. Hãy tải lại trang.';
    player.querySelectorAll('button, input, select').forEach(control => { control.disabled = true; });
  });
})();
