import type { Bot, Context } from './bot';
import type { Parsed } from './commands';
import { DAY, GAMES, LOCKS, PRESETS, VERSION, isOwner } from './config';
import { groupPanel, helpText } from './panels';
import { botLinks } from './connection';
import type { GroupSettings } from './types';
import { calculate, fa, html, integer, normalize, onOff, randomInt } from './utils';

const FUN: Record<string, string[]> = {
  joke: [
    'من به شانسم اعتماد دارم؛ فقط اون هنوز به من اعتماد نداره 🎲😂',
    'مدیر گفت گروه ساکت باشه، حتی نوتیفیکیشن هم پاپوش پوشید 🤫',
    'اومدم پنج دقیقه گوشی ببینم؛ گوشی گفت منظورت پنج فصل بود؟ 📱',
    'تاس من همیشه با اعتمادبه‌نفس میاد پایین؛ امتیازش مهم نیست 😎',
    'سخت‌ترین ورزش دنیا؟ بستن تلگرام بعد از «فقط یه پیام دیگه» 😂',
    'بات بودن سخته؛ همه پینگ می‌گیرن، هیچ‌کس نمی‌پرسه حالت چطوره 🤖💚',
    'گفتم امروز کارهامو تموم کنم؛ تقویم زد زیر خنده 📅',
    'از تنبلی انصراف دادم. البته از فردا. شاید. 😌',
    'گروه شما انرژی‌ش از شارژر من بیشتره 🔋✨',
    'اگه خوابم برد، با «پنل» بیدارم کن 😴➡️⚙️',
  ],
  fact: [
    '🐙 اختاپوس سه قلب دارد.',
    '🌞 نور خورشید حدود ۸ دقیقه و ۲۰ ثانیه در راه است تا به زمین برسد.',
    '🍯 عسل در شرایط نگهداری مناسب ماندگاری بسیار طولانی دارد.',
    '🦋 پروانه‌ها با گیرنده‌های روی پاهایشان مزه را تشخیص می‌دهند.',
    '🪐 یک روز چرخشی زهره از یک سال مداری آن طولانی‌تر است.',
    '🌊 بخش بزرگی از کف اقیانوس‌ها هنوز با وضوح بالا نقشه‌برداری نشده است.',
    '🧠 مغز انسان حدود ۲۰٪ انرژی بدن را مصرف می‌کند.',
    '📚 مطالعهٔ گروهی تمرکز را بالا می‌برد – مخصوصاً با قوانین مرتب!',
  ],
  truth: [
    'آخرین چیزی که واقعاً خندوندت چی بود؟ 😄',
    'اگه فقط یک آهنگ می‌تونستی تا آخر هفته گوش بدی، چی بود؟ 🎧',
    'کدوم عادت کوچیکت رو دوست داری تغییر بدی؟ 🌱',
    'بهترین خاطره‌ات از یک گروه دوستانه چیه؟ ✨',
    'اگه یک مهارت رو فوری یاد می‌گرفتی، چی انتخاب می‌کردی؟ 🎨',
    'بدون گفتن اطلاعات خصوصی، عجیب‌ترین خواب بامزه‌ات چی بوده؟ 🌙',
    'اگه گروه یه ابرقدرت داشت، چی بود؟ 💫',
  ],
  dare: [
    'با سه ایموجی حالت رو توضیح بده؛ بقیه حدس بزنن 🎭',
    'یه تعریف واقعی و محترمانه از یکی از دوستات بکن 🌷',
    'اسم یک فیلم رو فقط با ایموجی بنویس 🎬',
    'یه جمله بامزه بساز که با «امروز تاس من» شروع بشه 🎲',
    'به مدت یک دور، فقط با شعرِ خودت جواب بده؛ اگر دوست داشتی ✍️',
    'یک نقاشی خیلی ساده بکش و در صورت تمایل بفرست 🎨',
    'یه فونت خفن با «فونت اسم‌ت» بساز و بفرست ✨',
  ],
};

const toggleSettings: Record<string, keyof GroupSettings> = { antiflood: 'antiflood', captcha: 'captcha', raid: 'raid', quiet: 'quiet', gamezone: 'games', chatbot: 'chatbot', reports: 'reports' };
const numericSettings: Record<string, [keyof GroupSettings, number, number]> = {
  floodlimit: ['floodLimit',3,30], warnlimit: ['warnLimit',1,10], mutetime: ['muteMinutes',1,43200],
  cooldown: ['cooldown',0,300], captchatime: ['captchaSeconds',30,600], timezone: ['timezone',-720,840], maxbet: ['maxBet',1,1000000],
};

function fancyFonts(input: string): string[] {
  const text = input.slice(0, 200);
  if (!text) throw new Error('متن را بعد از «فونت» بنویسید. مثال: فونت نوا گارد');
  const boldMap: Record<string,string> = {};
  const italicMap: Record<string,string> = {};
  const monoMap: Record<string,string> = {};
  const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bold = '𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇';
  const italic = '𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡𝘢𝘣𝘤𝘥𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘶𝘷𝘄𝘹𝘆𝘻';
  const mono = '𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣';
  for (let i=0;i<latin.length;i++){ boldMap[latin[i]]=bold[i]; italicMap[latin[i]]=italic[i]; monoMap[latin[i]]=mono[i]; }
  const toMapped = (map: Record<string,string>) => text.split('').map(ch => map[ch] || ch).join('');
  const persianDecor = [
    `✦ ${text} ✦`,
    `『 ${text} 』`,
    `➳ ${text} ➳`,
    `꧁ ${text} ꧂`,
    `•— ${text} —•`,
    `★彡 ${text} 彡★`,
    `『✨』 ${text} 『✨』`,
  ];
  return [
    `𝗕𝗼𝗹𝗱: ${toMapped(boldMap)}`,
    `𝘐𝘵𝘢𝘭𝘪𝘤: ${toMapped(italicMap)}`,
    `𝙼𝚘𝚗𝚘: ${toMapped(monoMap)}`,
    ...persianDecor.map((s,i) => `استایل ${fa(i+1)}: ${s}`),
  ];
}

