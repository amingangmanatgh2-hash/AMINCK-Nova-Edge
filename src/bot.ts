import { COMMANDS, parseCommand } from './commands';
import type { Parsed } from './commands';
import { DAY, GAMES, HOUR, LOCKS, OWNERS, diceScore, filterReason, isOwner } from './config';
import { Database } from './database';
import { botLinks } from './connection';
import { executeCommand } from './handlers';
import { executeOwner } from './owner';
import { groupPanel, helpText, locksPanel } from './panels';
import { Telegram, TelegramError } from './telegram';
import type { Keyboard } from './telegram';
import type { ChatMember, DuelRow, Env, GroupSettings, Message, Update, User } from './types';
import { fa, hash, html, integer, normalize, randomInt, safeError, token } from './utils';

export interface Context { m: Message; user: User; chat: number; private: boolean; settings: GroupSettings }
const MUTE_PERMISSIONS = Object.fromEntries(['can_send_messages','can_send_audios','can_send_documents','can_send_photos','can_send_videos','can_send_video_notes','can_send_voice_notes','can_send_polls','can_send_other_messages','can_add_web_page_previews','can_change_info','can_invite_users','can_pin_messages','can_manage_topics'].map(k => [k, false]));

export class Bot {
  readonly api: Telegram;
  private members = new Map<string, ChatMember>();
  constructor(readonly db: Database, readonly env: Env) { this.api = new Telegram(env, db); }
  context(m: Message, user: User): Context { return { m, user, chat: m.chat.id, private: m.chat.type === 'private', settings: this.db.settings(m.chat.id) }; }
  say(c: Context, text: string, keyboard?: Keyboard) { return this.api.send(c.chat, text, keyboard, c.m.message_thread_id ? { message_thread_id: c.m.message_thread_id } : {}); }
  name(id: number) { return `<a href="tg://user?id=${id}">${html(this.db.user(id)?.name || id)}</a>`; }
  async member(chat: number, id: number) {
    const key = `${chat}:${id}`;
    if (!this.members.has(key)) this.members.set(key, await this.api.call<ChatMember>('getChatMember', { chat_id: chat, user_id: id }));
    return this.members.get(key)!;
  }
  async botMember(chat: number): Promise<ChatMember> {
    const me = await this.api.me();
    return this.member(chat, me.id);
  }
  async admin(c: Context, permission?: keyof ChatMember): Promise<boolean> {
    if (isOwner(c.user.id)) return true;
    if (c.private || c.m.sender_chat) return false;
    const member = await this.member(c.chat, c.user.id);
    return member.status === 'creator' || (member.status === 'administrator' && (!permission || member[permission] === true));
  }
  async requireAdmin(c: Context, permission?: keyof ChatMember) {
    if (c.private) throw new Error('این دستور را داخل گروه بفرستید.');
    if (!(await this.admin(c, permission))) throw new Error('این کار دسترسی مدیر مجاز گروه را می‌خواهد.');
  }
  async protect(c: Context, target: number) {
    if (isOwner(target)) throw new Error('مالک سراسری قابل محدودکردن نیست.');
    const me = await this.api.me();
    if (target === me.id) throw new Error('خود بات را نمی‌توان هدف گرفت.');
    const member = await this.member(c.chat, target);
    if (['creator', 'administrator'].includes(member.status)) throw new Error('این کار روی مدیرهای تلگرام انجام نمی‌شود.');
  }
  target(c: Context, args: string): { id: number; rest: string } {
    if (c.m.reply_to_message?.sender_chat) throw new Error('روی پیام حساب واقعی ریپلای کنید، نه پیام ناشناس یا کانال.');
    const reply = c.m.reply_to_message?.from;
    if (reply) { this.db.ensureUser(reply); return { id: reply.id, rest: args }; }
    const [first, ...rest] = normalize(args).split(' ');
    if (!first) throw new Error('روی پیام کاربر ریپلای کنید یا شناسهٔ عددی بدهید.');
    // Persian users often type @username – give a clear message instead of huge number range
    if (first.startsWith('@')) throw new Error('لطفاً روی پیام کاربر ریپلای کنید؛ نام کاربری متنی برای بن/سکوت کافی نیست، شناسهٔ عددی یا ریپلای لازم است.');
    try {
      return { id: integer(first, 1, Number.MAX_SAFE_INTEGER), rest: rest.join(' ') };
    } catch {
      throw new Error('شناسهٔ کاربر نامعتبر است. روی پیامش ریپلای کنید یا شناسهٔ عددی درست بفرستید.');
    }
  }
  async mute(chat: number, user: number, minutes: number) {
    await this.api.call('restrictChatMember', { chat_id: chat, user_id: user, permissions: MUTE_PERMISSIONS, use_independent_chat_permissions: true, until_date: Math.floor(Date.now() / 1000) + minutes * 60 });
  }
  async unmute(chat: number, user: number) {
    const group = await this.api.call<{permissions?:Record<string,boolean>}>('getChat', { chat_id: chat });
    if (!group.permissions) throw new Error('برای رفع سکوت، گروه باید سوپرگروه با دسترسی‌های مشخص باشد.');
    await this.api.call('restrictChatMember', { chat_id: chat, user_id: user, permissions: group.permissions, use_independent_chat_permissions: true });
  }
  async warn(c: Context, target: number, reason = 'اخطار مدیر') {
    await this.protect(c, target);
    const n = this.db.warning(c.chat, target, 1);
    this.db.log(c.user.id, c.chat, 'member.warn', `${target}: ${reason}`);
    if (n >= c.settings.warnLimit) {
      const botMember = await this.botMember(c.chat).catch(() => null);
      const canRestrict = botMember && (botMember.status === 'creator' || (botMember.status === 'administrator' && botMember.can_restrict_members));
      if (!canRestrict) {
        if (this.db.rate(`missing-restrict-warn:${c.chat}`, 1, 10*60000)) {
          this.db.log(0, c.chat, 'permissions.missing', 'can_restrict_members for warn action');
          await this.say(c, `⚠️ ${this.name(target)} به حد اخطار رسید، اما برای ${c.settings.warnAction === 'ban' ? 'مسدودکردن' : 'سکوت'} به دسترسی «بن کاربران» نیاز دارم. لطفاً این دسترسی را به بات بدهید؛ پنل بدون آن هم کار می‌کند.`);
        }
        return;
      }
      try {
        if (c.settings.warnAction === 'ban') await this.api.call('banChatMember', { chat_id: c.chat, user_id: target });
        else await this.mute(c.chat, target, c.settings.muteMinutes);
      } catch (e) {
        this.db.log(0, c.chat, 'member.warn_failed', safeError(e));
        if (this.db.rate(`warn-failed:${c.chat}:${target}`, 1, 5*60000)) {
          await this.say(c, `⚠️ برای اجرای مجازات اخطار به دسترسی مدیریت نیاز دارم.`);
        }
        return;
      }
      this.db.warning(c.chat, target, 0, true);
      await this.say(c, `🛡 ${this.name(target)} به حد اخطار رسید؛ ${c.settings.warnAction === 'ban' ? 'مسدود شد' : `${fa(c.settings.muteMinutes)} دقیقه سکوت`} شد.`);
    } else {
      // For flood, don't spam warning for every deleted message – only when approaching limit
      if (reason === 'ارسال سیل پیام') return;
      await this.say(c, `⚠️ ${this.name(target)} · اخطار ${fa(n)} از ${fa(c.settings.warnLimit)}\n${html(reason)}`);
    }
  }
  async issuePair(c: Context, kind: 'self' | 'terminal') {
    if (!c.private) throw new Error(`برای حفظ امنیت، «${kind === 'self' ? 'سلف جدا' : 'کنسول مالک'}» را در گفت‌وگوی خصوصی بات بفرستید.`);
    if (kind === 'terminal' && !isOwner(c.user.id)) throw new Error('کنسول مدیریت فقط برای مالک‌های سراسری است.');
    if (this.db.requireUser(c.user.id).frozen && !isOwner(c.user.id)) throw new Error('دسترسی حساب متوقف است.');
    this.db.exec('DELETE FROM tokens WHERE user_id=? AND kind=?', c.user.id, `pair_${kind}`);
    const code = token(16);
    this.db.addToken(await hash(code), c.user.id, `pair_${kind}`, Date.now() + 10 * 60000);
    await this.say(c, `${kind === 'self' ? '💎 اتصال سلف جدا — اپ جدا، بات جدا، سلف جدا ولی یه ورکر' : '🖥 اتصال کنسول مالک — بات جدا'}\n\nکد یک‌بارمصرف، معتبر برای ۱۰ دقیقه:\n<code>${code}</code>\n\nکد را فقط در سلف جدا همین پروژه وارد کنید: self/self_client.py، نه برای اشخاص دیگر. ${kind === 'self' ? 'هر ساعتِ شروع‌شده ۵ الماس پیش‌پرداخت؛ توقف زودتر بازپرداخت ندارد. مالکان معاف‌اند. شماره، کد ورود و نشست تلگرام فقط روی دستگاه خودتان می‌ماند.' : 'این دسترسی اختیار مدیریت ربات دارد؛ فایل تنظیمات سلف جدا را به کسی ندهید.'}`);
  }
  async announce(chat: number, text: string, pin: boolean, actor: number) {
    const group = this.db.group(chat);
    if (!group || group.active !== 1) throw new Error('گروه مقصد فعال و شناخته‌شده نیست.');
    if (!text.trim() || text.length > 3500) throw new Error('متن باید بین ۱ و ۳۵۰۰ نویسه باشد.');
    const message = await this.api.send(chat, html(text));
    this.db.log(actor, chat, 'message.send', pin ? 'pin requested' : 'message');
    if (pin) {
      try { await this.api.call('pinChatMessage', { chat_id: chat, message_id: message.message_id }); }
      catch { throw new Error('پیام ارسال شد، ولی سنجاق نشد؛ دسترسی Pin Messages بات را بررسی کنید. برای جلوگیری از تکرار، دوباره ارسال نکنید.'); }
    }
    return message;
  }
  async confirm(c: Context, action: string, payload: unknown, summary: string) {
    const id = this.db.confirm(c.user.id, c.chat, action, payload);
    return this.say(c, `⚠️ <b>تأیید عملیات</b>\n${summary}\n\nفقط درخواست‌کننده تا ۹۰ ثانیه می‌تواند تأیید کند.`, { inline_keyboard: [[{ text: '✅ تأیید می‌کنم', callback_data: `confirm:${id}` }, { text: 'انصراف', callback_data: `dismiss:${id}` }]] });
  }
  async executeConfirmation(action: string, payload: Record<string, unknown>, actor: number, contextChat: number) {
    const target = typeof payload.chat === 'number' ? payload.chat : contextChat;
    if (action === 'purge') {
      const ids = payload.ids as number[];
      // Prevent duplicate purge jobs spamming the group
      const pendingPurge = this.db.one<{n:number}>("SELECT COUNT(*) n FROM jobs WHERE chat_id=? AND type='purge' AND state='pending'", target)?.n || 0;
      if (pendingPurge > 0) throw new Error('یک عملیات پاک‌سازی از قبل در صف این گروه است؛ لطفاً تا پایان آن صبر کنید.');
      const id = this.db.job(target, actor, 'purge', { ids, processed: 0, total: ids.length });
      this.db.log(actor, target, 'purge.queued', `${ids.length} tracked IDs; job=${id}`);
      return `🧹 کار ${id} ثبت شد؛ ${fa(ids.length)} شناسهٔ قابل بررسی. فقط پیام‌های ثبت‌شدهٔ کمتر از ۴۸ ساعت هدف هستند.`;
    }
    if (action === 'unpinall') { await this.api.call('unpinAllChatMessages', { chat_id: target }); this.db.log(actor, target, 'pins.clear'); return '📌 سنجاق‌ها برداشته شدند.'; }
    if (!isOwner(actor)) throw new Error('فقط مالک سراسری.');
    if (!this.db.group(target)) throw new Error('گروه شناخته‌شده نیست.');
    if (action === 'leave') {
      await this.api.call('leaveChat', { chat_id: target }); this.db.exec('UPDATE groups SET active=0 WHERE id=?', target);
    } else if (action === 'resetgroup') {
      this.db.exec('UPDATE groups SET settings=? WHERE id=?', JSON.stringify((await import('./config')).DEFAULT_GROUP), target);
    } else if (action === 'blockgroup') this.db.exec('UPDATE groups SET active=-1 WHERE id=?', target);
    else if (action === 'resetboard') this.db.exec('UPDATE members SET xp=0,wins=0,losses=0,messages=0 WHERE chat_id=?', target);
    else throw new Error('عملیات ناشناخته.');
    this.db.log(actor, target, action); return '✅ عملیات تأییدشده انجام شد.';
  }
  duelText(d: DuelRow): string {
    const intro = `<b>${d.emoji} دوئل نُوا · ${html(d.id)}</b>\n${this.name(d.creator)}${d.opponent ? ` در برابر ${this.name(d.opponent)}` : d.target ? ` · دعوت از ${this.name(d.target)}` : ' · حریف می‌طلبد!'}\nشرط هر نفر: ${fa(d.stake)} سکهٔ مجازی\n`;
    if (['settled', 'cancelled'].includes(d.state)) {
      const result = JSON.parse(d.result || '{}') as {winner:number|null;reason:string;diamond:boolean};
      return `${intro}\n${result.winner ? `🏆 برنده: ${this.name(result.winner)}\nجایزه: ${fa(d.stake * 2)} سکه${result.reason === 'forfeit' ? ' · حریف در مهلت مقرر پرتاب نکرد.' : ''}` : '🤝 مساوی، انصراف یا پایان مهلت؛ شرط‌ها پس داده شدند.'}${result.diamond ? '\n💎 خوش‌شانسی کمیاب! ۱ الماس هم بردی.' : ''}\n${d.roll1 !== null ? `امتیاز اول: ${diceScore(d.emoji, d.roll1)}` : ''} ${d.roll2 !== null ? `· دوم: ${diceScore(d.emoji, d.roll2)}` : ''}`;
    }
    return `${intro}\n${d.opponent ? `حالا هر دو روی <b>همین پیام بات</b> ریپلای کنید و ${d.emoji} بفرستید. فقط اولین پرتاب معتبر ثبت می‌شود.\n${d.roll1 === null ? '⏳' : '✅'} بازیکن اول · ${d.roll2 === null ? '⏳' : '✅'} بازیکن دوم\nاگر فقط یک نفر پرتاب کند، بعد از پایان مهلت برنده است.` : 'برای ورود، دکمهٔ قبول دوئل را بزن. بعد از ورود حریف، لغو ممکن نیست.'}\n⏱ پایان: ${new Date(d.expires_at).toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' })}\nسکه و الماس قابل خرید، فروش یا برداشت نیستند.`;
  }
  duelKeyboard(d: DuelRow): Keyboard | undefined {
    if (d.state !== 'open' && d.state !== 'creating') return;
    return { inline_keyboard: [[{ text: `${d.emoji} قبول دوئل`, callback_data: `join:${d.id}` }, { text: 'انصراف سازنده', callback_data: `cancel:${d.id}` }]] };
  }
  async updateDuel(d: DuelRow) { if (d.message_id) await this.api.edit(d.chat_id, d.message_id, this.duelText(d), this.duelKeyboard(d)); }
  async startDuel(c: Context, args: string) {
    if (c.private) throw new Error('دوئل را داخل گروه بساز.');
    if (!c.settings.games) throw new Error('بازی‌های این گروه خاموش‌اند.');
    const parts = args.split(' ').filter(Boolean);
    const emoji = GAMES.find(g => parts.includes(g.emoji))?.emoji || '🎲';
    const amount = parts.find(p => /^\d+$/.test(p));
    if (parts.some(p => p !== emoji && p !== amount)) throw new Error('نمونه: دوئل 🎲 ۵۰');
    const stake = integer(amount || '50', 1, 1000000);
    const opponent = c.m.reply_to_message?.from;
    const me = await this.api.me();
    if (opponent?.is_bot && opponent.id !== me.id) throw new Error('حریف باید یک انسان باشد.');
    if (c.m.reply_to_message?.sender_chat) throw new Error('پیام ناشناس نمی‌تواند حریف باشد.');
    if (opponent && !opponent.is_bot) this.db.ensureUser(opponent);
    const d = this.db.createDuel(c.chat, c.user.id, opponent && !opponent.is_bot ? opponent.id : null, emoji, stake);
    try {
      const sent = await this.say(c, this.duelText(d), this.duelKeyboard(d));
      this.db.exec("UPDATE duels SET message_id=?,state='open' WHERE id=?", sent.message_id, d.id);
    } catch (e) { this.db.cancelDuel(d.id, c.user.id); throw e; }
  }
  async processDice(c: Context): Promise<boolean> {
    const m = c.m;
    if (!m.dice || !m.reply_to_message) return false;
    const d = this.db.one<DuelRow>("SELECT * FROM duels WHERE chat_id=? AND message_id=? AND state='active'", c.chat, m.reply_to_message.message_id);
    if (!d) return false;
    if (m.forward_origin || m.via_bot || m.edit_date || m.sender_chat || c.user.is_bot || m.date * 1000 < d.created_at - 1000 || m.date * 1000 > Date.now() + 30000) throw new Error('فقط پرتاب جدید خود بازیکن معتبر است؛ فوروارد، بات و پیام ویرایش‌شده قبول نیست.');
    const result = this.db.roll(d.id, c.user.id, m.dice.emoji, m.dice.value);
    await this.updateDuel(result); return true;
  }
  async moderation(c: Context): Promise<boolean> {
    // Fast exempt checks before any heavy work
    if (c.private) return false;
    if (isOwner(c.user.id)) return false;
    if (c.settings.trusted.includes(c.user.id)) return false;
    if (c.m.sender_chat?.id === c.chat) return false;
    if (await this.admin(c)) return false;

    const m = c.m, s = c.settings, time = Date.now();
    const isDuel = !!(m.dice && m.reply_to_message && this.db.one('SELECT id FROM duels WHERE chat_id=? AND message_id=? AND state=\'active\' AND (creator=? OR opponent=?)', c.chat, m.reply_to_message.message_id, c.user.id, c.user.id));
    let reason = this.db.blacklistMatch(c.chat, m) ? 'لیست سیاه' : filterReason(m, s, isDuel);
    if (s.quiet) reason = 'سکوت گروه';
    const hour = new Date(time + s.timezone * 60000).getUTCHours();
    if (s.nightEnabled && (s.nightStart === s.nightEnd || (s.nightStart < s.nightEnd ? hour >= s.nightStart && hour < s.nightEnd : hour >= s.nightStart || hour < s.nightEnd))) reason = 'سکوت شبانه';
    this.db.member(c.chat, c.user.id);
    const member = this.db.one<{flood_start:number;flood_count:number;last_message:number}>('SELECT flood_start,flood_count,last_message FROM members WHERE chat_id=? AND user_id=?', c.chat, c.user.id)!;
    if (!m.edit_date) {
      const count = time - member.flood_start < s.floodWindow * 1000 ? member.flood_count + 1 : 1;
      this.db.exec('UPDATE members SET flood_start=?,flood_count=?,last_message=? WHERE chat_id=? AND user_id=?', count === 1 ? time : member.flood_start, count, time, c.chat, c.user.id);
      if (s.antiflood && count > s.floodLimit) reason = 'ارسال سیل پیام';
      if (s.cooldown && time - member.last_message < s.cooldown * 1000) reason = 'فاصلهٔ کوتاه پیام';
    }
    if (!reason) return false;

    // Check bot's own permissions before attempting any deletion
    let botMember: ChatMember | null = null;
    try { botMember = await this.botMember(c.chat); } catch { return false; }
    const canDelete = botMember.status === 'creator' || (botMember.status === 'administrator' && botMember.can_delete_messages);
    if (!canDelete) {
      if (this.db.rate(`missing-delete:${c.chat}`, 1, 10*60000)) {
        this.db.log(0, c.chat, 'permissions.missing', 'can_delete_messages for moderation');
      }
      return false;
    }

    try {
      await this.api.remove(c.chat, m.message_id);
    } catch (e) {
      // Don't spam group with raw Telegram errors – log and silently skip
      this.db.log(0, c.chat, 'message.delete_failed', safeError(e));
      return false;
    }
    this.db.log(c.user.id, c.chat, 'message.filtered', reason);
    // For flood, don't spam warn messages – just delete. Warn only if user keeps spamming after deletion
    if (reason === 'ارسال سیل پیام') {
      if (this.db.rate(`floodwarn:${c.chat}:${c.user.id}`, 1, 60000)) {
        // Check restrict permission before warn that may mute/ban
        const canRestrict = botMember.status === 'creator' || (botMember.status === 'administrator' && botMember.can_restrict_members);
        if (!canRestrict) return true;
        await this.warn(c, c.user.id, reason).catch(() => {});
      }
      return true;
    }
    return true;
  }
  async newMembers(c: Context) {
    const members = c.m.new_chat_members || [];
    if (members.length > 5) {
      this.db.job(c.chat, 0, 'joins', { message: {
        message_id: c.m.message_id, date: c.m.date, chat: c.m.chat, from: c.user,
        message_thread_id: c.m.message_thread_id, new_chat_members: members.slice(5),
      } });
    }
    const me = await this.api.me();
    const needsRestriction = c.settings.captcha || c.settings.raid || c.settings.locks.includes('bots');
    const self = needsRestriction ? await this.member(c.chat, me.id) : null;
    const canRestrict = !self || self.status === 'creator' || (self.status === 'administrator' && self.can_restrict_members === true);
    if (!canRestrict && this.db.rate(`missing-restrict:${c.chat}`, 1, 10 * 60000)) {
      this.db.log(0, c.chat, 'permissions.missing', 'can_restrict_members');
      // Don't spam welcome with permission notice if bot just joined – send once per 10 min
      await this.say(c, 'ℹ️ پنل و بازی‌ها بدون دسترسی بن هم کار می‌کنند، اما برای بن، سکوت، کپچا و ضدهجوم به «مسدودکردن کاربران» نیاز دارم.').catch(() => {});
    }
    for (const user of members.slice(0, 5)) {
      this.db.ensureUser(user);
      if (isOwner(user.id) || user.id === me.id) continue;
      const context = { ...c, user };
      if (await this.admin(context) || ['left', 'kicked'].includes((await this.member(c.chat, user.id)).status)) continue;
      if (canRestrict && (c.settings.raid || (user.is_bot && c.settings.locks.includes('bots')))) {
        try {
          await this.api.call('banChatMember', { chat_id: c.chat, user_id: user.id, until_date: Math.floor(Date.now() / 1000) + 60 });
          await this.api.call('unbanChatMember', { chat_id: c.chat, user_id: user.id, only_if_banned: true });
          this.db.log(0, c.chat, 'member.raid_reject', String(user.id));
        } catch (e) {
          this.db.log(0, c.chat, 'member.raid_failed', safeError(e));
        }
        continue;
      }
      if (canRestrict && c.settings.captcha && !user.is_bot) {
        const key = token(5), index = randomInt(3), emojis = ['🍒', '💎', '🍀'];
        try {
          await this.mute(c.chat, user.id, Math.ceil(c.settings.captchaSeconds / 60) + 1);
        } catch (e) {
          this.db.log(0, c.chat, 'captcha.mute_failed', safeError(e));
          continue;
        }
        this.db.exec('INSERT OR REPLACE INTO captchas(chat_id,user_id,answer,expires_at) VALUES (?,?,?,?)', c.chat, user.id, `${key}:${index}`, Date.now() + c.settings.captchaSeconds * 1000);
        try {
          await this.say(c, `${this.name(user.id)} خوش اومدی! برای تأیید، ${emojis[index]} را بزن.\n⏱ ${fa(c.settings.captchaSeconds)} ثانیه فرصت داری.`, { inline_keyboard: [emojis.map((e, i) => ({ text: e, callback_data: `captcha:${user.id}:${key}:${i}` }))] });
        } catch (e) { this.db.exec('DELETE FROM captchas WHERE chat_id=? AND user_id=?', c.chat, user.id); try { await this.unmute(c.chat, user.id); } catch {} }
      }
      if (c.settings.welcome) await this.say(c, html(c.settings.welcome).replace(/\{name\}/g, this.name(user.id)).replace(/\{group\}/g, html(c.m.chat.title || 'گروه'))).catch(() => {});
    }
  }
  async callback(q: NonNullable<Update['callback_query']>) {
    if (!q.message || !q.data || q.data.length > 64 || q.message.chat.type === 'channel') return;
    this.db.ensureUser(q.from);
    const c = this.context(q.message, q.from);
    if (!this.db.rate(`cb:${q.from.id}`, 30, 60000)) { await this.api.answer(q.id, 'کمی صبر کن.'); return; }
    const [action, value, extra, last] = q.data.split(':');
    try {
      const known = this.db.group(c.chat);
      if (!c.private && (!known || known.active === 0)) {
        const self = await this.member(c.chat,(await this.api.me()).id);
        const present = ['creator','administrator','member'].includes(self.status) || self.status === 'restricted' && self.is_member === true;
        if (!present) throw new Error('بات دیگر عضو این گروه نیست؛ با لینک افزودن دوباره عضو کنید.');
        this.db.ensureGroup(c.chat,c.m.chat.title || 'گروه');
        this.db.exec('UPDATE groups SET active=1 WHERE id=?',c.chat);
        c.settings = this.db.settings(c.chat);
      }
      if (action === 'captcha') {
        if (Number(value) !== q.from.id) throw new Error('این تأیید برای تازه‌وارد مشخص‌شده است.');
        const challenge = this.db.one<{answer:string;expires_at:number}>('SELECT answer,expires_at FROM captchas WHERE chat_id=? AND user_id=?', c.chat, c.user.id);
        if (!challenge || challenge.expires_at <= Date.now()) throw new Error('مهلت تأیید تمام شده است.');
        if (challenge.answer !== `${extra}:${last}`) throw new Error('دکمهٔ خواسته‌شده در پیام را انتخاب کن.');
        await this.unmute(c.chat, c.user.id);
        this.db.exec('DELETE FROM captchas WHERE chat_id=? AND user_id=?', c.chat, c.user.id);
        await this.api.answer(q.id, 'خوش اومدی! تأیید شد.');
        await this.api.edit(c.chat, c.m.message_id, `✅ ${this.name(c.user.id)} تأیید شد.`); return;
      }
      if (['join', 'cancel'].includes(action)) {
        const d = this.db.duel(value);
        if (!d || d.chat_id !== c.chat || d.message_id !== c.m.message_id) throw new Error('پیام دوئل معتبر نیست.');
        if (!this.db.group(c.chat)?.active || this.db.group(c.chat)?.active !== 1) throw new Error('گروه فعال نیست.');
        if (action === 'join') {
          if (this.db.global().maintenance || !c.settings.games) throw new Error('شروع بازی فعلاً متوقف است.');
          const member = await this.member(c.chat, c.user.id);
          if (['left', 'kicked'].includes(member.status) || c.user.is_bot) throw new Error('باید عضو واقعی گروه باشید.');
        }
        const result = action === 'join' ? this.db.joinDuel(value, q.from.id) : this.db.cancelDuel(value, q.from.id);
        await this.api.answer(q.id, action === 'join' ? 'قبول شد؛ روی همین پیام تاس بفرست!' : 'شرط برگشت داده شد.');
        await this.updateDuel(result); return;
      }
      await this.requireAdmin(c.private ? { ...c, private: false } : c);
      if (c.private && !isOwner(c.user.id)) throw new Error('دسترسی ندارید.');
      if (action === 'dismiss') {
        this.db.consumeConfirm(value, c.user.id, c.chat);
        await this.api.answer(q.id, 'لغو شد.'); await this.api.edit(c.chat, c.m.message_id, '↩️ عملیات لغو شد.'); return;
      }
      if (action === 'confirm') {
        const pending = this.db.one<{action:string}>('SELECT action FROM confirmations WHERE id=?', value);
        if (pending?.action === 'purge') await this.requireAdmin(c, 'can_delete_messages');
        if (pending?.action === 'unpinall') await this.requireAdmin(c, 'can_pin_messages');
        const confirmation = this.db.consumeConfirm(value, c.user.id, c.chat);
        const result = await this.executeConfirmation(confirmation.action, JSON.parse(confirmation.payload), c.user.id, c.chat);
        await this.api.answer(q.id, 'تأیید شد.'); await this.api.edit(c.chat, c.m.message_id, result); return;
      }
      if (action === 'approve' || action === 'decline') {
        await this.requireAdmin(c, 'can_invite_users');
        await this.api.call(action === 'approve' ? 'approveChatJoinRequest' : 'declineChatJoinRequest', { chat_id: c.chat, user_id: integer(value, 1, Number.MAX_SAFE_INTEGER) });
        this.db.log(c.user.id, c.chat, `join.${action}`, value);
        await this.api.answer(q.id, 'انجام شد.'); await this.api.edit(c.chat, c.m.message_id, '✅ درخواست عضویت بررسی شد.'); return;
      }
      if (action === 'hint') {
        const command = COMMANDS.find(x => x.name === value);
        if (!command || command.role === 'owner') throw new Error('دستور نامعتبر');
        await this.api.answer(q.id, `${command.description}\n/${command.usage || command.name}\n${command.fa}`, true); return;
      }
      if (action === 'toggle' || action === 'lock') {
        await this.requireAdmin(c, 'can_change_info');
        if (action === 'toggle') {
          if (!['antiflood','captcha','raid','quiet','games','chatbot','nightEnabled','reports'].includes(value)) throw new Error('گزینه نامعتبر');
          c.settings = this.db.patchGroup(c.chat, { [value]: !c.settings[value as keyof GroupSettings] }, c.user.id);
        } else {
          if (!LOCKS.some(l => l[0] === value)) throw new Error('قفل ناشناخته');
          c.settings = this.db.patchGroup(c.chat, { locks: c.settings.locks.includes(value) ? c.settings.locks.filter(l => l !== value) : [...c.settings.locks, value] }, c.user.id);
        }
      }
      const page = action === 'lock' || action === 'locks' ? locksPanel(c.settings, integer(action === 'lock' ? extra : value, 0, 2)) : groupPanel(c.settings, action === 'panel' ? value : ['games','chatbot'].includes(value) ? 'games' : value === 'reports' ? 'welcome' : 'security');
      await this.api.answer(q.id, action === 'toggle' || action === 'lock' ? 'تنظیم ذخیره شد.' : '');
      await this.api.edit(c.chat, c.m.message_id, page.text, page.keyboard);
    } catch (e) {
      const msg = safeError(e);
      // Don't leak raw Telegram API errors to users – show friendly version
      const friendly = msg.includes('not enough rights') ? 'برای این کار به دسترسی مدیریت نیاز دارم.' : msg;
      await this.api.answer(q.id, friendly, true);
      this.db.log(q.from.id, c.chat, 'callback.denied_or_failed', msg);
    }
  }
  async handle(update: Update) {
    this.members.clear();
    if (update.callback_query) { await this.callback(update.callback_query); return; }
    if (update.my_chat_member) {
      const event = update.my_chat_member;
      if (!['group','supergroup'].includes(event.chat.type)) return;
      const previous = this.db.group(event.chat.id);
      const g = this.db.ensureGroup(event.chat.id, event.chat.title || 'گروه');
      const joined = ['member','administrator','creator'].includes(event.new_chat_member.status) || event.new_chat_member.status === 'restricted' && event.new_chat_member.is_member === true;
      if (g.active !== -1) this.db.exec('UPDATE groups SET active=? WHERE id=?', joined ? 1 : 0, g.id);
      this.db.log(event.from.id, g.id, 'bot.membership', event.new_chat_member.status);
      const arrived = !previous || ['left','kicked'].includes(event.old_chat_member?.status || '') || event.old_chat_member?.status === 'member' && event.new_chat_member.status === 'administrator';
      if (joined && arrived && g.active !== -1 && this.db.rate(`group-hello:${g.id}`, 1, 30000)) {
        try {
          const me = await this.api.me(), link = botLinks(me);
          await this.api.send(g.id, `<b>✅ نُوا به این گروه وصل شد.</b>\nمدیر گروه می‌تواند دکمهٔ زیر را بزند یا این دستور را بفرستد:\n<code>${html(link.panelCommand)}</code>\n\nاگر بات ادمین باشد، «پنل» فارسی هم کار می‌کند.${!event.new_chat_member.can_restrict_members ? '\nℹ️ ندادن Ban Users مانع پنل نیست؛ فقط بن، سکوت، کپچا و ضدهجوم به آن نیاز دارند.' : ''}`, {inline_keyboard:[[{text:'⚙️ باز کردن پنل گروه',callback_data:'panel:home'}]]});
        } catch(error) { this.db.log(0,g.id,'group.welcome_failed',safeError(error)); }
      }
      return;
    }
    if (update.chat_join_request) {
      const request = update.chat_join_request;
      this.db.ensureUser(request.from); this.db.ensureGroup(request.chat.id, request.chat.title || 'گروه');
      if (this.db.group(request.chat.id)?.active !== 1) return;
      const s = this.db.settings(request.chat.id);
      if (s.joinMode !== 'manual' || s.raid) await this.api.call(s.raid || s.joinMode === 'decline' ? 'declineChatJoinRequest' : 'approveChatJoinRequest', { chat_id: request.chat.id, user_id: request.from.id });
      else await this.api.send(request.chat.id, `🙋 درخواست عضویت ${this.name(request.from.id)}`, { inline_keyboard: [[{ text: '✅ تأیید', callback_data: `approve:${request.from.id}` }, { text: '❌ رد', callback_data: `decline:${request.from.id}` }]] });
      return;
    }
    const message = update.message || update.edited_message;
    if (!message?.from || message.chat.type === 'channel') return;
    if (update.edited_message) message.edit_date ||= Math.floor(Date.now() / 1000);
    this.db.ensureUser(message.from);
    if (message.chat.type !== 'private') this.db.ensureGroup(message.chat.id, message.chat.title || 'گروه');
    const c = this.context(message, message.from);
    if (!c.private) this.db.track(message);
    if (!c.private && this.db.group(c.chat)?.active !== 1 && !isOwner(c.user.id)) return;
    try {
      if (message.new_chat_members) { await this.newMembers(c); return; }
      if (message.left_chat_member) {
        if (c.settings.goodbye) await this.say(c, html(c.settings.goodbye).replace(/\{name\}/g, html(message.left_chat_member.first_name)).replace(/\{group\}/g, html(message.chat.title || 'گروه'))).catch(() => {});
        return;
      }
      if (await this.moderation(c)) return;
      if (message.edit_date) return;
      if (message.sender_chat) {
        const me = await this.api.me();
        if (message.sender_chat.id === c.chat && !message.forward_origin && parseCommand(message.text || '',me.username)?.command.name === 'panel' && this.db.rate(`anonymous-panel:${c.chat}`,1,60000)) {
          await this.say(c,'ℹ️ پیام شما با هویت ناشناس مدیر ارسال شده است. برای کنترل دسترسی، از حالت ناشناس خارج شوید و دوباره «پنل» بفرستید.').catch(() => {});
        }
        return;
      }
      if (c.user.is_bot || message.forward_origin || message.via_bot) return;
      if (await this.processDice(c)) return;
      const me = await this.api.me();
      const parsed = parseCommand(message.text || '', me.username);
      if (parsed && (!c.settings.commandsOnlySlash || parsed.slashed || c.private || isOwner(c.user.id))) {
        if (!this.db.rate(`cmd:${c.user.id}`, isOwner(c.user.id) ? 100 : 18, 60000)) return;
        if (this.db.global().maintenance && !isOwner(c.user.id) && parsed.command.role === 'member' && !['selfstop','selfstatus','cancelduel'].includes(parsed.command.name)) throw new Error('ربات در حالت نگهداری است؛ مدیریت امنیت همچنان فعال است.');
        if (parsed.command.role === 'owner') {
          if (!isOwner(c.user.id)) throw new Error('این فرمان فقط برای مالک سراسری است.');
          await executeOwner(this, c, parsed); return;
        }
        if (parsed.command.role === 'admin') await this.requireAdmin(c);
        await executeCommand(this, c, parsed); return;
      }
      if (!c.private) {
        const text = normalize(message.text || '').toLowerCase();
        const answer = this.db.one<{text:string}>('SELECT text FROM answers WHERE chat_id=? AND name=?', c.chat, text);
        if (answer && this.db.rate(`auto:${c.chat}`, 1, 15000)) await this.say(c, html(answer.text)).catch(() => {});
        else if (c.settings.chatbot && message.reply_to_message?.from?.id === me.id && this.db.rate(`chatty:${c.chat}`, 1, 20000)) {
          const lower = text;
          let reply = '';
          if (/(سلام|درود|hi|hello)/i.test(lower)) reply = ['سلام رفیق! 😎 چه خبر؟', 'درود! آماده‌ام 💚', 'سلام! چطور می‌تونم کمکت کنم؟ ✨'][randomInt(3)];
          else if (/(فونت|font)/i.test(lower)) reply = 'برای فونت خفن: `فونت نوا گارد` رو بزن 🔤 ۷ استایل می‌ده!';
          else if (/(دوئل|بازی|تاس)/i.test(lower)) reply = 'دوئل می‌خوای؟ `دوئل 🎲 ۵۰` بزن، حریف دکمه قبول رو می‌زنه! 🎲';
          else if (/(راهنما|help)/i.test(lower)) reply = 'راهنما رو می‌خوای؟ `راهنما` بزن — ۱۳۵ دستور دسته‌بندی شده دارم 📖';
          else if (/(جوک|لطیفه)/i.test(lower)) {
            const jokes = ['تاس من همیشه با اعتمادبه‌نفس میاد پایین 😎', 'گروه شما از شارژر من پر انرژی‌تره 🔋', 'اومدم ۵ دقیقه گوشی ببینم، شد ۵ فصل 📱'];
            reply = jokes[randomInt(jokes.length)];
          } else {
            const lines = c.settings.style === 'formal' ? [
              'در خدمتم. برای دیدن امکانات «راهنما» را ارسال کنید.',
              'برای بازی، «دوئل 🎲 ۵۰» را امتحان کنید.',
              'سوالی دارید؟ «راهنما» را بفرستید تا همهٔ قابلیت‌ها را ببینید.',
              'با «فونت متن» می‌توانید فونت فانتزی بسازید.',
            ] : c.settings.style === 'friendly' ? [
              'سلام رفیق 🌱 اگر کمکی خواستی، «راهنما» رو بفرست.',
              'خوشحالم اینجایی ✨ یه دوئل دوستانه شروع کنیم؟',
              'قوانین رو رعایت کنیم و از کنار هم بودن لذت ببریم 💚',
              'چه خبر؟ اگه حوصله‌ت سر رفته «جوک» بفرست 😄',
              'بیا یه فونت خفن بسازیم! «فونت سلام» رو امتحان کن ✨',
            ] : [
              'من حاضرم، حریف کجاست؟ 😏 با «دوئل 🎲 ۵۰» شروع کن!',
              'هواتو دارم رفیق ✨ «راهنما» رو بزن ببین چه خبرهاست.',
              'گروه بدون شما سوت و کوره! یه «حقیقت» بفرست؟ 👀',
              'من فقط تاس می‌ریزم، تقصیر شانس رو گردن من ننداز 😂',
              'بیا یه فونت خفن بسازیم! «فونت سلام» رو امتحان کن ✨',
              'حوصله‌ت سر رفته؟ «بازیها» رو بزن!',
              'می‌خوای مخاطب‌ها رو سریع اد کنی؟ سلف گولاخ با .contacts و .filter داره!',
              '۱۳۵ قابلیت دارم، بدون ادعای ۱۰۰۰تایی الکی — «راهنما» رو بزن 📚',
              'می‌خوای گروه رو بترکونی؟ «قفل همه» و «خوشامد» رو تنظیم کن 🚀',
            ];
            reply = lines[randomInt(lines.length)];
          }
          await this.say(c, reply).catch(() => {});
        }
      }
    } catch (e) {
      const raw = safeError(e);
      this.db.log(c.user.id, c.chat, 'command_or_moderation.failed', raw);
      // Filter technical Telegram errors – show friendly message
      let friendly = raw;
      if (raw.includes('not enough rights to restrict') || raw.includes('not enough rights to pin') || raw.includes('not enough rights')) {
        friendly = 'برای این کار به دسترسی مدیریت مربوطه نیاز دارم. لطفاً دسترسی‌های بات را در تنظیمات گروه بررسی کنید.';
      } else if (raw.includes('Bad Request')) {
        friendly = raw.replace('تلگرام: Bad Request:', '').trim() || 'درخواستی که فرستادید قابل اجرا نیست.';
      } else if (raw.includes('عدد باید بین')) {
        friendly = 'عدد وارد شده معتبر نیست. لطفاً عدد کوچکتری وارد کنید.';
      }
      if (this.db.rate(`errors:${c.chat}:${c.user.id}`, 2, 60000)) {
        await this.say(c, `⚠️ ${html(friendly)}`).catch(() => {});
      }
    }
  }
  async jobs() {
    this.members.clear();
    for (const d of this.db.expireDuels().slice(0, 5)) {
      try { await this.updateDuel(d); } catch (e) { this.db.log(0, d.chat_id, 'duel.notification_failed', safeError(e)); }
    }
    const captchas = this.db.all<{chat_id:number;user_id:number}>('SELECT chat_id,user_id FROM captchas WHERE expires_at<=? LIMIT 3', Date.now());
    for (const item of captchas) {
      try {
        const c = this.context({ chat: { id: item.chat_id, type: 'supergroup' }, message_id: 0, date: 0 }, { id: item.user_id, first_name: '' });
        if (!isOwner(item.user_id) && !await this.admin(c)) {
          await this.api.call('banChatMember', { chat_id: item.chat_id, user_id: item.user_id, until_date: Math.floor(Date.now() / 1000) + 60 });
          await this.api.call('unbanChatMember', { chat_id: item.chat_id, user_id: item.user_id, only_if_banned: true });
        }
        this.db.exec('DELETE FROM captchas WHERE chat_id=? AND user_id=?', item.chat_id, item.user_id);
      } catch (e) {
        this.db.exec('DELETE FROM captchas WHERE chat_id=? AND user_id=?', item.chat_id, item.user_id);
        this.db.log(0, item.chat_id, 'captcha.expiry_failed', safeError(e));
      }
    }
    const jobs = this.db.all<{id:string;chat_id:number;actor:number;type:string;payload:string;attempts:number}>("SELECT * FROM jobs WHERE state='pending' AND next_at<=? ORDER BY next_at LIMIT 2", Date.now());
    for (const job of jobs) {
      try {
        const g = this.db.group(job.chat_id);
        if (!g || g.active !== 1) throw new Error('گروه مقصد فعال نیست.');
        if (job.type === 'joins') {
          this.db.exec("UPDATE jobs SET state='sending' WHERE id=?", job.id);
          const message = JSON.parse(job.payload).message as Message;
          await this.newMembers(this.context(message, message.from!));
          this.db.exec("UPDATE jobs SET state='done',payload='{}' WHERE id=?", job.id);
          continue;
        }
        const c = this.context({ message_id: 0, date: 0, chat: { id: job.chat_id, type: 'supergroup' } }, { id: job.actor, first_name: 'مدیر' });
        await this.requireAdmin(c, job.type === 'purge' ? 'can_delete_messages' : undefined);
        const payload = JSON.parse(job.payload);
        if (job.type === 'schedule') {
          if (payload.pin) await this.requireAdmin(c, 'can_pin_messages');
          this.db.exec("UPDATE jobs SET state='sending' WHERE id=?", job.id);
          await this.announce(job.chat_id, payload.text, !!payload.pin, job.actor);
          this.db.exec("UPDATE jobs SET state='done',payload='{}' WHERE id=?", job.id);
        } else if (job.type === 'purge') {
          const batch: number[] = payload.ids.slice(0, 100);
          const eligible = new Set(this.db.eligibleMessages(job.chat_id));
          const ids = batch.filter(id => eligible.has(id));
          if (ids.length) {
            await this.api.call('deleteMessages', { chat_id: job.chat_id, message_ids: ids });
            this.db.atomic(() => { for (const id of ids) this.db.exec('DELETE FROM messages WHERE chat_id=? AND id=?', job.chat_id, id); });
          }
          payload.ids = payload.ids.slice(batch.length); payload.processed += ids.length;
          this.db.exec('UPDATE jobs SET state=?,payload=?,next_at=?,attempts=0 WHERE id=?', payload.ids.length ? 'pending' : 'done', JSON.stringify(payload), Date.now() + 2000, job.id);
          if (!payload.ids.length) {
            this.db.log(job.actor, job.chat_id, 'purge.finished', `${payload.processed} IDs submitted; Telegram can skip missing messages`);
            await this.api.send(job.chat_id, `🧹 پاک‌سازی ${job.id} تمام شد.\n${fa(payload.processed)} شناسه برای حذف پردازش شد. تلگرام ممکن است پیام‌های ناموجود را نادیده بگیرد؛ این عدد شمارش قطعیِ حذف نیست.`);
          }
        }
      } catch (e) {
        const terminal = ['schedule', 'joins'].includes(job.type) || job.attempts >= 4;
        this.db.exec('UPDATE jobs SET state=?,attempts=attempts+1,next_at=? WHERE id=?', terminal ? 'failed' : 'pending', Date.now() + 60000 * (job.attempts + 1), job.id);
        this.db.log(job.actor, job.chat_id, 'job.failed', `${job.id}: ${safeError(e)}`);
      }
    }
  }
}
