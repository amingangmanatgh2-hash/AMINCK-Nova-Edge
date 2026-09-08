// ═══════════════════════════════════════════════════════════════════
//  مینی‌اپ سکه‌ای — WebApp تلگرام: تپ، آپگرید، چرخ شانس، لیگ، ماموریت
// ═══════════════════════════════════════════════════════════════════
import { verifyInitData, json, html, clamp } from './util.js';
import { getUser, weekKey, todayStr, faDigits } from './db.js';
import { getNum, getSettingValue } from './texts.js';
import { payWithCoins } from './pay.js';
import { getChatMember } from './tg.js';

const now = () => Math.floor(Date.now() / 1000);

const TIERS = [
  { min: 0, name: 'Bronze برنز 🥉' },
  { min: 5000, name: 'Silver نقره 🥈' },
  { min: 25000, name: 'Gold طلا 🥇' },
  { min: 75000, name: 'Diamond الماس 💎' },
];
export const tierOf = (totalTaps) => {
  let t = TIERS[0];
  for (const x of TIERS) if (totalTaps >= x.min) t = x;
  return t.name;
};

const energyCap = (u) => 400 + (u.energy_level || 1) * 100;
const regenRate = (u) => 1 + (u.speed_level || 1);
const energyCost = (u) => Math.round(300 * Math.pow(1.7, (u.energy_level || 1) - 1));
const speedCost = (u) => Math.round(400 * Math.pow(1.7, (u.speed_level || 1) - 1));

function currentEnergy(u) {
  const cap = energyCap(u);
  const dt = Math.max(0, now() - (u.energy_ts || now()));
  return Math.min(cap, (u.energy_left ?? cap) + dt * regenRate(u));
}

async function ensureWeek(db, u) {
  const wk = weekKey();
  if (u.week_key !== wk) {
    await db.prepare('UPDATE users SET week_key=?, weekly_taps=0 WHERE id=?').bind(wk, u.id).run();
    return { ...u, week_key: wk, weekly_taps: 0 };
  }
  return u;
}

async function statePayload(env, u) {
  const db = env.DB;
  u = await ensureWeek(db, u);
  const channelId = await getSettingValue(db, 'channel_id');
  const channelUrl = await getSettingValue(db, 'channel_url');
  const prize = await getNum(db, 'league_prize_coins', 10000);
  const shopItems = (await db.prepare("SELECT id, title, days, traffic_gb, coin_price FROM products WHERE category='coin' AND enabled=1 ORDER BY coin_price ASC LIMIT 20").all()).results;
  let missionsDone = [];
  try {
    if (u.missions_date === todayStr()) missionsDone = JSON.parse(u.missions_done || '[]');
  } catch {}
  return {
    coins: u.coins,
    energy: Math.floor(currentEnergy(u)),
    energyCap: energyCap(u),
    regen: regenRate(u),
    totalTaps: u.total_taps,
    weeklyTaps: u.weekly_taps,
    tier: tierOf(u.total_taps),
    energyLevel: u.energy_level,
    speedLevel: u.speed_level,
    energyCost: energyCost(u),
    speedCost: speedCost(u),
    spinDone: u.last_spin_date === todayStr(),
    streak: u.streak,
    missions: {
      done: missionsDone,
      channel: !!channelId,
      channelUrl,
      invited: u.invited_count > 0,
    },
    shopItems,
    leaguePrize: prize,
  };
}

async function authUser(env, body) {
  const user = await verifyInitData(body?.initData || '', env.TELEGRAM_BOT_TOKEN);
  if (!user) return null;
  return getUser(env.DB, user.id);
}