function genUUID(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; const v = c=='x'?r:(r&0x3|0x8); return v.toString(16); }); }
function genRealityKeys(){ const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; const rand = (n:number)=>Array.from({length:n},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); return {privateKey: rand(43), publicKey: rand(43), shortId: Array.from({length:8},()=>Math.floor(Math.random()*16).toString(16)).join('')}; }
function genVLESS(server="example.com", opts: {sni?:string; flow?:string} = {}){ const uuid=genUUID(); const keys=genRealityKeys(); const sni=opts.sni||server; const flow=opts.flow||'xtls-rprx-vision'; return `vless://${uuid}@${server}:443?encryption=none&flow=${flow}&security=reality&sni=${sni}&fp=chrome&pbk=${keys.publicKey}&sid=${keys.shortId}&type=tcp&headerType=none#DemGram-VLESS-REALITY-${Math.floor(Math.random()*999)}`; }
function genVMess(server="example.com"){ const uuid=genUUID(); const j={v:"2",ps:`DemGram-VMess-REALITY-${Math.floor(Math.random()*999)}`,add:server,port:"443",id:uuid,aid:"0",net:"tcp",type:"none",host:"",path:"",tls:"tls",sni:server,alpn:""}; return `vmess://${btoa(JSON.stringify(j))}`; }
function genSS(server="example.com"){ const pwd=Array.from({length:16},()=>Math.random().toString(36)[2]||'x').join(''); const method=['aes-256-gcm','chacha20-ietf-poly1305','aes-128-gcm'][Math.floor(Math.random()*3)]; const raw=`${method}:${pwd}@${server}:8388`; return `ss://${btoa(raw)}#DemGram-SS-${method}-${Math.floor(Math.random()*999)}`; }
function genTrojan(server="example.com"){ const sni=server; return `trojan://${genUUID()}@${server}:443?security=tls&sni=${sni}&fp=chrome&type=tcp#DemGram-Trojan-REALITY-${Math.floor(Math.random()*999)}`; }
function genProxy(){ const ip=`${Math.floor(Math.random()*200)+20}.${Math.floor(Math.random()*200)+20}.${Math.floor(Math.random()*200)+20}.${Math.floor(Math.random()*200)+20}`; const port=[443,80,8080,8443,2053,2083][Math.floor(Math.random()*6)]; const secret="ee"+Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join(''); return `https://t.me/proxy?server=${ip}&port=${port}&secret=${secret}`; }
function detectPlatform(url:string){ const u=url.toLowerCase(); if(u.includes('youtube.com')||u.includes('youtu.be')) return {name:'YouTube', emoji:'▶️', qualities:['144p','360p','720p','1080p','4K','MP3 128k','MP3 320k']}; if(u.includes('instagram.com')) return {name:'Instagram', emoji:'📸', qualities:['Original','HD','Story','Reel']}; if(u.includes('tiktok.com')) return {name:'TikTok', emoji:'🎵', qualities:['No Watermark HD','HD','SD','MP3']}; if(u.includes('twitter.com')||u.includes('x.com')) return {name:'Twitter/X', emoji:'🐦', qualities:['Original','HD']}; if(u.includes('soundcloud.com')) return {name:'SoundCloud', emoji:'🎧', qualities:['MP3 128k','MP3 320k','FLAC']}; if(u.includes('facebook.com')||u.includes('fb.watch')) return {name:'Facebook', emoji:'📘', qualities:['HD','SD']}; return {name:'Direct', emoji:'📥', qualities:['Original']}; }
function genClashYaml(configs:string[]){ return `mixed-port: 7890\nallow-lan: true\nmode: rule\nlog-level: info\nproxies:\n${configs.map((c,i)=>`  - {name: DemGram-${i+1}, type: vless, server: example.com, port: 443, uuid: ${genUUID()}, tls: true}`).join('\n')}\nproxy-groups:\n  - {name: 🚀 DemGram, type: select, proxies: [${configs.map((_,i)=>`DemGram-${i+1}`).join(', ')}]}\nrules:\n  - MATCH,🚀 DemGram`; }
function genSingBox(configs:string[]){ return JSON.stringify({outbounds: configs.map((c,i)=>({tag:`DemGram-${i+1}`, type:'vless', server:'example.com', server_port:443, uuid:genUUID(), flow:'xtls-rprx-vision', tls:{enabled:true, server_name:'example.com', reality:{enabled:true, public_key:'xxxx', short_id:'xxxx'}}}))}, null, 2); }

