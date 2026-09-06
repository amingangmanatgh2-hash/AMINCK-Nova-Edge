import { COMMANDS } from './commands';
import type { Database } from './database';
import { Telegram, TelegramError } from './telegram';
import type { Chat, ChatMember, Env, User } from './types';
import { integer, normalize, safeError, token } from './utils';
import { openCredentials, sealCredentials } from './vault';
import type { BotCredentials, VaultEnvelope } from './vault';

const VAULT_KEY = 'bot.credentials.v1';
export const validBotToken = (value: unknown): value is string => typeof value === 'string'
  && value.length <= 256 && /^[1-9]\d{4,15}:[A-Za-z0-9_-]{25,200}$/.test(value)
  && Number.isSafeInteger(Number(value.split(':')[0]));
const validSecret = (value: unknown): value is string => typeof value === 'string'
  && /^[A-Za-z0-9_-]{32,256}$/.test(value) && !value.startsWith('REPLACE_');
export interface BotInfo extends User { is_bot: true; can_join_groups?: boolean; can_read_all_group_messages?: boolean }
interface CurrentCredentials { credentials: (Partial<BotCredentials> & {botToken: string; source: 'panel' | 'environment'}) | null; locked: boolean }
interface WebhookInfo { url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string }
export type ConnectionStage = 'needs_token' | 'vault_locked' | 'token_invalid' | 'unreachable' | 'webhook_missing' | 'webhook_elsewhere' | 'webhook_error' | 'needs_repair' | 'waiting_for_update' | 'connected';
export interface ConnectionStatus {
  configured: boolean; tokenValid: boolean; source: 'panel' | 'environment' | null;
  stage: ConnectionStage; message: string; bot: BotInfo | null;
  registeredHere: boolean; canReceive: boolean; receiving: boolean;
  addGroupUrl: string | null; adminGroupUrl: string | null; startUrl: string | null;
  panelCommand: string; webhook: null | {url: string; expectedUrl: string; pending_update_count: number; last_error_date: number | null; last_error_message: string | null};
  lastReceivedAt: number | null; lastProcessedAt: number | null; lastGroupAt: number | null;
  groupCount: number; queue: {pending: number; failed: number}; warnings: string[];
}
function publicBot(me: BotInfo): BotInfo {
  if (!me || !Number.isSafeInteger(me.id) || me.id <= 0 || me.is_bot !== true
    || typeof me.first_name !== 'string' || !me.username || !/^[A-Za-z0-9_]{1,64}$/.test(me.username)) throw new Error('پاسخ شناسایی بات از تلگرام معتبر نیست.');
  return { id: me.id, first_name: me.first_name, username: me.username, is_bot: true,
    can_join_groups: me.can_join_groups, can_read_all_group_messages: me.can_read_all_group_messages };
}
export function botLinks(me: Pick<User, 'username'> | null) {
  if (!me?.username || !/^[A-Za-z0-9_]{1,64}$/.test(me.username)) return {addGroupUrl:null,adminGroupUrl:null,startUrl:null,panelCommand:'/panel'};
  const base = `https://t.me/${me.username}`;
  return {
    addGroupUrl: `${base}?startgroup=setup`,
    // This optional link asks for management rights. Restrict is NOT a prerequisite for /panel.
    adminGroupUrl: `${base}?startgroup=setup&admin=delete_messages+restrict_members+pin_messages+invite_users+change_info`,
    startUrl: `${base}?start=setup`, panelCommand: `/panel@${me.username}`,
  };
}
function displayWebhook(raw: string, expected: string): string {
  if (raw === expected || !raw) return raw;
  try { return new URL(raw).origin + '/…'; } catch { return 'آدرس دیگر'; }
}
function telegramHint(error: unknown, credentials?: Partial<BotCredentials> | null): string {
  if (error instanceof TelegramError) {
    if ([401, 404].includes(error.code)) return 'توکن بات نامعتبر یا باطل شده است؛ توکن جدید همان بات را از BotFather کپی کنید.';
    if (error.code === 429) return `تلگرام درخواست‌ها را محدود کرده؛ ${error.retryAfter || 60} ثانیه دیگر بررسی کنید.`;
    if (error.code >= 500) return 'ارتباط با تلگرام کامل نشد. کمی بعد دوباره «بررسی اتصال» را بزنید.';
  }
  return safeError(error, [credentials?.botToken || '', credentials?.webhookSecret || '']);
}
export function groupReference(input: unknown): string | number {
  if (typeof input === 'number') return integer(input, -Number.MAX_SAFE_INTEGER, -1);
  if (typeof input !== 'string' || input.length > 300) throw new Error('لینک عمومی گروه، @username یا شناسهٔ عددی گروه را وارد کنید.');
  const value = normalize(input);
  if (/^-\d+$/.test(value)) return integer(value, -Number.MAX_SAFE_INTEGER, -1);
  let username = value;
  if (/^(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\//i.test(value)) {
    const url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value);
    if (url.username || url.password || url.port || url.search || url.hash || !['t.me','telegram.me','telegram.dog'].includes(url.hostname)) throw new Error('لینک عمومی سادهٔ گروه را بدون پارامتر اضافی وارد کنید.');
    const path = url.pathname.replace(/^\/+|\/+$/g, '');
    if (path.startsWith('+') || path.startsWith('joinchat/')) throw new Error('بات نمی‌تواند با لینک دعوت خصوصی خودش وارد شود. «افزودن بات در تلگرام» را بزنید، گروه را انتخاب کنید و سپس /panel بفرستید.');
    username = path;
  }
  username = username.replace(/^@/, '');
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) throw new Error('برای گروه خصوصی از دکمهٔ افزودن در تلگرام یا شناسهٔ -100… استفاده کنید؛ لینک عمومی باید مانند t.me/groupname باشد.');
  return '@' + username;
}
export function groupCapabilities(member: ChatMember, me: BotInfo, defaults?: Record<string,boolean>) {
  const isMember = ['creator','administrator','member'].includes(member.status) || member.status === 'restricted' && member.is_member === true;
  const admin = member.status === 'administrator' || member.status === 'creator';
  return {
    isMember, admin,
    panel: isMember && (admin || (member.status === 'restricted' ? member.can_send_messages !== false : defaults?.can_send_messages !== false)),
    readAllMessages: isMember && (admin || me.can_read_all_group_messages === true),
    delete: admin && member.can_delete_messages === true,
    restrict: admin && member.can_restrict_members === true,
    pin: admin && member.can_pin_messages === true,
    changeInfo: admin && member.can_change_info === true,
    invite: admin && member.can_invite_users === true,
  };
}

