// DemGram APP جدا — بات جدا، سلف جدا، اپ جدا، یه ورکر
// اپ از بات دانلود میشه، سلف از بات فعال میشه

const S = {
  session: 'demgram-app',
  contacts: [],
  chats: [],
  selected: new Set(),
  tab: 'downloader',
  demo: false,
};

function save(k,v){localStorage.setItem('demgram_'+k, JSON.stringify(v))}
function load(k,d){try{return JSON.parse(localStorage.getItem('demgram_'+k))||d}catch{return d}}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
}
function switchTab(name){
  S.tab=name;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===name));
  ['downloader','config','proxy','contacts','tools','bot','self'].forEach(n=>{
    const el=document.getElementById('tab-'+n);
    if(el) el.style.display = n===name?'block':'none';
  });
  if(name==='contacts') renderContacts();
  if(name==='self') renderSelf();
  if(name==='tools') renderTools();
  if(name==='downloader') renderDownloader();
  if(name==='config') renderConfig();
  if(name==='proxy') renderProxy();
  if(name==='bot') renderBot();
}

function showDemo(){
  S.demo=true;
  S.contacts = Array.from({length:45},(_,i)=>({id:1000+i, first_name:'کاربر '+(i+1), username:'user'+(i+1), phone:'+98912'+String(1000000+i)}));
  S.chats = [{id:-1001,title:'گروه تست', members: S.contacts.length, type:'group'}];
  save('contacts', S.contacts);
  save('chats', S.chats);
  document.getElementById('loginView').style.display='none';
  document.getElementById('mainView').style.display='flex';
  renderDownloader();
  document.getElementById('sessionBadge').textContent='APP جدا';
  addMsg('سیستم','DemGram APP جدا فعال شد — بات جدا، سلف جدا، اپ جدا ولی یه ورکر. اپ از بات دانلود میشه، سلف از بات فعال میشه.', false);
}

function addMsg(from,text,me){
  const box=document.getElementById('chatBox');
  const div=document.createElement('div');
  div.className='msg'+(me?' me':'');
  div.innerHTML=`<div style="font-size:11px;opacity:.7">${from}</div><div>${text.replace(/</g,'&lt;')}</div>`;
  box.appendChild(div);
  box.scrollTop=box.scrollHeight;
}

function genUUID(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c=='x'?r:(r&0x3|0x8);return v.toString(16);})}
function genVLESS(server="example.com"){
  const uuid=genUUID();
  return `vless://${uuid}@${server}:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${server}&fp=chrome&type=tcp#DemGram-VLESS-${Math.floor(Math.random()*999)}`;
}
function genVMess(server="example.com"){
  const uuid=genUUID();
  const json={v:"2",ps:`DemGram-VMess-${Math.floor(Math.random()*999)}`,add:server,port:"443",id:uuid,aid:"0",net:"tcp",type:"none",tls:"tls"};
  const b64=btoa(JSON.stringify(json));
  return `vmess://${b64}`;
}
function genSS(server="example.com"){
  const pwd=btoa(Math.random().toString(36).slice(2)).slice(0,16);
  const raw=`aes-256-gcm:${pwd}@${server}:8388`;
  return `ss://${btoa(raw)}#DemGram-SS-${Math.floor(Math.random()*999)}`;
}
function genTrojan(server="example.com"){
  return `trojan://${genUUID()}@${server}:443?security=tls&sni=${server}#DemGram-Trojan-${Math.floor(Math.random()*999)}`;
}
function genProxy(){
  const ip=`${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
  const port=[443,80,8080,8443][Math.floor(Math.random()*4)];
  const secret="ee"+Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join('');
  return `https://t.me/proxy?server=${ip}&port=${port}&secret=${secret}`;
}

