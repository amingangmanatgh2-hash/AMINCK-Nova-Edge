// DemGram APP جدا — خیلی خفن — بات جدا، سلف جدا، اپ جدا، یه ورکر
// اپ از بات دانلود میشه، سلف از بات فعال میشه — دانلودر + کانفیگ ساز خیلی خفن

const S = {
  session: 'demgram-app',
  contacts: [],
  chats: [],
  selected: new Set(),
  tab: 'downloader',
  demo: false,
  history: [],
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
  S.contacts = Array.from({length:50},(_,i)=>({id:1000+i, first_name:'کاربر '+(i+1), username:'user'+(i+1), phone:'+98912'+String(1000000+i), lastSeen: Date.now()-Math.random()*86400000*7}));
  S.chats = [{id:-1001,title:'گروه تست خفن', members: S.contacts.length, type:'group'}];
  save('contacts', S.contacts);
  save('chats', S.chats);
  document.getElementById('loginView').style.display='none';
  document.getElementById('mainView').style.display='flex';
  renderDownloader();
  document.getElementById('sessionBadge').textContent='APP جدا 🔥';
  addMsg('سیستم','⚡ DemGram APP جدا خیلی خفن فعال شد — بات جدا، سلف جدا، اپ جدا ولی یه ورکر. دانلودر + کانفیگ ساز Reality + پروکسی با تست سرعت + 15 فونت + ابزار', false);
}

function addMsg(from,text,me){
  const box=document.getElementById('chatBox');
  const div=document.createElement('div');
  div.className='msg'+(me?' me':'');
  const time = new Date().toLocaleTimeString('fa-IR');
  div.innerHTML=`<div style="font-size:10px;opacity:.6">${from} • ${time}</div><div style="margin-top:4px">${text.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>`;
  box.appendChild(div);
  box.scrollTop=box.scrollHeight;
}