export class BotConnection {
  private cache: { envelope: string; password: string; credentials: BotCredentials } | null = null;
  constructor(readonly db: Database, readonly env: Env) {}
  async current(): Promise<CurrentCredentials> {
    const envelope = this.db.meta<VaultEnvelope | null>(VAULT_KEY, null);
    if (envelope) {
      try {
        const serialized = JSON.stringify(envelope), password = this.env.PANEL_PASSWORD || '';
        let credentials = this.cache?.envelope === serialized && this.cache.password === password ? this.cache.credentials : null;
        if (!credentials) credentials = await openCredentials(envelope, password);
        if (!validBotToken(credentials.botToken) || !validSecret(credentials.webhookSecret)) throw new Error('Invalid credentials');
        this.cache = { envelope: serialized, password, credentials };
        return { credentials: {...credentials,source:'panel'}, locked:false };
      } catch { return { credentials:null,locked:true }; }
    }
    // Existing installations keep working without re-entering their Cloudflare secrets.
    return { credentials: validBotToken(this.env.BOT_TOKEN) ? {
      botToken: this.env.BOT_TOKEN, webhookSecret: validSecret(this.env.WEBHOOK_SECRET) ? this.env.WEBHOOK_SECRET : undefined,
      source:'environment',
    } : null, locked:false };
  }
  async runtimeEnv(): Promise<Env> {
    const {credentials} = await this.current();
    return {...this.env,BOT_TOKEN:credentials?.botToken,WEBHOOK_SECRET:credentials?.webhookSecret};
  }
  private remember(me: BotInfo) {
    const bound = this.db.meta<number | null>('bot.boundId', null) || this.db.meta<User | null>('bot.me', null)?.id;
    if (bound && bound !== me.id) throw new Error('این پنل به بات دیگری متصل بوده است. توکن تازهٔ همان بات را وارد کنید؛ برای بات متفاوت یک نصب جدا بسازید.');
    this.db.setMeta('bot.me', me); this.db.setMeta('bot.boundId', me.id);
  }
  private base(): ConnectionStatus {
    const lastReceivedAt = this.db.meta<number | null>('connection.lastReceivedAt', null);
    return {
      configured:false,tokenValid:false,source:null,stage:'needs_token',message:'فقط توکن جدید بات را وارد کنید؛ بقیهٔ اتصال را خود پنل انجام می‌دهد.',bot:null,
      registeredHere:false,canReceive:false,receiving:false,...botLinks(null),webhook:null,
      lastReceivedAt,lastProcessedAt:this.db.meta('connection.lastProcessedAt',null),lastGroupAt:this.db.meta('connection.lastGroupAt',null),
      groupCount:this.db.one<{n:number}>('SELECT COUNT(*) n FROM groups WHERE active=1')!.n,
      queue:{pending:this.db.one<{n:number}>("SELECT COUNT(*) n FROM updates WHERE status='pending'")!.n,failed:this.db.one<{n:number}>("SELECT COUNT(*) n FROM updates WHERE status IN ('failed','uncertain')")!.n},warnings:[],
    };
  }
  async status(origin: string): Promise<ConnectionStatus> {
    const result = this.base(), {credentials,locked} = await this.current();
    if (locked) return {...result,stage:'vault_locked',message:'رمز پنل تغییر کرده یا اطلاعات اتصال قابل خواندن نیست؛ توکن جدید همان بات را دوباره ثبت کنید.'};
    if (!credentials) return result;
    result.configured = true; result.source = credentials.source;
    const api = new Telegram({...this.env,BOT_TOKEN:credentials.botToken,WEBHOOK_SECRET:credentials.webhookSecret},this.db);
    try {
      const me = publicBot(await api.call<BotInfo>('getMe'));
      if (me.id !== Number(credentials.botToken.split(':')[0])) throw new Error('شناسهٔ بات با توکن هماهنگ نیست.');
      this.remember(me);
      result.bot = me; result.tokenValid = true; Object.assign(result,botLinks(me));
      if (me.can_join_groups === false) {
        result.addGroupUrl = null; result.adminGroupUrl = null;
        result.warnings.push('افزودن این بات به گروه در BotFather غیرفعال است؛ در BotFather گزینهٔ Allow Groups را روشن کنید.');
      }
      const hook = await api.call<WebhookInfo>('getWebhookInfo'), expected = origin + '/telegram';
      const configuredAt = this.db.meta('connection.configuredAt',0);
      const errorMessage = hook.last_error_message ? safeError(new Error(hook.last_error_message),[credentials.botToken,credentials.webhookSecret || '']) : null;
      result.webhook = {url:displayWebhook(hook.url,expected),expectedUrl:expected,pending_update_count:hook.pending_update_count || 0,last_error_date:hook.last_error_date || null,last_error_message:errorMessage};
      result.registeredHere = hook.url === expected;
      result.canReceive = result.registeredHere && !!credentials.webhookSecret;
      if (!credentials.webhookSecret) { result.stage = 'needs_repair'; result.message = 'توکن درست است، اما کلید اتصال داخلی هنوز ساخته نشده. «اتصال خودکار» را بزنید.'; }
      else if (!hook.url) { result.stage='webhook_missing'; result.message='توکن درست است، ولی تلگرام هنوز پیام‌ها را به این پنل نمی‌فرستد. «اتصال خودکار» را بزنید.'; }
      else if (!result.registeredHere) { result.stage='webhook_elsewhere'; result.message='پیام‌های این بات به یک آدرس دیگر می‌روند، نه این پنل. «اتصال به همین پنل» را بزنید.'; }
      else if (hook.last_error_date && hook.last_error_date*1000 > Math.max(result.lastReceivedAt || 0,configuredAt)) { result.stage='webhook_error'; result.message='تلگرام برای رساندن پیام به این پنل خطا ثبت کرده است. اتصال را تعمیر و دوباره در بات /start بفرستید.'; }
      else if (result.lastReceivedAt && result.lastReceivedAt >= configuredAt) { result.stage='connected'; result.receiving=true; result.message='ارتباط برقرار است و پیام تلگرام به این پنل رسیده است.'; }
      else { result.stage='waiting_for_update'; result.message='اتصال ثبت شد؛ حالا «آزمایش در تلگرام» را بزنید و Start کنید تا دریافت پیام هم تأیید شود.'; }
      if (me.can_read_all_group_messages === false) result.warnings.push('اگر بات ادمین نباشد، با Privacy روشن ممکن است «پنل» فارسی را نبیند. دستور '+result.panelCommand+' را امتحان کنید یا بات را ادمین کنید.');
      if (result.queue.failed) result.warnings.push('بعضی آپدیت‌ها پردازش نشده‌اند؛ بخش گزارش رویدادها را بررسی کنید.');
    } catch(error) {
      result.stage = error instanceof TelegramError && [401,404].includes(error.code) ? 'token_invalid' : 'unreachable';
      result.message = telegramHint(error,credentials);
    }
    return result;
  }
  async setup(origin: string, input: unknown, actor: number) {
    if (new URL(origin).protocol !== 'https:') throw new Error('ثبت بات فقط روی آدرس HTTPS پنل خودتان امکان‌پذیر است؛ نه نسخهٔ محلی یا نمایشی.');
    if (!this.env.PANEL_PASSWORD || this.env.PANEL_PASSWORD.length < 16 || this.env.PANEL_PASSWORD.startsWith('REPLACE_')) throw new Error('ابتدا رمز پنل را هنگام نصب تعیین کنید.');
    const {credentials,locked} = await this.current();
    if (input !== undefined && typeof input !== 'string') throw new Error('توکن بات باید متن باشد.');
    const candidate = typeof input === 'string' ? input.trim() : credentials?.botToken;
    if (!validBotToken(candidate)) throw new Error(locked ? 'توکن همان بات را دوباره وارد کنید تا با رمز جدید ذخیره شود.' : 'توکن کامل را از BotFather کپی کنید؛ شامل شناسهٔ عددی، دو نقطه و رشتهٔ بعد از آن است.');
    const secret = credentials?.webhookSecret || token(32);
    const api = new Telegram({...this.env,BOT_TOKEN:candidate,WEBHOOK_SECRET:secret},this.db);
    let me: BotInfo;
    try { me = publicBot(await api.call<BotInfo>('getMe')); }
    catch(error) { throw new Error(telegramHint(error,{botToken:candidate,webhookSecret:secret})); }
    if (me.id !== Number(candidate.split(':')[0])) throw new Error('شناسهٔ توکن با پاسخ تلگرام هماهنگ نیست.');
    // Check identity before any durable or external configuration change.
    const bound = this.db.meta<number | null>('bot.boundId',null) || this.db.meta<User | null>('bot.me',null)?.id;
    if (bound && bound !== me.id) throw new Error('این پنل برای بات دیگری ثبت شده است؛ توکن جدید همان بات را وارد کنید یا برای بات جدید نصب جدا بسازید.');
    const sealed = await sealCredentials({botToken:candidate,webhookSecret:secret},this.env.PANEL_PASSWORD);
    this.db.atomic(()=>{
      this.db.setMeta(VAULT_KEY,sealed); this.remember(me);
      this.db.log(actor,null,'bot.credentials.saved',`bot_id=${me.id}; encrypted`);
    });
    this.cache = null;
    let warning: string | null = null, registered = false;
    try {
      await api.call('setWebhook',{url:origin+'/telegram',secret_token:secret,allowed_updates:['message','edited_message','callback_query','my_chat_member','chat_join_request'],drop_pending_updates:false,max_connections:2});
      this.db.setMeta('connection.configuredAt',Date.now());
      this.db.log(actor,null,'webhook.setup'); registered = true;
    } catch(error) {
      warning = 'توکن تأیید و ذخیره شد، اما ثبت اتصال کامل نشد: '+telegramHint(error,{botToken:candidate,webhookSecret:secret});
      this.db.log(actor,null,'webhook.setup_failed',warning);
    }
    if (registered) {
      try {
        await api.call('setMyCommands',{commands:COMMANDS.filter(c=>['start','panel','help','id','rules','duel','games','balance','daily','profile','leaderboard','self','selfstop','report'].includes(c.name)).map(c=>({command:c.name,description:c.description.slice(0,100)}))});
      } catch { warning = 'اتصال ثبت شد، اما منوی دستورها نصب نشد؛ /panel همچنان قابل استفاده است.'; }
    }
    const connection = await this.status(origin);
    return { ok:registered && connection.canReceive, saved:true, username:me.username, connection, warning };
  }
  async groupDiagnostic(chat: string | number) {
    const current = await this.current();
    if (!current.credentials) throw new Error('ابتدا توکن بات را در بخش «ثبت و اتصال بات» وارد کنید.');
    const api = new Telegram(await this.runtimeEnv(),this.db);
    const me = publicBot(await api.call<BotInfo>('getMe'));
    this.remember(me);
    let group: Chat, member: ChatMember;
    try {
      group = await api.call<Chat>('getChat',{chat_id:chat});
      if (!['group','supergroup'].includes(group.type) || !Number.isSafeInteger(group.id) || group.id >= 0) throw new Error('این آدرس مربوط به گروه نیست؛ کانال و گفت‌وگوی خصوصی پشتیبانی نمی‌شوند.');
      member = await api.call<ChatMember>('getChatMember',{chat_id:group.id,user_id:me.id});
      if (member.user?.id !== me.id) throw new Error('پاسخ عضویت بات معتبر نیست.');
    } catch(error) {
      if (error instanceof TelegramError && [400,403].includes(error.code)) throw new Error('بات این گروه را پیدا نمی‌کند یا هنوز عضو آن نیست. با دکمهٔ «افزودن بات در تلگرام» اضافه‌اش کنید و سپس دوباره بررسی کنید.');
      throw error;
    }
    const capabilities = groupCapabilities(member,me,group.permissions), warnings: string[] = [];
    if (!capabilities.isMember) warnings.push('بات الان عضو این گروه نیست؛ دوباره از لینک افزودن استفاده کنید.');
    else {
      if (!capabilities.panel) warnings.push('بات اجازهٔ ارسال پیام در این گروه را ندارد؛ محدودیت ارسالش را در تلگرام بردارید.');
      if (!capabilities.readAllMessages) warnings.push('برای دیدن دستور فارسی و همهٔ پیام‌ها، بات را ادمین کنید؛ فعلاً '+botLinks(me).panelCommand+' را بفرستید.');
      if (!capabilities.restrict) warnings.push('Ban/Restrict Users داده نشده: فقط بن، سکوت، کپچا و ضدهجوم محدود می‌شوند؛ پنل به این دسترسی نیاز ندارد.');
      if (!capabilities.delete) warnings.push('برای پاک‌سازی و فیلتر پیام، Delete Messages را بدهید.');
      if (!capabilities.pin) warnings.push('برای سنجاق‌کردن، Pin Messages را بدهید.');
    }
    return {group:{id:group.id,title:group.title || 'گروه',type:group.type},status:member.status,capabilities,warnings,...botLinks(me)};
  }
  async recoverGroup(input: unknown, actor: number) {
    const diagnostic = await this.groupDiagnostic(groupReference(input));
    if (!diagnostic.capabilities.isMember) throw new Error('بات عضو این گروه نیست. این فرم بات را با لینک دعوت وارد نمی‌کند؛ دکمهٔ افزودن در تلگرام را بزنید.');
    const {group} = diagnostic;
    const row = this.db.ensureGroup(group.id,group.title);
    if (row.active !== -1) this.db.exec('UPDATE groups SET active=1 WHERE id=?',group.id);
    else diagnostic.warnings.push('این گروه با دستور مالک متوقف شده است؛ برای فعال‌کردن، دستور unblockgroup را از حساب مالک اجرا کنید.');
    this.db.log(actor,group.id,'group.recovered','membership verified');
    return {...diagnostic,active:this.db.group(group.id)!.active};
  }
}
