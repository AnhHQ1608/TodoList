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
    try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const child=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
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
    async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Timeout: '+expression);}
    await send('Page.navigate',{url:origin+'/index.html'});
    await until("location.pathname.endsWith('/login.html') && !!document.getElementById('auth-submit')");
    await evaluate("document.getElementById('auth-register-tab').click();document.getElementById('auth-fullname').value='Hoàng Quốc Anh';document.getElementById('auth-username').value='testuser';document.getElementById('auth-password').value='Test-password-12345';document.getElementById('auth-confirm').value='Test-password-12345';document.getElementById('auth-form').requestSubmit();");
    await until("!!window.todoAccount && !document.documentElement.classList.contains('account-loading')");
    assert.equal(await evaluate("document.getElementById('account-name').textContent"),'Hoàng Quốc Anh');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
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
    await send('Page.reload');
    await until("!!window.todoAccount && !!document.querySelector('.task')");
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
    await evaluate("document.getElementById('account-logout').click()");
    await until("location.pathname.endsWith('/login.html') && !!document.getElementById('auth-submit')");
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
