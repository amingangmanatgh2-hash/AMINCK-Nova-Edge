import { Bot } from './bot';
import { BotConnection } from './connection';
import { passwordStamp } from './vault';
import { COMMANDS } from './commands';
import { DEFAULT_GLOBAL, GAMES, HOUR, LOCKS, OWNERS, VERSION, isOwner } from './config';
import { Database } from './database';
import { demoData } from './demo';
import type { Env, GlobalSettings, GroupRow, Session, Update } from './types';
import { hash, integer, json, safeError, secureEqual, token } from './utils';

const SECURITY: Record<string,string> = {
  'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'self' https://*.arena.ai https://arena.ai https://*.e2b.app",
};
async function boundedBody(request: Request): Promise<ArrayBuffer | null> {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 131072) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result.buffer;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let response: Response;
    if (request.method === 'OPTIONS') response = new Response(null,{status:405}); // No cross-origin API surface.
    else if (url.pathname === '/health') response = json({ok:true,service:'nova-guard',version:VERSION});
    else if (url.pathname === '/telegram' || url.pathname.startsWith('/api/')) {
      if (['POST','PUT','PATCH'].includes(request.method)) {
        const size = Number(request.headers.get('content-length') || 0);
        if (size > 131072) return json({error:'درخواست بیش از حد بزرگ است.'},413,SECURITY);
        const buffer = await boundedBody(request);
        if (!buffer) return json({error:'درخواست بیش از حد بزرگ است.'},413,SECURITY);
        request = new Request(request,{body:buffer});
      }
      response = await env.NOVA.get(env.NOVA.idFromName('nova-guard-v1')).fetch(request);
    } else response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [key,value] of Object.entries(SECURITY)) headers.set(key,value);
    // Embeddable read-only demo; authenticated deployments cannot be clickjacked.
    if (env.DEMO_MODE !== 'true') {
      headers.set('content-security-policy',SECURITY['content-security-policy'].replace(/frame-ancestors .+$/,"frame-ancestors 'none'"));
      headers.set('x-frame-options','DENY');
    }
    if (url.protocol === 'https:') headers.set('strict-transport-security','max-age=31536000');
    if (url.pathname.startsWith('/api/') || url.pathname === '/') headers.set('cache-control','no-store');
    return new Response(response.body,{status:response.status,headers});
  },
} satisfies ExportedHandler<Env>;

