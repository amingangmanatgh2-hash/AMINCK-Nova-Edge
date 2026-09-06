// DemGram Web Client — powerful Telegram client with self features
// All data stays in browser (localStorage + IndexedDB). No server upload.
// Uses mock + real Telegram API via gramjs if available.

const S = {
  session: 'demgram1',
  contacts: [],
  chats: [],
  selected: new Set(),
  tab: 'chats',
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
  ['chats','contacts','self','tools','ai'].forEach(n=>{
    document.getElementById('tab-'+n).style.display = n===name?'block':'none';
  });
  if(name==='contacts') renderContacts();
  if(name==='self') renderSelf();
  if(name==='tools') renderTools();
  if(name==='ai') renderAI();
  if(name==='chats') renderChats();
}

function showDemo(){
  S.demo=true;
  S.contacts = Array.from({length:45},(_,i)=>({id:1000+i, first_name:'کاربر '+(i+1), username:'user'+(i+1), phone:'+98912'+String(1000000+i)}));
  S.chats = [{id:-1001,title:'گروه تست DemGram', members: S.contacts.length, type:'group'}, {id:1001,title:'Saved Messages', type:'private'}];
  save('contacts', S.contacts);
  save('chats', S.chats);
  document.getElementById('loginView').style.display='none';
  document.getElementById('mainView').style.display='flex';
  renderChats(); renderContacts();
  document.getElementById('sessionBadge').textContent='demo';
  addMsg('سیستم','DemGram دمو فعال شد — ۴۵ مخاطب شبیه‌سازی شده. برای اتصال واقعی API ID وارد کن.', false);
}

function startLogin(){
  const apiId = document.getElementById('apiId').value.trim();
  const apiHash = document.getElementById('apiHash').value.trim();
  const phone = document.getElementById('phone').value.trim();
  if(!apiId||!apiHash||!phone){alert('همه فیلدها لازم است');return;}
  // Save locally
  save('api', {apiId, apiHash, phone});
  document.getElementById('loginForm').style.display='none';
  document.getElementById('codeView').style.display='block';
  // In real implementation, here we would call gramjs: client.start({phone, code...})
  addMsg('سیستم','کد ورود به '+phone+' ارسال شد (در دمو شبیه‌سازی).', false);
}
function confirmCode(){
  const code = document.getElementById('code').value.trim();
  if(!code){alert('کد لازم');return;}
  showDemo(); // For now, jump to demo after code (real impl would verify via Telegram)
}

function renderChats(){
  const el=document.getElementById('tab-chats');
  el.innerHTML = S.chats.map(c=>`
    <div class="list-item" onclick="openChat(${c.id})">
      <div><b>${c.title}</b><div style="font-size:12px;color:var(--muted)">${c.type} • ${c.members||''} عضو</div></div>
      <span class="badge">${c.id}</span>
    </div>
  `).join('') || '<div class="card">چتی نیست — اول مخاطبین رو ببین</div>';
}

function renderContacts(filter=''){
  const el=document.getElementById('tab-contacts');
  let list=S.contacts;
  if(filter){
    const q=filter.toLowerCase();
    list=list.filter(u=> (u.first_name+' '+(u.username||'')+' '+(u.phone||'')).toLowerCase().includes(q));
  }
  const html = `
    <div class="card">
      <b>👥 مخاطبین (${list.length})</b>
      <p style="font-size:12px;color:var(--muted);margin-top:6px">.contacts [عبارت] .filter نام .find @username .add @user .addall confirm</p>
      <div style="margin-top:10px;display:flex;gap:6px">
        <button class="btn" onclick="selectAllContacts()">انتخاب همه</button>
        <button class="btn btn-ghost" onclick="clearSelection()">پاک انتخاب</button>
        <button class="btn btn-ghost" onclick="showAddAll()">افزودن انتخاب‌شده‌ها</button>
      </div>
    </div>
    ${list.map(u=>`
      <div class="list-item" onclick="toggleSelect(${u.id})">
        <div>
          <b>${u.first_name}</b> <span style="color:var(--muted)">@${u.username||''}</span>
          <div style="font-size:11px;color:var(--muted)">${u.phone||''} • ${u.id}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="checkbox" ${S.selected.has(u.id)?'checked':''} onclick="event.stopPropagation();toggleSelect(${u.id})"/>
          <button class="btn btn-ghost" onclick="event.stopPropagation();addOne(${u.id})">افزودن</button>
        </div>
      </div>
    `).join('')}
  `;
  el.innerHTML=html;
}