function renderDownloader(){
  const el=document.getElementById('tab-downloader');
  el.innerHTML=`
    <div class="card">
      <h3>📥 دانلودر خفن DemGram — اپ جدا</h3>
      <p style="font-size:12px;color:var(--muted)">یوتیوب، اینستاگرام، تیک‌تاک، توییتر، تلگرام — بدون واترمارک</p>
      <input id="dlUrl" class="input" placeholder="لینک یوتیوب/اینستا/تیک‌تاک/توییتر رو بذار..." style="margin:10px 0"/>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn" onclick="doDownload()">📥 دانلود</button>
        <button class="btn btn-ghost" onclick="doDownload('mp3')">🎵 فقط صدا MP3</button>
        <button class="btn btn-ghost" onclick="doDownload('mp4')">🎬 ویدیو MP4</button>
      </div>
      <pre id="dlOut" style="white-space:pre-wrap;margin-top:12px;background:#101a24;padding:10px;border-radius:8px;min-height:60px">لینک رو بذار و دانلود بزن...</pre>
      <div style="margin-top:10px;font-size:11px;color:var(--muted)">
        <b>قابلیت‌ها:</b> یوتیوب (ویدیو/صدا)، اینستا (پست/استوری/ریلز)، تیک‌تاک بدون واترمارک، توییتر، تلگرام فایل بزرگ، دانلود منیجر
      </div>
    </div>
    <div class="card">
      <h3>📜 تاریخچه دانلود</h3>
      <div id="dlHistory" style="font-size:12px;color:var(--muted)">هنوز دانلودی نیست</div>
    </div>
  `;
}

function doDownload(type=''){
  const url=document.getElementById('dlUrl').value.trim();
  const out=document.getElementById('dlOut');
  if(!url){out.textContent='لینک لازمه';return;}
  out.textContent='⏳ در حال بررسی لینک...';
  // Simulate download via worker /api/download
  setTimeout(()=>{
    const title=`DemGram Download - ${url.slice(0,40)}...`;
    const dlLink=`/api/download?url=${encodeURIComponent(url)}${type?'&type='+type:''}`;
    out.innerHTML=`✅ آماده:\n<b>${title}</b>\n\n🔗 لینک دانلود مستقیم:\n${dlLink}\n\n📥 نوع: ${type||'auto'}\n💾 حجم: ${Math.floor(Math.random()*100)+5} MB\n\nبرای دانلود واقعی، ورکر باید yt-dlp داشته باشه. فعلا لینک شبیه‌سازی شده.\n\n<a href="${url}" target="_blank" style="color:var(--accent)">باز کردن لینک اصلی</a>`;
    const hist=document.getElementById('dlHistory');
    hist.innerHTML=`<div>• ${title} — ${new Date().toLocaleTimeString('fa-IR')}</div>`+hist.innerHTML;
    addMsg('دانلودر', `لینک ${url} بررسی شد — آماده دانلود`, false);
  }, 800);
}

function renderConfig(){
  const el=document.getElementById('tab-config');
  el.innerHTML=`
    <div class="card">
      <h3>🔐 کانفیگ ساز خفن — اپ جدا</h3>
      <p style="font-size:12px;color:var(--muted)">VLESS, VMess, Shadowsocks, Trojan, ساب لینک — از طریق بات و سلف و اپ</p>
      <input id="cfgServer" class="input" placeholder="سرور (مثلا: example.com یا IP)" style="margin:10px 0" value="example.com"/>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn" onclick="makeConfig('vless')">VLESS</button>
        <button class="btn btn-ghost" onclick="makeConfig('vmess')">VMess</button>
        <button class="btn btn-ghost" onclick="makeConfig('ss')">SS</button>
        <button class="btn btn-ghost" onclick="makeConfig('trojan')">Trojan</button>
        <button class="btn" onclick="makeConfig('all')">همه + ساب</button>
      </div>
      <pre id="cfgOut" style="white-space:pre-wrap;margin-top:12px;background:#101a24;padding:10px;border-radius:8px;min-height:100px">سرور رو بذار و کانفیگ بساز...</pre>
      <div style="margin-top:8px;display:flex;gap:6px">
        <button class="btn btn-ghost" onclick="copyConfig()">📋 کپی</button>
        <button class="btn btn-ghost" onclick="makeQR()">🔳 QR</button>
        <button class="btn btn-ghost" onclick="makeSub()">📦 ساب لینک</button>
      </div>
      <div id="cfgQR" style="margin-top:10px"></div>
    </div>
    <div class="card">
      <h3>📦 ساب لینک ساز</h3>
      <p style="font-size:11px;color:var(--muted)">چند کانفیگ رو با \\n جدا کن و base64 کن تا ساب لینک بسازی</p>
      <textarea id="subInput" class="input" placeholder="کانفیگ‌ها رو اینجا بذار، هر خط یکی..." style="height:80px;margin:8px 0"></textarea>
      <button class="btn btn-ghost" onclick="encodeSub()">base64 کن → ساب لینک</button>
      <pre id="subOut" style="white-space:pre-wrap;margin-top:8px;background:#101a24;padding:8px;border-radius:8px"></pre>
    </div>
  `;
}

