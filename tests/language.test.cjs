const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function boot(saved='vi',blocked=false){
  const storage=new Map([['focus-language-v1',saved]]),events={};
  function element(text,skip=false){
    const node={nodeType:1,childNodes:[],attributes:{},matches:()=>skip,closest:()=>skip?node:null,
      hasAttribute(name){return name in this.attributes;},getAttribute(name){return this.attributes[name];},setAttribute(name,value){this.attributes[name]=value;}};
    if(text)node.childNodes.push({nodeType:3,nodeValue:text,parentElement:node});
    return node;
  }
  const heading=element('Công việc của bạn'),user=element('Thông báo',true),title=element('Focus List — Công việc của bạn');
  const input=element();input.attributes.placeholder='Bạn muốn hoàn thành điều gì?';
  const body=element();body.childNodes=[heading,user,input];
  let changes;
  const context={Event:class{constructor(type){this.type=type;}},MutationObserver:class{constructor(callback){changes=callback;}disconnect(){}observe(){}},
    localStorage:{getItem:key=>{if(blocked)throw Error('Blocked');return storage.get(key);},setItem:(key,value)=>{if(blocked)throw Error('Blocked');storage.set(key,value);}},
    document:{body,documentElement:{lang:'vi'},querySelector:()=>title,querySelectorAll:()=>[]},
    window:{addEventListener:(name,callback)=>events[name]=callback,dispatchEvent(){}}};
  vm.runInNewContext(fs.readFileSync('language.js','utf8'),context);
  return {language:context.window.todoLanguage,heading,user,input,storage,context,events,update:()=>changes([{type:'characterData',target:heading.childNodes[0]}])};
}

test('Language switches Vietnamese, English and Japanese and restores original text and placeholders',()=>{
  const app=boot();
  app.language.set('en');assert.equal(app.heading.childNodes[0].nodeValue,'Your tasks');assert.equal(app.input.attributes.placeholder,'What would you like to get done?');
  app.language.set('ja');assert.equal(app.heading.childNodes[0].nodeValue,'あなたのタスク');assert.equal(app.context.document.documentElement.lang,'ja');
  assert.equal(app.storage.get('focus-language-v1'),'ja');
  app.language.set('vi');assert.equal(app.heading.childNodes[0].nodeValue,'Công việc của bạn');assert.equal(app.input.attributes.placeholder,'Bạn muốn hoàn thành điều gì?');
  assert.equal(app.user.childNodes[0].nodeValue,'Thông báo');
});

test('Saved language applies on load, dynamic status updates translate and user text remains intact',()=>{
  const app=boot('ja');assert.equal(app.language.locale,'ja-JP');
  app.heading.childNodes[0].nodeValue='Đã hoàn thành 2 / 5 công việc';app.update();
  assert.equal(app.heading.childNodes[0].nodeValue,'完了 2 / 5 件');
  app.language.set('en');assert.equal(app.heading.childNodes[0].nodeValue,'Completed 2 / 5 tasks');
  assert.equal(app.language.t('Đang phát: Thông báo'),'Playing: Thông báo');
  app.heading.childNodes[0].nodeValue='Đang phát: $&';app.update();
  assert.equal(app.heading.childNodes[0].nodeValue,'Playing: $&');
  assert.equal(app.user.childNodes[0].nodeValue,'Thông báo');
});

test('Invalid language falls back safely and blocked storage still allows changing language',()=>{
  const app=boot('<invalid>');assert.equal(app.language.locale,'vi-VN');
  app.language.set('invalid');assert.equal(app.language.locale,'vi-VN');
  const blocked=boot('ja',true);blocked.language.set('en');assert.equal(blocked.language.locale,'en-US');
  const other=boot();other.storage.set('focus-language-v1','ja');other.events.storage({key:'focus-language-v1'});assert.equal(other.language.locale,'ja-JP');
});