function toggleSelect(id){
  if(S.selected.has(id)) S.selected.delete(id); else S.selected.add(id);
  renderContacts(document.getElementById('globalSearch').value);
  document.getElementById('chatTitle').textContent = `${S.selected.size} انتخاب شده`;
}
function selectAllContacts(){ S.contacts.forEach(c=>S.selected.add(c.id)); renderContacts(); }
function clearSelection(){ S.selected.clear(); renderContacts(); }

function addOne(id){
  const u=S.contacts.find(x=>x.id===id);
  if(!u) return;
  addMsg('شما', `.add @${u.username||u.id} — در حال افزودن ${u.first_name}...`, true);
  setTimeout(()=> addMsg('سیستم', `✅ ${u.first_name} اضافه شد (شبیه‌سازی — در حالت واقعی InviteToChannelRequest با تاخیر ۳ ثانیه)`, false), 800);
}
function showAddAll(){
  if(S.selected.size===0 && !confirm('هیچ انتخابی نیست — همه ۵۰ تا اضافه بشن؟ (با تایید YES و تاخیر ضداسپم)')) return;
  const count = S.selected.size||Math.min(50, S.contacts.length);
  const yes = prompt(`⚠️ افزودن ${count} مخاطب با تاخیر ۳ ثانیه‌ای؟ برای تایید YES بنویس:`);
  if(yes!=='YES'){addMsg('سیستم','لغو شد — برای تایید باید YES بنویسی', false); return;}
  let added=0;
  const ids = S.selected.size? Array.from(S.selected) : S.contacts.slice(0,50).map(c=>c.id);
  addMsg('سیستم', `🚀 شروع افزودن ${ids.length} مخاطب با تاخیر ۳ ثانیه...`, false);
  let i=0;
  const iv=setInterval(()=>{
    if(i>=ids.length){clearInterval(iv); addMsg('سیستم', `✅ تمام شد: ${added} نفر اضافه شد`, false); return;}
    const u=S.contacts.find(x=>x.id===ids[i]);
    if(u){added++; addMsg('سیستم', `+ ${u.first_name} @${u.username||''} اضافه شد`, false);}
    i++;
  }, 800); // demo faster, real is 3000ms
}

