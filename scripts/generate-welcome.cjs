// Tạo trước lời chào công khai; website phát file cục bộ, không gửi task/tên người dùng ra ngoài.
const fs = require('node:fs');
(async () => {
  const sentences = [
    'Chào mừng bạn quay trở lại.',
    'Chúc bạn một ngày thật hiệu quả.',
    'Mời bạn nghe một chút nhạc và bắt đầu nhé!'
  ];
  const chunks = [];
  for (const text of sentences) {
    const url = new URL('https://translate.google.com/translate_tts');
    url.search = new URLSearchParams({ie:'UTF-8',client:'tw-ob',tl:'vi',q:text}).toString();
    const response = await fetch(url, {signal:AbortSignal.timeout(20000)});
    if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) throw Error('TTS response: ' + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000) throw Error('Empty TTS response');
    chunks.push(bytes);
  }
  fs.writeFileSync('music/welcome-vi.mp3', Buffer.concat(chunks));
  console.log('Created music/welcome-vi.mp3 (' + chunks.reduce((size,item)=>size+item.length,0) + ' bytes)');
})().catch(error => { console.error(error.message); process.exitCode=1; });
