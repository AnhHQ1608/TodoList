// Kiểm tra luồng thật trên Edge với API giả lập; không tạo tài khoản trên production.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  if(!fs.existsSync(edge))throw Error('Cần Microsoft Edge để chạy kiểm tra giao diện.');
  const root=path.resolve(__dirname,'..');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'focus-account-qa-'));
  const server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    if(file.endsWith('telemetry-config.js')){res.setHeader('Content-Type','application/javascript');return res.end("window.TODO_ANALYTICS={apiUrl:'https://api.example'};");}
    try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.mp3')?'audio/mpeg':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const child=spawn(edge,['--headless=new','--disable-gpu','--autoplay-policy=user-gesture-required','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
  let socket;
  try{
    let port;
    for(let i=0;i<80;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await delay(150);}}
    if(!port)throw Error('Edge chưa mở DevTools.');
    const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
    let sequence=0;const pending=new Map(),errors=[];
    function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},8000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});socket.send(JSON.stringify({id,method,params}));});}
    const user={id:'12345678-1234-4123-8123-123456789abc',username:'testuser',fullName:'Hoàng Quốc Anh'};
    let data={tasks:[],folders:[]},version=0;
    socket.onmessage=event=>{
      const message=JSON.parse(event.data);
      if(message.id){const item=pending.get(message.id);if(item){pending.delete(message.id);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}return;}
      if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
      if(message.method==='Fetch.requestPaused'){
        const {requestId,request}=message.params;let result={},status=200;
        const route=new URL(request.url).pathname;
        if(request.method==='OPTIONS')status=204;
        else if(route==='/auth/login'||route==='/auth/register'){
          if(route==='/auth/register')assert.equal(JSON.parse(request.postData).fullName,user.fullName);
          result={token:'a'.repeat(64),user,expiresAt:Date.now()+864000000};
        }
        else if(route==='/auth/me')result={user,expiresAt:Date.now()+864000000};
        else if(route==='/admin/login')result={token:'admin-test-token',expiresAt:Date.now()+864000000};
        else if(route==='/admin/sessions')result={sessions:[24,31].map(device_no=>({device_no,visitor_id:'test-visitor',username:user.username,fullName:user.fullName,browser:'Chrome',os:'Windows',device:'desktop',last_seen:1}))};
        else if(route==='/admin/events')result={events:[]};
        else if(route==='/admin/users')result={users:[]};
        else if(route==='/account/data'){
          if(request.method==='POST'){const body=JSON.parse(request.postData);assert.equal(body.version,version);data=body.data;version++;result={version};}
          else result={data,version};
        }else if(route==='/device/alerts')result={alerts:[]};
        else result={accepted:true};
        send('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:origin},{name:'Access-Control-Allow-Headers',value:'Content-Type, Authorization'},{name:'Access-Control-Allow-Methods',value:'GET, POST, OPTIONS'}],body:Buffer.from(status===204?'':JSON.stringify(result)).toString('base64')}).catch(e=>{if(!e.message.includes('Invalid InterceptionId'))errors.push(e.message);});
      }
    };
    await send('Runtime.enable');await send('Page.enable');
    await send('Fetch.enable',{patterns:[{urlPattern:'https://api.example/*',requestStage:'Request'}]});
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
    async function until(expression){for(let i=0;i<250;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Timeout: '+expression);}
    await send('Page.navigate',{url:origin+'/index.html'});
    await until("location.pathname.endsWith('/login.html') && !!document.getElementById('auth-submit')");
    await evaluate("document.getElementById('auth-register-tab').click();document.getElementById('auth-fullname').value='Hoàng Quốc Anh';document.getElementById('auth-username').value='testuser';document.getElementById('auth-password').value='Test-password-12345';document.getElementById('auth-confirm').value='Test-password-12345';document.getElementById('auth-form').requestSubmit();");
    await until("!!window.todoAccount && !document.documentElement.classList.contains('account-loading')");
    assert.equal(await evaluate("document.getElementById('account-name').textContent"),'Hoàng Quốc Anh');
    await until("document.getElementById('background-music').readyState>=1");
    await until("document.getElementById('welcome-audio').readyState>=1");
    assert.ok(await evaluate("document.getElementById('welcome-audio').duration>5"));
    await evaluate("document.getElementById('task-input').scrollIntoView({block:'center'})");
    const point=await evaluate("(()=>{const rect=document.getElementById('task-input').getBoundingClientRect();return {x:rect.x+20,y:rect.y+20};})()");
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    await until("!document.getElementById('welcome-audio').paused && document.getElementById('welcome-audio').currentTime>0.1");
    assert.equal(await evaluate("document.getElementById('background-music').paused || document.getElementById('background-music').muted"),true);
    await until("!document.getElementById('background-music').paused && document.getElementById('background-music').currentTime>0.1");
    assert.equal(await evaluate("document.getElementById('welcome-audio').ended"),true);
    assert.equal(await evaluate("document.getElementById('background-music').volume>0 && !document.getElementById('background-music').muted"),true);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.vinyl-record')).animationPlayState"),'running');
    await evaluate("window.scrollTo(0,0);document.getElementById('music-disc').click()");
    assert.equal(await evaluate("document.getElementById('music-popover').open"),true);
    assert.equal(await evaluate("(()=>{const r=document.getElementById('music-player').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth;})()"),true);
    await evaluate("document.getElementById('music-close').click()");
    assert.equal(await evaluate("document.getElementById('music-popover').open"),false);
    await evaluate("document.getElementById('open-settings').click();document.getElementById('menu-guide-tab').click()");
    assert.equal(await evaluate("document.getElementById('menu-guide-panel').hidden"),false);
    assert.equal(await evaluate("document.getElementById('menu-guide-tab').getAttribute('aria-expanded')"),'true');
    assert.equal(await evaluate("document.querySelectorAll('.guide-steps li').length"),6);
    assert.equal(await evaluate("document.getElementById('settings-dialog').scrollWidth<=document.getElementById('settings-dialog').clientWidth"),true);
    await evaluate("document.getElementById('menu-sound-tab').click()");
    assert.equal(await evaluate("document.getElementById('menu-guide-panel').hidden"),true);
    await evaluate("document.getElementById('close-settings').click()");
    await evaluate("document.getElementById('task-input').value='Keep my draft';document.getElementById('open-settings').click();document.getElementById('menu-language-tab').click();document.querySelector('[data-language=en]').click()");
    await until("document.getElementById('menu-guide-tab').textContent.includes('How to use')");
    assert.equal(await evaluate('document.documentElement.lang'),'en');
    assert.equal(await evaluate("document.getElementById('task-input').placeholder"),'What would you like to get done?');
    assert.equal(await evaluate("document.getElementById('task-input').value"),'Keep my draft');
    assert.equal(await evaluate("document.getElementById('completed-count').textContent"),'Completed 0 / 0 tasks');
    await evaluate("document.querySelector('[data-language=ja]').click()");
    await until("document.getElementById('menu-guide-tab').textContent.includes('使い方')");
    assert.equal(await evaluate('document.documentElement.lang'),'ja');
    assert.equal(await evaluate("document.getElementById('task-input').placeholder"),'何を達成したいですか？');
    assert.equal(await evaluate("localStorage.getItem('focus-language-v1')"),'ja');
    assert.equal(await evaluate("document.getElementById('settings-dialog').scrollWidth<=document.getElementById('settings-dialog').clientWidth"),true);
    await evaluate("document.querySelector('[data-language=vi]').click();document.getElementById('task-input').value='';document.getElementById('close-settings').click()");
    await until("document.getElementById('menu-guide-tab').textContent.includes('Hướng dẫn sử dụng')");
    assert.equal(await evaluate("document.getElementById('task-options').open"),false);
    assert.equal(await evaluate("[...document.querySelectorAll('#week-days button')].every(button=>button.disabled===(button.id.slice(-10)<dayKey(new Date(Date.now()))))"),true);
    assert.equal(await evaluate("document.getElementById('week-previous').disabled"),true);
    assert.equal(await evaluate("Math.abs(document.getElementById('task-input').getBoundingClientRect().top-document.getElementById('submit-task').getBoundingClientRect().top)<2"),true);
    assert.equal(await evaluate("Boolean(document.querySelector('.task-management').compareDocumentPosition(document.getElementById('task-list')) & Node.DOCUMENT_POSITION_PRECEDING)"),true);
    await evaluate("document.querySelector('#task-options > summary').click()");
    assert.equal(await evaluate("document.getElementById('open-schedule-picker').getBoundingClientRect().height>0"),true);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await evaluate("const planned=new Date();planned.setDate(planned.getDate()+7);window.qaPlannedDay=planned.getFullYear()+'-'+String(planned.getMonth()+1).padStart(2,'0')+'-'+String(planned.getDate()).padStart(2,'0');document.getElementById('task-date').value=window.qaPlannedDay;document.getElementById('task-date').dispatchEvent(new Event('change'));document.getElementById('open-picker').click();");
    assert.equal(await evaluate('dayKey(selectedDate)===window.qaPlannedDay'),true);
    assert.equal(await evaluate("document.getElementById('calendar-days').getBoundingClientRect().height"),0);
    assert.equal(await evaluate("document.getElementById('hour-wheel').getBoundingClientRect().height"),220);
    await evaluate("document.getElementById('hour-wheel').children[18].click();document.getElementById('minute-wheel').children[45].click();");
    assert.equal(await evaluate("document.getElementById('picker-hour').value+':'+document.getElementById('picker-minute').value"),'18:45');
    assert.equal(await evaluate("document.getElementById('next-month').disabled"),true);
    assert.equal(await evaluate("document.querySelectorAll('#calendar-days button:not(:disabled)').length"),1);
    await evaluate("document.getElementById('cancel-picker').click();document.getElementById('task-date').value='';document.getElementById('task-date').dispatchEvent(new Event('change'));");
    await evaluate("document.getElementById('task-input').value='Browser QA task';document.getElementById('task-form').requestSubmit();");
    for(let i=0;i<50 && !data.tasks.length;i++)await delay(100);
    assert.equal(data.tasks[0].text,'Browser QA task');
    await until("document.getElementById('account-sync').textContent==='Đã đồng bộ'");
    await evaluate("document.getElementById('task-repeat').click();for(const button of [...document.getElementById('repeat-days').children]){if(button.getAttribute('aria-pressed')==='true')button.click();}for(const index of [0,2,4])document.getElementById('repeat-days').children[index].click();const start=new Date();start.setDate(start.getDate()+((8-start.getDay())%7||7));document.getElementById('task-date').value=start.getFullYear()+'-'+String(start.getMonth()+1).padStart(2,'0')+'-'+String(start.getDate()).padStart(2,'0');document.getElementById('task-input').value='Weekly QA task';document.getElementById('task-form').requestSubmit();");
    for(let i=0;i<50 && !data.routines?.length;i++)await delay(100);
    assert.deepEqual(data.routines[0].weekdays,[1,3,5]);
    assert.equal(data.tasks.filter(task=>task.routineId).length,3);
    assert.equal(await evaluate("document.getElementById('week-days').children.length"),7);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await until("document.getElementById('account-sync').textContent==='Đã đồng bộ'");
    data.tasks.push({id:'qa-overdue',text:'Recover QA task',completed:false,deadline:new Date(Date.now()-3600000).toISOString(),scheduledDate:null});version++;
    await send('Page.reload');
    await until("!!window.todoAccount && !!document.querySelector('.task')");
    await until("document.getElementById('overdue-history-count').textContent==='1' && document.getElementById('account-sync').textContent==='Đã đồng bộ'");
    await evaluate("document.getElementById('overdue-history').open=true;document.querySelector('.history-task button').click();document.getElementById('open-schedule-picker').click();");
    assert.equal(await evaluate("document.getElementById('picker-time-section').hidden"),true);
    await evaluate("document.getElementById('pick-tomorrow').click();document.getElementById('apply-deadline').click();document.getElementById('open-picker').click();document.getElementById('picker-hour').value='18';document.getElementById('picker-minute').value='30';document.getElementById('picker-hour').dispatchEvent(new Event('input'));document.getElementById('apply-deadline').click();document.getElementById('task-form').requestSubmit();");
    for(let i=0;i<50 && !data.overdueHistory?.[0]?.restoredAt;i++)await delay(100);
    assert.ok(data.overdueHistory[0].restoredAt);
    assert.ok(Date.parse(data.tasks.find(task=>task.id==='qa-overdue').deadline)>Date.now());
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    assert.ok(await evaluate("document.getElementById('task-list').textContent.includes('Browser QA task')"));
    assert.equal(await evaluate("tasks.filter(task=>task.routineId).length"),3);
    await send('Page.navigate',{url:origin+'/admin.html'});
    await until("!!document.getElementById('admin-login-button') && !!window.TODO_ANALYTICS");
    await evaluate("document.getElementById('admin-password').value='fake-admin-password';document.getElementById('admin-login-form').requestSubmit();");
    await until("document.getElementById('admin-device-options').children.length===3");
    await evaluate("document.getElementById('admin-events-tab').click();document.getElementById('admin-device-trigger').click();");
    assert.equal(await evaluate("document.getElementById('admin-device-picker').open"),true);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await evaluate("document.getElementById('admin-device-options').children[1].click()");
    assert.equal(await evaluate("document.getElementById('device-filter').value"),'24');
    assert.equal(await evaluate("document.getElementById('admin-device-picker').open"),false);
    await evaluate("document.documentElement.dataset.theme='light';document.getElementById('admin-device-trigger').click();");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.admin-device-menu')).backgroundColor"),'rgb(255, 255, 255)');
    await send('Page.navigate',{url:origin+'/index.html'});
    await until("!!window.todoAccount && !document.documentElement.classList.contains('account-loading')");
    await evaluate("window.todoLanguage.set('ja');document.getElementById('account-logout').click()");
    await until("location.pathname.endsWith('/login.html') && !!document.getElementById('auth-submit')");
    await until("document.documentElement.lang==='ja' && document.getElementById('auth-submit').textContent==='ログイン'");
    assert.equal(await evaluate("localStorage.getItem('focus-language-v1')"),'ja');
    assert.equal(await evaluate("localStorage.getItem('focus-user-session-v1')"),null);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    assert.deepEqual(errors,[]);
    console.log('PASS Edge mobile: accounts, task sync, admin device picker, dark/light, logout, no overflow or JS errors');
  }finally{
    if(socket)socket.close();child.kill();server.closeAllConnections();await new Promise(r=>server.close(r));await delay(800);
    // Chỉ xóa thư mục profile QA vừa tạo trong thư mục tạm.
    if(path.dirname(profile)===path.resolve(os.tmpdir()) && path.basename(profile).startsWith('focus-account-qa-')){
      try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300});}catch{ /* Edge có thể còn giữ file tạm. */ }
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