function renderSelf(){
  const el=document.getElementById('tab-self');
  el.innerHTML = `
    <div class="card">
      <h3>🛠 سلف گولاخ — ۵۰+ دستور</h3>
      <div style="margin-top:10px;line-height:1.9;font-size:13px">
        ${[
          '.help راهنما کامل',
          '.ping فعال بودن + سشن',
          '.id شناسه‌ها',
          '.time ساعت',
          '.calc (12+3)*2 ماشین حساب',
          '.status وضعیت مجوز و الماس',
          '.afk متن / .back برگشت',
          '.autoreply on/off/text',
          '.chat on/off سخنگوی خودکار',
          '.contacts [فیلتر] لیست مخاطبین',
          '.filter نام جستجوی مخاطب',
          '.find @username جستجو',
          '.add @user افزودن تکی',
          '.addall confirm افزودن همه با تایید',
          '.addselect انتخاب تعاملی',
          '.stats آمار گروه',
          '.admins لیست ادمین‌ها',
          '.invite لینک دعوت',
          '.pin ریپلای سنجاق',
          '.unpin حذف سنجاق',
          '.font متن فونت ساز ۷ استایل',
          '.bold/.italic/.code/.reverse',
          '.save ذخیره به Saved',
          '.note متن یادداشت',
          '.clean 10 confirm پاکسازی پیام‌های خودت',
          '.ai سوال هوش مصنوعی محلی/ابری',
          '.tr متن ترجمه',
          '.remind 5 متن یادآوری',
          '.export خروجی سشن (وب)',
        ].map(x=>`<div class="feature"><span class="kbd">${x.split(' ')[0]}</span> ${x.slice(x.indexOf(' '))}</div>`).join('')}
      </div>
    </div>
  `;
}
function renderTools(){
  const el=document.getElementById('tab-tools');
  el.innerHTML=`
    <div class="card">
      <h3>🔤 فونت ساز خفن</h3>
      <input id="fontInput" class="input" placeholder="متنت رو بنویس: نوا گارد" style="margin:10px 0"/>
      <button class="btn" onclick="makeFont()">ساخت فونت</button>
      <pre id="fontOut" style="white-space:pre-wrap;margin-top:12px;background:#101a24;padding:10px;border-radius:8px"></pre>
    </div>
    <div class="card">
      <h3>🔗 ابزار گروه</h3>
      <button class="btn btn-ghost" onclick="mockAction('stats')">📊 آمار گروه</button>
      <button class="btn btn-ghost" onclick="mockAction('admins')">👑 ادمین‌ها</button>
      <button class="btn btn-ghost" onclick="mockAction('invite')">🔗 لینک دعوت</button>
      <div id="toolOut" style="margin-top:10px;color:var(--muted)"></div>
    </div>
  `;
}
function makeFont(){
  const t=document.getElementById('fontInput').value||'نوا گارد';
  const fonts=[
    `𝗕𝗼𝗹𝗱: ${t}`,
    `𝘐𝘵𝘢𝘭𝘪𝘤: ${t}`,
    `𝙼𝚘𝚗𝚘: ${t}`,
    `✦ ${t} ✦`,
    `꧁ ${t} ꧂`,
    `•— ${t} —•`,
    `★彡 ${t} 彡★`,
    `𝕯𝖔𝖚𝖇𝖑𝖊: ${t}`,
    `🄱🄾🅇: ${t}`,
  ];
  document.getElementById('fontOut').textContent=fonts.join('\n');
}
function mockAction(type){
  const out=document.getElementById('toolOut');
  if(type==='stats') out.textContent='📊 گروه تست DemGram — ۴۵ عضو — درباره: گروه قدرتمند DemGram';
  if(type==='admins') out.textContent='👑 ادمین‌ها: @owner (8882866473) @admin2';
  if(type==='invite') out.textContent='🔗 https://t.me/+testDemGramInviteLink';
}