export async function handleGameApi(env, request, path) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  let body = {};
  try {
    body = await request.json();
  } catch {}
  const u0 = await authUser(env, body);
  if (!u0) return json({ error: 'unauthorized' }, 403);
  let u = await ensureWeek(env.DB, u0);
  const db = env.DB;

  if (path === '/api/game/init') return json(await statePayload(env, u));

  if (path === '/api/game/tap') {
    const reqTaps = clamp(Math.floor(Number(body.taps) || 0), 0, 500);
    if (reqTaps <= 0) return json({ error: 'bad' }, 400);
    const energy = Math.floor(currentEnergy(u));
    const used = Math.min(reqTaps, energy);
    if (used <= 0) return json({ ok: false, reason: 'no_energy', ...((await statePayload(env, u))) });
    const newEnergy = energy - used;
    // استریک روزانه
    const today = todayStr();
    let streak = u.streak || 0;
    let bonus = 0;
    let lastDay = u.last_active_day;
    if (lastDay !== today) {
      const yest = todayStr(Date.now() - 86400000);
      streak = lastDay === yest ? streak + 1 : 1;
      bonus = Math.min(50, streak * 5);
      lastDay = today;
    }
    await db
      .prepare(
        `UPDATE users SET energy_left=?, energy_ts=?, coins=coins+?+?, total_taps=total_taps+?, weekly_taps=weekly_taps+?,
         streak=?, last_active_day=? WHERE id=?`
      )
      .bind(newEnergy, now(), used, bonus, used, used, streak, lastDay, u.id)
      .run();
    return json({ ok: true, added: used + bonus, bonus, coins: u.coins + used + bonus, energy: newEnergy, streak });
  }

  if (path === '/api/game/upgrade') {
    const type = body.type;
    const cost = type === 'energy' ? energyCost(u) : type === 'speed' ? speedCost(u) : 0;
    if (!cost) return json({ error: 'bad' }, 400);
    if (u.coins < cost) return json({ ok: false, reason: 'no_coins' });
    const col = type === 'energy' ? 'energy_level' : 'speed_level';
    await db.prepare(`UPDATE users SET coins=coins-?, ${col}=${col}+1 WHERE id=?`).bind(cost, u.id).run();
    return json({ ok: true, ...(await statePayload(env, await getUser(db, u.id))) });
  }

  if (path === '/api/game/spin') {
    if (u.last_spin_date === todayStr()) return json({ ok: false, reason: 'already' });
    const prizes = [
      [5, 30], [10, 25], [25, 20], [50, 12], [100, 8], [250, 4], [1000, 1],
    ];
    const total = prizes.reduce((s, p) => s + p[1], 0);
    let r = Math.random() * total;
    let prize = prizes[0][0];
    for (const [c, w] of prizes) {
      r -= w;
      if (r <= 0) {
        prize = c;
        break;
      }
    }
    await db.prepare('UPDATE users SET coins=coins+?, last_spin_date=? WHERE id=?').bind(prize, todayStr(), u.id).run();
    return json({ ok: true, prize, coins: u.coins + prize });
  }

  if (path === '/api/game/mission') {
    const m = body.mission;
    let done = [];
    try {
      if (u.missions_date === todayStr()) done = JSON.parse(u.missions_done || '[]');
    } catch {}
    if (done.includes(m)) return json({ ok: false, reason: 'done' });
    let reward = 0;
    if (m === 'channel') {
      const ch = await getSettingValue(db, 'channel_id');
      if (!ch) return json({ ok: false, reason: 'no_channel' });
      const mem = await getChatMember(env.TELEGRAM_BOT_TOKEN, ch, u.id);
      if (!mem || !['member', 'administrator', 'creator'].includes(mem.status)) return json({ ok: false, reason: 'not_joined' });
      reward = 150;
    } else if (m === 'invite') {
      if (!(u.invited_count > 0)) return json({ ok: false, reason: 'no_invite' });
      reward = 200;
    } else if (m === 'streak') {
      if ((u.streak || 0) < 2) return json({ ok: false, reason: 'low_streak' });
      reward = 100;
    } else return json({ error: 'bad' }, 400);
    done.push(m);
    await db.prepare('UPDATE users SET coins=coins+?, missions_date=?, missions_done=? WHERE id=?').bind(reward, todayStr(), JSON.stringify(done), u.id).run();
    return json({ ok: true, reward, coins: u.coins + reward, done });
  }

  if (path === '/api/game/buy') {
    const p = await db.prepare("SELECT * FROM products WHERE id=? AND category='coin' AND enabled=1").bind(Number(body.productId)).first();
    if (!p) return json({ error: 'notfound' }, 404);
    const res = await payWithCoins(env, u, p);
    if (!res.ok) return json({ ok: false, reason: res.reason });
    return json({ ok: true, token: res.sub.token });
  }

  if (path === '/api/game/league') {
    const top = (await db.prepare('SELECT first_name, username, weekly_taps, total_taps FROM users WHERE weekly_taps>0 ORDER BY weekly_taps DESC LIMIT 10').all()).results;
    const rank = (await db.prepare('SELECT COUNT(*)+1 r FROM users WHERE weekly_taps>?').bind(u.weekly_taps).first())?.r || 0;
    return json({ top, me: { weeklyTaps: u.weekly_taps, rank, coins: u.coins }, prize: await getNum(db, 'league_prize_coins', 10000) });
  }

  return json({ error: 'notfound' }, 404);
}