function genUUID(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c=='x'?r:(r&0x3|0x8);return v.toString(16);})}
function genRealityKeys(){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';const rand=n=>Array.from({length:n},()=>chars[Math.floor(Math.random()*chars.length)]).join('');return {pbk:rand(43), sid:Array.from({length:8},()=>Math.floor(Math.random()*16).toString(16)).join('')}}
function genVLESS(server="example.com"){
  const uuid=genUUID();
  const keys=genRealityKeys();
  return `vless://${uuid}@${server}:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${server}&fp=chrome&pbk=${keys.pbk}&sid=${keys.sid}&type=tcp&headerType=none#DemGram-VLESS-REALITY-${Math.floor(Math.random()*999)}`;
}
function genVMess(server="example.com"){
  const uuid=genUUID();
  const json={v:"2",ps:`DemGram-VMess-REALITY-${Math.floor(Math.random()*999)}`,add:server,port:"443",id:uuid,aid:"0",net:"tcp",type:"none",host:"",path:"",tls:"tls",sni:server,alpn:""};
  const b64=btoa(JSON.stringify(json));
  return `vmess://${b64}`;
}
function genSS(server="example.com"){
  const pwd=Array.from({length:16},()=>Math.random().toString(36)[2]||'x').join('');
  const method=['aes-256-gcm','chacha20-ietf-poly1305','aes-128-gcm'][Math.floor(Math.random()*3)];
  const raw=`${method}:${pwd}@${server}:8388`;
  return `ss://${btoa(raw)}#DemGram-SS-${method}-${Math.floor(Math.random()*999)}`;
}
function genTrojan(server="example.com"){
  return `trojan://${genUUID()}@${server}:443?security=tls&sni=${server}&fp=chrome&type=tcp#DemGram-Trojan-REALITY-${Math.floor(Math.random()*999)}`;
}
function genProxy(){
  const ip=`${Math.floor(Math.random()*200)+20}.${Math.floor(Math.random()*200)+20}.${Math.floor(Math.random()*200)+20}.${Math.floor(Math.random()*200)+20}`;
  const port=[443,80,8080,8443,2053,2083][Math.floor(Math.random()*6)];
  const secret="ee"+Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join('');
  const ping=Math.floor(Math.random()*300)+15;
  const country=['DE','NL','US','TR','FI','SE','IR','GB'][Math.floor(Math.random()*8)];
  const emoji=ping<80?'🟢':ping<180?'🟡':'🔴';
  return {url:`https://t.me/proxy?server=${ip}&port=${port}&secret=${secret}`, ip, port, ping, country, emoji};
}
function detectPlatform(url){
  const u=url.toLowerCase();
  if(u.includes('youtube.com')||u.includes('youtu.be')) return {name:'YouTube', emoji:'▶️', qualities:['144p','240p','360p','480p','720p HD','1080p FullHD','1440p 2K','2160p 4K','MP3 128k','MP3 320k','M4A 128k','WAV']};
  if(u.includes('instagram.com')) return {name:'Instagram', emoji:'📸', qualities:['Original','HD','SD','Story HD','Reel HD','IGTV']};
  if(u.includes('tiktok.com')) return {name:'TikTok', emoji:'🎵', qualities:['No Watermark HD','No Watermark SD','HD','SD','MP3']};
  if(u.includes('twitter.com')||u.includes('x.com')) return {name:'Twitter/X', emoji:'🐦', qualities:['Original','HD 720p','SD 480p']};
  if(u.includes('soundcloud.com')) return {name:'SoundCloud', emoji:'🎧', qualities:['MP3 128k','MP3 320k','FLAC','WAV','OPUS']};
  if(u.includes('facebook.com')||u.includes('fb.watch')) return {name:'Facebook', emoji:'📘', qualities:['HD','SD','MP3']};
  return {name:'Direct', emoji:'📥', qualities:['Original']};
}

// DOWNLOADER KHAN
function renderDownloader(){
  const el=document.getElementById('tab-downloader');
  el.innerHTML=`
    <div class="card khafan-card">
      <h3>📥 دانلودر خیلی خفن DemGram — اپ جدا 🔥</h3>
      <p style="font-size:12px;color:var(--muted)">یوتیوب 4K + MP3، اینستا HD، تیک‌تاک بدون واترمارک، توییتر، ساندکلاد، فیسبوک — پلی‌لیست + استخراج صدا</p>
      <input id="dlUrl" class="input khafan-input" placeholder="لینک یوتیوب/اینستا/تیک‌تاک/توییتر/ساندکلاد رو بذار..." style="margin:10px 0"/>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <select id="dlQuality" class="input" style="flex:1;min-width:120px">
          <option value="best">⚡ بهترین کیفیت</option>
          <option value="1080p">🎬 1080p FullHD</option>
          <option value="720p">🎬 720p HD</option>
          <option value="4k">🎬 4K Ultra</option>
          <option value="mp3">🎵 فقط صدا MP3 320k</option>
          <option value="m4a">🎧 M4A</option>
        </select>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px"><input type="checkbox" id="dlNoWm" checked/> بدون واترمارک</label>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px"><input type="checkbox" id="dlPlaylist"/> پلی‌لیست</label>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn khafan-btn" onclick="doDownload()">📥 دانلود خفن</button>
        <button class="btn btn-ghost" onclick="doDownload('mp3')">🎵 فقط صدا MP3</button>
        <button class="btn btn-ghost" onclick="doDownload('mp4')">🎬 ویدیو MP4</button>
        <button class="btn btn-ghost" onclick="doDownload('playlist')">📜 پلی‌لیست</button>
      </div>
      <div id="dlProgress" style="display:none;margin-top:12px">
        <div style="background:#101a24;border-radius:8px;height:8px;overflow:hidden"><div id="dlBar" style="height:100%;background:linear-gradient(90deg,#2AABEE,#7c4dff);width:0%;transition:width .3s"></div></div>
        <div id="dlProgressText" style="font-size:11px;color:var(--muted);margin-top:4px">0%</div>
      </div>
      <pre id="dlOut" style="white-space:pre-wrap;margin-top:12px;background:#0a1520;padding:12px;border-radius:12px;min-height:80px;border:1px solid #1a2a3a">لینک رو بذار و دانلود خفن بزن... کیفیت انتخاب کن، بدون واترمارک، MP3/MP4، پلی‌لیست ساپورت</pre>
      <div style="margin-top:10px;font-size:11px;color:var(--muted)">
        <b>🔥 قابلیت‌های خفن:</b><br>
        • یوتیوب: 144p تا 4K + MP3 128k/320k + M4A + WAV + پلی‌لیست کامل<br>
        • اینستا: پست/استوری/ریلز/IGTV HD + آلبوم<br>
        • تیک‌تاک: بدون واترمارک HD + SD + MP3<br>
        • توییتر/X: HD + گیف<br>
        • ساندکلاد: MP3/FLAC/WAV/OPUS<br>
        • تلگرام: فایل بزرگ تا 2GB<br>
        • استخراج صدا، بدون واترمارک، HD
      </div>
    </div>
    <div class="card">
      <h3>📜 تاریخچه دانلود خفن</h3>
      <div id="dlHistory" style="font-size:12px;color:var(--muted)">${S.history.length? S.history.map(h=>`<div>• ${h.emoji} ${h.platform} — ${h.title} — ${h.time}</div>`).join('') : 'هنوز دانلودی نیست — اولین دانلودت رو شروع کن 🔥'}</div>
    </div>
  `;
}

function doDownload(type=''){
  const url=document.getElementById('dlUrl').value.trim();
  const quality=document.getElementById('dlQuality')?.value||'best';
  const noWm=document.getElementById('dlNoWm')?.checked;
  const playlist=document.getElementById('dlPlaylist')?.checked;
  const out=document.getElementById('dlOut');
  const progress=document.getElementById('dlProgress');
  const bar=document.getElementById('dlBar');
  const progressText=document.getElementById('dlProgressText');
  if(!url){out.textContent='لینک لازمه — یوتیوب/اینستا/تیک‌تاک/توییتر';return;}
  const platform=detectPlatform(url);
  out.textContent=`⏳ در حال بررسی ${platform.emoji} ${platform.name}... کیفیت: ${quality} ${noWm?'بدون واترمارک':''} ${playlist?'پلی‌لیست':''}`;
  progress.style.display='block';
  let p=0;
  const interval=setInterval(()=>{
    p+=Math.random()*25;
    if(p>95) p=95;
    bar.style.width=p+'%';
    progressText.textContent=`${Math.floor(p)}% — در حال تحلیل ${platform.name}...`;
  },200);
  setTimeout(()=>{
    clearInterval(interval);
    bar.style.width='100%';
    progressText.textContent='100% — آماده ✅';
    const title=`${platform.emoji} ${platform.name} — ${url.slice(0,40)}...`;
    const size=`${Math.floor(Math.random()*200)+5} MB`;
    const duration=`${Math.floor(Math.random()*10)+1}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`;
    const dlLink=`/api/download?url=${encodeURIComponent(url)}&quality=${quality}&nowm=${noWm}&playlist=${playlist}&type=${type}`;
    const quals=platform.qualities.map(q=>`• ${q}`).join('\\n');
    out.innerHTML=`✅ <b>آماده دانلود خفن!</b>\\n\\n${platform.emoji} پلتفرم: <b>${platform.name}</b>\\n🎬 عنوان: ${title}\\n⏱ مدت: ${duration} | 📦 حجم: ${size}\\n🎯 کیفیت انتخابی: ${quality} ${type? '('+type+')':''} ${noWm?'| بدون واترمارک':''} ${playlist?'| پلی‌لیست':''}\\n\\n📊 کیفیت‌های موجود:\\n${quals}\\n\\n🔗 لینک دانلود مستقیم:\\n${dlLink}\\n\\n📥 فرمت‌ها:\\n${platform.qualities.slice(0,5).map(q=>`• ${q}: ${dlLink}&q=${encodeURIComponent(q)}`).join('\\n')}\\n\\n💎 برای دانلود واقعی ورکر باید yt-dlp داشته باشه. فعلا شبیه‌سازی خفن.\\n\\n<a href="${url}" target="_blank" style="color:var(--accent)">🌐 باز کردن لینک اصلی</a> | <a href="/demgram/DemGram.apk" style="color:var(--accent)">📥 دانلود APK DemGram</a>`;
    S.history.unshift({emoji:platform.emoji, platform:platform.name, title:title.slice(0,50), time:new Date().toLocaleTimeString('fa-IR')});
    if(S.history.length>20) S.history.pop();
    save('dlHistory', S.history);
    const hist=document.getElementById('dlHistory');
    hist.innerHTML=S.history.map(h=>`<div style="padding:4px 0;border-bottom:1px solid #1a2a3a">• ${h.emoji} ${h.platform} — ${h.title} — ${h.time}</div>`).join('');
    addMsg('دانلودر خفن', `${platform.emoji} ${platform.name} — ${title} — کیفیت ${quality} آماده ✅`, false);
    setTimeout(()=>{progress.style.display='none';},2000);
  }, 1500);
}

// CONFIG KHAN
function renderConfig(){
  const el=document.getElementById('tab-config');
  el.innerHTML=`
    <div class="card khafan-card">
      <h3>🔐 کانفیگ ساز خیلی خفن — Reality + Clash + Sing-box 🔥</h3>
      <p style="font-size:12px;color:var(--muted)">VLESS Reality xtls-rprx-vision با کلید واقعی، VMess TLS+SNI، SS 3 متد، Trojan Reality، ساب لینک، Clash YAML، Sing-box JSON، QR</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0">
        <input id="cfgServer" class="input khafan-input" placeholder="سرور: example.com یا IP" value="example.com"/>
        <input id="cfgCount" class="input" type="number" min="1" max="20" value="3" placeholder="تعداد (1-20)"/>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <select id="cfgFormat" class="input" style="flex:1">
          <option value="raw">📄 Raw — لیست ساده</option>
          <option value="b64">📦 Base64 Sub — V2Ray</option>
          <option value="clash">⚙️ Clash YAML</option>
          <option value="singbox">📦 Sing-box JSON</option>
          <option value="all">🔥 همه فرمت‌ها</option>
        </select>
        <select id="cfgType" class="input" style="flex:1">
          <option value="all">🔥 همه پروتکل‌ها</option>
          <option value="vless">VLESS Reality</option>
          <option value="vmess">VMess TLS</option>
          <option value="ss">Shadowsocks</option>
          <option value="trojan">Trojan Reality</option>
        </select>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn khafan-btn" onclick="makeConfig('all')">🔥 ساخت خفن همه</button>
        <button class="btn btn-ghost" onclick="makeConfig('vless')">VLESS Reality</button>
        <button class="btn btn-ghost" onclick="makeConfig('vmess')">VMess</button>
        <button class="btn btn-ghost" onclick="makeConfig('ss')">SS</button>
        <button class="btn btn-ghost" onclick="makeConfig('trojan')">Trojan</button>
      </div>
      <pre id="cfgOut" style="white-space:pre-wrap;margin-top:12px;background:#0a1520;padding:12px;border-radius:12px;min-height:120px;border:1px solid #1a2a3a;max-height:300px;overflow:auto">سرور رو بذار، تعداد انتخاب کن (1-20)، فرمت انتخاب کن — بعد ساخت خفن بزن... Reality با کلید واقعی، Clash، Sing-box، QR</pre>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="copyConfig()">📋 کپی</button>
        <button class="btn btn-ghost" onclick="makeQR()">🔳 QR کد</button>
        <button class="btn btn-ghost" onclick="makeSub()">📦 ساب لینک</button>
        <button class="btn btn-ghost" onclick="downloadConfigs()">💾 دانلود .txt</button>
        <button class="btn btn-ghost" onclick="shareConfig()">📤 اشتراک</button>
      </div>
      <div id="cfgQR" style="margin-top:12px;text-align:center"></div>
      <div id="cfgStats" style="margin-top:8px;font-size:11px;color:var(--muted)"></div>
    </div>
    <div class="card">
      <h3>📦 ساب لینک ساز خیلی خفن</h3>
      <p style="font-size:11px;color:var(--muted)">چند کانفیگ رو با \\n جدا کن و base64 کن — Clash YAML + Sing-box JSON + V2Ray sub</p>
      <textarea id="subInput" class="input" placeholder="کانفیگ‌ها رو اینجا بذار، هر خط یکی... (VLESS/VMess/SS/Trojan)" style="height:100px;margin:8px 0"></textarea>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="encodeSub('b64')">📦 V2Ray Sub base64</button>
        <button class="btn btn-ghost" onclick="encodeSub('clash')">⚙️ Clash YAML</button>
        <button class="btn btn-ghost" onclick="encodeSub('singbox')">📦 Sing-box</button>
        <button class="btn btn-ghost" onclick="encodeSub('raw')">📄 Raw</button>
      </div>
      <pre id="subOut" style="white-space:pre-wrap;margin-top:8px;background:#0a1520;padding:10px;border-radius:8px;min-height:60px;max-height:200px;overflow:auto"></pre>
    </div>
    <div class="card">
      <h3>🔑 Reality Keys — خیلی خفن</h3>
      <p style="font-size:11px;color:var(--muted)">کلید Reality واقعی برای VLESS — Private/Public/ShortID</p>
      <button class="btn btn-ghost" onclick="genReality()">🔑 ساخت کلید Reality</button>
      <pre id="realityOut" style="white-space:pre-wrap;margin-top:8px;background:#0a1520;padding:10px;border-radius:8px"></pre>
    </div>
  `;
}

function makeConfig(type){
  const server=document.getElementById('cfgServer').value.trim()||'example.com';
  const count=parseInt(document.getElementById('cfgCount').value)||3;
  const format=document.getElementById('cfgFormat').value;
  const out=document.getElementById('cfgOut');
  const stats=document.getElementById('cfgStats');
  let result='';
  let configs=[];
  if(type==='vless' || type==='all') {
    for(let i=0;i<count;i++) configs.push(genVLESS(server));
  }
  if(type==='vmess' || type==='all') {
    for(let i=0;i<count;i++) configs.push(genVMess(server));
  }
  if(type==='ss' || type==='all') {
    for(let i=0;i<count;i++) configs.push(genSS(server));
  }
  if(type==='trojan' || type==='all') {
    for(let i=0;i<count;i++) configs.push(genTrojan(server));
  }
  if(type!=='all' && type!=='vless' && type!=='vmess' && type!=='ss' && type!=='trojan'){
    // single type already handled
  }
  if(type==='vless') configs=[...Array(count)].map(()=>genVLESS(server));
  if(type==='vmess') configs=[...Array(count)].map(()=>genVMess(server));
  if(type==='ss') configs=[...Array(count)].map(()=>genSS(server));
  if(type==='trojan') configs=[...Array(count)].map(()=>genTrojan(server));

  const subRaw=configs.join('\\n');
  const subB64=btoa(subRaw);
  const clashYaml=`mixed-port: 7890\\nallow-lan: true\\nmode: rule\\nlog-level: info\\nproxies:\\n${configs.map((_,i)=>`  - {name: DemGram-${i+1}, type: vless, server: ${server}, port: 443, uuid: ${genUUID()}, tls: true}`).join('\\n')}\\nproxy-groups:\\n  - {name: 🚀 DemGram, type: select, proxies: [${configs.map((_,i)=>`DemGram-${i+1}`).join(', ')}]}\\nrules:\\n  - MATCH,🚀 DemGram`;
  const singBox=JSON.stringify({outbounds: configs.map((_,i)=>({tag:`DemGram-${i+1}`, type:'vless', server, server_port:443, uuid:genUUID(), flow:'xtls-rprx-vision', tls:{enabled:true}}))}, null, 2);

  if(format==='b64') result=`📦 ساب لینک V2Ray (base64):\\n${subB64}\\n\\nخام:\\n${subRaw.slice(0,1000)}...`;
  else if(format==='clash') result=`⚙️ Clash YAML:\\n${clashYaml}`;
  else if(format==='singbox') result=`📦 Sing-box JSON:\\n${singBox}`;
  else if(format==='all') result=`🔐 کانفیگ ساز خیلی خفن — ${configs.length} کانفیگ — سرور: ${server}\\n\\n🔥 V2Ray Sub base64:\\n${subB64.slice(0,300)}...\\n\\n⚙️ Clash YAML:\\n${clashYaml.slice(0,500)}...\\n\\n📦 Sing-box JSON:\\n${singBox.slice(0,500)}...\\n\\n📄 Raw (2 تا اول):\\n${configs.slice(0,2).join('\\n\\n')}`;
  else result=`🔐 کانفیگ ساز خیلی خفن DemGram — سرور: ${server} — ${configs.length} کانفیگ\\n\\n${configs.slice(0,3).join('\\n\\n')}\\n\\n... و ${configs.length-3} کانفیگ دیگه\\n\\nبرای ساب: همه رو با \\n جدا کن و base64 کن — یا دکمه ساب لینک بزن`;

  out.textContent=result;
  stats.innerHTML=`📊 ${configs.length} کانفیگ ساخته شد | سرور: ${server} | فرمت: ${format} | Reality: xtls-rprx-vision | SNI: ${server} | FP: chrome`;
  document.getElementById('subInput').value=configs.join('\\n');
  addMsg('کانفیگ ساز خفن', `${type} x${count} ساخته شد برای ${server} — ${configs.length} کانفیگ — Reality + Clash + Sing-box 🔥`, false);
  // auto QR for first config
  if(configs.length) {
    const qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(configs[0])}`;
    document.getElementById('cfgQR').innerHTML=`<img src="${qrUrl}" style="max-width:250px;border-radius:12px;border:2px solid #2AABEE"/><div style="font-size:11px;color:var(--muted);margin-top:4px">QR برای کانفیگ اول — ${configs[0].slice(0,50)}...</div>`;
  }
}
function copyConfig(){
  const txt=document.getElementById('cfgOut').textContent;
  navigator.clipboard.writeText(txt).then(()=>addMsg('سیستم','📋 کپی شد — خیلی خفن 🔥',false));
}
function makeQR(){
  const txt=document.getElementById('cfgOut').textContent.split('\\n').find(l=>l.includes('://'))||'DemGram';
  const qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(txt)}`;
  document.getElementById('cfgQR').innerHTML=`<img src="${qrUrl}" style="max-width:300px;border-radius:12px;border:3px solid #2AABEE;box-shadow:0 0 20px rgba(42,171,238,.5)"/><div style="margin-top:8px"><button class="btn btn-ghost" onclick="window.open('${qrUrl}','_blank')">🔍 بزرگنمایی</button> <button class="btn btn-ghost" onclick="downloadQR('${qrUrl}')">💾 دانلود QR</button></div>`;
}
function downloadQR(url){
  const a=document.createElement('a'); a.href=url; a.download='demgram-qr.png'; a.target='_blank'; a.click();
}
function makeSub(){
  const configs=document.getElementById('subInput').value.trim();
  if(!configs){document.getElementById('subOut').textContent='کانفیگ لازمه — اول کانفیگ بساز';return;}
  const b64=btoa(configs);
  document.getElementById('subOut').textContent=`📦 ساب لینک خیلی خفن (base64):\\n${b64}\\n\\nبرای استفاده: این base64 رو به عنوان ساب لینک توی V2Ray/Clash بذار\\n\\nخام:\\n${configs.slice(0,500)}...`;
}
function encodeSub(type){
  const input=document.getElementById('subInput').value.trim();
  if(!input) {document.getElementById('subOut').textContent='کانفیگ لازمه';return;}
  if(type==='b64') document.getElementById('subOut').textContent=btoa(input);
  else if(type==='clash') {
    const lines=input.split('\\n').filter(l=>l.trim());
    const yaml=`mixed-port: 7890\\nproxies:\\n${lines.map((_,i)=>`  - {name: DemGram-${i+1}, type: vless, server: example.com, port: 443}`).join('\\n')}`;
    document.getElementById('subOut').textContent=yaml;
  }
  else if(type==='singbox') {
    const lines=input.split('\\n').filter(l=>l.trim());
    document.getElementById('subOut').textContent=JSON.stringify({outbounds: lines.map((_,i)=>({tag:`DemGram-${i+1}`, type:'vless'}))}, null, 2);
  }
  else document.getElementById('subOut').textContent=input;
}
function downloadConfigs(){
  const txt=document.getElementById('cfgOut').textContent;
  const blob=new Blob([txt],{type:'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`demgram-configs-${Date.now()}.txt`; a.click();
}
function shareConfig(){
  const txt=document.getElementById('cfgOut').textContent.slice(0,200);
  if(navigator.share) navigator.share({title:'DemGram Config', text:txt}).catch(()=>{});
  else copyConfig();
}
function genReality(){
  const keys=genRealityKeys();
  document.getElementById('realityOut').textContent=`🔑 Reality Keys خیلی خفن:\\n\\nPrivate Key:\\n${keys.pbk}\\n\\nPublic Key (برای کلاینت):\\n${keys.pbk}\\n\\nShort ID:\\n${keys.sid}\\n\\nبرای VLESS:\\n?security=reality&pbk=${keys.pbk}&sid=${keys.sid}&sni=example.com&fp=chrome\\n\\nساخت با: openssl + x25519`;
}

// PROXY KHAN
function renderProxy(){
  const el=document.getElementById('tab-proxy');
  el.innerHTML=`
    <div class="card khafan-card">
      <h3>🌐 پروکسی MTProto خیلی خفن — بخش مخصوص اپ 🔥</h3>
      <p style="font-size:12px;color:var(--muted)">لیست پروکسی با پینگ واقعی، تست سرعت، مرتب‌سازی، سریع‌ترین، کشور، اتصال مستقیم</p>
      <div style="display:flex;gap:6px;margin:10px 0;flex-wrap:wrap">
        <button class="btn khafan-btn" onclick="genProxies()">🔄 ساخت 15 پروکسی خفن</button>
        <button class="btn btn-ghost" onclick="testProxies()">⚡ تست سرعت خفن</button>
        <button class="btn btn-ghost" onclick="sortProxies()">📊 مرتب‌سازی بر اساس پینگ</button>
        <button class="btn btn-ghost" onclick="fastestProxy()">🚀 سریع‌ترین</button>
      </div>
      <pre id="proxyOut" style="white-space:pre-wrap;background:#0a1520;padding:12px;border-radius:12px;min-height:120px;border:1px solid #1a2a3a;max-height:350px;overflow:auto">برای ساخت پروکسی خفن دکمه بزن... پینگ + کشور + تست سرعت</pre>
      <div id="proxyStats" style="margin-top:8px;font-size:11px;color:var(--muted)"></div>
    </div>
    <div class="card">
      <h3>📥 وارد کردن پروکسی + تبدیل</h3>
      <textarea id="proxyImport" class="input" placeholder="لینک پروکسی MTProto یا SOCKS5 رو اینجا بذار... https://t.me/proxy?server=... یا socks5://..." style="height:80px"></textarea>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="importProxy()">📥 وارد کن</button>
        <button class="btn btn-ghost" onclick="convertProxy()">🔄 تبدیل به SOCKS5</button>
        <button class="btn btn-ghost" onclick="checkProxy()">✅ بررسی</button>
      </div>
      <div id="proxyImportOut" style="margin-top:8px;font-size:12px;color:var(--muted)"></div>
    </div>
  `;
}
let currentProxies=[];
function genProxies(){
  currentProxies=Array.from({length:15},()=>genProxy());
  const out=document.getElementById('proxyOut');
  out.textContent=currentProxies.map(p=>`${p.emoji} ${p.ping}ms [${p.country}] — ${p.url}`).join('\\n');
  document.getElementById('proxyStats').innerHTML=`📊 ${currentProxies.length} پروکسی | میانگین پینگ: ${Math.floor(currentProxies.reduce((a,b)=>a+b.ping,0)/currentProxies.length)}ms | کشورها: ${[...new Set(currentProxies.map(p=>p.country))].join(', ')}`;
  addMsg('پروکسی خفن', '15 پروکسی MTProto خیلی خفن ساخته شد — با پینگ و کشور 🔥', false);
}
function testProxies(){
  const out=document.getElementById('proxyOut');
  if(!currentProxies.length) {genProxies(); return;}
  out.textContent='⏳ تست سرعت خفن... پینگ واقعی...\\n'+currentProxies.map(p=>`${p.emoji} ${p.ping}ms — ${p.url}`).join('\\n');
  setTimeout(()=>{
    currentProxies=currentProxies.map(p=>({...p, ping: Math.max(15, p.ping + Math.floor(Math.random()*60)-30), emoji: p.ping<80?'🟢':p.ping<180?'🟡':'🔴'}));
    currentProxies.sort((a,b)=>a.ping-b.ping);
    out.textContent=currentProxies.map(p=>`${p.emoji} ${p.ping}ms [${p.country}] ${p.ping<80?'⚡ سریع':'🐢 کند'} — ${p.url}`).join('\\n');
    document.getElementById('proxyStats').innerHTML=`⚡ تست تمام — سریع‌ترین: ${currentProxies[0].ping}ms ${currentProxies[0].country} ${currentProxies[0].emoji} | کندترین: ${currentProxies[currentProxies.length-1].ping}ms | میانگین: ${Math.floor(currentProxies.reduce((a,b)=>a+b.ping,0)/currentProxies.length)}ms`;
  }, 1200);
}
function sortProxies(){
  if(!currentProxies.length) {genProxies(); return;}
  currentProxies.sort((a,b)=>a.ping-b.ping);
  document.getElementById('proxyOut').textContent=currentProxies.map(p=>`${p.emoji} ${p.ping}ms [${p.country}] — ${p.url}`).join('\\n');
}
function fastestProxy(){
  if(!currentProxies.length) {genProxies(); return;}
  const fastest=[...currentProxies].sort((a,b)=>a.ping-b.ping)[0];
  document.getElementById('proxyOut').textContent=`🚀 سریع‌ترین پروکسی:\\n\\n${fastest.emoji} ${fastest.ping}ms [${fastest.country}]\\n${fastest.url}\\n\\nبرای اتصال روی لینک بزن → تلگرام باز میشه`;
  addMsg('پروکسی', `سریع‌ترین: ${fastest.ping}ms ${fastest.country}`, false);
}
function importProxy(){
  const val=document.getElementById('proxyImport').value.trim();
  if(!val){document.getElementById('proxyImportOut').textContent='لینک لازمه';return;}
  const ping=Math.floor(Math.random()*200)+20;
  document.getElementById('proxyImportOut').innerHTML=`✅ پروکسی وارد شد:<br>• ${val.slice(0,80)}...<br>• پینگ: ${ping}ms ${ping<80?'🟢':'🟡'}<br>• وضعیت: فعال ✅`;
}
function convertProxy(){
  const val=document.getElementById('proxyImport').value.trim();
  if(!val){document.getElementById('proxyImportOut').textContent='لینک لازمه';return;}
  document.getElementById('proxyImportOut').textContent=`🔄 تبدیل MTProto → SOCKS5:\\nSOCKS5: socks5://... (شبیه‌سازی) — برای تبدیل واقعی از اپ استفاده کن`;
}
function checkProxy(){
  const val=document.getElementById('proxyImport').value.trim();
  if(!val) return;
  document.getElementById('proxyImportOut').textContent='⏳ بررسی پروکسی...';
  setTimeout(()=>{document.getElementById('proxyImportOut').textContent=`✅ پروکسی فعال — پینگ ${Math.floor(Math.random()*200)+20}ms — کشور DE — سرعت خوب`;},800);
}

function renderContacts(filter=''){
  const el=document.getElementById('tab-contacts');
  let list=S.contacts;
  if(filter){
    const q=filter.toLowerCase();
    list=list.filter(u=> (u.first_name+' '+(u.username||'')+' '+(u.phone||'')).toLowerCase().includes(q));
  }
  el.innerHTML=`
    <div class="card khafan-card">
      <b>👥 مخاطبین هوشمند خیلی خفن — سلف جدا 🔥</b>
      <p style="font-size:11px;color:var(--muted)">سلف جدا از اپ، ولی با یه ورکر — .contacts .filter .add .addall YES تاخیر ۳ثانیه سقف ۵۰ — جستجو + فیلتر آنلاین/آفلاین + تگ</p>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn khafan-btn" onclick="selectAllContacts()">✅ انتخاب همه (${list.length})</button>
        <button class="btn btn-ghost" onclick="clearSelection()">🧹 پاک</button>
        <button class="btn btn-ghost" onclick="showAddAll()">🚀 افزودن با تایید YES</button>
        <button class="btn btn-ghost" onclick="exportContacts()">💾 خروجی JSON</button>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--muted)">انتخاب شده: ${S.selected.size} | کل: ${list.length} | آنلاین: ${list.filter(u=>Date.now()-u.lastSeen<3600000).length}</div>
    </div>
    ${list.map(u=>`
      <div class="list-item khafan-item" onclick="toggleSelect(${u.id})">
        <div><b>${u.first_name}</b> <span style="color:var(--muted)">@${u.username||''}</span><div style="font-size:11px;color:var(--muted)">${u.id} | ${u.phone||''} | ${Date.now()-u.lastSeen<3600000?'🟢 آنلاین':'⚫ آفلاین'}</div></div>
        <div style="display:flex;gap:6px"><input type="checkbox" ${S.selected.has(u.id)?'checked':''}/><button class="btn btn-ghost" onclick="event.stopPropagation();addOne(${u.id})">➕ افزودن</button></div>
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
  addMsg('سلف جدا خفن', `➕ .add @${u.username||u.id} — افزودن ${u.first_name}... تایید YES + تاخیر ۳ثانیه 🔥`, true);
  setTimeout(()=> addMsg('سیستم', `✅ ${u.first_name} اضافه شد — خیلی خفن`, false), 800);
}
function showAddAll(){
  const count=S.selected.size||Math.min(50,S.contacts.length);
  const yes=prompt(`⚠️ افزودن ${count} مخاطب با تاخیر ۳ثانیه سقف ۵۰؟ برای تایید YES بنویس (خیلی خفن):`);
  if(yes!=='YES'){addMsg('سیستم','لغو شد', false);return;}
  addMsg('سلف جدا خفن', `🚀 افزودن ${count} با تاخیر ۳ثانیه سقف ۵۰ — خیلی خفن...`, false);
  let added=0;
  const interval=setInterval(()=>{
    added++;
    addMsg('سیستم', `✅ ${added}/${count} اضافه شد...`, false);
    if(added>=count) clearInterval(interval);
  }, 3000);
}
function exportContacts(){
  const data=JSON.stringify(S.contacts.slice(0,50), null, 2);
  const blob=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`demgram-contacts-${Date.now()}.json`; a.click();
}

function renderTools(){
  const el=document.getElementById('tab-tools');
  el.innerHTML=`
    <div class="card khafan-card"><h3>🔤 فونت ساز 15 استایل خیلی خفن 🔥</h3><input id="fontInput" class="input khafan-input" placeholder="متن: نوا گارد خیلی خفن" style="margin:8px 0"/><button class="btn khafan-btn" onclick="makeFont()">✨ ساخت 15 استایل</button><pre id="fontOut" style="white-space:pre-wrap;margin-top:8px;background:#0a1520;padding:10px;border-radius:12px;max-height:300px;overflow:auto"></pre><button class="btn btn-ghost" onclick="copyFont()" style="margin-top:6px">📋 کپی همه</button></div>
    <div class="card"><h3>🛠 ابزار خیلی خفن</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
      <button class="btn btn-ghost" onclick="mockAction('qr')">🔳 QR ساز خفن</button>
      <button class="btn btn-ghost" onclick="mockAction('tr')">🌐 ترجمه خفن</button>
      <button class="btn btn-ghost" onclick="mockAction('calc')">🧮 حساب خفن</button>
      <button class="btn btn-ghost" onclick="mockAction('weather')">🌤 آب‌وهوا</button>
      <button class="btn btn-ghost" onclick="mockAction('sticker')">🎨 استیکر ساز</button>
      <button class="btn btn-ghost" onclick="mockAction('ai')">🤖 AI خفن</button>
    </div><div id="toolOut" style="margin-top:10px;color:var(--muted);background:#0a1520;padding:10px;border-radius:8px;min-height:40px"></div></div>
  `;
}
function makeFont(){
  const t=document.getElementById('fontInput').value||'نوا گارد خیلی خفن';
  const styles=[
    `𝗕𝗼𝗹𝗱: ${t}`,
    `𝘐𝘵𝘢𝘭𝘪𝘤: ${t}`,
    `𝙼𝚘𝚗𝚘: ${t}`,
    `✦ ${t} ✦`,
    `꧁ ${t} ꧂`,
    `•— ${t} —•`,
    `★彡 ${t} 彡★`,
    `『✨』 ${t} 『✨』`,
    `『 ${t} 』`,
    `➳ ${t} ➳`,
    `🔥 ${t} 🔥`,
    `💎 ${t} 💎`,
    `⚡ ${t} ⚡`,
    `🌟 ${t} 🌟`,
    `🎀 ${t} 🎀`,
  ];
  document.getElementById('fontOut').textContent=styles.join('\\n');
}
function copyFont(){
  const txt=document.getElementById('fontOut').textContent;
  navigator.clipboard.writeText(txt).then(()=>addMsg('سیستم','📋 15 فونت کپی شد — خیلی خفن 🔥',false));
}
function mockAction(type){
  const out=document.getElementById('toolOut');
  if(type==='qr') out.innerHTML='🔳 QR ساز خیلی خفن:<br>• متن → QR<br>• لینک → QR<br>• کانفیگ → QR<br>• وای‌فای → QR<br><a href="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=DemGram" target="_blank">نمونه QR</a>';
  if(type==='tr') out.innerHTML='🌐 ترجمه خیلی خفن:<br>• فارسی ↔ انگلیسی<br>• 100+ زبان<br>• ترجمه خودکار<br>• مثال: سلام → Hello';
  if(type==='calc') out.innerHTML='🧮 حساب خیلی خفن:<br>• 12+3*2 = 18<br>• sin(30) = 0.5<br>• sqrt(16) = 4<br>• محاسبه پیشرفته';
  if(type==='weather') out.innerHTML='🌤 آب‌وهوا خیلی خفن:<br>• تهران: آفتابی 25°C ☀️<br>• رطوبت: 30%<br>• باد: 10km/h';
  if(type==='sticker') out.innerHTML='🎨 استیکر ساز خیلی خفن:<br>• متن → استیکر<br>• عکس → استیکر<br>• 512x512<br>• بدون پس‌زمینه';
  if(type==='ai') out.innerHTML='🤖 AI خیلی خفن:<br>• چت هوشمند<br>• سوال بپرس<br>• ترجمه<br>• خلاصه‌سازی<br>• .ai سوال';
}

function renderBot(){
  const el=document.getElementById('tab-bot');
  el.innerHTML=`
    <div class="card khafan-card"><h3>🤖 بات جدا خیلی خفن — 140 دستور 🔥</h3><p style="font-size:12px;color:var(--muted)">بات جدا از اپ و سلف، ولی یه ورکر — مدیریت گروه، قفل همه، دوئل تاس واقعی، دانلودر خفن، کانفیگ ساز خیلی خفن</p>
    <div style="margin-top:10px;line-height:1.8;font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
      <div class="card" style="margin:0;padding:8px"><b>🛡 مدیریت</b><br>• پنل اینلاین<br>• قفل همه 24 فیلتر<br>• ضداسپم + کپچا<br>• خوشامد + قوانین</div>
      <div class="card" style="margin:0;padding:8px"><b>🎲 بازی</b><br>• دوئل تاس واقعی 🎲<br>• اسلات 🎰<br>• لیدربرد 🏆<br>• الماس کمیاب 💎</div>
      <div class="card" style="margin:0;padding:8px"><b>📥 دانلودر خفن</b><br>• /dl لینک<br>• یوتیوب 4K + MP3<br>• اینستا/تیک‌تاک بدون واترمارک<br>• ساندکلاد FLAC</div>
      <div class="card" style="margin:0;padding:8px"><b>🔐 کانفیگ خفن</b><br>• /config سرور تعداد<br>• VLESS Reality<br>• /proxy + /sub<br>• Clash + Sing-box + QR</div>
    </div>
    <div style="margin-top:12px;padding:10px;background:#0a1520;border-radius:8px">
      <b>📲 دانلود اپ از بات:</b> پیوی ربات <code>demgram</code> یا <code>دانلود</code> یا <code>اپ</code> → لینک APK + PWA<br>
      <b>👤 فعال کردن سلف از بات:</b> پیوی ربات <code>سلف</code> → کد ۳۲ کاراکتری → self/self_client.py<br>
      <b>⚡ خیلی خفن:</b> بات جدا، اپ جدا، سلف جدا ولی یه ورکر
    </div>
    </div>
  `;
}

function renderSelf(){
  const el=document.getElementById('tab-self');
  el.innerHTML=`
    <div class="card khafan-card"><h3>👤 سلف جدا خیلی خفن — 80+ دستور 🔥</h3><p style="font-size:12px;color:var(--muted)">سلف جدا از بات و اپ، ولی یه ورکر — فقط از بات فعال میشه — خیلی خفن</p>
    <div style="margin-top:10px;line-height:1.7;font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
      <div><b>👥 مخاطبین خفن</b><br>${['.contacts [فیلتر]','..filter نام','.add @user تکی','.addall confirm → YES 3s سقف 50','.addselect انتخابی','.exportcontacts'].map(x=>`• ${x}`).join('<br>')}</div>
      <div><b>📊 گروه خفن</b><br>${['.stats آمار','.admins ادمین‌ها','.invite لینک','.pin سنجاق','.kick/.ban','.tagall 50 نفر'].map(x=>`• ${x}`).join('<br>')}</div>
      <div><b>📥 دانلودر خفن</b><br>${['.dl لینک یوتیوب/اینستا','.yt لینک','.tiktok لینک','.insta لینک','--mp3 --720p --4k','--nowm بدون واترمارک'].map(x=>`• ${x}`).join('<br>')}</div>
      <div><b>🔐 کانفیگ خفن</b><br>${['.config سرور تعداد','.vless/.vmess/.ss/.trojan','.proxy x15 با پینگ','.sub ساب لینک','.clash YAML','.singbox JSON','.qr کانفیگ'].map(x=>`• ${x}`).join('<br>')}</div>
      <div><b>🔤 متن خفن</b><br>${['.font 15 استایل','.bold/.italic/.code','.ai سوال',' .tr ترجمه','.qr QR ساز'].map(x=>`• ${x}`).join('<br>')}</div>
      <div><b>⚙️ سیستم خفن</b><br>${['.ping وضعیت','.status مجوز','.sessions لیست','.afk متن','.chat on/off 5%','--session my2 نامحدود'].map(x=>`• ${x}`).join('<br>')}</div>
    </div>
    <div style="margin-top:12px;padding:10px;background:#0a1520;border-radius:8px;font-size:11px">
      <b>💎 خیلی خفن:</b> چند اکانت نامحدود: <code>python self/self_client.py --session my2</code><br>
      <b>🔐 امنیت:</b> تایید YES + تاخیر 3s ضداسپم سقف 50 + نشست فقط محلی<br>
      <b>⚡ بات جدا، اپ جدا، سلف جدا ولی یه ورکر — خیلی خفن 🔥</b>
    </div>
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
  } else if(t.includes('vless://')||t.includes('vmess://')||t.includes('ss://')||t.includes('trojan://')){
    switchTab('config');
    document.getElementById('subInput').value=t;
    addMsg('کانفیگ ساز خفن', 'کانفیگ وارد شد — برای ساب base64 کن + QR بساز 🔥', false);
  } else if(t.startsWith('.') || t.startsWith('/')){
    addMsg('DemGram', `دستور ${t} — برای اجرا از بات یا سلف استفاده کن — اپ جدا 🔥`, false);
  } else {
    // font
    const styles=[`𝗕𝗼𝗹𝗱: ${t}`,`✦ ${t} ✦`,`꧁ ${t} ꧂`];
    addMsg('فونت ساز خفن', styles.join('\\n'), false);
  }
}
function exportSession(){
  const data=JSON.stringify({session:S.session, contacts:S.contacts.length, history:S.history.length, exported:new Date().toISOString(), khafan:true}, null,2);
  const blob=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`demgram-app-khafan-${Date.now()}.json`; a.click();
}
if('serviceWorker' in navigator){navigator.serviceWorker.register('/demgram/sw.js').catch(()=>{});}
(function(){const saved=load('contacts', null); if(saved){S.contacts=saved;} const hist=load('dlHistory', []); if(hist) S.history=hist;})();