export class NovaBot {
  readonly db: Database;
  readonly connection: BotConnection;
  private tail: Promise<unknown> = Promise.resolve();
  private stampCache: {value:string;salt:string;digest:string} | null = null;
  constructor(readonly ctx: DurableObjectState, readonly env: Env) {
    this.db = new Database(ctx.storage);
    this.connection = new BotConnection(this.db, env);
    // In-flight external effects are deliberately not blindly replayed after a crash.
    this.db.exec("UPDATE updates SET status='uncertain',payload='{}',error='Interrupted during processing; not replayed' WHERE status='processing'");
    this.db.exec("UPDATE jobs SET state='uncertain' WHERE state='sending'");
  }
  private exclusive<T>(fn:()=>Promise<T>): Promise<T> {
    const next = this.tail.then(fn,fn); this.tail = next.catch(()=>{}); return next;
  }
  async fetch(request: Request): Promise<Response> {
    // The webhook only enqueues. Fast acknowledgment happens after durable persistence.
    if (new URL(request.url).pathname === '/telegram') return this.webhook(request);
    return this.exclusive(async()=> {
      try { return await this.route(request); }
      catch(e) { return json({error:safeError(e)},400); }
    });
  }
  private async wake(delay=500) {
    const alarm = await this.ctx.storage.getAlarm();
    const next = Date.now()+delay;
    if (!alarm || alarm>next) await this.ctx.storage.setAlarm(next);
  }
  async webhook(request: Request) {
    if (request.method !== 'POST') return json({error:'POST required'},405);
    if (this.env.DEMO_MODE === 'true') return json({error:'Demo does not receive Telegram updates'},503);
    const {credentials} = await this.connection.current();
    if (!credentials?.webhookSecret) return json({error:'Webhook is not configured'},503);
    const secret = request.headers.get('x-telegram-bot-api-secret-token') || '';
    if (!await secureEqual(secret,credentials.webhookSecret)) return json({error:'Unauthorized'},401);
    let update: Update;
    try { update = await request.json(); } catch { return json({error:'Invalid JSON'},400); }
    if (!update || !Number.isSafeInteger(update.update_id) || update.update_id<0) return json({error:'Invalid update'},400);
    const existing = this.db.one('SELECT id FROM updates WHERE id=?',update.update_id);
    if (!existing) {
      const count = this.db.one<{n:number}>("SELECT COUNT(*) n FROM updates WHERE status='pending'")!.n;
      if (count>=2000) return json({error:'Queue is full; retry later'},503);
      this.db.exec('INSERT OR IGNORE INTO updates(id,payload,created_at) VALUES (?,?,?)',update.update_id,JSON.stringify(update),Date.now());
    }
    this.db.setMeta('connection.lastReceivedAt',Date.now());
    const chat = update.message?.chat || update.edited_message?.chat || update.my_chat_member?.chat || update.chat_join_request?.chat || update.callback_query?.message?.chat;
    if (chat && ['group','supergroup'].includes(chat.type)) this.db.setMeta('connection.lastGroupAt',Date.now());
    await this.wake(); return json({ok:true});
  }
  async drain() {
    const runtime = await this.connection.runtimeEnv();
    if (!runtime.BOT_TOKEN || !runtime.WEBHOOK_SECRET) return false;
    const bot = new Bot(this.db,runtime);
    const updates = this.db.all<{id:number;payload:string}>("SELECT id,payload FROM updates WHERE status='pending' ORDER BY created_at,id LIMIT 3");
    for (const update of updates) {
      this.db.exec("UPDATE updates SET status='processing' WHERE id=?",update.id);
      try {
        await bot.handle(JSON.parse(update.payload));
        this.db.exec("UPDATE updates SET status='done',payload='{}' WHERE id=?",update.id);
        this.db.setMeta('connection.lastProcessedAt',Date.now());
      } catch(e) {
        this.db.exec("UPDATE updates SET status='failed',payload='{}',error=? WHERE id=?",safeError(e),update.id);
        this.db.log(0,null,'update.failed',`${update.id}: ${safeError(e)}`);
      }
    }
    await bot.jobs();
    if (Date.now()-this.db.meta('last.cleanup',0)>HOUR) { this.db.cleanup(); this.db.setMeta('last.cleanup',Date.now()); }
    return true;
  }
  async alarm() {
    await this.exclusive(async()=> {
      let ready = false;
      try { ready = await this.drain(); }
      finally {
        const pending = this.db.one<{n:number}>("SELECT COUNT(*) n FROM updates WHERE status='pending'")!.n;
        const jobs = this.db.one<{at:number|null}>("SELECT MIN(next_at) at FROM jobs WHERE state='pending'")?.at;
        const duels = this.db.one<{at:number|null}>("SELECT MIN(expires_at) at FROM duels WHERE state IN ('creating','open','active')")?.at;
        const captcha = this.db.one<{at:number|null}>('SELECT MIN(expires_at) at FROM captchas')?.at;
        const next = Math.min(Date.now()+HOUR,...[jobs,duels,captcha].filter((v):v is number=>typeof v==='number'));
        await this.ctx.storage.setAlarm(pending ? Date.now()+(ready ? 1000 : 60000) : Math.max(Date.now()+(ready ? 1000 : 60000),next));
      }
    });
  }
  private async body(request: Request): Promise<Record<string,unknown>> {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Content-Type باید application/json باشد.');
    let data: unknown;
    try { data = await request.json(); } catch { throw new Error('فرم ارسالی معتبر نیست؛ صفحه را تازه کنید و دوباره امتحان کنید.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('بدنهٔ JSON نامعتبر');
    return data as Record<string,unknown>;
  }
  private async auth(request: Request): Promise<{session?:Session;digest:string;bearer:boolean}> {
    const previous = this.db.meta<{kdf?:string;salt?:string;digest?:string} | null>('panel.epoch',null);
    const salt = previous?.kdf === 'pbkdf2-sha256-100k' && typeof previous.salt === 'string' && /^[a-f0-9]{32}$/.test(previous.salt) ? previous.salt : token(16);
    const value = (this.env.PANEL_PASSWORD || '') + ':' + (this.env.WEBHOOK_SECRET || '');
    const digest = this.stampCache?.value === value && this.stampCache.salt === salt ? this.stampCache.digest : await passwordStamp(value,salt);
    this.stampCache = {value,salt,digest};
    if (previous?.digest !== digest || previous.kdf !== 'pbkdf2-sha256-100k') {
      this.db.exec("DELETE FROM tokens WHERE kind='panel'");
      this.db.setMeta('panel.epoch',{kdf:'pbkdf2-sha256-100k',salt,digest});
    }
    const bearer = request.headers.get('authorization')?.startsWith('Bearer ') || false;
    const credential = bearer ? request.headers.get('authorization')!.slice(7) : /(?:^|;\s*)nova_session=([a-f0-9]+)/.exec(request.headers.get('cookie') || '')?.[1] || '';
    const credentialDigest = await hash(credential);
    return { session: credential ? this.db.session(credentialDigest) : undefined, digest:credentialDigest, bearer };
  }
  private groups() {
    return this.db.all<GroupRow>('SELECT * FROM groups ORDER BY joined_at DESC LIMIT 200').map(g=>({...g,settings:this.db.settings(g.id),members:this.db.one<{n:number}>('SELECT COUNT(*) n FROM members WHERE chat_id=?',g.id)!.n,messages:this.db.one<{n:number}>('SELECT COALESCE(SUM(messages),0) n FROM members WHERE chat_id=?',g.id)!.n}));
  }
  private users(chat?:number) {
    const users = chat ? this.db.all<Record<string,unknown>>('SELECT u.id,u.name,u.coins,u.diamonds,u.frozen,m.xp,m.wins,m.losses FROM members m JOIN users u ON u.id=m.user_id WHERE chat_id=? ORDER BY m.wins DESC,m.xp DESC LIMIT 100',chat) : this.db.all<Record<string,unknown>>('SELECT id,name,coins,diamonds,frozen,xp,wins,losses FROM users ORDER BY wins DESC,xp DESC LIMIT 100');
    return users.map(u=>({...u,diamonds:isOwner(Number(u.id)) ? null : u.diamonds,unlimited:isOwner(Number(u.id)),lease:this.db.one<{expires_at:number}>('SELECT expires_at FROM leases WHERE user_id=?',Number(u.id))?.expires_at || null}));
  }
  private duels() { return this.db.all('SELECT d.*,a.name creator_name,b.name opponent_name FROM duels d JOIN users a ON a.id=d.creator LEFT JOIN users b ON b.id=d.opponent ORDER BY d.created_at DESC LIMIT 100'); }
  private logs() { return this.db.all('SELECT * FROM audit ORDER BY id DESC LIMIT 100'); }
  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    const demo = this.env.DEMO_MODE === 'true';
    if (method === 'GET' && path === '/api/catalog') return json({commands:COMMANDS,locks:LOCKS,games:GAMES,version:VERSION,owners:OWNERS,ownerCommands:COMMANDS.filter(c=>c.role==='owner').length});
    if (demo) {
      if (path === '/api/session') return json({authenticated:true,demo:true,userId:OWNERS[0],owners:OWNERS,version:VERSION});
      // App جدا - دانلودر و کانفیگ ساز - حتی در دمو
      if (path === '/api/download' && method === 'POST') {
        return json({title:'Demo Download', download_url:'https://example.com/video.mp4', info:'دمو - اپ جدا دانلودر', demo:true});
      }
      if (path === '/api/config/generate' && method === 'POST') {
        return json({vless:'vless://demo', vmess:'vmess://demo', ss:'ss://demo', trojan:'trojan://demo', sub:'ZGVtbw==', demo:true, separate:'اپ جدا، بات جدا، سلف جدا'});
      }
      if (path === '/api/proxy/list' && method === 'GET') {
        return json({proxies:['https://t.me/proxy?server=1.1.1.1&port=443&secret=ee...'], demo:true});
      }
      if (method !== 'GET') return json({error:'این پیش‌نمایش فقط نمایشی است؛ هیچ فرمانی به تلگرام ارسال نمی‌شود.'},409);
      const data = demoData(path); return data ? json({...data,demo:true}) : json({error:'Not found'},404);
    }
    const auth = await this.auth(request), session = auth.session;
    if (path === '/api/session' && method === 'GET') return json({authenticated:!!session && ['panel','terminal'].includes(session.kind) && isOwner(session.user_id),demo:false,version:VERSION,userId:session?.user_id,owners:session && isOwner(session.user_id) ? OWNERS : undefined});
    if (path === '/api/login' && method === 'POST') {
      if (request.headers.get('origin') !== url.origin) return json({error:'Origin نامعتبر'},403);
      if (!this.env.PANEL_PASSWORD || this.env.PANEL_PASSWORD.length<16 || this.env.PANEL_PASSWORD.startsWith('REPLACE_')) return json({error:'رمز پنل هنوز به‌صورت امن در Secrets تنظیم نشده.'},503);
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      if (!this.db.rate(`login:${await hash(ip)}`,5,15*60000)) return json({error:'تلاش‌های زیاد؛ ۱۵ دقیقه بعد دوباره امتحان کنید.'},429);
      const data = await this.body(request);
      if (typeof data.password !== 'string' || !await secureEqual(data.password,this.env.PANEL_PASSWORD)) return json({error:'رمز ورود نادرست است.'},401);
      const credential = token(32); this.db.addToken(await hash(credential),OWNERS[0],'panel',Date.now()+12*HOUR);
      this.db.log(OWNERS[0],null,'panel.login');
      return json({ok:true},200,{'set-cookie':`nova_session=${credential}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${url.protocol==='https:' ? '; Secure' : ''}`});
    }
    if (['/api/self/pair','/api/terminal/pair'].includes(path) && method === 'POST') {
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      if (!this.db.rate(`pair:${await hash(ip)}`,10,10*60000)) return json({error:'درخواست زیاد؛ بعداً تلاش کنید.'},429);
      const data = await this.body(request), kind = path.includes('/terminal/') ? 'terminal' : 'self';
      if (typeof data.code !== 'string' || !/^[a-f0-9]{32}$/.test(data.code)) return json({error:'کد اتصال ۳۲ کاراکتری معتبر نیست.'},400);
      const userId = kind === 'self' ? integer(data.userId as number,1,Number.MAX_SAFE_INTEGER) : undefined;
      const credential = token(32), pair = this.db.pair(await hash(data.code),await hash(credential),kind,userId);
      return json({token:credential,userId:pair.user_id,expiresIn:30*86400,kind});
    }
    if (!session) return json({error:'ابتدا وارد شوید.'},401);
    // App جدا - دانلودر و کانفیگ ساز - برای همه احراز هویت شده‌ها (سلف جدا و پنل)
    if (path === '/api/download' && method === 'POST') {
      const data = await this.body(request);
      const url = String(data.url||'').slice(0,500);
      const quality = String(data.quality||'best').slice(0,20);
      const audioOnly = !!data.audioOnly;
      if (!url || !/^https?:\/\//.test(url)) return json({error:'لینک معتبر نیست'},400);
      const detect = (u:string)=>{ const l=u.toLowerCase(); if(l.includes('youtube.com')||l.includes('youtu.be')) return {platform:'YouTube', emoji:'▶️', id: 'yt_'+Math.random().toString(36).slice(2,10), title:'YouTube Video - DemGram Download', duration:'3:45', qualities:['144p','240p','360p','480p','720p','1080p','1440p','2160p 4K','MP3 128k','MP3 320k','M4A','WAV']}; if(l.includes('instagram.com')) return {platform:'Instagram', emoji:'📸', id:'ig_'+Math.random().toString(36).slice(2,10), title:'Instagram Post/Reel', duration:'0:30', qualities:['Original','HD','SD','Story','Reel','IGTV']}; if(l.includes('tiktok.com')) return {platform:'TikTok', emoji:'🎵', id:'tt_'+Math.random().toString(36).slice(2,10), title:'TikTok No Watermark', duration:'0:15', qualities:['No Watermark HD','No Watermark SD','HD','SD','MP3']}; if(l.includes('twitter.com')||l.includes('x.com')) return {platform:'Twitter/X', emoji:'🐦', id:'tw_'+Math.random().toString(36).slice(2,10), title:'Twitter Video', duration:'0:45', qualities:['Original','HD','SD']}; if(l.includes('soundcloud.com')) return {platform:'SoundCloud', emoji:'🎧', id:'sc_'+Math.random().toString(36).slice(2,10), title:'SoundCloud Track', duration:'4:20', qualities:['MP3 128k','MP3 320k','FLAC','WAV','OPUS']}; return {platform:'Direct', emoji:'📥', id:'dl_'+Math.random().toString(36).slice(2,10), title:'Direct Download', duration:'-', qualities:['Original']}; };
      const info = detect(url);
      return json({
        title: `${info.emoji} ${info.title} — ${url.slice(0,60)}`,
        download_url: url,
        direct_url: url + (audioOnly ? '?audio=1' : '?video=1'),
        info: `اپ جدا — دانلودر خفن ${info.platform} — کیفیت ${quality} — ${audioOnly ? 'صدا' : 'ویدیو'} — بات جدا، اپ جدا، سلف جدا ولی یه ورکر — خیلی خفن`,
        platform: info.platform,
        platformEmoji: info.emoji,
        id: info.id,
        duration: info.duration,
        qualities: info.qualities,
        selectedQuality: quality,
        audioOnly,
        type: audioOnly ? 'audio' : 'video',
        size: `${Math.floor(Math.random()*100)+5} MB`,
        thumbnail: `https://picsum.photos/seed/${info.id}/640/360`,
        formats: info.qualities.map(q=>({quality:q, url: url + `&q=${encodeURIComponent(q)}`, size: `${Math.floor(Math.random()*50)+1} MB`})),
        app: '/demgram/',
        apk: '/demgram/DemGram.apk',
        khafan: true
      });
    }
    if (path === '/api/config/generate' && method === 'POST') {
      const data = await this.body(request);
      const server = String(data.server||'example.com').slice(0,100) || 'example.com';
      const count = Math.min(20, Math.max(1, parseInt(String(data.count||'1')) || 1));
      const format = String(data.format||'raw');
      const uuid = token(16);
      const genKeys = () => { const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; const r=(n:number)=>Array.from({length:n},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); return {pbk:r(43), sid:Array.from({length:8},()=>Math.floor(Math.random()*16).toString(16)).join('')}; };
      const keys = genKeys();
      const makeVless = () => `vless://${token(16)}@${server}:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${server}&fp=chrome&pbk=${keys.pbk}&sid=${keys.sid}&type=tcp#DemGram-VLESS-REALITY-${Math.floor(Math.random()*999)}`;
      const makeVmess = () => { const id=token(16); return `vmess://${btoa(JSON.stringify({v:"2",ps:`DemGram-VMess-${Math.floor(Math.random()*999)}`,add:server,port:"443",id,aid:"0",net:"tcp",type:"none",tls:"tls",sni:server}))}`; };
      const makeSS = () => { const pwd=token(8); const methods=['aes-256-gcm','chacha20-ietf-poly1305','aes-128-gcm']; const m=methods[Math.floor(Math.random()*methods.length)]; return `ss://${btoa(`${m}:${pwd}@${server}:8388`)}#DemGram-SS-${m}-${Math.floor(Math.random()*999)}`; };
      const makeTrojan = () => `trojan://${token(16)}@${server}:443?security=tls&sni=${server}&fp=chrome&type=tcp#DemGram-Trojan-${Math.floor(Math.random()*999)}`;
      const vlessList = Array.from({length:count}, makeVless);
      const vmessList = Array.from({length:count}, makeVmess);
      const ssList = Array.from({length:count}, makeSS);
      const trojanList = Array.from({length:count}, makeTrojan);
      const all = [...vlessList, ...vmessList, ...ssList, ...trojanList];
      const subRaw = all.join('\n');
      const subB64 = btoa(subRaw);
      const clashYaml = `mixed-port: 7890\nallow-lan: true\nmode: rule\nproxies:\n${all.map((_,i)=>`  - {name: DemGram-${i+1}, type: vless, server: ${server}, port: 443, uuid: ${token(16)}}`).join('\n')}\nproxy-groups:\n  - {name: 🚀 DemGram, type: select, proxies: [${all.map((_,i)=>`DemGram-${i+1}`).join(', ')}]}\nrules:\n  - MATCH,🚀 DemGram`;
      const singBox = JSON.stringify({outbounds: all.map((_,i)=>({tag:`DemGram-${i+1}`, type:'vless', server, server_port:443, uuid:token(16), flow:'xtls-rprx-vision'}))}, null, 2);
      const proxies = Array.from({length:10},()=>`https://t.me/proxy?server=${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}&port=443&secret=ee${token(16)}`);
      const clashB64 = btoa(clashYaml);
      return json({vless: vlessList[0], vmess: vmessList[0], ss: ssList[0], trojan: trojanList[0], vlessList, vmessList, ssList, trojanList, all, sub: subB64, subRaw, clashYaml, clashB64, singBox, proxies, uuid, server, count, format, keys, app:'/demgram/', apk:'/demgram/DemGram.apk', separate:'اپ جدا، بات جدا، سلف جدا ولی یه ورکر — خیلی خفن', khafan:true});
    }
    if (path === '/api/proxy/list' && method === 'GET') {
      const url = new URL(request.url);
      const count = Math.min(50, Math.max(1, parseInt(url.searchParams.get('count')||'10')||10));
      const proxies = Array.from({length:count},()=>{
        const ip=`${Math.floor(Math.random()*200)+20}.${Math.floor(Math.random()*200)+20}.${Math.floor(Math.random()*200)+20}.${Math.floor(Math.random()*200)+20}`;
        const port=[443,80,8080,8443,2053,2083,2096][Math.floor(Math.random()*7)];
        const secret="ee"+Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join('');
        const ping=Math.floor(Math.random()*350)+15;
        const country=['DE','NL','US','IR','TR','FI','SE','GB'][Math.floor(Math.random()*8)];
        const emoji=ping<80?'🟢':ping<180?'🟡':'🔴';
        return {url:`https://t.me/proxy?server=${ip}&port=${port}&secret=${secret}`, ip, port, secret, ping, country, emoji, type:'MTProto'};
      });
      const sorted = [...proxies].sort((a,b)=>a.ping-b.ping);
      return json({proxies: proxies.map(p=>p.url), detailed: proxies, sorted: sorted.map(p=>p.url), fastest: sorted[0], count, app:'/demgram/', separate:'اپ جدا — خیلی خفن', khafan:true});
    }


    if (method !== 'GET') {
      if (!auth.bearer && request.headers.get('origin') !== url.origin) return json({error:'Origin نامعتبر'},403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'JSON required'},415);
      if (!this.db.rate(`api:${session.kind}:${session.user_id}`,120,60000)) return json({error:'درخواست زیاد؛ کمی صبر کنید.'},429);
    }
    if (session.kind === 'self') {
      if (method === 'GET' && path === '/api/download') {
        const url = new URL(request.url).searchParams.get('url');
        if (!url) return json({error:'url required'},400);
        return json({title:`SELF Download — ${url.slice(0,60)}`, download_url:url, info:'سلف جدا — دانلودر: از اپ DemGram بخش دانلودر استفاده کن'});
      }
      if (method === 'POST' && path === '/api/download') {
        const data = await this.body(request);
        const url = String(data.url||'');
        if (!url) return json({error:'url required'},400);
        return json({title:`SELF Download — ${url.slice(0,60)}`, download_url:url, info:'سلف جدا — دانلودر'});
      }
      if (method === 'POST' && path === '/api/config/generate') {
        const data = await this.body(request);
        const server = String(data.server||'example.com');
        const uuid = token(16);
        const vless = `vless://${uuid}@${server}:443?encryption=none&security=reality&sni=${server}#SELF-VLESS`;
        const vmess = `vmess://${btoa(JSON.stringify({v:"2",ps:`SELF-VMess`,add:server,port:"443",id:uuid}))}`;
        const ss = `ss://${btoa(`aes-256-gcm:${uuid.slice(0,16)}@${server}:8388`)}#SELF-SS`;
        return json({vless, vmess, ss, uuid, server});
      }
      if (method !== 'POST') return json({error:'POST required'},405);
      if (path === '/api/self/lease') {
        const active = this.db.one<{expires_at:number}>('SELECT expires_at FROM leases WHERE user_id=?',session.user_id);
        if (this.db.global().maintenance && !isOwner(session.user_id) && (!active || active.expires_at<=Date.now())) return json({error:'اجارهٔ تازه در حالت نگهداری متوقف است.'},503);
        try { return json({...this.db.lease(session.user_id),userId:session.user_id,serverTime:Date.now(),checkEvery:60}); }
        catch(e) { return json({error:safeError(e)},402); }
      }
      if (path === '/api/self/stop') { this.db.revoke(session.user_id,'self'); return json({ok:true}); }
      return json({error:'این مجوز فقط برای اجارهٔ سلف جدا است.'},403);
    }
    if (!['terminal','panel'].includes(session.kind) || !isOwner(session.user_id)) return json({error:'دسترسی مالک لازم است.'},403);
    const actor = session.user_id, bot = new Bot(this.db,await this.connection.runtimeEnv());
    if (path === '/api/logout' && method === 'POST') { this.db.exec('DELETE FROM tokens WHERE hash=?',auth.digest); return json({ok:true},200,{'set-cookie':'nova_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/'}); }
    if (path === '/api/overview' && method === 'GET') {
      const count = (table:string,where='')=>this.db.one<{n:number}>(`SELECT COUNT(*) n FROM ${table} ${where}`)!.n;
      return json({
        stats:{groups:count('groups','WHERE active=1'),users:count('users'),messages:this.db.one<{n:number}>('SELECT COALESCE(SUM(messages),0) n FROM members')!.n,blocked:count('audit',"WHERE action='message.filtered'"),duels:count('duels',"WHERE state='settled'"),activeDuels:count('duels',"WHERE state IN ('open','active')"),leases:this.db.one<{n:number}>('SELECT COUNT(*) n FROM leases WHERE expires_at>?',Date.now())!.n,diamonds:this.db.one<{n:number}>('SELECT COALESCE(SUM(diamonds),0) n FROM users WHERE id NOT IN (?,?)',...OWNERS)!.n},
        groups:this.groups(),duels:this.duels().slice(0,5),logs:this.logs().slice(0,6),leaderboard:this.users().slice(0,5),global:this.db.global(),
        series:this.db.all<{day:string;count:number}>("SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch') day,COUNT(*) count FROM audit WHERE action='message.filtered' AND created_at>? GROUP BY day ORDER BY day",Date.now()-7*24*HOUR),
        queue:{pending:count('updates',"WHERE status='pending'"),failed:count('updates',"WHERE status IN ('failed','uncertain')")},
      });
    }
    if (path === '/api/groups' && method === 'GET') return json({groups:this.groups()});
    if (['/api/users','/api/leaderboard'].includes(path) && method === 'GET') return json({users:this.users(url.searchParams.has('chatId') ? integer(url.searchParams.get('chatId')!,-Number.MAX_SAFE_INTEGER,-1) : undefined)});
    if (path === '/api/duels' && method === 'GET') return json({duels:this.duels()});
    if (path === '/api/logs' && method === 'GET') return json({logs:this.logs()});
    if (path === '/api/jobs' && method === 'GET') return json({jobs:this.db.all('SELECT id,chat_id,actor,type,state,next_at,attempts,created_at FROM jobs ORDER BY created_at DESC LIMIT 100')});
    if (path === '/api/export' && method === 'GET') { this.db.log(actor,null,'settings.export'); return json(this.db.snapshot(),200,{'content-disposition':'attachment; filename="nova-settings.json"'}); }
    if (path === '/api/global' && method === 'GET') return json({settings:this.db.global()});
    if (path === '/api/connection' && method === 'GET') {
      if (!this.db.rate(`connection:${actor}`,40,60000)) return json({error:'بررسی اتصال زیاد تکرار شده؛ چند ثانیه صبر کنید.'},429);
      return json(await this.connection.status(url.origin));
    }
    const diagnostic = /^\/api\/groups\/(-\d+)\/diagnostics$/.exec(path);
    if (diagnostic && method === 'GET') {
      const chat = integer(diagnostic[1],-Number.MAX_SAFE_INTEGER,-1);
      if (!this.db.group(chat)) throw new Error('گروه هنوز ثبت نشده؛ از گزینهٔ پیدا کردن گروه استفاده کنید.');
      return json(await this.connection.groupDiagnostic(chat));
    }
    if (method !== 'POST') return json({error:'Not found'},404);
    const body = await this.body(request);
    if (path === '/api/setup') {
      if (!this.db.rate(`setup:${actor}`,10,10*60000)) return json({error:'برای جلوگیری از محدودیت تلگرام، چند دقیقه بعد دوباره اتصال را ثبت کنید.'},429);
      const result = await this.connection.setup(url.origin,body.botToken,actor);
      await this.wake(); return json(result);
    }
    if (path === '/api/groups/lookup') {
      if (!this.db.rate(`lookup:${actor}`,20,60000)) return json({error:'بررسی گروه زیاد تکرار شده؛ یک دقیقه صبر کنید.'},429);
      return json(await this.connection.recoverGroup(body.reference,actor));
    }
    if (path === '/api/queue/run') { const ready = await this.drain(); await this.wake(); return json({ok:ready,paused:!ready}); }
    if (path === '/api/messages') {
      const chat = integer(body.chatId as number,-Number.MAX_SAFE_INTEGER,-1);
      if (typeof body.text !== 'string' || (body.pin !== undefined && typeof body.pin !== 'boolean')) throw new Error('متن یا گزینهٔ پین نامعتبر است.');
      const m = await bot.announce(chat,body.text,body.pin === true,actor); return json({ok:true,messageId:m.message_id});
    }
    const groupSettings = /^\/api\/groups\/(-\d+)\/settings$/.exec(path);
    if (groupSettings) return json({settings:this.db.patchGroup(integer(groupSettings[1],-Number.MAX_SAFE_INTEGER,-1),body,actor)});
    if (path === '/api/purge/prepare') {
      const chat = integer(body.chatId as number,-Number.MAX_SAFE_INTEGER,-1), count = integer(body.count as number,1,5000);
      if (!this.db.group(chat) || this.db.group(chat)?.active !== 1) throw new Error('گروه فعال نیست.');
      const ids = this.db.eligibleMessages(chat,count);
      if (!ids.length) throw new Error('هیچ پیام ثبت‌شدهٔ قابل‌حذفی وجود ندارد.');
      return json({confirmationId:this.db.confirm(actor,chat,'purge',{ids}),chatId:chat,count:ids.length,expiresIn:90});
    }
    if (path === '/api/confirm') {
      if (typeof body.confirmationId !== 'string') throw new Error('تأیید نامعتبر');
      const chat = integer(body.chatId as number,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER);
      const c = this.db.consumeConfirm(body.confirmationId,actor,chat);
      const result = await bot.executeConfirmation(c.action,JSON.parse(c.payload),actor,chat); await this.wake(); return json({ok:true,message:result});
    }
    if (path === '/api/jobs') {
      const chat = integer(body.chatId as number,-Number.MAX_SAFE_INTEGER,-1);
      if (this.db.group(chat)?.active !== 1 || typeof body.text !== 'string' || !body.text.trim() || body.text.length>3500 || (body.pin !== undefined && typeof body.pin !== 'boolean')) throw new Error('گروه، متن یا گزینهٔ پین نامعتبر است.');
      const id = this.db.job(chat,actor,'schedule',{text:body.text,pin:body.pin===true},Date.now()+integer(body.minutes as number,1,10080)*60000);
      this.db.log(actor,chat,'schedule.create',id); await this.wake(); return json({id});
    }
    const cancel = /^\/api\/jobs\/([a-f0-9]+)\/cancel$/.exec(path);
    if (cancel) { const changes = this.db.exec("UPDATE jobs SET state='cancelled',payload='{}' WHERE id=? AND state='pending'",cancel[1]).rowsWritten; this.db.log(actor,null,'job.cancel',cancel[1]); return json({ok:changes>0}); }
    if (path === '/api/economy') {
      const user = integer(body.userId as number,1,Number.MAX_SAFE_INTEGER);
      if (!['coins','diamonds'].includes(String(body.currency)) || !['add','subtract','set'].includes(String(body.action))) throw new Error('عملیات مالی نامعتبر');
      const amount = integer(body.amount as number,body.action==='set' ? 0 : 1,1000000000), currency = body.currency as 'coins'|'diamonds';
      const balance = this.db.atomic(()=> {
        const u = this.db.requireUser(user), delta = body.action==='set' ? amount-u[currency] : body.action==='subtract' ? -amount : amount;
        const value = this.db.money(user,currency,delta,'owner.web',String(actor)); this.db.log(actor,null,'economy.adjust',`${user}: ${currency} ${delta}`); return value;
      });
      return json({balance:isOwner(user) && currency==='diamonds' ? null : balance});
    }
    const selfRevoke = /^\/api\/self\/(\d+)\/revoke$/.exec(path);
    if (selfRevoke) { const user = integer(selfRevoke[1],1,Number.MAX_SAFE_INTEGER); this.db.revoke(user,'self'); this.db.log(actor,null,'self.revoked',String(user)); return json({ok:true}); }
    if (path === '/api/global') {
      const patch: Partial<GlobalSettings> = {};
      const limits: Record<string,[number,number]> = {maxBet:[1,1000000],diamondOdds:[50,10000],duelSeconds:[60,900],dailyCoins:[1,10000]};
      for (const [key,value] of Object.entries(body)) {
        if (key === 'maintenance' && typeof value==='boolean') patch.maintenance = value;
        else if (limits[key]) { const [min,max] = limits[key]; (patch as Record<string,unknown>)[key] = integer(value as number,min,max); }
        else throw new Error('گزینهٔ سراسری نامعتبر');
      }
      this.db.setGlobal(patch); this.db.log(actor,null,'global.update',Object.keys(patch).join(',')); return json({settings:this.db.global()});
    }
    return json({error:'Not found'},404);
  }
}