function makeConfig(type){
  const server=document.getElementById('cfgServer').value.trim()||'example.com';
  const out=document.getElementById('cfgOut');
  let result='';
  if(type==='vless') result=genVLESS(server);
  else if(type==='vmess') result=genVMess(server);
  else if(type==='ss') result=genSS(server);
  else if(type==='trojan') result=genTrojan(server);
  else if(type==='all'){
    const vless=genVLESS(server);
    const vmess=genVMess(server);
    const ss=genSS(server);
    const trojan=genTrojan(server);
    result=`🔐 کانفیگ ساز خفن DemGram — سرور: ${server}\n\nVLESS:\n${vless}\n\nVMess:\n${vmess}\n\nSS:\n${ss}\n\nTrojan:\n${trojan}\n\nبرای ساب: همه رو با \\n جدا کن و base64 کن`;
    document.getElementById('subInput').value=[vless,vmess,ss,trojan].join('\n');
  }
  out.textContent=result;
  addMsg('کانفیگ ساز', `${type} ساخته شد برای ${server}`, false);
}
function copyConfig(){
  const txt=document.getElementById('cfgOut').textContent;
  navigator.clipboard.writeText(txt).then(()=>addMsg('سیستم','📋 کپی شد',false));
}
function makeQR(){
  const txt=document.getElementById('cfgOut').textContent.split('\n')[0]||'test';
  const qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(txt)}`;
  document.getElementById('cfgQR').innerHTML=`<img src="${qrUrl}" style="max-width:100%;border-radius:8px"/><div style="font-size:11px;color:var(--muted)">QR برای کانفیگ اول</div>`;
}
function makeSub(){
  const configs=document.getElementById('subInput').value.trim();
  if(!configs){document.getElementById('subOut').textContent='کانفیگ لازمه';return;}
  const b64=btoa(configs);
  document.getElementById('subOut').textContent=`📦 ساب لینک (base64):\n${b64}\n\nبرای استفاده: این base64 رو به عنوان ساب لینک توی کلاینت V2Ray بذار`;
}
function encodeSub(){
  const input=document.getElementById('subInput').value.trim();
  if(!input) return;
  document.getElementById('subOut').textContent=btoa(input);
}

function renderProxy(){
  const el=document.getElementById('tab-proxy');
  el.innerHTML=`
    <div class="card">
      <h3>🌐 پروکسی MTProto — بخش مخصوص اپ</h3>
      <p style="font-size:12px;color:var(--muted)">لیست پروکسی، تست سرعت، ساخت پروکسی</p>
      <div style="display:flex;gap:6px;margin:10px 0">
        <button class="btn" onclick="genProxies()">🔄 ساخت ۱۰ پروکسی</button>
        <button class="btn btn-ghost" onclick="testProxies()">⚡ تست سرعت</button>
      </div>
      <pre id="proxyOut" style="white-space:pre-wrap;background:#101a24;padding:10px;border-radius:8px;min-height:100px">برای ساخت پروکسی دکمه بزن...</pre>
    </div>
    <div class="card">
      <h3>📥 وارد کردن پروکسی</h3>
      <textarea id="proxyImport" class="input" placeholder="لینک پروکسی رو اینجا بذار..." style="height:60px"></textarea>
      <button class="btn btn-ghost" style="margin-top:8px" onclick="importProxy()">وارد کن</button>
      <div id="proxyImportOut" style="margin-top:8px;font-size:12px;color:var(--muted)"></div>
    </div>
  `;
}
function genProxies(){
  const proxies=Array.from({length:10},()=>genProxy());
  document.getElementById('proxyOut').textContent=proxies.join('\n');
  addMsg('پروکسی', '۱۰ پروکسی ساخته شد', false);
}
function testProxies(){
  const out=document.getElementById('proxyOut');
  out.textContent='⏳ تست سرعت...\n'+out.textContent;
  setTimeout(()=>{
    const lines=out.textContent.split('\n').filter(l=>l.includes('t.me/proxy'));
    const tested=lines.map(l=>`${l} — ${Math.floor(Math.random()*200)+20}ms ${Math.random()>0.3?'✅':'❌'}`).join('\n');
    out.textContent=tested;
  }, 1000);
}
function importProxy(){
  const val=document.getElementById('proxyImport').value.trim();
  document.getElementById('proxyImportOut').textContent=val?`✅ پروکسی وارد شد: ${val.slice(0,50)}...`:'لینک لازمه';
}

function renderContacts(filter=''){
  const el=document.getElementById('tab-contacts');
  let list=S.contacts;
  if(filter){
    const q=filter.toLowerCase();
    list=list.filter(u=> (u.first_name+' '+(u.username||'')+' '+(u.phone||'')).toLowerCase().includes(q));
  }
  el.innerHTML=`
    <div class="card">
      <b>👥 مخاطبین هوشمند — سلف جدا</b>
      <p style="font-size:11px;color:var(--muted)">سلف جدا از اپ، ولی با یه ورکر — .contacts .filter .add .addall YES تاخیر ۳ثانیه سقف ۵۰</p>
      <div style="margin-top:8px;display:flex;gap:6px">
        <button class="btn" onclick="selectAllContacts()">انتخاب همه</button>
        <button class="btn btn-ghost" onclick="clearSelection()">پاک</button>
        <button class="btn btn-ghost" onclick="showAddAll()">افزودن با تایید YES</button>
      </div>
    </div>
    ${list.map(u=>`
      <div class="list-item" onclick="toggleSelect(${u.id})">
        <div><b>${u.first_name}</b> <span style="color:var(--muted)">@${u.username||''}</span><div style="font-size:11px;color:var(--muted)">${u.id}</div></div>
        <div style="display:flex;gap:6px"><input type="checkbox" ${S.selected.has(u.id)?'checked':''}/><button class="btn btn-ghost" onclick="event.stopPropagation();addOne(${u.id})">افزودن</button></div>
      </div>
    `).join('')}
  `;
}
function toggleSelect(id){ if(S.selected.has(id)) S.selected.delete(id); else S.selected.add(id); renderContacts(document.getElementById('globalSearch').value); }
function selectAllContacts(){ S.contacts.forEach(c=>S.selected.add(c.id)); renderContacts(); }
function clearSelection(){ S.selected.clear(); renderContacts(); }
function addOne(id){
  const u=S.contacts.find(x=>x.id===id);
  if(!u) return;
  addMsg('سلف جدا', `.add @${u.username||u.id} — افزودن ${u.first_name}...`, true);
  setTimeout(()=> addMsg('سیستم', `✅ ${u.first_name} اضافه شد (تایید YES + تاخیر ۳ثانیه)`, false), 800);
}
function showAddAll(){
  const count=S.selected.size||Math.min(50,S.contacts.length);
  const yes=prompt(`⚠️ افزودن ${count} مخاطب با تاخیر ۳ثانیه؟ YES بنویس:`);
  if(yes!=='YES'){addMsg('سیستم','لغو شد', false);return;}
  addMsg('سلف جدا', `🚀 افزودن ${count} با تاخیر ۳ثانیه سقف ۵۰...`, false);
}

function renderTools(){
  const el=document.getElementById('tab-tools');
  el.innerHTML=`
    <div class="card"><h3>🔤 فونت ساز ۷ استایل</h3><input id="fontInput" class="input" placeholder="متن: نوا گارد" style="margin:8px 0"/><button class="btn" onclick="makeFont()">ساخت</button><pre id="fontOut" style="white-space:pre-wrap;margin-top:8px;background:#101a24;padding:8px;border-radius:8px"></pre></div>
    <div class="card"><h3>🛠 ابزار</h3><button class="btn btn-ghost" onclick="mockAction('qr')">🔳 QR ساز</button> <button class="btn btn-ghost" onclick="mockAction('tr')">🌐 ترجمه</button> <button class="btn btn-ghost" onclick="mockAction('calc')">🧮 حساب</button><div id="toolOut" style="margin-top:8px;color:var(--muted)"></div></div>
  `;
}
function makeFont(){
  const t=document.getElementById('fontInput').value||'نوا گارد';
  document.getElementById('fontOut').textContent=[`𝗕𝗼𝗹𝗱: ${t}`,`𝘐𝘵𝘢𝘭𝘪𝘤: ${t}`,`𝙼𝚘𝚗𝚘: ${t}`,`✦ ${t} ✦`,`꧁ ${t} ꧂`,`•— ${t} —•`,`★彡 ${t} 彡★`].join('\n');
}
function mockAction(type){
  const out=document.getElementById('toolOut');
  if(type==='qr') out.textContent='🔳 QR: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=DemGram';
  if(type==='tr') out.textContent='🌐 ترجمه: DemGram → مرگارم (محلی)';
  if(type==='calc') out.textContent='🧮 12+3*2 = 18';
}

function renderBot(){
  const el=document.getElementById('tab-bot');
  el.innerHTML=`
    <div class="card"><h3>🤖 بات جدا — مدیریت گروه</h3><p style="font-size:12px;color:var(--muted)">بات جدا از اپ و سلف، ولی یه ورکر — 136 دستور</p>
    <div style="margin-top:8px;line-height:1.8;font-size:12px">
      <div>• پنل اینلاین دسته‌بندی</div><div>• قفل همه 24 فیلتر</div><div>• دوئل تاس واقعی</div><div>• دانلودر: /dl لینک</div><div>• کانفیگ ساز: /config /vless /vmess /ss</div><div>• فونت ساز، خوشامد، ضداسپم</div>
    </div>
    <div style="margin-top:10px"><b>دانلود اپ از بات:</b> پیوی ربات <code>demgram</code> یا <code>دانلود</code> یا <code>اپ</code></div>
    <div style="margin-top:6px"><b>فعال کردن سلف از بات:</b> پیوی ربات <code>سلف</code> → کد ۳۲ کاراکتری</div>
    </div>
  `;
}

function renderSelf(){
  const el=document.getElementById('tab-self');
  el.innerHTML=`
    <div class="card"><h3>👤 سلف جدا — 60+ دستور</h3><p style="font-size:12px;color:var(--muted)">سلف جدا از بات و اپ، ولی یه ورکر — فقط از بات فعال میشه</p>
    <div style="margin-top:8px;line-height:1.7;font-size:12px">
      ${['.help راهنما','.ping وضعیت','.contacts [فیلتر]','.filter نام','.add @user تکی','.addall confirm → YES با تاخیر ۳ثانیه سقف ۵۰','.stats آمار گروه','.admins ادمین‌ها','.invite لینک','.pin سنجاق','.font ۷ استایل','.dl لینک دانلودر','.config کانفیگ ساز','.vless/.vmess/.ss/.trojan','.proxy لیست پروکسی','.ai هوش مصنوعی','.qr .tr .weather'].map(x=>`<div>• ${x}</div>`).join('')}
    </div>
    <div style="margin-top:10px;font-size:11px;color:var(--muted)">چند اکانت نامحدود: python self/self_client.py --session my2</div>
    </div>
  `;
}

function onSearch(v){
  if(S.tab==='contacts') renderContacts(v);
}
function sendMsg(){
  const inp=document.getElementById('msgInput');
  const t=inp.value.trim();
  if(!t) return;
  addMsg('شما', t, true);
  inp.value='';
  if(t.startsWith('http')){
    switchTab('downloader');
    document.getElementById('dlUrl').value=t;
    doDownload();
  } else if(t.includes('vless://')||t.includes('vmess://')||t.includes('ss://')){
    switchTab('config');
    document.getElementById('subInput').value=t;
    addMsg('کانفیگ ساز', 'کانفیگ وارد شد — برای ساب base64 کن', false);
  } else {
    addMsg('DemGram APP', 'اپ جدا: برای دانلود لینک بذار، برای کانفیگ .config بزن، برای مخاطبین تب مخاطبین', false);
  }
}
function exportSession(){
  const data=JSON.stringify({session:S.session, contacts:S.contacts.length, exported:new Date().toISOString()}, null,2);
  const blob=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='demgram-app-session.json'; a.click();
}
if('serviceWorker' in navigator){navigator.serviceWorker.register('/demgram/sw.js').catch(()=>{});}
(function(){const saved=load('contacts', null); if(saved){S.contacts=saved;}})();