// ─────────────────────────── صفحه وب‌اپ ───────────────────────────
export function gameHtml(env) {
  return html(`<!doctype html><html lang="fa" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>🎮 مینی‌اپ سکه‌ای</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
:root{--bg:#0d1526;--card:#16233f;--gold:#f5b31e;--txt:#eaf1ff;--mut:#8fa3c8;--ok:#38d39f}
*{box-sizing:border-box;margin:0;padding:0;font-family:Vazirmatn,'Segoe UI',Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
body{background:var(--bg);color:var(--txt);min-height:100vh;padding-bottom:84px}
.hdr{padding:16px;text-align:center;background:linear-gradient(180deg,#16233f,#0d1526)}
.coins{font-size:26px;font-weight:800;color:var(--gold)}
.tier{font-size:12px;color:var(--mut);margin-top:2px}
.tabs{display:flex;position:fixed;bottom:0;left:0;right:0;background:#101b33;border-top:1px solid #22314f;z-index:9}
.tabs button{flex:1;background:none;border:none;color:var(--mut);padding:10px 2px;font-size:11px}
.tabs button.on{color:var(--gold)}
.tabs .ic{font-size:20px;display:block}
.page{display:none;padding:16px;max-width:560px;margin:0 auto}
.page.on{display:block}
.card{background:var(--card);border-radius:16px;padding:16px;margin-bottom:12px}
.coinwrap{display:flex;flex-direction:column;align-items:center;padding:18px 0}
#coin{width:200px;height:200px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffd97a,#f5b31e 55%,#b57a05);display:flex;align-items:center;justify-content:center;font-size:88px;box-shadow:0 14px 44px rgba(245,179,30,.35);user-select:none;transition:transform .06s}
#coin:active{transform:scale(.94)}
.ebar{width:100%;max-width:340px;height:14px;background:#0a1120;border-radius:8px;overflow:hidden;margin-top:16px}
#efill{height:100%;width:60%;background:linear-gradient(90deg,#38d39f,#f5b31e);transition:width .2s}
.small{font-size:12px;color:var(--mut);margin-top:8px}
.btn{display:block;width:100%;background:linear-gradient(135deg,#f5b31e,#ff8a00);color:#171305;border:none;border-radius:12px;padding:13px;font-size:15px;font-weight:800;margin-top:10px}
.btn.sec{background:#22314f;color:var(--txt)}
.btn:disabled{opacity:.45}
.row{display:flex;gap:10px}.row .card{flex:1}
h3{font-size:15px;margin-bottom:8px}
.mut{color:var(--mut);font-size:12px}
#wheel{width:230px;height:230px;border-radius:50%;margin:10px auto;border:8px solid #22314f;background:conic-gradient(#f5b31e 0 51.4deg,#22314f 51.4deg 102.8deg,#38d39f 102.8deg 154.3deg,#22314f 154.3deg 205.7deg,#7c5cff 205.7deg 257.1deg,#22314f 257.1deg 308.6deg,#ff5470 308.6deg 360deg);transition:transform 3.4s cubic-bezier(.15,.9,.1,1);position:relative}
#wheel:after{content:'🎁';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:8px 4px;border-bottom:1px solid #22314f}
.float{position:fixed;color:var(--gold);font-weight:800;font-size:20px;pointer-events:none;animation:up .9s ease-out forwards;z-index:99}
@keyframes up{to{transform:translateY(-90px);opacity:0}}
.item{display:flex;justify-content:space-between;align-items:center;padding:12px;background:#101b33;border-radius:12px;margin-bottom:8px}
.badge{background:#22314f;border-radius:20px;padding:3px 10px;font-size:11px}
.toast{position:fixed;top:14px;left:50%;transform:translateX(-50%);background:#16233f;border:1px solid #f5b31e;border-radius:12px;padding:10px 18px;font-size:13px;opacity:0;transition:.3s;z-index:100;white-space:nowrap}
.toast.on{opacity:1}
</style></head><body>
<div class="hdr"><div class="coins">🪙 <span id="coins">0</span></div><div class="tier" id="tier">—</div></div>
<div class="toast" id="toast"></div>

<div class="page on" id="pg-tap">
 <div class="coinwrap">
  <div id="coin">🪙</div>
  <div class="ebar"><div id="efill"></div></div>
  <div class="small">⚡ <span id="energy">0</span>/<span id="ecap">0</span> | 🔥 استریک: <span id="streak">0</span> روز</div>
 </div>
</div>

<div class="page" id="pg-up">
 <div class="row">
  <div class="card"><h3>🔋 ظرفیت انرژی</h3><div class="mut">سطح <span id="elvl">1</span></div><button class="btn" id="buyE">ارتقا</button></div>
  <div class="card"><h3>⚡ سرعت شارژ</h3><div class="mut">سطح <span id="slvl">1</span></div><button class="btn" id="buyS">ارتقا</button></div>
 </div>
 <div class="card"><h3>📈 سطح کلی</h3><div class="mut" id="tier2">—</div><div class="small">با تپ بیشتر به الماس 💎 برس!</div></div>
</div>

<div class="page" id="pg-spin">
 <div class="card" style="text-align:center">
  <h3>🎡 چرخ شانس روزانه</h3><div class="mut">هر روز یک چرخش رایگان — تا ۱۰۰۰ سکه!</div>
  <div id="wheel"></div>
  <button class="btn" id="spinBtn">بچرخون! 🎰</button>
 </div>
</div>

<div class="page" id="pg-league">
 <div class="card"><h3>🏆 لیگ هفتگی</h3><div class="mut">جایزه نفر اول: <b id="prize" style="color:var(--gold)">—</b> سکه</div>
 <div class="small">رتبه شما: <b id="myrank">—</b> | تپ این هفته: <b id="mytaps">0</b></div></div>
 <div class="card"><table id="ltab"><tbody></tbody></table></div>
</div>

<div class="page" id="pg-miss">
 <div class="card" id="m-channel"><h3>📢 عضویت در کانال</h3><div class="mut">+۱۵۰ سکه</div><button class="btn sec mb">عضویت</button><button class="btn claim">دریافت</button></div>
 <div class="card" id="m-invite"><h3>👥 دعوت یک دوست</h3><div class="mut">+۲۰۰ سکه</div><button class="btn claim">دریافت</button></div>
 <div class="card" id="m-streak"><h3>🔥 استریک ۲ روزه</h3><div class="mut">+۱۰۰ سکه — هر روز تپ کن!</div><button class="btn claim">دریافت</button></div>
</div>

<div class="page" id="pg-shop">
 <div class="card"><h3>🛒 فروشگاه سکه‌ای</h3><div class="mut">کانفیگ‌های سطح متوسط — فقط با سکه</div></div>
 <div id="shoplist"></div>
</div>

<div class="tabs">
 <button class="on" data-pg="tap"><span class="ic">💰</span>تپ</button>
 <button data-pg="up"><span class="ic">📈</span>آپگرید</button>
 <button data-pg="spin"><span class="ic">🎡</span>شانس</button>
 <button data-pg="league"><span class="ic">🏆</span>لیگ</button>
 <button data-pg="miss"><span class="ic">🎯</span>ماموریت</button>
 <button data-pg="shop"><span class="ic">🛒</span>فروشگاه</button>
</div>
<script>
const tg=window.Telegram?.WebApp;tg?.ready();tg?.expand();
const initData=tg?.initData||'';
let S=null,tapBuf=0,flushTimer=null,lastE=0,lastT=Date.now();
const $=id=>document.getElementById(id);
const api=async(p,b)=>{const r=await fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,...b})});return r.json()};
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2200)}
function paint(){if(!S)return;$('coins').textContent=S.coins.toLocaleString('fa-IR');$('tier').textContent=S.tier;$('tier2').textContent=S.tier;
 $('ecap').textContent=S.energyCap;$('elvl').textContent=S.energyLevel;$('slvl').textContent=S.speedLevel;
 $('streak').textContent=S.streak;$('buyE').textContent='ارتقا — '+S.energyCost.toLocaleString('fa-IR')+' 🪙';$('buyS').textContent='ارتقا — '+S.speedCost.toLocaleString('fa-IR')+' 🪙';
 $('spinBtn').disabled=S.spinDone;$('spinBtn').textContent=S.spinDone?'امروز چرخاندی ✅':'بچرخون! 🎰';
 $('prize').textContent=S.leaguePrize.toLocaleString('fa-IR');
 for(const[m,el]of[['channel','m-channel'],['invite','m-invite'],['streak','m-streak']]){const card=$(el);const done=S.missions.done.includes(m);
  card.querySelectorAll('.claim').forEach(b=>{b.disabled=done||!(m==='invite'?S.missions.invited:m==='streak'?S.streak>=2:true)});
  if(done)card.style.opacity=.5}
 if(!S.missions.channel)$('m-channel').style.display='none';
 const sl=$('shoplist');sl.innerHTML='';for(const it of S.shopItems){const d=document.createElement('div');d.className='item';
  d.innerHTML='<div><b>'+it.title+'</b><div class="mut">'+it.days+' روز</div></div><button class="btn" style="width:auto;margin:0;padding:8px 14px">'+(it.coin_price||0).toLocaleString('fa-IR')+' 🪙</button>';
  d.querySelector('button').onclick=async()=>{const r=await api('/api/game/buy',{productId:it.id});if(r.ok){toast('✅ خرید شد! لینک ساب در پیوی بات ارسال می‌شود');S.coins-=(it.coin_price||0);paint()}else toast('❌ '+(r.reason==='سکه کافی نیست'?'سکه کافی نیست':'خطا'))};
  sl.appendChild(d)}}
function energyTick(){if(!S)return;const nowT=Date.now();const dt=(nowT-lastT)/1000;lastT=nowT;lastE=Math.min(S.energyCap,lastE+dt*S.regen);$('energy').textContent=Math.floor(lastE);$('efill').style.width=(lastE/S.energyCap*100)+'%'}
setInterval(energyTick,500);
function flushTaps(){if(tapBuf<=0)return;const n=tapBuf;tapBuf=0;api('/api/game/tap',{taps:n}).then(r=>{if(r.ok){S.coins=r.coins;lastE=r.energy;S.streak=r.streak;paint();if(r.bonus)toast('🔥 پاداش استریک +'+r.bonus)}else if(r.reason==='no_energy'){toast('⚡ انرژی تمام شد! صبر کن')}})}
$('coin').addEventListener('pointerdown',e=>{if(!S)return;if(lastE<1){toast('⚡ انرژی کافی نیست');return}
 lastE-=1;tapBuf++;S.energy=Math.floor(lastE);
 const f=document.createElement('div');f.className='float';f.textContent='+1';f.style.left=(e.clientX-8)+'px';f.style.top=(e.clientY-20)+'px';document.body.appendChild(f);setTimeout(()=>f.remove(),900);
 clearTimeout(flushTimer);flushTimer=setTimeout(flushTaps,400);});
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
 document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));$('pg-'+b.dataset.pg).classList.add('on');
 if(b.dataset.pg==='league')loadLeague();});
$('buyE').onclick=async()=>{const r=await api('/api/game/upgrade',{type:'energy'});if(r.ok){Object.assign(S,r);paint();toast('✅ ارتقا یافت')}else toast('🪙 سکه کافی نیست')};
$('buyS').onclick=async()=>{const r=await api('/api/game/upgrade',{type:'speed'});if(r.ok){Object.assign(S,r);paint();toast('✅ ارتقا یافت')}else toast('🪙 سکه کافی نیست')};
$('spinBtn').onclick=async()=>{$('spinBtn').disabled=true;const r=await api('/api/game/spin',{});if(r.ok){const deg=1440+Math.floor(Math.random()*360);$('wheel').style.transform='rotate('+deg+'deg)';
 setTimeout(()=>{toast('🎉 '+r.prize+' سکه بردی!');S.coins=r.coins;S.spinDone=true;paint()},3500)}else toast('امروز استفاده شده ⏰')};
document.querySelectorAll('#m-channel .mb')[0]?.addEventListener('click',()=>{if(S.missions.channelUrl)open(S.missions.channelUrl,'_blank')});
document.querySelectorAll('.claim').forEach(b=>b.onclick=async e=>{const card=e.target.closest('.card');const m=card.id.replace('m-','');
 const r=await api('/api/game/mission',{mission:m});
 if(r.ok){toast('🎁 +'+r.reward+' سکه');S.coins=r.coins;S.missions.done=r.done;paint()}
 else toast(m==='channel'?'اول عضو کانال شو 📢':m==='invite'?'هنوز دوستی دعوت نکرده‌ای 👥':'استریک ۲ روزه لازم است 🔥')});
async function loadLeague(){const r=await fetch('/api/game/league',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData})}).then(x=>x.json()).catch(()=>null);
 if(!r)return;const tb=$('ltab').querySelector('tbody');tb.innerHTML='';const med=['🥇','🥈','🥉'];
 r.top.forEach((p,i)=>{const tr=document.createElement('tr');tr.innerHTML='<td>'+(med[i]||i+1)+'</td><td>'+(p.first_name||p.username||'—')+'</td><td>'+Number(p.weekly_taps).toLocaleString('fa-IR')+' تپ</td>';tb.appendChild(tr)});
 if(!r.top.length)tb.innerHTML='<tr><td colspan="3" style="text-align:center;color:var(--mut)">هنوز کسی تپ نزده — تو شروع کن! 🚀</td></tr>';
 $('myrank').textContent=r.me.rank;$('mytaps').textContent=r.me.weeklyTaps.toLocaleString('fa-IR')}
(async()=>{S=await api('/api/game/init',{});if(S.error){document.body.innerHTML='<div style="padding:40px;text-align:center">⚠️ فقط از داخل تلگرام باز کنید</div>';return}
 lastE=S.energy;paint();flushTimer=setInterval(flushTaps,3000)})();
</script></body></html>`);
}
