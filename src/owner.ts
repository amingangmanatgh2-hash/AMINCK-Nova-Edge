import type { Bot, Context } from './bot';
import type { Parsed } from './commands';
import { OWNERS, isOwner } from './config';
import { helpText } from './panels';
import type { GlobalSettings, GroupRow } from './types';
import { fa, html, integer, onOff } from './utils';

export async function executeOwner(bot: Bot, c: Context, parsed: Parsed) {
  if (!isOwner(c.user.id)) throw new Error('فقط مالک سراسری.');
  const {name} = parsed.command, args = parsed.args, db = bot.db, api = bot.api;
  const groupTarget = () => {
    const id = args ? integer(args,-Number.MAX_SAFE_INTEGER,-1) : c.private ? NaN : c.chat;
    if (!Number.isSafeInteger(id) || !db.group(id)) throw new Error('شناسهٔ یک گروه ثبت‌شده را وارد کنید.');
    return id;
  };
  const globalNumbers: Record<string,[keyof GlobalSettings,number,number]> = {
    diamondodds:['diamondOdds',50,10000], dueltime:['duelSeconds',60,900], globalbet:['maxBet',1,1000000], dailycoins:['dailyCoins',1,10000],
  };
  if (globalNumbers[name]) {
    const [key,min,max] = globalNumbers[name]; db.setGlobal({[key]:integer(args,min,max)});
    db.log(c.user.id,null,`owner.${name}`,args); await bot.say(c,'👑 تنظیم سراسری ذخیره شد.'); return;
  }
  switch(name) {
    case 'ownerhelp': await bot.say(c,helpText('owner','owner')); break;
    case 'ownerstats': {
      const count = (table:string,where='') => db.one<{n:number}>(`SELECT COUNT(*) n FROM ${table} ${where}`)!.n;
      await bot.say(c,`👑 <b>دید سراسری</b>\nگروه فعال: ${fa(count('groups','WHERE active=1'))}\nکاربر دیده‌شده: ${fa(count('users'))}\nدوئل تمام‌شده: ${fa(count('duels',"WHERE state='settled'"))}\nکارهای منتظر: ${fa(count('jobs',"WHERE state='pending'"))}\nاجارهٔ فعال: ${fa(db.one<{n:number}>('SELECT COUNT(*) n FROM leases WHERE expires_at>?',Date.now())!.n)}\nمالک‌ها: ${OWNERS.join('، ')}\nالماس شما: ∞`); break;
    }
    case 'groups': {
      const groups = db.all<GroupRow>('SELECT * FROM groups ORDER BY joined_at DESC LIMIT 30');
      await bot.say(c,`👥 <b>گروه‌های ثبت‌شده؛ ۳۰ مورد آخر</b>\n${groups.map(g=>`${g.active === 1 ? '🟢' : '⚪️'} ${html(g.title)}\n<code>${g.id}</code>`).join('\n') || 'ابتدا بات را به یک گروه اضافه کنید.'}`); break;
    }
    case 'send': case 'sendpin': {
      const [first,...rest] = args.split(' '); const chat = integer(first,-Number.MAX_SAFE_INTEGER,-1);
      await bot.announce(chat,rest.join(' '),name === 'sendpin',c.user.id);
      if (chat !== c.chat) await bot.say(c,'✅ پیام به گروه مقصد ارسال شد.'); break;
    }
    case 'leave': case 'resetgroup': case 'blockgroup': case 'resetboard': {
      const chat = groupTarget();
      await bot.confirm(c,name,{chat},`${html(parsed.command.description)}\nگروه: ${html(db.group(chat)!.title)} · <code>${chat}</code>`); break;
    }
    case 'unblockgroup': {
      const chat = groupTarget();
      const me = await api.me(); const member = await api.call<{status:string}>('getChatMember',{chat_id:chat,user_id:me.id});
      if (['left','kicked'].includes(member.status)) throw new Error('بات عضو گروه نیست؛ ابتدا دوباره اضافه‌اش کنید.');
      db.exec('UPDATE groups SET active=1 WHERE id=?',chat); db.log(c.user.id,chat,'group.unblock'); await bot.say(c,'🟢 پردازش گروه ازسرگرفته شد.'); break;
    }
    case 'grant': case 'take': case 'setcoins': case 'givecoins': {
      const {id,rest} = bot.target(c,args), amount = integer(rest,name === 'setcoins' ? 0 : 1,1000000000);
      const user = db.requireUser(id);
      const currency = name === 'grant' || name === 'take' ? 'diamonds' : 'coins';
      const delta = name === 'take' ? -amount : name === 'setcoins' ? amount-user.coins : amount;
      const balance = db.atomic(()=> { const result = db.money(id,currency,delta,`owner.${name}`,String(c.user.id)); db.log(c.user.id,null,`owner.${name}`,`${id}: ${amount}`); return result; });
      await bot.say(c,`👑 موجودی ${bot.name(id)}: ${currency === 'diamonds' && isOwner(id) ? '∞' : fa(balance)} ${currency === 'diamonds' ? 'الماس' : 'سکه'}`); break;
    }
    case 'maintenance': db.setGlobal({maintenance:onOff(args)}); db.log(c.user.id,null,'maintenance',args); await bot.say(c,'🛠 حالت نگهداری به‌روزرسانی شد. حفاظت گروه و تسویهٔ دوئل‌های قبلی ادامه دارد.'); break;
    case 'freeze': case 'unfreeze': {
      const {id} = bot.target(c,args); db.requireUser(id); if (isOwner(id)) throw new Error('مالک سراسری قابل توقیف نیست.');
      db.exec('UPDATE users SET frozen=? WHERE id=?',name === 'freeze' ? 1 : 0,id);
      if (name === 'freeze') db.revoke(id,'self');
      db.log(c.user.id,null,name,String(id)); await bot.say(c,'✅ وضعیت اقتصادی کاربر تغییر کرد. شرط‌های قبلی همچنان تسویه می‌شوند.'); break;
    }
    case 'inspect': {
      const {id} = bot.target(c,args); const user = db.requireUser(id); const lease = db.one<{expires_at:number}>('SELECT expires_at FROM leases WHERE user_id=?',id);
      await bot.say(c,`🔎 ${bot.name(id)}\n🪪 <code>${id}</code>\nسکه: ${fa(user.coins)} · الماس: ${isOwner(id) ? '∞' : fa(user.diamonds)}\nتوقیف: ${user.frozen ? 'بله' : 'خیر'}\nبرد: ${fa(user.wins)} · باخت: ${fa(user.losses)}\nسلف: ${lease && lease.expires_at>Date.now() ? 'اجارهٔ فعال' : 'بدون اجاره'}\nتعداد مجوز فعال: ${db.one<{n:number}>('SELECT COUNT(*) n FROM tokens WHERE user_id=? AND expires_at>?',id,Date.now())!.n}`); break;
    }
    case 'audit': {
      const rows = db.all<{action:string;actor:number;chat_id:number|null;created_at:number}>('SELECT action,actor,chat_id,created_at FROM audit ORDER BY id DESC LIMIT 15');
      await bot.say(c,`🗂 <b>۱۵ رویداد آخر</b>\n${rows.map(r=>`${html(r.action)} · ${r.actor}\n${r.chat_id || 'سراسری'} · ${new Date(r.created_at).toLocaleTimeString('fa-IR',{timeZone:'Asia/Tehran'})}`).join('\n') || 'خالی'}`); break;
    }
    case 'ledger': {
      const {id} = bot.target(c,args); const rows = db.all<{delta:number;currency:string;reason:string;balance:number}>('SELECT delta,currency,reason,balance FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 15',id);
      await bot.say(c,`📒 گردش ${bot.name(id)}\n${rows.map(r=>`${r.delta>0 ? '+' : ''}${r.delta} ${r.currency} · ${html(r.reason)}\nمانده: ${r.balance}`).join('\n') || 'هنوز تراکنشی ندارد.'}`); break;
    }
    case 'export': {
      if (!c.private) throw new Error('خروجی تنظیمات را فقط در خصوصی بگیرید تا اطلاعات گروه‌ها منتشر نشود.');
      await api.document(c.chat,'nova-settings.json',JSON.stringify(db.snapshot(),null,2)); db.log(c.user.id,null,'settings.export'); break;
    }
    case 'revoke': case 'stopself': {
      const {id} = bot.target(c,args); db.requireUser(id); db.revoke(id,name === 'stopself' ? 'self' : undefined);
      db.log(c.user.id,null,name,String(id)); await bot.say(c,'🛑 مجوز ابطال شد؛ بررسی بعدی کلاینت رسمی حداکثر تا ۶۰ ثانیه دیگر است.'); break;
    }
    case 'terminal': await bot.issuePair(c,'terminal'); break;
    case 'brand': case 'bio': case 'botdescription': {
      const max = name === 'brand' ? 64 : name === 'bio' ? 120 : 512;
      if (!args || args.length>max) throw new Error(`متن باید بین ۱ و ${max} نویسه باشد.`);
      await api.call(name === 'brand' ? 'setMyName' : name === 'bio' ? 'setMyShortDescription' : 'setMyDescription',{[name === 'brand' ? 'name' : name === 'bio' ? 'short_description' : 'description']:args});
      if (name === 'brand') { db.setGlobal({brand:args}); db.exec("DELETE FROM meta WHERE key='bot.me'"); }
      db.log(c.user.id,null,name); await bot.say(c,'✨ نمایهٔ عمومی بات به‌روزرسانی شد.'); break;
    }
    case 'synccommands': {
      const commands = (await import('./commands')).COMMANDS.filter(x=>['start','help','panel','rules','duel','games','balance','daily','profile','leaderboard','self','selfstop','id','report'].includes(x.name));
      await api.call('setMyCommands',{commands:commands.map(x=>({command:x.name,description:x.description.slice(0,100)}))});
      db.log(c.user.id,null,'commands.sync'); await bot.say(c,'📖 منوی اسلش نصب شد. دستورات فارسیِ بدون اسلش هم طبق تنظیم گروه کار می‌کنند.'); break;
    }
    case 'jobs': {
      const rows = db.all<{id:string;type:string;state:string;chat_id:number}>("SELECT id,type,state,chat_id FROM jobs ORDER BY created_at DESC LIMIT 20");
      await bot.say(c,`🧰 <b>کارهای اخیر</b>\n${rows.map(r=>`<code>${r.id}</code> · ${r.type} · ${r.state}\n${r.chat_id}`).join('\n') || 'صف خالی است.'}`); break;
    }
    case 'canceljob': {
      const count = db.exec("UPDATE jobs SET state='cancelled',payload='{}' WHERE id=? AND state='pending'",args).rowsWritten;
      db.log(c.user.id,null,'job.cancel',args); await bot.say(c,count ? '🛑 کار متوقف شد. پیام‌های قبلاً حذف‌شده برنمی‌گردند.' : 'کارِ درانتظار با این شناسه پیدا نشد.'); break;
    }
    case 'health': {
      const me = await api.call<{username:string}>('getMe'); const hook = await api.call<{url:string;pending_update_count:number;last_error_message?:string}>('getWebhookInfo');
      await bot.say(c,`🟢 اتصال به @${html(me.username)} برقرار است.\nوبهوک: ${hook.url ? 'ثبت‌شده' : 'تنظیم‌نشده'}\nآپدیت‌های منتظر تلگرام: ${fa(hook.pending_update_count)}\nخطای آخر: ${html(hook.last_error_message || 'ندارد')}`); break;
    }
    default: throw new Error('دستور اختصاصی ناشناخته.');
  }
}
