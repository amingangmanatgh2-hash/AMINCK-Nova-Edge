/* ═══════════════════════════════════════════════════════════════════
   Nova Edge — کلاینت داشبورد مالک (/mc/admin)
   همهٔ داده‌ها از /api/mc/admin/* می‌آید (با کوکی نشست ادمین).
   ═══════════════════════════════════════════════════════════════════ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('en-US');
const usd = (n) => '$' + Number(n || 0).toFixed(2);
const faDate = (t) => (t ? new Date(Number(t) * 1000).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

async function api(action, body = {}, method = 'POST') {
  const r = await fetch('/api/mc/admin/' + action, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch {}
  if (r.status === 401) { location.href = '/mc/admin'; return { ok: false, error: 'نشست تمام شد' }; }
  return { ok: r.ok && j.ok !== false, status: r.status, data: j };
}
function toast(msg, ok = true) {
  const t = $('#toast');
  if (!t) return alert(msg);
  const d = document.createElement('div');
  d.textContent = msg;
  d.style.borderInlineStartColor = ok ? '#22c55e' : '#ef4444';
  t.appendChild(d);
  setTimeout(() => d.remove(), 4200);
}

let STATE = null;

const RENDERERS = {
  overview, servers, players, matches, bots, shop, orders, receipts, fraud,
  gateway, card, otp, configs, brand, anticheat, reports, season, settings, apiTab,
  api: apiTab,
};

async function boot() {
  const r = await api('state', {}, 'POST');
  if (!r.ok) { $('#panels').innerHTML = `<div class="glass card"><b style="color:#fca5a5">${esc(r.data.error || 'خطا')}</b></div>`; return; }
  STATE = r.data;
  $$('#side a').forEach((a) => (a.onclick = () => select(a.dataset.tab)));
  $('#logout').onclick = async () => { await api('logout'); document.cookie = 'nova_admin=;path=/;max-age=0'; location.href = '/mc/admin'; };
  select('overview');
}

async function select(tab) {
  $$('#side a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  $$('.panel').forEach((p) => p.classList.toggle('on', p.id === 'p-' + tab));
  const el = $('#p-' + tab);
  el.innerHTML = '<div class="glass card"><div class="mut">در حال بارگذاری…</div></div>';
  try {
    await RENDERERS[tab](el);
  } catch (e) {
    el.innerHTML = `<div class="glass card"><b style="color:#fca5a5">خطا در رندر: ${esc(e.message)}</b></div>`;
  }
}

const card = (title, inner, cls = '') => `<div class="glass card ${cls}"><h3 style="margin-top:0">${title}</h3>${inner}</div>`;
const stat = (label, value, sub = '') => `<div class="stat"><b>${value}</b><span class="small mut">${label}${sub ? ' • ' + sub : ''}</span></div>`;
const table = (cols, rows) => `<div class="scroll"><table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="mut">داده‌ای نیست</td></tr>`}</tbody></table></div>`;
const kvRow = (label, input) => `<div class="kv"><label>${label}</label>${input}</div>`;

// ───────────────────────── ۱) داشبورد ─────────────────────────
async function overview(el) {
  const s = STATE, c = s.counters, st = s.status;
  el.innerHTML = `
  <div class="grid g4">${stat('آنلاین الان', st.online_now, st.servers.filter((x) => x.online).length + ' سرور')}
    ${stat('بازیکنان ثبت‌شده', num(c.players), c.banned + ' بن‌شده')}
    ${stat('شماره‌های تأییدشده', num(c.verified_phones))}
    ${stat('مچ ۲۴ ساعت', num(st.matches_24h), num(st.bots_24h) + ' بات')}</div>
  <div class="grid g4" style="margin-top:14px">${stat('درآمد پرداخت‌شده', usd(s.shop.revenue_usd), num(s.shop.paid) + ' سفارش')}
    ${stat('سفارش باز', num(c.orders_open))}${stat('فیش در صف', num(c.receipts_pending))}
    ${stat('هشدار تقلب باز', num(c.fraud_open))}</div>
  <div class="grid g2" style="margin-top:16px">
    ${card('🤖 مصرف AI بات‌ها (۷ روز)', table(['سطح', 'مچ', 'فراخوانی AI', 'بات'], s.bot_tiers_7d.map((t) => [t.tier, num(t.matches), num(t.ai_calls), num(t.bots)])))}
    ${card('🛡 آنتی‌چیت (ایزولات جاری)', `<div class="row"><span class="badge">${s.anticheat.players_tracked} بازیکن ردیابی‌شده</span><span class="badge ${s.anticheat.flagged ? 'bad' : 'ok'}">${s.anticheat.flagged} پرچم‌دار</span></div>` + table(['چک', 'تعداد'], Object.entries(s.anticheat.by_check || {}).map(([k, v]) => [k, v])))}
  </div>
  <div class="grid g2" style="margin-top:16px">
    ${card('💵 نرخ دلار', `<div class="price">${s.rate.rate ? num(s.rate.rate) + ' تومان' : 'در دسترس نیست'}</div><div class="small mut">منبع: ${esc(s.rate.source)} — اگر «در دسترس نیست» باشد خرید درگاه بسته می‌ماند (عدد جعلی نمایش داده نمی‌شود). می‌توانید نرخ دستی در تب تنظیمات وارد کنید.</div>`)}
    ${card('🛍 پرفروش‌ها', table(['نوع', 'تعداد', 'درآمد'], s.shop.by_type.map((b) => [esc(b.type), num(b.count), usd(b.usd)])) + `<div class="small mut" style="margin-top:8px">ساعات پرفروش (به وقت ایران): ${s.shop.hot_hours_local.map((h) => h.hour + ':00(' + h.orders + ')').join(' • ') || '—'}</div>`)}
  </div>
  ${card('🔔 رویدادهای اخیر', table(['زمان', 'نوع', 'متن', 'شدت'], s.alerts.map((a) => [faDate(a.created_at), esc(a.kind), esc(a.text), a.severity >= 3 ? '<span class="badge bad">بالا</span>' : a.severity === 2 ? '<span class="badge warn">متوسط</span>' : '<span class="badge">عادی</span>'])), 'mt')}
  <div class="row" style="margin-top:14px"><button class="btn ghost sm" onclick="select('overview')">🔄 به‌روزرسانی</button>
    <span class="small mut">گرانت‌های در انتظار تحویل به پلاگین: <b>${num(c.grants_pending)}</b></span></div>`;
}

// ───────────────────────── ۲) سرورها ─────────────────────────
async function servers(el) {
  const st = STATE.status;
  el.innerHTML = card('🖥 سرورهای ثبت‌شده (هارت‌بیت پلاگین)', table(
    ['سرور', 'نرم‌افزار', 'وضعیت', 'بازیکن', 'Java/Bedrock', 'TPS/MSPT', 'بات‌ها', 'مودها', 'آخرین دیده‌شدن'],
    st.servers.map((s) => [
      `<b>${esc(s.name || s.id)}</b><div class="small mut mono">${esc(s.address || '—')}:${s.port_java}/${s.port_bedrock}</div>`,
      esc(s.software) + ' ' + esc(s.version || ''),
      s.online ? '<span class="badge ok">🟢 آنلاین</span>' : '<span class="badge bad">🔴 آفلاین</span>',
      `${s.players}/${s.max}`, `${s.java_now}/${s.bedrock_now}`, `${s.tps} / ${s.mspt}`,
      `${s.bots_active} ${s.bot_tier || ''}`,
      (s.modes || []).slice(0, 5).map((m) => `<span class="chip">${esc(typeof m === 'string' ? m : m.id)}</span>`).join(''),
      faDate(s.last_seen) + (s.online ? '' : ` (${Math.round(s.stale_sec / 60)} دقیقه پیش)`),
    ])
  )) + card('تنظیمات اتصال', `<div class="kv">
    ${kvRow('آدرس نمایشی سرور', `<input id="sv_addr" value="${esc(STATE.config.address)}">`)}
    ${kvRow('پورت Java', `<input id="sv_pj" type="number" value="${STATE.config.portJava}">`)}
    ${kvRow('پورت Bedrock', `<input id="sv_pb" type="number" value="${STATE.config.portBedrock}">`)}
    ${kvRow('کراس‌پلی (Geyser)', `<label><input type="checkbox" id="sv_cross" ${STATE.config.crossplay ? 'checked' : ''} style="width:auto"> فعال</label>`)}
    ${kvRow('حالت نگهداری', `<label><input type="checkbox" id="sv_maint" ${STATE.config.maintenance ? 'checked' : ''} style="width:auto"> فعال (ورود بازیکن بسته می‌شود)</label>`)}
  </div><div class="row" style="margin-top:12px"><button class="btn pri sm" id="sv_save">💾 ذخیره</button></div>
  <script>document.getElementById('sv_save').onclick=async()=>{const r=await api('settings',{settings:{server_address:sv_addr.value,server_port_java:sv_pj.value,server_port_bedrock:sv_pb.value,crossplay:sv_cross.checked?'1':'0',maintenance:sv_maint.checked?'1':'0'}});toast(r.ok?'ذخیره شد ✅':r.data.error,r.ok)}</script>`);
}

// ───────────────────────── ۳) بازیکنان ─────────────────────────
async function players(el) {
  el.innerHTML = card('👥 بازیکنان', `<div class="row"><input id="pq" placeholder="جستجوی نام…" style="max-width:280px">
    <button class="btn pri sm" id="pgo">جستجو</button></div><div id="plist" style="margin-top:12px"></div>
    <div class="divider"></div>
    <h3>🎁 گرانت دستی</h3>
    <div class="grid g4"><input id="g_user" placeholder="نام کاربری"><select id="g_type">${['rank', 'cosmetic', 'gems', 'coins', 'battlepass', 'config', 'custom'].map((t) => `<option>${t}</option>`).join('')}</select>
    <input id="g_item" placeholder="شناسه آیتم (مثلاً god)"><input id="g_amount" placeholder="مقدار (اختیاری)" type="number"></div>
    <div class="row" style="margin-top:10px"><button class="btn gold sm" id="g_go">ارسال به صف تحویل</button><span class="small mut">در اولین اتصال بازیکن به سرور تحویل می‌شود (مقاوم در برابر قطعی نت).</span></div>`);
  const load = async () => {
    const r = await api('players', { q: $('#pq').value });
    $('#plist').innerHTML = table(['بازیکن', 'پلتفرم', 'رنک', 'ELO', 'لول', 'RP', 'سکه/جم', 'برد/باخت', 'K/D', 'وضعیت', 'عملیات'],
      (r.data.players || []).map((p) => [
        `<b>${esc(p.username)}</b><div class="small mut mono" style="font-size:11px">${esc(p.id).slice(0, 22)}</div>`,
        p.platform === 'bedrock' ? '📱' : '☕',
        esc(p.rank_bought || p.rank_id || 'free'),
        num(p.rating), num(p.level), num(p.rp),
        `${num(p.coins)} / ${num(p.gems)}`, `${p.wins}/${p.losses}`,
        p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills,
        p.banned ? `<span class="badge bad">بن: ${esc(p.ban_reason || '')}</span>` : '<span class="badge ok">سالم</span>' + (p.cheat_score > 20 ? ` <span class="badge warn">چیت ${p.cheat_score}</span>` : ''),
        `<button class="btn sm ghost" onclick='editPlayer(${JSON.stringify({ id: p.id, username: p.username, coins: p.coins, gems: p.gems, rating: p.rating, rp: p.rp, level: p.level, rank_id: p.rank_bought || p.rank_id, banned: !!p.banned, cosmetics: p.cosmetics })})'>✏️</button>`,
      ]));
  };
  $('#pgo').onclick = load;
  $('#pq').onkeydown = (e) => e.key === 'Enter' && load();
  $('#g_go').onclick = async () => {
    const payload = {};
    const amt = Number($('#g_amount').value);
    if ($('#g_type').value === 'gems' || $('#g_type').value === 'coins') payload.amount = amt;
    else payload.id = $('#g_item').value;
    const r = await api('grant', { username: $('#g_user').value, type: $('#g_type').value, item_id: $('#g_item').value, payload });
    toast(r.ok ? 'در صف تحویل ✅' : r.data.error, r.ok);
  };
  load();
}

window.editPlayer = (p) => {
  const w = window.open('', '_blank', 'width=520,height=660');
  w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>ویرایش ${esc(p.username)}</title><style>body{font-family:Tahoma;background:#05070f;color:#e8edf7;padding:18px}input,select{width:100%;padding:9px;margin:5px 0 12px;border-radius:9px;border:1px solid #333;background:#0b1020;color:#fff}button{padding:10px 16px;border-radius:10px;border:0;background:#22d3ee;font-weight:700;cursor:pointer}label{font-size:12px;color:#96a2b8}</style></head><body>
  <h3>ویرایش ${esc(p.username)}</h3>
  <label>سکه</label><input id="coins" value="${p.coins}">
  <label>جم</label><input id="gems" value="${p.gems}">
  <label>ELO</label><input id="rating" value="${p.rating}">
  <label>RP</label><input id="rp" value="${p.rp}">
  <label>لول</label><input id="level" value="${p.level}">
  <label>رنک خریداری‌شده</label><select id="rank">${['', 'noob', 'normal', 'pro', 'god', 'ultragod'].map((r) => `<option ${r === p.rank_id ? 'selected' : ''} value="${r}">${r || 'بدون تغییر'}</option>`).join('')}</select>
  <label><input type="checkbox" id="banned" ${p.banned ? 'checked' : ''}> بن</label>
  <label>دلیل بن</label><input id="reason" value="">
  <label>کازمتیک‌ها (JSON آرایه)</label><input id="cos" value='${esc(JSON.stringify(p.cosmetics || []))}'>
  <button onclick="save()">💾 ذخیره</button><div id="m" style="margin-top:10px;font-size:12px"></div>
  <script>async function save(){const r=await fetch('/api/mc/admin/player_update',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({id:${JSON.stringify(p.id)},coins:+coins.value,gems:+gems.value,rating:+rating.value,rp:+rp.value,level:+level.value,rank_id:rank.value,banned:banned.checked,ban_reason:reason.value,cosmetics:JSON.parse(cos.value||'[]')})});const j=await r.json();m.textContent=j.ok?'ذخیره شد ✅':(j.error||'خطا');if(j.ok)setTimeout(()=>window.close(),900)}<\/script></body></html>`);
};

// ───────────────────────── ۴) مچ‌ها ─────────────────────────
async function matches(el) {
  const r = await api('matches', { limit: 40 });
  el.innerHTML = card('🎮 آخرین مچ‌ها', table(
    ['مود', 'نقشه', 'پایان', 'مدت', 'انسان/بات', 'سطح بات', 'فراخوانی AI', 'لاتنسی AI', 'برنده', 'بازیکنان'],
    (r.data.matches || []).map((m) => [
      esc(m.mode), esc(m.map || '—'), faDate(m.ended_at), Math.round(m.duration_sec / 60) + ' دقیقه',
      `${m.humans}/${m.bots}`, `${m.tier_start || '—'}→${m.tier_end || '—'}`, num(m.ai_calls), m.ai_latency_ms ? Math.round(m.ai_latency_ms) + 'ms' : '—',
      m.winner_team >= 0 ? 'تیم ' + m.winner_team : '—',
      `<details><summary>${(m.players || []).length}</summary><div class="small mono">${(m.players || []).map((p) => `${p.is_bot ? '🤖' : '👤'} ${p.points}pt ${p.elo_delta >= 0 ? '+' : ''}${p.elo_delta}${p.mvp ? ' ⭐' : ''}${p.won ? ' 🏆' : ''}`).join('<br>')}</div></details>`,
    ])
  ));
}

// ───────────────────────── ۵) بات‌ها و AI ─────────────────────────
async function bots(el) {
  const r = await api('bots');
  const b = r.data;
  el.innerHTML = `
  ${card('🤖 سطوح هوش بات (مشخصات)', table(['سطح', 'نام', 'مهارت', 'مدل', 'واکنش(ms)', 'خطای نشانه', 'اشتباه', 'تصمیم/ثانیه', 'کیفیت بیلد', 'فریب'],
    b.tiers.map((t) => [`<b>${t.id}</b>`, esc(t.name_fa), t.skill, `<span class="mono small">${esc(t.model || '—')}</span>`, `${t.reaction_ms.min}–${t.reaction_ms.max}`, `${t.aim_error_deg.min}–${t.aim_error_deg.max}°`, t.mistake_rate, t.decision_hz, t.bridge_quality + ' / ' + t.build_skill, t.deception])))}
  ${card('⚙️ تنظیمات بات', `<div class="kv">
    ${kvRow('LLM ابری', `<label><input type="checkbox" id="b_llm" ${b.settings.bot_llm_enabled ? 'checked' : ''} style="width:auto"> فعال (اگر خاموش شود همهٔ بات‌ها محلی کار می‌کنند)</label>`)}
    ${kvRow('آفست سطح', `<input id="b_off" type="number" value="${b.settings.bot_tier_offset}" min="-2" max="2">`)}
    ${kvRow('سقف سطح', `<select id="b_max">${['T0', 'T1', 'T2', 'T3', 'T4'].map((t) => `<option ${t === b.settings.bot_max_tier ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
    ${kvRow('سطح اجباری (تست)', `<select id="b_force"><option value="">خودکار</option>${['T0', 'T1', 'T2', 'T3', 'T4'].map((t) => `<option ${t === b.settings.bot_force_tier ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
    ${kvRow('مدل دلخواه', `<input id="b_model" value="${esc(b.settings.bot_model_override)}" placeholder="@cf/meta/llama-3.3-70b-instruct-fp8-fast">`)}
    ${kvRow('نمایش نام بات‌ها', `<label><input type="checkbox" id="b_names" ${b.settings.bot_names_visible ? 'checked' : ''} style="width:auto"> بازیکنان بفهمند بات است</label>`)}
  </div><div class="row" style="margin-top:12px"><button class="btn pri sm" id="b_save">💾 ذخیره</button>
    <span class="small mut">مصرف ۷ روز: ${num(b.usage_7d?.ai)} فراخوانی در ${num(b.usage_7d?.c)} مچ • میانگین لاتنسی ${Math.round(b.usage_7d?.l || 0)}ms</span></div>`)}
  ${card('🧪 شبیه‌ساز سطح هوش + تصمیم', `<div class="grid g3">
    <div><label>مود</label><select id="s_mode">${b.modes.map((m) => `<option value="${m.id}">${esc(m.name_fa)}</option>`).join('')}</select></div>
    <div><label>تعداد بات برای پرکردن</label><input id="s_fill" type="number" value="3"></div>
    <div><label>بازیکنان واقعی (JSON)</label><textarea id="s_players" rows="4">[{"id":"h1","rating":1900,"level":60,"rank_id":"pro","games":400,"is_bot":false},{"id":"h2","rating":1200,"level":20,"rank_id":"noob","games":80,"is_bot":false}]</textarea></div>
  </div><div class="row" style="margin-top:10px"><button class="btn gold sm" id="s_run">▶ اجرای شبیه‌سازی</button></div><div id="s_out" style="margin-top:12px"></div>`)}
  ${card('📈 قانون ترفیع تدریجی', `<div class="small mut">شروع یک پله پایین‌تر، سپس پله‌ها بر اساس درصد پیشرفت مچ. اگر انسان‌ها له شده باشند ترفیع متوقف می‌شود (rubber-band) و اگر مسلط باشند زودتر ترفیع می‌گیرد.</div>` + table(['درصد مچ', 'افزایش سطح'], b.escalation.ramp_steps.map((s) => [s.at_pct_of_duration + '%', '+' + s.delta])) + `<div class="small mut" style="margin-top:8px">سقف هزینه: ${b.cost_guard.max_llm_calls_per_match} فراخوانی در هر مچ، ${b.cost_guard.max_llm_calls_per_bot_per_match} برای هر بات. کش وضعیت تکراری: ${b.cost_guard.cache_identical_states ? 'فعال' : 'خاموش'}.</div>`)}`;
  $('#b_save').onclick = async () => {
    const r2 = await api('settings', { settings: { bot_llm_enabled: $('#b_llm').checked ? '1' : '0', bot_tier_offset: $('#b_off').value, bot_max_tier: $('#b_max').value, bot_force_tier: $('#b_force').value, bot_model_override: $('#b_model').value, bot_names_visible: $('#b_names').checked ? '1' : '0' } });
    toast(r2.ok ? 'ذخیره شد ✅' : r2.data.error, r2.ok);
  };
  $('#s_run').onclick = async () => {
    let players = [];
    try { players = JSON.parse($('#s_players').value); } catch { return toast('JSON بازیکنان نامعتبر', false); }
    $('#s_out').innerHTML = '<div class="mut">در حال محاسبه…</div>';
    const r2 = await api('bot_simulate', { mode: $('#s_mode').value, players, fill_slots: Number($('#s_fill').value) });
    if (!r2.ok) return ($('#s_out').innerHTML = `<span style="color:#fca5a5">${esc(r2.data.error || 'خطا')}</span>`);
    const t = r2.data.tier, d = r2.data.decision;
    $('#s_out').innerHTML = `<div class="grid g2">
      <div><div class="row"><span class="badge">سطح مچ: <b>${t.match_tier}</b></span><span class="badge">شروع: ${t.start_tier}</span><span class="badge">مدل: ${esc(t.model || 'محلی')}</span><span class="badge">مهارت انسان‌ها: ${t.skill_human}</span></div>
      <div class="small mut" style="margin-top:8px">${(t.reasons || []).map((x) => '• ' + esc(x)).join('<br>')}</div>
      <div class="small mut" style="margin-top:8px">بودجهٔ AI: ${d.budget?.allowed ?? '—'} فراخوانی مجاز • فاصله: ${d.budget?.interval_sec ?? '—'} ثانیه</div></div>
      <div><div class="badge ${d.decision?.source === 'llm' ? 'ok' : 'warn'}">منبع تصمیم: ${esc(d.source)}</div>
      <div style="margin-top:8px"><b>${esc(d.decision?.action)}</b> → هدف: ${esc(d.decision?.target || '—')}</div>
      <div class="small mut">چرا: ${esc(d.decision?.why || '—')} • تأخیر واکنش: ${d.decision?.reaction_ms}ms • خطای نشانه: ${d.decision?.aim_error_deg}° • اشتباه: ${d.decision?.fumble ? d.decision.fumble_kind : 'خیر'}</div>
      ${d.decision?.alternatives ? `<div class="small mut" style="margin-top:6px">جایگزین‌ها: ${d.decision.alternatives.map((a) => esc(a.action) + '(' + a.score + ')').join('، ')}</div>` : ''}
      ${d.parse_error ? `<div class="small" style="color:#fcd34d">پاسخ مدل پارس نشد (${esc(d.parse_error)}) → بازگشت به مغز محلی</div>` : ''}
      <details style="margin-top:8px"><summary class="small mut">پارامترهای انسانی‌شدهٔ بات‌ها</summary><pre class="code">${esc(JSON.stringify(t.bots, null, 1))}</pre></details></div>
    </div>`;
  };
}

// ───────────────────────── ۶) فروشگاه ─────────────────────────
async function shop(el) {
  const r = await api('catalog');
  const c = r.data;
  el.innerHTML = card('🛍 کاتالوگ و قیمت‌گذاری هوشمند', `<div class="row">
    <span class="badge">${num(c.count)} آیتم</span><span class="badge">سقف تخفیف: ${c.max_discount}٪</span>
    <span class="badge ${c.ai ? 'ok' : ''}">پیشنهاد AI: ${c.ai ? 'فعال' : 'خاموش'}</span>
    <span class="badge">نرخ دلار: ${c.rate?.rate ? num(c.rate.rate) : '—'}</span>
    ${c.season ? `<span class="badge warn">${esc(c.season.name)} — ${c.season.promo_pct}٪</span>` : ''}
  </div>` + table(['آیتم', 'نوع', 'قیمت فهرست', 'تخفیف', 'قیمت نهایی', 'تومان', 'فروش ۷/۳۰ روز', 'دلیل'],
    c.items.map((i) => [esc(i.title_fa), esc(i.type), usd(i.list_usd), (i.pct || 0) + '%', `<b>${usd(i.price_usd)}</b>`, num(i.price_toman), `${num(i.p7)}/${num(i.p30)}`,
      `<details><summary class="small">دیدن</summary><div class="small mut">${(i.reasons || []).map(esc).join('<br>') || '—'}</div></details>`]))) + `
  ${card('⚙️ تنظیمات قیمت‌گذاری', `<div class="kv">
    ${kvRow('پیشنهاد AI', `<label><input type="checkbox" id="c_ai" ${STATE.runtime ? '' : ''}> فعال (کد همیشه در سقف clamp می‌کند)</label>`)}
    ${kvRow('فاصلهٔ باز محاسبهٔ AI (دقیقه)', `<input id="c_int" type="number" value="60">`)}
    ${kvRow('سقف تخفیف (٪)', `<input id="c_max" type="number" value="${c.max_discount}" max="30">`)}
    ${kvRow('قیمت‌گذاری روی کانفیگ‌ها', `<label><input type="checkbox" id="c_conf" checked style="width:auto"> تخفیف بگیرند</label>`)}
  </div><div class="row" style="margin-top:10px"><button class="btn pri sm" id="c_save">💾 ذخیره</button></div>`)}
  <script>document.getElementById('c_save').onclick=async()=>{const r=await api('settings',{settings:{price_ai_enabled:document.getElementById('c_ai').checked?'1':'0',price_ai_interval_min:document.getElementById('c_int').value,price_max_discount:document.getElementById('c_max').value,price_configs:document.getElementById('c_conf').checked?'1':'0'}});toast(r.ok?'ذخیره شد ✅':r.data.error,r.ok)}</script>`;
  const cur = (await api('settings_current')).data?.settings || {};
  $('#c_ai').checked = cur.price_ai_enabled === '1';
  $('#c_int').value = cur.price_ai_interval_min || '60';
  $('#c_conf').checked = (cur.price_configs ?? '1') === '1';
}

// ───────────────────────── ۷) سفارش‌ها ─────────────────────────
async function orders(el) {
  el.innerHTML = card('🧾 سفارش‌ها', `<div class="tabs" id="of">${['', 'pending', 'manual', 'paid', 'rejected'].map((s) => `<button class="tab ${s === '' ? 'on' : ''}" data-s="${s}">${s || 'همه'}</button>`).join('')}</div><div id="olist"></div>`);
  const load = async (s = '') => {
    const r = await api('orders', { status: s });
    $('#olist').innerHTML = table(['رفرنس', 'آیتم', 'مبلغ', 'تخفیف', 'روش', 'وضعیت', 'خریدار', 'زمان', 'عملیات'],
      (r.data.orders || []).map((o) => [
        `<span class="mono small">${esc(o.ref)}</span>`, esc(o.item_title), `${usd(o.amount_usd)} / ${num(o.amount_toman)}T`, o.discount_pct + '%',
        esc(o.method), `<span class="badge ${o.status === 'paid' ? 'ok' : o.status === 'rejected' ? 'bad' : 'warn'}">${esc(o.status)}</span>`,
        esc(o.username || '—'), faDate(o.created_at),
        o.status === 'paid' ? '—' : `<button class="btn sm ghost" onclick="orderAct(${o.id},'paid')">✅ پرداخت‌شده</button> <button class="btn sm ghost" onclick="orderAct(${o.id},'rejected')">❌</button>`,
      ]));
  };
  $$('#of .tab').forEach((b) => (b.onclick = () => { $$('#of .tab').forEach((x) => x.classList.remove('on')); b.classList.add('on'); load(b.dataset.s); }));
  window.orderAct = async (id, status) => { const r = await api('order_update', { id, status }); toast(r.ok ? 'انجام شد ✅' : r.data.error, r.ok); load($('#of .tab.on')?.dataset.s || ''); };
  load();
}

// ───────────────────────── ۸) فیش‌ها ─────────────────────────
async function receipts(el) {
  el.innerHTML = card('💳 صف فیش‌های کارت‌به‌کارت', `<div id="rlist"></div>
    <div class="small mut" style="margin-top:10px">🤖 هر فیش با Workers AI بررسی می‌شود: مبلغ، تاریخ، کد پیگیری، شمارهٔ کارت مقصد و اثر دستکاری. موارد مشکوک (فیش تکراری/دستکاری‌شده/مبلغ نامعتبر) خودکار رد و به شما گزارش می‌شوند — هیچ فیشی بی‌بررسی تأیید نمی‌شود مگر «تأیید خودکار» را روشن کرده باشید.</div>`);
  const load = async () => {
    const r = await api('receipts');
    const d = r.data;
    const rows = (q, title) => q.length ? `<h3>${title} (${q.length})</h3>` + table(['سفارش', 'مبلغ', 'حکم AI', 'دلیل‌ها', 'تکراری', 'زمان', 'عملیات'],
      q.map((x) => [`<span class="mono small">${esc(x.order_ref || x.order_id)}</span>`, num(x.amount_toman) + 'T',
        `<span class="badge ${x.ai_verdict === 'auto' ? 'ok' : x.ai_verdict === 'reject' ? 'bad' : 'warn'}">${esc(x.ai_verdict)}</span>`,
        `<details><summary class="small">دیدن</summary><div class="small mut">${(JSON.parse(x.ai_reasons || '[]') || []).map(esc).join('<br>') || '—'}</div></details>`,
        x.reused ? '<span class="badge bad">بله</span>' : '—', faDate(x.created_at),
        x.status === 'pending' ? `<button class="btn sm pri" onclick="recAct(${x.id},'approve')">✅ تأیید</button> <button class="btn sm ghost" onclick="recAct(${x.id},'reject')">❌ رد</button> <button class="btn sm ghost" onclick="recInfo(${x.id})">🔎 جزئیات</button>` : esc(x.status)])
    ).replace(/<tbody>/, '<tbody>') : '';
    $('#rlist').innerHTML = rows(d.receipts || [], '⏳ در انتظار بررسی') + rows(d.all || [], '✅ تأییدشده') + rows(d.rejected || [], '❌ ردشده') || '<div class="mut">فیشی نیست</div>';
  };
  window.recAct = async (id, decision) => { const r = await api('receipt_decide', { id, decision }); toast(r.ok ? 'ثبت شد ✅' : r.data.error, r.ok); load(); };
  window.recInfo = async (id) => { const r = await api('receipt_image', { id }); alert(JSON.stringify(r.data, null, 1)); };
  load();
}

// ───────────────────────── ۹) تقلب ─────────────────────────
async function fraud(el) {
  const r = await api('fraud');
  el.innerHTML = card('🚨 صف تقلب و هشدارها', table(['زمان', 'نوع', 'شدت', 'موضوع', 'جزئیات', 'وضعیت', 'عملیات'],
    (r.data.items || []).map((f) => [faDate(f.created_at), esc(f.kind),
      `<span class="badge ${f.severity >= 3 ? 'bad' : f.severity === 2 ? 'warn' : ''}">${f.severity}</span>`,
      esc(f.subject), `<details><summary class="small">دیدن</summary><pre class="code">${esc(JSON.stringify(f.detail, null, 1))}</pre></details>`,
      `<span class="badge ${f.status === 'open' ? 'warn' : 'ok'}">${esc(f.status)}</span>`,
      f.status === 'open' ? `<button class="btn sm ghost" onclick="fAct(${f.id},'resolve')">بررسی شد</button> <button class="btn sm ghost" onclick="fAct(${f.id},'dismiss')">رد</button>` : '—'])));
  window.fAct = async (id, status) => { await api('fraud_resolve', { id, status }); toast('ثبت شد'); select('fraud'); };
}

// ───────────────────────── ۱۰) درگاه ─────────────────────────
async function gateway(el) {
  el.innerHTML = card('🏦 درگاه پرداخت', `<div class="kv">
    ${kvRow('فعال', `<label><input type="checkbox" id="g_en" style="width:auto"> فعال</label>`)}
    ${kvRow('پرووایدر', `<select id="g_p"><option value="zarinpal">زرین‌پال (v4)</option><option value="idpay">IDPay (v1.1)</option><option value="custom">قالب دلخواه JSON</option></select>`)}
    ${kvRow('مرچنت آیدی / لینک درگاه', `<input id="g_m" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">`)}
    ${kvRow('API Key (IDPay)', `<input id="g_k" type="password" placeholder="خالی = تغییر نکند">`)}
    ${kvRow('آدرس API (اختیاری)', `<input id="g_u" placeholder="https://api.zarinpal.com/pg/v4/payment/request.json">`)}
    ${kvRow('واحد', `<select id="g_c"><option value="IRT">ریال</option><option value="ITP">تومان</option></select>`)}
  </div>
  <div class="row" style="margin-top:12px"><button class="btn pri sm" id="g_save">💾 ذخیره</button><button class="btn ghost sm" id="g_test">🧪 تست اتصال</button></div>
  <div id="g_out" class="small mut" style="margin-top:12px"></div>
  <div class="divider"></div>
  <div class="small mut">پرداخت فقط با وریفای سرور‌به‌سرور ثبت می‌شود؛ بازگشت مرورگر به‌تنهایی اعتبار ندارد. مسیر بازگشت با HMAC امضا می‌شود.</div>`);
  const r = await api('gateway_test');
  const g = r.data?.gateway || {};
  $('#g_en').checked = !!g.enabled;
  $('#g_p').value = g.provider || 'zarinpal';
  $('#g_m').value = g.merchantId || '';
  $('#g_u').value = g.url || '';
  $('#g_c').value = g.currency || 'IRT';
  if (r.data?.probe) $('#g_out').innerHTML = `<pre class="code">${esc(JSON.stringify(r.data.probe, null, 1))}</pre>`;
  $('#g_save').onclick = async () => {
    const s = { gateway_enabled: $('#g_en').checked ? '1' : '0', gateway_provider: $('#g_p').value, gateway_merchant_id: $('#g_m').value, gateway_url: $('#g_u').value, gateway_currency: $('#g_c').value };
    if ($('#g_k').value) s.gateway_api_key = $('#g_k').value;
    const r2 = await api('settings', { settings: s });
    toast(r2.ok ? 'ذخیره شد ✅' : r2.data.error, r2.ok);
  };
  $('#g_test').onclick = async () => { const r2 = await api('gateway_test'); $('#g_out').innerHTML = `<pre class="code">${esc(JSON.stringify(r2.data, null, 1))}</pre>`; };
}

// ───────────────────────── ۱۱) کارت‌به‌کارت ─────────────────────────
async function card(el) {
  const r = await api('gateway_test');
  const c = r.data?.card || {};
  el.innerHTML = card('🏧 کارت‌به‌کارت', `<div class="kv">
    ${kvRow('فعال', `<label><input type="checkbox" id="k_en" ${c.enabled ? 'checked' : ''} style="width:auto"> فعال</label>`)}
    ${kvRow('شمارهٔ کارت (۱۶ رقم)', `<input id="k_n" class="mono" value="${esc(r.data?.card_full?.number || '')}" placeholder="خالی = نمایش داده نمی‌شود">`)}
    ${kvRow('به نام', `<input id="k_h" value="">`)}
    ${kvRow('بانک', `<input id="k_b" value="">`)}
    ${kvRow('تأیید خودکار فیش معتبر', `<label><input type="checkbox" id="k_a" style="width:auto"> (توصیه نمی‌شود؛ پیش‌فرض: همه به صف شما می‌آیند)</label>`)}
  </div><div class="row" style="margin-top:12px"><button class="btn pri sm" id="k_save">💾 ذخیره</button></div>
  <div class="small mut" style="margin-top:10px">مقدار فعلی (ماسک‌شده): <span class="mono">${esc(c.number || '—')}</span> ${esc(c.holder || '')}</div>`);
  $('#k_save').onclick = async () => {
    const s = { card_enabled: $('#k_en').checked ? '1' : '0', card_holder: $('#k_h').value, card_bank: $('#k_b').value, card_auto_verify: $('#k_a').checked ? '1' : '0' };
    const n = $('#k_n').value.replace(/\D/g, '');
    if (n.length === 16) s.card_number = n;
    const r2 = await api('settings', { settings: s });
    toast(r2.ok ? 'ذخیره شد ✅' : r2.data.error, r2.ok);
  };
}

// ───────────────────────── ۱۲) احراز هویت ─────────────────────────
async function otp(el) {
  const r = await api('otp_state');
  const c = r.data.config;
  el.innerHTML = card('📲 احراز هویت با شمارهٔ موبایل', `<div class="kv">
    ${kvRow('روش ارسال کد', `<select id="o_p"><option value="dev" ${c.provider === 'dev' ? 'selected' : ''}>حالت تست (کد در پاسخ)</option><option value="sms" ${c.provider === 'sms' ? 'selected' : ''}>سرویس پیامکی REST</option><option value="telegram" ${c.provider === 'telegram' ? 'selected' : ''}>ربات تلگرام</option></select>`)}
    ${kvRow('آدرس API پیامک', `<input id="o_url" value="${esc(c.sms.url)}">`)}
    ${kvRow('کلید/توکن', `<input id="o_key" type="password" placeholder="خالی = تغییر نکند">`)}
    ${kvRow('بدنهٔ درخواست', `<textarea id="o_body" rows="3">${esc(c.sms.body)}</textarea>`)}
    ${kvRow('متد', `<select id="o_m"><option>POST</option><option>GET</option></select>`)}
    ${kvRow('مسیر موفقیت در پاسخ', `<input id="o_sp" value="return.status" placeholder="مثلاً data.code">`)}
    ${kvRow('چت تلگرام برای کد/هشدار', `<input id="o_tg" value="${esc(c.tg.chatId)}">`)}
    ${kvRow('اعتبار کد (ثانیه)', `<input id="o_ttl" type="number" value="${c.ttl}">`)}
    ${kvRow('حداکثر تلاش', `<input id="o_att" type="number" value="${c.maxAttempts}">`)}
    ${kvRow('حداکثر ارسال در ساعت (هر شماره)', `<input id="o_rl" type="number" value="${c.rateLimitHour}">`)}
    ${kvRow('حداکثر حساب از یک IP در ۲۴ ساعت', `<input id="o_ip" type="number" value="${c.fraud.ipMaxAccounts}">`)}
    ${kvRow('حداکثر ارسال از یک IP در ساعت', `<input id="o_vel" type="number" value="${c.fraud.velocityHour}">`)}
    ${kvRow('پیشوند شمارهٔ مشکوک (regex)', `<input id="o_rx" value="${esc(c.fraud.phoneRegex || '')}" placeholder="^09(0[0-9]{8}|9[0-9]{8})$">`)}
    ${kvRow('نمایش کد در حالت تست', `<label><input type="checkbox" id="o_dev" ${c.devShow ? 'checked' : ''} style="width:auto"> (فقط وقتی provider=dev)</label>`)}
  </div><div class="row" style="margin-top:12px"><button class="btn pri sm" id="o_save">💾 ذخیره</button>
    <span class="badge ${r.data.fraud_open ? 'bad' : 'ok'}">${r.data.fraud_open} هشدار تقلب باز</span></div>`) +
    card('🕘 آخرین درخواست‌های کد', table(['شماره (ماسک)', 'روش', 'تأییدشده', 'ارسال‌ها', 'تلاش‌ها', 'زمان'],
      (r.data.recent || []).map((x) => [esc(x.phone_masked), esc(x.provider), x.verified ? '<span class="badge ok">بله</span>' : '<span class="badge">نه</span>', x.sends, x.attempts, faDate(x.created_at)])));
  $('#o_save').onclick = async () => {
    const s = { otp_provider: $('#o_p').value, otp_sms_api_url: $('#o_url').value, otp_sms_body: $('#o_body').value, otp_sms_method: $('#o_m').value, otp_sms_success_path: $('#o_sp').value, otp_tg_chat_id: $('#o_tg').value, otp_ttl_sec: $('#o_ttl').value, otp_max_attempts: $('#o_att').value, otp_rate_limit_hour: $('#o_rl').value, fraud_ip_max_accounts: $('#o_ip').value, fraud_velocity_hour: $('#o_vel').value, fraud_phone_regex: $('#o_rx').value, otp_dev_show: $('#o_dev').checked ? '1' : '0' };
    if ($('#o_key').value) s.otp_sms_api_key = $('#o_key').value;
    const r2 = await api('settings', { settings: s });
    toast(r2.ok ? 'ذخیره شد ✅' : r2.data.error, r2.ok);
  };
}

// ───────────────────────── ۱۳) کانفیگ‌ها ─────────────────────────
async function configs(el) {
  const r = await api('configs');
  el.innerHTML = card('🛰 کانفیگ‌های اتصال (رایگان + ویژه)', `<div class="grid g2">
    <div><label>افزودن کانفیگ (تکی یا چندتا، هر خط یکی)</label>
      <textarea id="cf_txt" rows="5" placeholder="vless://uuid@host:443?security=reality&...#Iran-Free-1"></textarea>
      <div class="row"><select id="cf_tier"><option value="free">رایگان</option><option value="special">ویژه (پولی)</option></select>
      <input id="cf_country" placeholder="کشور 🇩🇪" style="max-width:130px"><label style="margin:0"><input type="checkbox" id="cf_unl" checked style="width:auto"> نامحدود</label></div>
      <div class="row" style="margin-top:10px"><button class="btn pri sm" id="cf_add">➕ افزودن</button>
      <button class="btn ghost sm" id="cf_check">🩺 بررسی سلامت</button></div></div>
    <div><label>ایمپورت از آدرس اشتراک</label><input id="cf_url" placeholder="https://example.com/sub.txt">
      <div class="row" style="margin-top:10px"><button class="btn ghost sm" id="cf_imp">⬇️ ایمپورت</button></div>
      <div class="small mut" style="margin-top:12px">⚠️ صادقانه: ورکر کلادفلر دسترسی TCP خام ندارد، بنابراین «پینگ واقعی» از اینجا ممکن نیست. سیگنال اصلی سلامت، بازخورد ✔/✖ خود کاربران از داخل ایران است (کانفیگی که ۵ بازخورد بگیرد و کمتر از ۳۰٪ مثبت باشد، خودکار از لیست سالم خارج می‌شود).</div></div>
  </div><div id="cf_msg" class="small" style="margin-top:10px"></div>`) +
    card('لیست کانفیگ‌ها', table(['نام', 'پروتکل', 'لایه', 'کشور', 'نامحدود', 'فعال', 'سالم', 'بازخورد', 'آخرین بررسی', 'عملیات'],
      (r.data.configs || []).map((c) => [esc(c.name), esc(c.protocol), c.tier === 'free' ? 'رایگان' : 'ویژه', esc(c.country || '—'),
        c.unlimited ? '♾' : '—', c.active ? '✅' : '⛔', c.healthy ? '🟢' : '🔴',
        c.feedback.score === null ? '—' : c.feedback.score + '% (' + c.feedback.up + '/' + (c.feedback.up + c.feedback.down) + ')',
        c.last_check ? faDate(c.last_check) : '—',
        `<button class="btn sm ghost" onclick="cfToggle(${c.id},${c.active ? 0 : 1})">${c.active ? 'غیرفعال' : 'فعال'}</button>
         <button class="btn sm ghost" onclick="cfDel(${c.id})">🗑</button>`])));
  $('#cf_add').onclick = async () => { const r2 = await api('config_add', { text: $('#cf_txt').value, tier: $('#cf_tier').value, country: $('#cf_country').value, unlimited: $('#cf_unl').checked }); $('#cf_msg').innerHTML = r2.ok ? `<span style="color:#86efac">${r2.data.added_count} کانفیگ اضافه شد</span> ${r2.data.rejected?.length ? '<span style="color:#fcd34d"> / ردشد: ' + r2.data.rejected.map((x) => esc(x.error)).join('، ') + '</span>' : ''}` : `<span style="color:#fca5a5">${esc(r2.data.error || 'خطا')}</span>`; select('configs'); };
  $('#cf_imp').onclick = async () => { const r2 = await api('config_import', { url: $('#cf_url').value, tier: $('#cf_tier').value }); $('#cf_msg').innerHTML = r2.ok ? `<span style="color:#86efac">${r2.data.added_count} کانفیگ ایمپورت شد</span>` : `<span style="color:#fca5a5">${esc(r2.data.error || 'خطا')}</span>`; select('configs'); };
  $('#cf_check').onclick = async () => { const r2 = await api('config_check'); $('#cf_msg').innerHTML = `<pre class="code">${esc(JSON.stringify(r2.data.results, null, 1))}</pre>`; };
  window.cfToggle = async (id, active) => { await api('config_toggle', { id, active }); select('configs'); };
  window.cfDel = async (id) => { if (!confirm('حذف شود؟')) return; await api('config_delete', { id }); select('configs'); };
}

// ───────────────────────── ۱۴) برندینگ ─────────────────────────
async function brand(el) {
  const r = await api('brand');
  const i = r.data.info;
  el.innerHTML = card('🎨 برند سرور (ساخته‌شده با Workers AI از روی اسمی که گذاشتید)', `
    <div class="grid g3">
      ${['logo', 'banner', 'splash'].map((k) => `<div><img src="/mc/brand/${k}.png?t=${Date.now()}" style="width:100%;border-radius:14px;border:1px solid var(--line)" onerror="this.style.opacity=.2">
        <div class="small mut" style="margin-top:6px">${k} ${i.assets.find((a) => a.key === k) ? '• ' + num(i.assets.find((a) => a.key === k).bytes) + ' بایت • ' + esc(i.assets.find((a) => a.key === k).model) + (i.assets.find((a) => a.key === k).manual ? ' • دستی' : '') : '• ساخته نشده'}</div></div>`).join('')}
    </div>
    <div class="divider"></div>
    <div class="kv">
      ${kvRow('اسم سرور', `<input id="br_name" value="${esc(i.server_name)}">`)}
      ${kvRow('سبک بصری', `<input id="br_style" value="${esc(STATE.config.brandStyle || 'cartoon pixel-art minecraft, vibrant, epic')}">`)}
      ${kvRow('پرامپت اختصاصی', `<textarea id="br_prompt" rows="2">${esc(STATE.config.brandPrompt || '')}</textarea>`)}
    </div>
    <div class="row" style="margin-top:12px"><button class="btn gold sm" id="br_gen">🎨 ساخت دوباره با AI</button>
      <label class="btn ghost sm" style="cursor:pointer">⬆️ آپلود لوگو<input type="file" id="br_file" accept="image/*" style="display:none"></label>
      <a class="btn ghost sm" href="/mc/setup">صفحهٔ راه‌اندازی</a></div>
    <div class="divider"></div>
    <h3>تم استخراج‌شده از اسم</h3><pre class="code">${esc(JSON.stringify(i.theme, null, 1))}</pre>
    <div class="small mut">اگر Workers AI در دسترس نباشد، برند جایگزین SVG (از هش اسم) فعال می‌ماند تا سایت هیچ‌وقت بی‌لوگو نباشد.</div>
    <div id="br_msg" class="small" style="margin-top:10px"></div>`);
  $('#br_gen').onclick = async () => {
    $('#br_msg').textContent = 'در حال ساخت… ۲۰ تا ۶۰ ثانیه ⏳';
    const r2 = await api('brand_generate', { name: $('#br_name').value, style: $('#br_style').value, prompt: $('#br_prompt').value });
    $('#br_msg').innerHTML = r2.ok ? `<span style="color:#86efac">ساخته شد ✅ ${(r2.data.saved || []).map((s) => s.key + ' (' + num(s.bytes) + 'B)').join('، ')}</span>` : `<span style="color:#fcd34d">${esc(r2.data.error || 'ناموفق')}</span>`;
    setTimeout(() => select('brand'), 1200);
  };
  $('#br_file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(f); });
    const r2 = await api('brand_upload', { key: 'logo', data_b64: b64, mime: f.type || 'image/png' });
    toast(r2.ok ? 'آپلود شد ✅' : r2.data.error, r2.ok);
    select('brand');
  };
}

// ───────────────────────── ۱۵) آنتی‌چیت ─────────────────────────
async function anticheat(el) {
  const r = await api('anticheat');
  el.innerHTML = card('🛡 آنتی‌چیت', `<div class="kv">
    ${kvRow('آستانهٔ هشدار', `<input id="a1" type="number" value="${r.data.settings.warn_at}">`)}
    ${kvRow('آستانهٔ کیک', `<input id="a2" type="number" value="${r.data.settings.kick_at}">`)}
    ${kvRow('آستانهٔ بن موقت', `<input id="a3" type="number" value="${r.data.settings.tempban_at}">`)}
    ${kvRow('آستانهٔ بن دائم', `<input id="a4" type="number" value="${r.data.settings.ban_at}">`)}
    ${kvRow('بن خودکار', `<label><input type="checkbox" id="a5" ${r.data.settings.auto_ban ? 'checked' : ''} style="width:auto"> فعال</label>`)}
  </div><div class="row" style="margin-top:10px"><button class="btn pri sm" id="a_save">💾 ذخیره</button>
  <span class="small mut">چک‌های فعال: reach, killaura, autoclicker, fly, speed, nofall, timer, scaffold, xray, fastbow, blink, impossible • جبران پینگ فعال</span></div>`) +
    card('بازیکنان پرچم‌دار', table(['بازیکن', 'امتیاز چیت', 'گزارش‌ها', 'بن', 'دلیل', 'آخرین اتصال', 'عملیات'],
      (r.data.players || []).map((p) => [esc(p.username), p.cheat_score, p.reported, p.banned ? '<span class="badge bad">بله</span>' : '—', esc(p.ban_reason || ''), faDate(p.last_seen),
        `<button class="btn sm ghost" onclick="banP('${esc(p.id)}',${p.banned ? 0 : 1})">${p.banned ? 'رفع بن' : 'بن'}</button>`])));
  $('#a_save').onclick = async () => { const r2 = await api('settings', { settings: { ac_warn_at: $('#a1').value, ac_kick_at: $('#a2').value, ac_tempban_at: $('#a3').value, ac_ban_at: $('#a4').value, ac_auto_ban: $('#a5').checked ? '1' : '0' } }); toast(r2.ok ? 'ذخیره شد ✅' : r2.data.error, r2.ok); };
  window.banP = async (id, banned) => { const r2 = await api('player_update', { id, banned: !!banned, ban_reason: banned ? 'admin_manual' : '' }); toast(r2.ok ? 'انجام شد' : r2.data.error, r2.ok); select('anticheat'); };
}

// ───────────────────────── ۱۶) گزارش‌ها ─────────────────────────
async function reports(el) {
  const r = await api('reports');
  el.innerHTML = card('🚩 گزارش‌های تخلف بازیکنان', table(['زمان', 'گزارش‌دهنده', 'هدف', 'دلیل', 'مود', 'مدرک', 'وضعیت', 'عملیات'],
    (r.data.reports || []).map((x) => [faDate(x.created_at), esc(x.reporter || '—'), `<b>${esc(x.target)}</b>`, esc(x.reason), esc(x.mode || '—'),
      `<details><summary class="small">دیدن</summary><div class="small mut">${esc(x.evidence)}</div></details>`,
      `<span class="badge ${x.status === 'open' ? 'warn' : 'ok'}">${esc(x.status)}</span>`,
      x.status === 'open' ? `<button class="btn sm pri" onclick="repAct(${x.id},'actioned','${esc(x.target)}','${esc(x.reporter || '')}',1)">✅ معتبر + بن</button>
        <button class="btn sm ghost" onclick="repAct(${x.id},'actioned','','${esc(x.reporter || '')}',0)">معتبر (بدون بن)</button>
        <button class="btn sm ghost" onclick="repAct(${x.id},'reject','','',0)">رد</button>` : esc(x.admin_note || '—')])));
  window.repAct = async (id, status, banTarget, reporter, ban) => {
    const r2 = await api('report_resolve', { id, status, ban_target: ban ? banTarget : '', ban_until: ban ? Math.floor(Date.now() / 1000) + 7 * 86400 : 0, reward_reporter: status === 'actioned' ? 100 : 0, reporter });
    toast(r2.ok ? 'ثبت شد ✅' : r2.data.error, r2.ok);
    select('reports');
  };
}

// ───────────────────────── ۱۷) ایونت فصلی ─────────────────────────
async function season(el) {
  const r = await api('season');
  const s = r.data.settings;
  el.innerHTML = card('🎉 ایونت فصلی و باندل تخفیفی', `<div class="kv">
    ${kvRow('فعال', `<label><input type="checkbox" id="se_en" ${s.season_active === '1' ? 'checked' : ''} style="width:auto"> فصل جاری فعال</label>`)}
    ${kvRow('نام فصل', `<input id="se_name" value="${esc(s.season_name)}" placeholder="فصل ۱ — نبرد خدایان">`)}
    ${kvRow('شناسهٔ فصل', `<input id="se_id" value="${esc(s.season_id)}">`)}
    ${kvRow('پایان (مهر زمانی unix یا خالی)', `<input id="se_end" value="${esc(s.season_ends)}" placeholder="${Math.floor(Date.now() / 1000) + 90 * 86400}">`)}
    ${kvRow('تخفیف فصلی (٪، سقف ۳۰)', `<input id="se_pct" type="number" value="${esc(s.season_promo_pct)}" max="30">`)}
    ${kvRow('آیتم‌های مشمول (خالی = همه)', `<input id="se_items" value="${esc(s.season_promo_items)}" placeholder="rank_god,bundle_god_pack">`)}
  </div><div class="row" style="margin-top:12px"><button class="btn pri sm" id="se_save">💾 ذخیره</button></div>
  <div class="divider"></div>
  <div class="small mut">شناسهٔ آیتم‌های موجود: ${(r.data.items || []).slice(0, 40).map((i) => `<span class="chip mono">${esc(i)}</span>`).join('')}</div>
  ${r.data.season ? `<div class="badge warn" style="margin-top:10px">فصل فعال: ${esc(r.data.season.name)} — ${r.data.season.promo_pct}٪</div>` : '<div class="small mut" style="margin-top:10px">فصل فعالی نیست.</div>'}`);
  $('#se_save').onclick = async () => {
    const r2 = await api('settings', { settings: { season_active: $('#se_en').checked ? '1' : '0', season_name: $('#se_name').value, season_id: $('#se_id').value, season_ends: $('#se_end').value, season_promo_pct: $('#se_pct').value, season_promo_items: $('#se_items').value } });
    toast(r2.ok ? 'ذخیره شد ✅' : r2.data.error, r2.ok);
  };
}

// ───────────────────────── ۱۸) تنظیمات ─────────────────────────
async function settings(el) {
  const cfg = STATE.config;
  el.innerHTML = card('⚙️ تنظیمات عمومی', `<div class="kv">
    ${kvRow('اسم سرور', `<input id="t_name" value="${esc(cfg.name)}">`)}
    ${kvRow('تگ‌لاین', `<input id="t_tag" value="${esc(cfg.tagline)}">`)}
    ${kvRow('آدرس/دامنه', `<input id="t_addr" value="${esc(cfg.address)}">`)}
    ${kvRow('پورت Java', `<input id="t_pj" type="number" value="${cfg.portJava}">`)}
    ${kvRow('پورت Bedrock', `<input id="t_pb" type="number" value="${cfg.portBedrock}">`)}
    ${kvRow('لینک دیسکورد', `<input id="t_dc" value="${esc(cfg.discord)}">`)}
    ${kvRow('لینک تلگرام', `<input id="t_tg" value="${esc(cfg.telegram)}">`)}
    ${kvRow('نرخ دلار دستی (تومان)', `<input id="t_rate" type="number" placeholder="0 = نرخ زندهٔ صرافی‌ها">`)}
    ${kvRow('حالت نت ایران', `<label><input type="checkbox" id="t_iran" ${cfg.iranMode ? 'checked' : ''} style="width:auto"> راهنما و کشتی‌شکن‌ها فعال</label>`)}
  </div>
  <div class="divider"></div><h3>کلیدهای فعال/غیرفعال</h3>
  <div class="row">${[['shop_enabled', 'فروشگاه'], ['configs_enabled', 'بخش کانفیگ'], ['leaderboard_enabled', 'لیدربرد'], ['reports_enabled', 'گزارش تخلف'], ['referral_enabled', 'رفرال']].map(([k, l]) => `<label class="badge" style="cursor:pointer"><input type="checkbox" class="tgl" data-k="${k}" checked style="width:auto"> ${l}</label>`).join('')}</div>
  <div class="row" style="margin-top:14px"><button class="btn pri sm" id="t_save">💾 ذخیرهٔ همه</button>
    <button class="btn ghost sm" id="t_export">⬇️ خروجی JSON (پشتیبان)</button></div>
  <div id="t_msg" class="small mut" style="margin-top:10px"></div>`);
  const r = await api('settings_current');
  const cur = r.data?.settings || {};
  $('#t_rate').value = cur.usd_rate_manual || '';
  $('#t_dc').value = cur.discord_url || '';
  $('#t_tg').value = cur.telegram_url || '';
  $$('.tgl').forEach((c) => { c.checked = (cur[c.dataset.k] ?? '1') === '1'; });
  $('#t_save').onclick = async () => {
    const s = { server_name: $('#t_name').value, server_tagline: $('#t_tag').value, server_address: $('#t_addr').value, server_port_java: $('#t_pj').value, server_port_bedrock: $('#t_pb').value, discord_url: $('#t_dc').value, telegram_url: $('#t_tg').value, usd_rate_manual: $('#t_rate').value, iran_mode: $('#t_iran').checked ? '1' : '0' };
    $$('.tgl').forEach((c) => (s[c.dataset.k] = c.checked ? '1' : '0'));
    const r2 = await api('settings', { settings: s });
    $('#t_msg').innerHTML = r2.ok ? `<span style="color:#86efac">${r2.data.saved} تنظیم ذخیره شد ✅</span>` : `<span style="color:#fca5a5">${esc(r2.data.error || 'خطا')}</span>`;
    if (r2.ok) { const rs = await api('state'); STATE = rs.data; }
  };
  $('#t_export').onclick = () => { window.open('/api/mc/admin/export', '_blank'); };
}

// ───────────────────────── ۱۹) API ─────────────────────────
async function apiTab(el) {
  const st = STATE;
  const origin = location.origin;
  el.innerHTML = card('🔌 API و کلیدها', `<h3>کلید پل (Bridge Key)</h3>
  <div class="row"><code class="mono" id="bk" style="font-size:13px;word-break:break-all">در حال بارگذاری…</code><button class="btn sm ghost" id="bk_copy">کپی</button><button class="btn sm ghost" id="bk_rot">چرخش</button></div>
  <div class="divider"></div>
  <h3>مسیرهای عمومی</h3>
  <pre class="code">GET  ${origin}/api/mc/status            → وضعیت سرورها (JSON، برای مانیتورینگ)
GET  ${origin}/api/mc/spec              → اسپک کامل مودها/رنک‌ها/سطوح بات
GET  ${origin}/api/mc/leaderboard       → لیدربرد (rating|wins|kills|rp|mode)
GET  ${origin}/api/mc/modes             → لیست گیم‌مودها
GET  ${origin}/api/mc/configs           → کانفیگ‌های رایگان (بدون URI)
GET  ${origin}/mc/configs/sub.txt       → اشتراک (ساب) برای v2rayNG
GET  ${origin}/mc/brand/logo.png        → لوگوی ساخته‌شده با AI
GET  ${origin}/health                   → سلامت ورکر</pre>
  <h3>مسیرهای پلاگین (نیازمند کلید + امضا)</h3>
  <pre class="code">POST ${origin}/api/mc/v1/heartbeat       → وضعیت سرور + گرفتن تنظیمات زنده
POST ${origin}/api/mc/v1/player/sync     → همگام‌سازی پروفایل + گرفتن گرانت‌ها
POST ${origin}/api/mc/v1/match/report    → گزارش مچ (ELO/سکه/XP/RP/رنک خودکار)
POST ${origin}/api/mc/v1/bot/tier        → گرفتن سطح هوش بات‌ها برای مچ
POST ${origin}/api/mc/v1/bot/escalate    → ترفیع سطح در طول مچ
POST ${origin}/api/mc/v1/bot/decide      → تصمیم استراتژیک از مدل ابری
POST ${origin}/api/mc/v1/anticheat       → گزارش تخطی و گرفتن حکم
POST ${origin}/api/mc/v1/report          → گزارش تخلف بازیکن

هدرها:  X-Nova-Key: &lt;bridge key&gt;
        X-Nova-Ts:  &lt;unix seconds&gt;
        X-Nova-Sig: HMAC_SHA256(key, ts + ":" + sha256(body))</pre>
  <h3>نمونهٔ curl</h3>
  <pre class="code">BODY='{"server_id":"main","players_now":12,"tps":19.8}'
TS=$(date +%s)
SHA=$(printf '%s' "$BODY" | sha256sum | cut -d' ' -f1)
SIG=$(printf '%s:%s' "$TS" "$SHA" | openssl dgst -sha256 -hmac "$KEY" | cut -d' ' -f2)
curl -X POST ${origin}/api/mc/v1/heartbeat \\
  -H "Content-Type: application/json" -H "X-Nova-Key: $KEY" \\
  -H "X-Nova-Ts: $TS" -H "X-Nova-Sig: $SIG" -d "$BODY"</pre>
  <div class="divider"></div>
  <h3>🩺 تست زندهٔ API</h3>
  <div class="row"><button class="btn sm ghost" id="t_status">/api/mc/status</button>
    <button class="btn sm ghost" id="t_spec">/api/mc/spec</button>
    <button class="btn sm ghost" id="t_lb">/api/mc/leaderboard</button></div>
  <pre class="code" id="t_out" style="max-height:260px">—</pre>`);
  const key = (await api('bridge_key')).data?.key || '';
  $('#bk').textContent = key;
  $('#bk_copy').onclick = () => { navigator.clipboard.writeText(key); toast('کپی شد'); };
  $('#bk_rot').onclick = async () => { if (!confirm('کلید عوض شود؟ پلاگین‌ها باید به‌روز شوند.')) return; await fetch('/api/mc/setup/rotate-key', { method: 'POST', body: '{}' }); select('apiTab'); };
  const probe = async (u) => { const r = await fetch(u); $('#t_out').textContent = `${u} → ${r.status}\n` + JSON.stringify(await r.json(), null, 1).slice(0, 3000); };
  $('#t_status').onclick = () => probe('/api/mc/status');
  $('#t_spec').onclick = () => probe('/api/mc/spec');
  $('#t_lb').onclick = () => probe('/api/mc/leaderboard');
}

boot();
setInterval(() => { if ($('#p-overview').classList.contains('on')) api('state').then((r) => { if (r.ok) { STATE = r.data; overview($('#p-overview')); } }); }, 45000);