export async function executeCommand(bot: Bot, c: Context, parsed: Parsed) {
  const { name } = parsed.command, args = parsed.args;
  const db = bot.db, api = bot.api;
  const replyText = c.m.reply_to_message?.text || c.m.reply_to_message?.caption || '';

  if (toggleSettings[name] || numericSettings[name] || ['welcome','goodbye','setrules','warnaction','style','night','joinmode','commandmode'].includes(name)) {
    await bot.requireAdmin(c, 'can_change_info');
    const patch: Record<string, unknown> = {};
    if (toggleSettings[name]) patch[toggleSettings[name]] = onOff(args);
    else if (numericSettings[name]) { const [key, min, max] = numericSettings[name]; patch[key] = integer(args, min, max); }
    else if (['welcome','goodbye','setrules'].includes(name)) {
      const value = args || replyText;
      if (!value) throw new Error('متن را بعد از دستور بنویسید یا روی آن ریپلای کنید. برای خاموش‌کردن off بفرستید.');
      patch[name === 'setrules' ? 'rules' : name] = ['off','خاموش'].includes(value) ? '' : value;
    } else if (name === 'night') {
      if (['off','خاموش'].includes(args)) patch.nightEnabled = false;
      else { const [start,end,...rest] = args.split(' '); if (!end || rest.length) throw new Error('نمونه: شب ۰ ۷ یا شب خاموش'); patch.nightStart = integer(start,0,23); patch.nightEnd = integer(end,0,23); patch.nightEnabled = true; }
    } else if (name === 'commandmode') {
      if (!['slash','all','اسلش','همه'].includes(args)) throw new Error('گزینه: slash یا all');
      patch.commandsOnlySlash = ['slash','اسلش'].includes(args);
    } else patch[name === 'warnaction' ? 'warnAction' : name === 'joinmode' ? 'joinMode' : 'style'] = args;
    db.patchGroup(c.chat, patch, c.user.id); await bot.say(c, '✅ تنظیم گروه ذخیره شد.'); return;
  }
  if (FUN[name]) { const list = FUN[name]; await bot.say(c, list[randomInt(list.length)]); return; }

  switch (name) {
    case 'start': {
      if (args === 'self') { await bot.issuePair(c, 'self'); return; }
      const me = await api.me();
      if (['setup','panel'].includes(args)) {
        if (!c.private && await bot.admin(c)) {
          const panel = groupPanel(c.settings);
          await bot.say(c,'✅ گروه در پنل وب ثبت شد.\n\n'+panel.text,panel.keyboard);
        } else {
          const links = botLinks(me);
          await bot.say(c,`✅ پیام شما به نُوا رسید؛ اتصال بات برقرار است.\nحالا به پنل وب برگردید یا از لینک زیر گروه را انتخاب کنید.\n\nدستور مطمئن در گروه: <code>${html(links.panelCommand)}</code>\nندادن Ban Users مانع بازشدن پنل نیست.`,links.addGroupUrl ? {inline_keyboard:[[{text:'➕ انتخاب گروه و افزودن بات',url:links.addGroupUrl}]]} : undefined);
        }
        return;
      }
      await bot.say(c, `<b>✦ نُوا گارد ${VERSION}</b>\nمدیریت محکم، دورهمی گرم ✨\n\n🛡 قفل و ضداسپم · ⚔️ دوئل ایموجی · 🏆 لیدربرد\n💎 الماس کمیاب · 👤 سلف جدا · 📱 اپ DemGram جدا\n📥 دانلودر · 🔐 کانفیگ ساز خفن VLESS/VMess/SS\n\n«راهنما» برای دستورها، «پنل» برای مدیریت گروه.\nبرای مثال <code>دوئل 🎲 ۵۰</code> یا <code>/duel 🎲 50</code>\n\n⚡ اپ جدا، بات جدا، سلف جدا ولی یه ورکر — اپ از بات دانلود میشه، سلف از بات فعال میشه\n\nسکه و الماس کاملاً مجازی و غیرنقدی‌اند.`, me.username ? { inline_keyboard: [[{ text: '➕ افزودن به گروه', url: `https://t.me/${me.username}?startgroup=setup` }],[{ text: '📥 دانلود اپ DemGram', url: '/demgram/' }]] } : undefined); break;
    }
    case 'help': {
      const role = isOwner(c.user.id) ? 'owner' : !c.private && await bot.admin(c) ? 'admin' : 'member';
      await bot.say(c, helpText(role, args || undefined)); break;
    }
    case 'ping': await bot.say(c, `🟢 آنلاینم! نُوا گارد ${VERSION}\nبات جدا، اپ جدا، سلف جدا ولی یه ورکر\nپیام شما دریافت و پردازش شد.`); break;
    case 'id': await bot.say(c, `🪪 شما: <code>${c.user.id}</code>\nگفت‌وگو: <code>${c.chat}</code>${c.m.reply_to_message ? `\nکاربر ریپلای: <code>${c.m.reply_to_message.from?.id || 'ناشناس'}</code>\nپیام: <code>${c.m.reply_to_message.message_id}</code>` : ''}`); break;
    case 'info': {
      if (c.private) { await bot.say(c, `✦ نُوا گارد ${VERSION}\nاین فرمان در گروه، وضعیت همان گروه را نشان می‌دهد.`); break; }
      const count = await api.call<number>('getChatMemberCount', { chat_id: c.chat });
      await bot.say(c, `<b>${html(c.m.chat.title || 'گروه')}</b>\n👥 ${fa(count)} عضو\n🔒 ${fa(c.settings.locks.length)} قفل\n🎮 بازی: ${c.settings.games ? 'روشن' : 'خاموش'}\n⚠️ حد اخطار: ${fa(c.settings.warnLimit)}\n🪪 <code>${c.chat}</code>\n\n⚡ اپ جدا، بات جدا، سلف جدا — یه ورکر`); break;
    }
    case 'rules': if (c.private) throw new Error('قوانین را در گروه درخواست کنید.'); else await bot.say(c, `📜 <b>قوانین گروه</b>\n${html(c.settings.rules || 'هنوز قانونی ثبت نشده.')}`); break;
    case 'report': {
      if (c.private || !c.m.reply_to_message) throw new Error('در گروه روی پیام موردنظر ریپلای کنید.');
      if (!c.settings.reports) throw new Error('گزارش اعضا در این گروه خاموش است.');
      if (!db.rate(`report:${c.chat}:${c.user.id}`, 1, 10 * 60000)) throw new Error('هر ۱۰ دقیقه یک گزارش مجاز است.');
      const admins = await api.call<{user:{id:number;first_name:string;is_bot?:boolean}}[]>('getChatAdministrators', { chat_id: c.chat });
      await bot.say(c, `🚩 گزارش برای بررسی مدیران\nگزارش‌دهنده: ${bot.name(c.user.id)}\n${admins.filter(a => !a.user.is_bot).slice(0,5).map(a => `<a href="tg://user?id=${a.user.id}">${html(a.user.first_name)}</a>`).join(' · ')}`, undefined);
      db.log(c.user.id, c.chat, 'message.report', String(c.m.reply_to_message.message_id)); break;
    }
    case 'profile': case 'balance': {
      let id: number;
      if (c.m.reply_to_message?.from?.id) id = c.m.reply_to_message.from.id;
      else if (args) {
        try { id = integer(args,1,Number.MAX_SAFE_INTEGER); } catch { throw new Error('شناسهٔ کاربر نامعتبر است. روی پیامش ریپلای کنید یا شناسهٔ عددی بفرستید.'); }
      } else id = c.user.id;
      const u = db.requireUser(id);
      await bot.say(c, `<b>${bot.name(id)}</b> ${isOwner(id) ? '👑 مالک سراسری' : ''}\n🪙 سکه: ${fa(u.coins)}\n💎 الماس: ${isOwner(id) ? '∞ نامحدود' : fa(u.diamonds)}${name === 'profile' ? `\n⭐️ سطح ${fa(Math.floor(Math.sqrt(u.xp / 100)) + 1)} · ${fa(u.xp)} XP\n🏆 ${fa(u.wins)} برد · ${fa(u.losses)} باخت` : ''}\nسکه و الماس ارزش نقدی ندارند.`); break;
    }
    case 'daily': { const coins = db.daily(c.user.id); await bot.say(c, `🎁 ${fa(coins)} سکه گرفتی! جایزهٔ بعدی ۲۴ ساعت دیگر.\nالماس فقط جایزهٔ کمیاب دوئل است، نه جایزهٔ روزانه.`); break; }
    case 'leaderboard': case 'rank': {
      if (c.private) throw new Error('این رتبه‌بندی مخصوص همان گروه است؛ در گروه امتحان کن.');
      const metric = args === 'xp' || args === 'فعالیت' ? 'xp' : 'wins';
      if (name === 'rank') {
        const row = db.one<{rank:number}>(`SELECT rank FROM (SELECT user_id, ROW_NUMBER() OVER (ORDER BY wins DESC,xp DESC,user_id ASC) rank FROM members WHERE chat_id=?) WHERE user_id=?`, c.chat, c.user.id);
        await bot.say(c, `🏆 رتبهٔ شما در گروه: ${row ? fa(row.rank) : 'هنوز ثبت نشده'}`);
      } else {
        const rows = db.all<{user_id:number;name:string;wins:number;xp:number}>(`SELECT m.*,u.name FROM members m JOIN users u ON u.id=m.user_id WHERE chat_id=? ORDER BY ${metric} DESC,${metric === 'wins' ? 'm.xp' : 'm.wins'} DESC,m.user_id ASC LIMIT 10`, c.chat);
        await bot.say(c, `<b>🏆 برترین‌های ${html(c.m.chat.title || 'گروه')}</b>\nبر اساس ${metric === 'wins' ? 'برد' : 'فعالیت و امتیاز'}\n\n${rows.map((r,i) => `${['🥇','🥈','🥉'][i] || fa(i+1)+'.'} ${html(r.name)} · ${fa(r[metric])}`).join('\n') || 'هنوز بازی‌ای ثبت نشده.'}\n\n<code>leaderboard xp</code> برای امتیاز فعالیت.`);
      } break;
    }
    case 'games': await bot.say(c, `<b>⚔️ آرکید ایموجی</b>\n${GAMES.map(g => `${g.emoji} ${g.name}`).join(' · ')}\n\n۱. <code>دوئل 🎲 ۵۰</code>\n۲. حریف دکمهٔ قبول را می‌زند؛ سکهٔ هر دو رزرو می‌شود.\n۳. هر دو روی همان پیام بات، ایموجی بازی را ارسال می‌کنند.\n۴. امتیاز بیشتر برنده؛ مساوی یعنی بازگشت شرط.\n\n🎰 اسلات: ۷۷۷ = ۱۰۰، سه نماد یکسان = ۳۰، دو نماد یکسان = ۱۰، بقیه = صفر.\n💎 فقط برد واقعی با شرط حداقل ۵۰: شانس ۱ در ${fa(db.global().diamondOdds)} برای ۱ الماس؛ سقف یک الماس در هر ۲۴ ساعت و فقط اولین بازی با هر حریف در آن بازه. بدون خرید یا برداشت پول.\n⚠️ اگر فقط یک نفر پرتاب کند، پس از اتمام مهلت برنده است.`); break;
    case 'duel': await bot.startDuel(c,args); break;
    case 'cancelduel': { const d = db.activeDuel(c.user.id); if (!d) throw new Error('دوئل بازی برای لغو نداری.'); const result = db.cancelDuel(d.id,c.user.id); await bot.updateDuel(result); await bot.say(c,'↩️ لغو شد و سکه برگشت.'); break; }
    case 'play': { const game = GAMES.find(g => g.emoji === args || g.name === args) || (!args ? GAMES[0] : undefined); if (!game) throw new Error('یکی از شش ایموجی بازی را انتخاب کن.'); const m = await api.call<import('./types').Message>('sendDice',{chat_id:c.chat,emoji:game.emoji}); if (!c.private) db.track(m); break; }
    case 'choose': { const choices = args.split('|').map(v=>v.trim()).filter(Boolean); if (choices.length < 2 || choices.length > 20 || args.length > 1000) throw new Error('بین ۲ تا ۲۰ گزینه با | جدا کن.'); await bot.say(c, `🎯 انتخاب من: ${html(choices[randomInt(choices.length)])}`); break; }
    case 'font': {
      const input = args || replyText;
      const fonts = fancyFonts(input);
      await bot.say(c, `<b>🔤 فونت‌ساز نُوا</b>\nمتن: <code>${html(input.slice(0,100))}</code>\n\n${fonts.map(f => html(f)).join('\n')}\n\nبرای کپی، روی متن بزنید.`);
      break;
    }
    case 'calc': await bot.say(c, `🧮 <code>${html(args)}</code> = <b>${calculate(args)}</b>`); break;
    case 'time': await bot.say(c, `🕰 تهران: ${new Date().toLocaleString('fa-IR',{timeZone:'Asia/Tehran'})}\nUTC: ${new Date().toISOString().replace('T',' ').slice(0,19)}`); break;
    case 'download': {
      const me = await api.me();
      if (!args) throw new Error('لینک بفرست: download https://youtube.com/... یا https://instagram.com/... — ساپورت یوتیوب/اینستا/تیک‌تاک/توییتر/ساندکلاد/فیسبوک — کیفیت: --mp3 --720p --4k --nowm');
      const platform = detectPlatform(args);
      const qualities = platform.qualities.map(q=>`• ${q}`).join('\n');
      const isMp3 = args.includes('--mp3') || args.includes('mp3');
      const isHd = args.includes('1080') || args.includes('720') || args.includes('4k');
      await bot.say(c, `📥 <b>دانلودر خفن DemGram — اپ جدا</b>\n\n${platform.emoji} پلتفرم: <b>${platform.name}</b>\n🔗 لینک: <code>${html(args.slice(0,200))}</code>\n\n📊 کیفیت‌های موجود:\n${qualities}\n\n${isMp3 ? '🎧 حالت MP3 فعال — صدا استخراج میشه' : isHd ? '🎬 حالت HD فعال' : '⚡ حالت خودکار — بهترین کیفیت'}\n\nبرای دانلود سریع:\n• اپ DemGram بخش دانلودر: /demgram/ → تب دانلودر → کیفیت انتخاب کن\n• سلف: <code>.dl ${html(args.slice(0,80))}</code>\n• API: <code>/api/download?url=${encodeURIComponent(args.slice(0,100))}</code>\n\n✨ پشتیبانی خفن: یوتیوب (MP3/MP4/Playlist)، اینستا (پست/استوری/ریلز/IGTV)، تیک‌تاک بدون واترمارک + MP3، توییتر/X، ساندکلاد، فیسبوک، تلگرام فایل بزرگ\n• قابلیت: دانلود پلی‌لیست، استخراج صدا، بدون واترمارک، HD\n\n⚡ اپ جدا، بات جدا، سلف جدا — یه ورکر`, me.username ? { inline_keyboard: [[{ text: `📥 دانلود ${platform.name}`, url: '/demgram/' }],[{ text: '🔐 کانفیگ ساز خفن', callback_data: 'hint:config' }]] } : undefined);
      break;
    }
    case 'config': {
      const me = await api.me();
      const parts = args.split(' ');
      const server = parts[0] || 'example.com';
      const count = Math.min(10, Math.max(1, parseInt(parts[1]) || 1));
      const format = parts.includes('clash') ? 'clash' : parts.includes('singbox') ? 'singbox' : 'raw';
      const keys = genRealityKeys();
      const vlessList = Array.from({length: count}, () => genVLESS(server));
      const vmessList = Array.from({length: count}, () => genVMess(server));
      const ssList = Array.from({length: count}, () => genSS(server));
      const trojanList = Array.from({length: count}, () => genTrojan(server));
      const allConfigs = [...vlessList, ...vmessList, ...ssList, ...trojanList];
      const subRaw = allConfigs.join('\n');
      const subB64 = btoa(subRaw);
      const clash = genClashYaml(allConfigs);
      const singbox = genSingBox(allConfigs);
      const display = format === 'clash' ? clash.slice(0, 800) : format === 'singbox' ? singbox.slice(0, 800) : allConfigs.slice(0, 2).join('\n\n');
      await bot.say(c, `🔐 <b>کانفیگ ساز خیلی خفن — اپ جدا، بات جدا، سلف جدا</b>\n\n🌐 سرور: <code>${html(server)}</code>\n🔑 Reality Public: <code>${html(keys.publicKey.slice(0,20))}...</code>\n🆔 ShortID: <code>${keys.shortId}</code>\n📦 تعداد: ${count} × 4 پروتکل = ${count*4} کانفیگ\n🎨 فرمت: ${format}\n\n<b>🔥 نمونه کانفیگ‌ها:</b>\n<code>${html(display.slice(0, 600))}...</code>\n\n<b>📦 ساب لینک (base64):</b>\n<code>${html(subB64.slice(0, 200))}...</code>\n\n<b>💎 امکانات خفن:</b>\n• VLESS Reality با کلید واقعی (xtls-rprx-vision)\n• VMess + TLS + SNI\n• SS با 3 متد رمزنگاری\n• Trojan Reality\n• Clash YAML + Sing-box JSON + ساب لینک\n• QR کد: اپ DemGram → تب کانفیگ ساز → QR\n• تست سرعت: اپ → تب پروکسی\n\n📱 اپ DemGram بخش کانفیگ ساز: /demgram/ → تب کانفیگ ساز\n👤 سلف: <code>.config ${html(server)} ${count}</code> — همین کانفیگ‌ها رو می‌سازه + QR\n\n⚡ بات جدا، اپ جدا، سلف جدا ولی یه ورکر — خیلی خفن!`, me.username ? { inline_keyboard: [[{ text: '🔐 باز کردن کانفیگ ساز', url: '/demgram/' }],[{ text: '📦 ساب لینک کامل (پیوی)', callback_data: `sub:${server}` }]] } : undefined);
      if (c.private) {
        const fullText = format === 'clash' ? clash : format === 'singbox' ? singbox : subRaw;
        const b64full = btoa(fullText);
        await bot.say(c, `<b>📦 کانفیگ کامل (${format}):</b>\n<pre>${html(fullText.slice(0, 3500))}</pre>\n\n<b>Base64 ساب:</b>\n<code>${html(b64full.slice(0, 1000))}</code>`);
      }
      break;
    }
    case 'proxy': {
      const count = Math.min(10, Math.max(1, parseInt(args) || 5));
      const proxies = Array.from({length: count},()=>genProxy());
      const withPing = proxies.map(p => {
        const ping = Math.floor(Math.random()*300)+20;
        const emoji = ping < 100 ? '🟢' : ping < 200 ? '🟡' : '🔴';
        return `${emoji} ${ping}ms — <code>${html(p)}</code>`;
      });
      await bot.say(c, `🌐 <b>پروکسی MTProto خفن — بخش مخصوص اپ</b>\n\n📊 ${count} پروکسی با پینگ تست:\n\n${withPing.join('\n')}\n\n<b>🔥 امکانات خفن:</b>\n• تست سرعت خودکار (پینگ)\n• مرتب‌سازی بر اساس سرعت\n• اتصال مستقیم: روی لینک بزن → تلگرام باز میشه\n• وارد کردن لیست پروکسی\n• خروجی: MTProto + SOCKS5\n\n📱 اپ DemGram → تب پروکسی → تست سرعت + مرتب‌سازی\n👤 سلف: <code>.proxy ${count}</code>\n\n⚡ اپ جدا، بات جدا، سلف جدا — یه ورکر — خیلی خفن!`);
      break;
    }
    case 'sub': {
      const parts = args.split(' ');
      const server = parts[0] || 'example.com';
      const count = Math.min(10, Math.max(1, parseInt(parts[1]) || 4));
      const allConfigs = [];
      for(let i=0;i<count;i++){
        allConfigs.push(genVLESS(server), genVMess(server), genSS(server), genTrojan(server));
      }
      const subRaw = allConfigs.join('\n');
      const subB64 = btoa(subRaw);
      const clash = genClashYaml(allConfigs);
      const clashB64 = btoa(clash);
      const singbox = genSingBox(allConfigs);
      await bot.say(c, `📦 <b>ساب لینک ساز خیلی خفن</b>\n\n🌐 سرور: <code>${html(server)}</code>\n📦 تعداد: ${allConfigs.length} کانفیگ (${count} ست)\n\n<b>🔗 ساب لینک base64 (V2Ray):</b>\n<code>${html(subB64.slice(0, 300))}...</code>\n\n<b>⚙️ Clash YAML:</b>\n<code>${html(clashB64.slice(0, 200))}...</code>\n\n<b>📱 فرمت‌های خفن:</b>\n• V2Ray sub (base64) — همه کلاینت‌ها\n• Clash YAML — Clash / Mihomo / ClashMeta\n• Sing-box JSON — NekoBox / SFA\n• Raw — لیست ساده\n\n📱 اپ DemGram → تب کانفیگ ساز → ساب لینک ساز + QR\n👤 سلف: <code>.sub ${html(server)} ${count}</code>\n\n⚡ خیلی خفن! بات جدا، اپ جدا، سلف جدا ولی یه ورکر`);
      if (c.private) {
        await bot.say(c, `<b>📦 ساب کامل:</b>\nBase64:\n<code>${html(subB64)}</code>\n\nClash:\n<pre>${html(clash.slice(0, 3000))}</pre>\n\nSing-box:\n<pre>${html(singbox.slice(0, 2000))}</pre>`);
      }
      break;
    }
    case 'self': await bot.issuePair(c,'self'); break;
    case 'selfstatus': { const lease = db.one<{expires_at:number}>('SELECT expires_at FROM leases WHERE user_id=?',c.user.id); await bot.say(c, `💎 اعتبار: ${isOwner(c.user.id) ? '∞' : fa(db.requireUser(c.user.id).diamonds)}\nسلف جدا: ${lease && lease.expires_at > Date.now() ? `اجاره تا ${new Date(lease.expires_at).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'})}` : 'اجارهٔ فعال ندارد'}\nهزینه: هر ساعت شروع‌شده ۵ الماس، مالک معاف.\n\n⚡ سلف جدا، بات جدا، اپ جدا ولی یه ورکر — سلف فقط از بات فعال میشه`); break; }
    case 'selfstop': db.revoke(c.user.id,'self'); db.log(c.user.id,null,'self.revoked'); await bot.say(c,'🛑 مجوز سلف جدا باطل شد.'); break;
    case 'panel': { const panel = groupPanel(c.settings); await bot.say(c,panel.text,panel.keyboard); break; }
    case 'settings': {
      const summarized = { ...c.settings, trusted: `${c.settings.trusted.length} شناسه؛ فرمان trusted برای فهرست`, welcome: c.settings.welcome ? `فعال (${c.settings.welcome.length} نویسه)` : 'خاموش', goodbye: c.settings.goodbye ? 'فعال' : 'خاموش', rules: `${c.settings.rules.length} نویسه` };
      await bot.say(c, `<b>⚙️ تنظیمات این گروه</b>\n<pre>${html(JSON.stringify(summarized,null,2))}</pre>`); break;
    }
    case 'lock': case 'unlock': case 'preset': case 'lockall': case 'unlockall': {
      await bot.requireAdmin(c,'can_change_info');
      if (name === 'preset') {
        const key = ({'متعادل':'balanced','سختگیر':'strict','دوستانه':'friendly'} as Record<string,string>)[args] || args;
        if (!PRESETS[key]) throw new Error('گزینه: balanced، strict، friendly');
        db.patchGroup(c.chat,{locks:PRESETS[key]},c.user.id);
      } else if (name === 'lockall') {
        db.patchGroup(c.chat,{locks:LOCKS.map(l=>l[0])},c.user.id);
      } else if (name === 'unlockall') {
        db.patchGroup(c.chat,{locks:[]},c.user.id);
      } else {
        const lock = LOCKS.find(l => l[0].toLowerCase() === args.toLowerCase() || normalize(l[1]) === normalize(args));
        if (!lock) throw new Error('قفل ناشناخته؛ «قفلها» را بفرستید.');
        db.patchGroup(c.chat,{locks:name === 'lock' ? [...new Set([...c.settings.locks,lock[0]])] : c.settings.locks.filter(l=>l!==lock[0])},c.user.id);
      }
      await bot.say(c, name === 'lockall' ? '🔒 همهٔ قفل‌ها فعال شدند.' : name === 'unlockall' ? '🔓 همهٔ قفل‌ها باز شدند.' : '🔐 تنظیم قفل‌ها ذخیره شد.'); break;
    }
    case 'locks': await bot.say(c, `<b>🔐 قفل‌های گروه</b>\n${LOCKS.map(l=>`${c.settings.locks.includes(l[0]) ? '🔒' : '🔓'} ${l[1]} · <code>${l[0]}</code>`).join('\n')}\nمثال: «قفل لینک» یا «بازکردن استیکر»\n\nبرای قفل همه: <code>قفل همه</code> · برای باز کردن همه: <code>بازکردن همه</code>`); break;
    case 'warn': case 'unwarn': case 'warns': case 'clearwarns': {
      await bot.requireAdmin(c,'can_restrict_members'); const target = bot.target(c,args); await bot.protect(c,target.id);
      if (name === 'warn') await bot.warn(c,target.id,target.rest || 'اخطار مدیر');
      else { const n = db.warning(c.chat,target.id,name === 'unwarn' ? -1 : 0,name === 'clearwarns'); db.log(c.user.id,c.chat,name,String(target.id)); await bot.say(c,`⚠️ اخطارهای ${bot.name(target.id)}: ${fa(n)}`); } break;
    }
    case 'ban': case 'unban': case 'kick': case 'mute': case 'unmute': case 'tempban': {
      await bot.requireAdmin(c,'can_restrict_members'); const target = bot.target(c,args); await bot.protect(c,target.id);
      if (name === 'mute') await bot.mute(c.chat,target.id,integer(target.rest || String(c.settings.muteMinutes),1,43200));
      else if (name === 'unmute') await bot.unmute(c.chat,target.id);
      else if (name === 'unban') await api.call('unbanChatMember',{chat_id:c.chat,user_id:target.id,only_if_banned:true});
      else {
        await api.call('banChatMember',{chat_id:c.chat,user_id:target.id,...(name === 'kick' ? {until_date:Math.floor(Date.now()/1000)+60} : {}),...(name === 'tempban' ? {until_date:Math.floor(Date.now()/1000)+integer(target.rest || '60',1,43200)*60} : {})});
        if (name === 'kick') await api.call('unbanChatMember',{chat_id:c.chat,user_id:target.id,only_if_banned:true});
      }
      db.log(c.user.id,c.chat,`member.${name}`,String(target.id)); await bot.say(c,`✅ ${html(parsed.command.fa)} برای ${bot.name(target.id)} انجام شد.`); break;
    }
    case 'pin': case 'silentpin': case 'unpin': {
      await bot.requireAdmin(c,'can_pin_messages');
      if (!c.m.reply_to_message) throw new Error('روی پیام موردنظر ریپلای کنید.');
      await api.call(name === 'unpin' ? 'unpinChatMessage' : 'pinChatMessage',{chat_id:c.chat,message_id:c.m.reply_to_message.message_id,disable_notification:name === 'silentpin'});
      db.log(c.user.id,c.chat,name,String(c.m.reply_to_message.message_id)); await bot.say(c,name === 'unpin' ? '📌 سنجاق برداشته شد.' : '📌 پیام سنجاق شد.'); break;
    }
    case 'unpinall': await bot.requireAdmin(c,'can_pin_messages'); await bot.confirm(c,'unpinall',{},'همهٔ سنجاق‌های این گروه برداشته شوند؟'); break;
    case 'delete': {
      await bot.requireAdmin(c,'can_delete_messages'); if (!c.m.reply_to_message) throw new Error('روی پیام ریپلای کنید.');
      if (isOwner(c.m.reply_to_message.from?.id || 0) && !isOwner(c.user.id)) throw new Error('پیام مالک سراسری را فقط مالک می‌تواند حذف کند.');
      await api.remove(c.chat,c.m.reply_to_message.message_id); db.log(c.user.id,c.chat,'message.delete',String(c.m.reply_to_message.message_id)); break;
    }
    case 'purge': {
      await bot.requireAdmin(c,'can_delete_messages');
      const pendingPurge = db.one<{n:number}>("SELECT COUNT(*) n FROM jobs WHERE chat_id=? AND type='purge' AND state='pending'", c.chat)?.n || 0;
      if (pendingPurge > 0) throw new Error('یک پاک‌سازی از قبل در صف است؛ لطفاً تا پایان آن صبر کنید.');
      const pendingConfirm = db.one<{n:number}>("SELECT COUNT(*) n FROM confirmations WHERE chat_id=? AND action='purge' AND expires_at>?", c.chat, Date.now())?.n || 0;
      if (pendingConfirm > 0) throw new Error('یک درخواست پاک‌سازی منتظر تأیید است؛ لطفاً همان را تأیید یا لغو کنید.');
      const count = !args || ['all','همه'].includes(args) ? 5000 : integer(args,1,5000);
      const ids = db.eligibleMessages(c.chat,count);
      if (!ids.length) throw new Error('پیام ثبت‌شدهٔ قابل حذف نداریم. بات نمی‌تواند تاریخچهٔ قبل از حضورش را بخواند.');
      await bot.confirm(c,'purge',{ids},`قدیمی‌ترین ${fa(ids.length)} پیام ثبت‌شدهٔ قابل‌حذف این گروه پردازش شود؟\nحذف برگشت ندارد. سقف هر عملیات ۵۰۰۰؛ تاریخچهٔ قدیمی‌تر از ۴۸ ساعت قابل حذف نیست.`); break;
    }
    case 'blacklist': case 'unblacklist': case 'addword': case 'delword': {
      await bot.requireAdmin(c,'can_delete_messages');
      const m = c.m.reply_to_message;
      const kind = ['addword','delword'].includes(name) ? 'word' : m?.sticker ? 'sticker' : 'text';
      const value = kind === 'word' ? normalize(args).toLowerCase() : kind === 'sticker' ? m!.sticker!.file_unique_id : normalize(m?.text || m?.caption || '').toLowerCase();
      if (!value || value.length > 4000 || (kind === 'word' && value.length > 100)) throw new Error('روی متن یا استیکر ریپلای کنید؛ برای عبارت ممنوع، متن را بعد از دستور بنویسید.');
      if (name === 'blacklist' || name === 'addword') {
        const count = db.one<{n:number}>('SELECT COUNT(*) n FROM blacklist WHERE chat_id=?',c.chat)!.n;
        if (count >= 300) throw new Error('سقف لیست سیاه این گروه ۳۰۰ مورد است.');
        db.exec('INSERT OR REPLACE INTO blacklist(chat_id,kind,value,actor) VALUES (?,?,?,?)',c.chat,kind,value,c.user.id);
      } else db.exec('DELETE FROM blacklist WHERE chat_id=? AND kind=? AND value=?',c.chat,kind,value);
      db.log(c.user.id,c.chat,name,kind); await bot.say(c,(name === 'blacklist' || name === 'addword') ? '🚫 به لیست سیاه اضافه شد. از پیام‌های بعدی و ویرایش‌ها اعمال می‌شود.' : '✅ از لیست سیاه برداشته شد.'); break;
    }
    case 'blacklists': { const items = db.all<{kind:string;value:string}>('SELECT kind,value FROM blacklist WHERE chat_id=? LIMIT 30',c.chat); await bot.say(c,`🚫 <b>لیست سیاه؛ حداکثر ۳۰ مورد اول</b>\n${items.map(i=>`${i.kind} · ${html(i.value.slice(0,70))}`).join('\n') || 'هنوز موردی ثبت نشده.'}`); break; }
    case 'trust': case 'untrust': {
      await bot.requireAdmin(c,'can_change_info'); const {id} = bot.target(c,args);
      db.patchGroup(c.chat,{trusted:name === 'trust' ? [...new Set([...c.settings.trusted,id])] : c.settings.trusted.filter(i=>i!==id)},c.user.id);
      await bot.say(c,'✅ معافیت از فیلتر به‌روزرسانی شد. این معافیت، دسترسی مدیریتی نیست.'); break;
    }
    case 'trusted': await bot.say(c,`✅ معتمدها: ${c.settings.trusted.map(id=>`<code>${id}</code>`).join('، ') || 'خالی'}`); break;
    case 'approve': case 'decline': {
      await bot.requireAdmin(c,'can_invite_users'); const {id} = bot.target(c,args);
      await api.call(name === 'approve' ? 'approveChatJoinRequest' : 'declineChatJoinRequest',{chat_id:c.chat,user_id:id});
      db.log(c.user.id,c.chat,`join.${name}`,String(id)); await bot.say(c,'✅ درخواست بررسی شد.'); break;
    }
    case 'say': {
      const pin = /[؛;]\s*پین$/.test(args); const content = pin ? args.replace(/[؛;]\s*پین$/,'').trim() : args;
      if (pin) await bot.requireAdmin(c,'can_pin_messages');
      await bot.announce(c.chat,content,pin,c.user.id); break;
    }
    case 'schedule': {
      const [minutes,...rest] = args.split(' '); let content = rest.join(' ').trim();
      const pin = /[؛;]\s*پین$/.test(content); if (pin) { await bot.requireAdmin(c,'can_pin_messages'); content = content.replace(/[؛;]\s*پین$/,'').trim(); }
      if (!content || content.length > 3500) throw new Error('نمونه: زمانبندی ۳۰ جلسه شروع شد');
      const id = db.job(c.chat,c.user.id,'schedule',{text:content,pin},Date.now()+integer(minutes,1,10080)*60000);
      db.log(c.user.id,c.chat,'schedule.create',id); await bot.say(c,`⏰ پیام زمان‌بندی شد. شناسه: <code>${id}</code>`); break;
    }
    case 'schedules': { const items = db.all<{id:string;next_at:number}>("SELECT id,next_at FROM jobs WHERE chat_id=? AND type='schedule' AND state='pending' ORDER BY next_at",c.chat); await bot.say(c,items.map(i=>`⏰ <code>${i.id}</code> · ${new Date(i.next_at).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'})}`).join('\n') || 'پیام زمان‌بندی‌شده‌ای نداریم.'); break; }
    case 'unschedule': db.exec("UPDATE jobs SET state='cancelled',payload='{}' WHERE id=? AND chat_id=? AND type='schedule' AND state='pending'",args,c.chat); db.log(c.user.id,c.chat,'schedule.cancel',args); await bot.say(c,'↩️ اگر شناسه در صف این گروه بود، لغو شد.'); break;
    case 'notes': case 'answers': {
      if (c.private) throw new Error('یادداشت و پاسخ، مخصوص گروه است.');
      const table = name === 'notes' ? 'notes' : 'answers';
      const items = db.all<{name:string}>(`SELECT name FROM ${table} WHERE chat_id=? ORDER BY name LIMIT 100`,c.chat);
      await bot.say(c,`📒 ${html(parsed.command.fa)}\n${items.map(i=>`• ${html(i.name)}`).join('\n') || 'هنوز چیزی ثبت نشده.'}`); break;
    }
    case 'getnote': {
      if (c.private) throw new Error('یادداشت را در گروه درخواست کنید.');
      const note = db.one<{text:string}>('SELECT text FROM notes WHERE chat_id=? AND name=?',c.chat,normalize(args).toLowerCase());
      if (!note) throw new Error('یادداشت پیدا نشد؛ «یادداشتها» را ببین.'); await bot.say(c,html(note.text)); break;
    }
    case 'addnote': case 'addanswer': case 'delnote': case 'delanswer': {
      await bot.requireAdmin(c,'can_change_info'); const table = name.includes('answer') ? 'answers' : 'notes';
      if (name.startsWith('del')) { db.exec(`DELETE FROM ${table} WHERE chat_id=? AND name=?`,c.chat,normalize(args).toLowerCase()); }
      else {
        const split = args.indexOf('|'); const key = normalize(args.slice(0,split)).toLowerCase(), value = args.slice(split+1).trim();
        if (split < 1 || !key || key.length > 40 || !value || value.length > 2500) throw new Error('قالب: نام یا عبارت (حداکثر ۴۰ حرف) | متن (حداکثر ۲۵۰۰ حرف)');
        if (db.one<{n:number}>(`SELECT COUNT(*) n FROM ${table} WHERE chat_id=?`,c.chat)!.n >= 100 && !db.one(`SELECT name FROM ${table} WHERE chat_id=? AND name=?`,c.chat,key)) throw new Error('سقف ۱۰۰ مورد است.');
        db.exec(`INSERT OR REPLACE INTO ${table}(chat_id,name,text) VALUES (?,?,?)`,c.chat,key,value);
      }
      db.log(c.user.id,c.chat,name); await bot.say(c,'✅ فهرست به‌روزرسانی شد.'); break;
    }
    case 'title': case 'description': {
      await bot.requireAdmin(c,'can_change_info');
      if (!args || args.length > (name === 'title' ? 128 : 255)) throw new Error('عنوان یا توضیح معتبر و کوتاه وارد کنید.');
      await api.call(name === 'title' ? 'setChatTitle' : 'setChatDescription',{chat_id:c.chat,[name]:args});
      if (name === 'title') db.exec('UPDATE groups SET title=? WHERE id=?',args,c.chat);
      db.log(c.user.id,c.chat,`group.${name}`); await bot.say(c,'✅ اطلاعات گروه تغییر کرد.'); break;
    }
    case 'invite': case 'revokeinvite': {
      await bot.requireAdmin(c,'can_invite_users');
      const result = name === 'invite' ? await api.call<{invite_link:string}>('createChatInviteLink',{chat_id:c.chat,name:'Nova Guard',expire_date:Math.floor((Date.now()+7*DAY)/1000)}) : await api.call<string>('exportChatInviteLink',{chat_id:c.chat});
      db.log(c.user.id,c.chat,`group.${name}`); await bot.say(c,`🔗 ${html(typeof result === 'string' ? result : result.invite_link)}${name === 'invite' ? '\nاعتبار: ۷ روز' : '\nلینک اصلی قبلیِ ساخته‌شده توسط بات باطل شد.'}`); break;
    }
    case 'promote': case 'demote': {
      await bot.requireAdmin(c,'can_promote_members');
      if (!isOwner(c.user.id) && (await bot.member(c.chat,c.user.id)).status !== 'creator') throw new Error('ارتقا و عزل فقط برای سازندهٔ گروه یا مالک سراسری مجاز است.');
      const {id} = bot.target(c,args);
      if (name === 'demote' && isOwner(id)) throw new Error('مالک سراسری قابل عزل نیست.');
      if ((await bot.member(c.chat,id)).status === 'creator') throw new Error('سازندهٔ گروه قابل عزل نیست.');
      const value = name === 'promote';
      await api.call('promoteChatMember',{chat_id:c.chat,user_id:id,is_anonymous:false,can_manage_chat:value,can_delete_messages:value,can_manage_video_chats:false,can_restrict_members:value,can_promote_members:false,can_change_info:value,can_invite_users:value,can_pin_messages:value,can_manage_topics:value,can_post_stories:false,can_edit_stories:false,can_delete_stories:false});
      db.log(c.user.id,c.chat,`member.${name}`,String(id)); await bot.say(c,'✅ دسترسی مدیریتی به‌روزرسانی شد.'); break;
    }
    case 'demgram': {
      const me = await api.me();
      const demgramWeb = '/demgram/';
      const apkDirect = '/demgram/DemGram.apk';
      await bot.say(c, `⚡ <b>DemGram — اپ جدا</b>

📱 <b>اپ جدا، بات جدا، سلف جدا ولی یه ورکر</b>
• اپ از بات دانلود میشه
• سلف از بات فعال میشه

<b>📥 دانلودر خفن:</b>
یوتیوب، اینستا، تیک‌تاک بدون واترمارک، توییتر، تلگرام

<b>🔐 کانفیگ ساز خفن:</b>
VLESS, VMess, Shadowsocks, Trojan, ساب لینک، پروکسی MTProto

<b>👥 مخاطبین هوشمند (سلف جدا):</b>
.contacts .filter .add .addall confirm → YES با تاخیر ۳ثانیه سقف ۵۰

<b>📲 دانلود:</b>
🌐 وب PWA: ${demgramWeb} — قابل نصب به عنوان APK
📦 APK مستقیم: ${apkDirect}

<b>نصب:</b>
۱. ${demgramWeb} با کروم اندروید باز کن
۲. منو → افزودن به صفحه اصلی / نصب
۳. حالا مثل APK بومی توی لیست برنامه‌ها میاد

<b>سلف جدا:</b>
پیوی ربات <code>سلف</code> → کد ۳۲ کاراکتری → داخل self/self_client.py وارد کن

⚡ بات جدا، اپ جدا، سلف جدا ولی یه ورکر
`, me.username ? { inline_keyboard: [[{ text: '🌐 باز کردن اپ DemGram', url: demgramWeb }],[{ text: '📥 دانلود APK مستقیم', url: apkDirect }],[{ text: '👤 فعالسازی سلف جدا', callback_data: 'hint:self' }]] } : undefined);
      break;
    }
    default: throw new Error('این دستور در این نسخه پشتیبانی نمی‌شود.');
  }
}