function renderAI(){
  const el=document.getElementById('tab-ai');
  el.innerHTML=`
    <div class="card">
      <h3>🤖 هوش مصنوعی DemGram</h3>
      <p style="font-size:12px;color:var(--muted)">کلید OpenAI فقط در مرورگر شما می‌ماند (localStorage). به سرور نمی‌رود.</p>
      <input id="aiKey" class="input" placeholder="OPENAI_API_KEY (اختیاری) sk-..." style="margin:10px 0" value="${load('openai_key','')}" />
      <button class="btn btn-ghost" onclick="saveAIKey()">ذخیره کلید محلی</button>
      <textarea id="aiPrompt" class="input" placeholder="سوالت رو بنویس... .ai چطور گروه رو فعال نگه دارم؟" style="margin-top:10px;height:80px"></textarea>
      <button class="btn" style="margin-top:8px" onclick="askAI()">پرسش</button>
      <pre id="aiOut" style="white-space:pre-wrap;margin-top:12px;background:#101a24;padding:10px;border-radius:8px"></pre>
    </div>
  `;
}
function saveAIKey(){
  const k=document.getElementById('aiKey').value.trim();
  save('openai_key', k);
  alert('کلید فقط در مرورگر ذخیره شد');
}
async function askAI(){
  const prompt=document.getElementById('aiPrompt').value.trim();
  if(!prompt) return;
  const out=document.getElementById('aiOut');
  out.textContent='⏳ در حال فکر...';
  const key=load('openai_key','');
  if(key){
    try{
      const r=await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
        body: JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:prompt}]})
      });
      const j=await r.json();
      out.textContent=j.choices?.[0]?.message?.content||JSON.stringify(j).slice(0,2000);
      return;
    }catch(e){ out.textContent='⚠️ خطا در اتصال ابری، پاسخ محلی: '+localAI(prompt); return;}
  }
  out.textContent=localAI(prompt);
}
function localAI(p){
  p=p.toLowerCase();
  if(p.includes('سلام')) return 'سلام رفیق! 😎 من DemGram هستم، چطور کمکت کنم؟';
  if(p.includes('فونت')) return 'برای فونت خفن: تب ابزار → فونت ساز، یا .font متن رو بزن 🔤';
  if(p.includes('اد')||p.includes('add')) return 'برای افزودن: تب مخاطبین → انتخاب کن بعد افزودن. برای همه: افزودن همه با تایید YES و تاخیر ۳ ثانیه‌ای.';
  if(p.includes('گروه')) return 'گروه رو با پنل مدیریت کن، قفل همه برای امنیت، خوشامد برای ورود ✨';
  return 'ایده خفنه! DemGram ۱۰۰۰ قابلیت داره — از مدیریت مخاطبین هوشمند تا فونت ساز و هوش مصنوعی محلی 🌱';
}

function onSearch(v){
  if(S.tab==='contacts') renderContacts(v);
}
function openChat(id){
  const c=S.chats.find(x=>x.id===id);
  if(!c) return;
  document.getElementById('chatTitle').textContent=c.title;
  addMsg('سیستم', `وارد ${c.title} شدی — اینجا می‌تونی پیام بدی و از دستورات سلف استفاده کنی`, false);
}
function addMsg(from,text,me){
  const box=document.getElementById('chatBox');
  const div=document.createElement('div');
  div.className='msg'+(me?' me':'');
  div.innerHTML=`<div style="font-size:11px;opacity:.7">${from}</div><div>${text.replace(/</g,'&lt;')}</div>`;
  box.appendChild(div);
  box.scrollTop=box.scrollHeight;
}
function sendMsg(){
  const inp=document.getElementById('msgInput');
  const t=inp.value.trim();
  if(!t) return;
  addMsg('شما', t, true);
  inp.value='';
  // interpret self commands
  if(t.startsWith('.contacts')||t.startsWith('.filter')||t.startsWith('.find')){
    const q=t.split(' ').slice(1).join(' ');
    switchTab('contacts'); renderContacts(q);
    addMsg('سیستم', `🔍 جستجو: ${q||'همه'} — ${S.contacts.length} مخاطب`, false);
  } else if(t.startsWith('.font')){
    const txt=t.slice(5).trim()||'نوا گارد';
    switchTab('tools'); setTimeout(()=>{document.getElementById('fontInput').value=txt; makeFont();},100);
  } else if(t.startsWith('.ai')){
    switchTab('ai'); setTimeout(()=>{document.getElementById('aiPrompt').value=t.slice(3).trim(); askAI();},100);
  } else if(t.startsWith('.add')){
    showAddAll();
  } else {
    setTimeout(()=> addMsg('DemGram', localAI(t), false), 600);
  }
}
function exportSession(){
  const data=JSON.stringify({session:S.session, contacts:S.contacts.length, exported:new Date().toISOString()}, null,2);
  const blob=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='demgram-session.json'; a.click();
}

// PWA
if('serviceWorker' in navigator){navigator.serviceWorker.register('/demgram/sw.js').catch(()=>{});}

// init
(function(){
  const saved=load('contacts', null);
  if(saved){S.contacts=saved; S.chats=load('chats', []);}
})();
