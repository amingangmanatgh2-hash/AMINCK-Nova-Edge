import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { OWNERS } from '../src/config';

let mf:Miniflare;let code='';let cookie='';let seq=1000;let messageId=20000;
const sent:{method:string;data:Record<string,unknown>}[]=[];
const secret='runtime_test_webhook_secret_32chars_NOT_REAL';
const password='runtime_only_panel_password_not_a_real_credential';
async function call(path:string,body?:unknown,opts:{cookie?:string;bearer?:string;origin?:string;headers?:Record<string,string>}={}){
  return mf.dispatchFetch('https://unit.test'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),origin:opts.origin||'https://unit.test',cookie:opts.cookie??cookie,...(opts.bearer?{authorization:'Bearer '+opts.bearer}:{}),...opts.headers},body:body===undefined?undefined:JSON.stringify(body)});
}
async function webhook(from:number,text:string,chat=from,id=seq++){
  return call('/telegram',{update_id:id,message:{message_id:seq++,date:Math.floor(Date.now()/1000),chat:{id:chat,type:chat<0?'supergroup':'private',title:'Runtime Group'},from:{id:from,first_name:'Runtime '+from},text}},{headers:{'x-telegram-bot-api-secret-token':secret}});
}
async function drain(){expect((await call('/api/queue/run',{})).status).toBe(200);}
async function pair(userId:number,kind='self'){
  await webhook(userId,kind==='self'?'سلف':'ترموکس');await drain();
  const pairing=sent.filter(x=>x.method==='sendMessage'&&Number(x.data.chat_id)===userId).at(-1)!;
  const code=String(pairing.data.text).match(/<code>([a-f0-9]{32})<\/code>/)![1];
  return {code,userId};
}
beforeAll(async()=>{
  code=(await build({entryPoints:['src/index.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
  mf=new Miniflare({modules:true,script:code,compatibilityDate:'2026-08-06',durableObjects:{NOVA:{className:'NovaBot',useSQLite:true}},bindings:{BOT_TOKEN:'999999:FAKE_RUNTIME_TOKEN_NOT_A_REAL_TELEGRAM_KEY',WEBHOOK_SECRET:secret,PANEL_PASSWORD:password},serviceBindings:{
    ASSETS:()=>new Response('static asset'),
    TELEGRAM:async (request: Request)=>{
      const method=new URL(request.url).pathname.split('/').pop()!;
      const data=await request.json() as Record<string,unknown>;sent.push({method,data});let result:unknown=true;
      if(method==='getMe')result={id:999999,first_name:'Nova',is_bot:true,username:'nova_runtime_bot'};
      if(method==='getChatMember')result={status:'member',user:{id:data.user_id}};
      if(method==='getWebhookInfo')result={url:'',pending_update_count:0};
      if(method==='sendMessage')result={message_id:messageId++,date:Math.floor(Date.now()/1000),chat:{id:data.chat_id,type:Number(data.chat_id)<0?'supergroup':'private'},from:{id:999999,first_name:'Nova',is_bot:true},text:data.text};
      return new Response(JSON.stringify({ok:true,result}),{headers:{'content-type':'application/json'}});
    },
  }});
  const login=await call('/api/login',{password},{cookie:'',headers:{'cf-connecting-ip':'login-success'}});
  expect(login.status).toBe(200);cookie=login.headers.get('set-cookie')!.split(';')[0];
});
afterAll(async()=>{await mf?.dispose();});

describe('real Workers runtime + SQLite Durable Object',()=>{
  it('returns a public health check without disclosing secrets',async()=>{
    const res=await call('/health');expect(res.status).toBe(200);const text=await res.text();expect(text).toContain('nova-guard');expect(text).not.toContain(secret);
  });
  it('serves accurate public capabilities but protects all administrative data',async()=>{
    const res=await call('/api/catalog',undefined,{cookie:''});const catalog=await res.json() as {commands:unknown[];ownerCommands:number};expect(catalog.commands.length).toBeGreaterThan(100);expect(catalog.ownerCommands).toBeGreaterThanOrEqual(30);
    for(const path of ['/api/overview','/api/users','/api/logs','/api/export','/api/overview?demo=true'])expect((await call(path,undefined,{cookie:''})).status).toBe(401);
  });
  it('uses secure cookies, strict origins, no permissive CORS and security headers',async()=>{
    const res=await call('/api/login',{password},{cookie:'',headers:{'cf-connecting-ip':'cookie-test'}});
    const header=res.headers.get('set-cookie')!;expect(header).toContain('HttpOnly');expect(header).toContain('SameSite=Strict');expect(header).toContain('Secure');
    expect((await call('/api/global',{maintenance:true},{origin:'https://evil.test'})).status).toBe(403);
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('rate-limits failed login attempts',async()=>{
    for(let i=0;i<5;i++)expect((await call('/api/login',{password:'wrong'},{cookie:'',headers:{'cf-connecting-ip':'brute-force-test'}})).status).toBe(401);
    expect((await call('/api/login',{password},{cookie:'',headers:{'cf-connecting-ip':'brute-force-test'}})).status).toBe(429);
  });
  it('rejects forged webhooks and oversized payloads',async()=>{
    expect((await call('/telegram',{update_id:1})).status).toBe(401);
    expect((await call('/telegram',{update_id:1},{headers:{'x-telegram-bot-api-secret-token':'wrong'}})).status).toBe(401);
    expect((await call('/telegram',{update_id:'bad'},{headers:{'x-telegram-bot-api-secret-token':secret}})).status).toBe(400);
    expect((await call('/api/messages',{text:'x'.repeat(140000)})).status).toBe(413);
  });
  it('persists webhooks, deduplicates replay and charges daily once',async()=>{
    const uid=2001,id=seq++;expect((await webhook(uid,'روزانه',-1009001,id)).status).toBe(200);expect((await webhook(uid,'روزانه',-1009001,id)).status).toBe(200);await drain();
    const data=await (await call('/api/users')).json() as {users:{id:number;coins:number}[]};expect(data.users.find(u=>u.id===uid)?.coins).toBe(1100);
    expect(sent.filter(x=>x.method==='sendMessage'&&Number(x.data.chat_id)===-1009001&&String(x.data.text).includes('سکه گرفتی'))).toHaveLength(1);
  });
  it('updates real group settings with strict validation and sends/pins through Telegram',async()=>{
    const group=-1009002;await webhook(OWNERS[0],'پینگ',group);await drain();
    expect((await call(`/api/groups/${group}/settings`,{captcha:true,locks:['links','photos']})).status).toBe(200);
    const result=await (await call('/api/groups')).json() as {groups:{id:number;settings:{captcha:boolean;locks:string[]}}[]};expect(result.groups.find(g=>g.id===group)?.settings.captcha).toBe(true);
    expect((await call(`/api/groups/${group}/settings`,{locks:['made-up-feature']})).status).toBe(400);
    expect((await call('/api/messages',{chatId:group,text:'runtime send',pin:true})).status).toBe(200);
    expect(sent.some(x=>x.method==='pinChatMessage'&&x.data.chat_id===group)).toBe(true);
    expect((await call('/api/messages',{chatId:-9999999,text:'unknown group'})).status).toBe(400);
  });
  it('pairs self tokens only once, binds user IDs and isolates privilege scopes',async()=>{
    const uid=2010,p=await pair(uid);
    expect((await call('/api/self/pair',{...p,userId:999})).status).toBe(400);
    const res=await call('/api/self/pair',p);expect(res.status).toBe(200);const result=await res.json() as {token:string};
    expect((await call('/api/self/pair',p)).status).toBe(400);
    expect((await call('/api/economy',{userId:uid,currency:'diamonds',action:'add',amount:100},{bearer:result.token,cookie:''})).status).toBe(403);
    expect((await call('/api/self/lease',{}, {bearer:result.token,cookie:''})).status).toBe(402);
    expect((await call('/api/economy',{userId:uid,currency:'diamonds',action:'add',amount:12})).status).toBe(200);
    const calls=await Promise.all(Array.from({length:5},()=>call('/api/self/lease',{}, {bearer:result.token,cookie:''})));
    const leases=await Promise.all(calls.map(r=>r.json())) as {charged:number;diamonds:number}[];
    expect(leases.filter(l=>l.charged===5)).toHaveLength(1);expect(leases.every(l=>l.diamonds===7)).toBe(true);
    await call(`/api/self/${uid}/revoke`,{});expect((await call('/api/self/lease',{}, {bearer:result.token,cookie:''})).status).toBe(401);
  });
  it('pairs owner console tokens without accepting arbitrary owner identity claims',async()=>{
    const p=await pair(OWNERS[1],'terminal');const res=await call('/api/terminal/pair',{code:p.code});expect(res.status).toBe(200);
    const token=(await res.json() as {token:string}).token;
    expect((await call('/api/groups',undefined,{bearer:token,cookie:''})).status).toBe(200);
    expect((await call('/api/logout',{}, {bearer:token,cookie:''})).status).toBe(200);
    expect((await call('/api/groups',undefined,{bearer:token,cookie:''})).status).toBe(401);
  });
  it('validates purge counts and uses a one-time owner-bound confirmation',async()=>{
    expect((await call('/api/purge/prepare',{chatId:-1009001,count:-10})).status).toBe(400);
    const res=await call('/api/purge/prepare',{chatId:-1009001,count:1000});expect(res.status).toBe(200);
    const pending=await res.json() as {confirmationId:string;chatId:number;count:number};expect(pending.count).toBeGreaterThan(0);
    expect((await call('/api/confirm',{confirmationId:pending.confirmationId,chatId:-1009002})).status).toBe(400);
    expect((await call('/api/confirm',pending)).status).toBe(200);expect((await call('/api/confirm',pending)).status).toBe(400);
  });
  it('sets the actual HTTPS origin and secret on Telegram webhook setup',async()=>{
    expect((await call('/api/setup',{})).status).toBe(200);
    const hook=sent.find(x=>x.method==='setWebhook')!;expect(hook.data.url).toBe('https://unit.test/telegram');expect(hook.data.secret_token).toBe(secret);expect(hook.data.drop_pending_updates).toBe(false);
  });
  it('exports settings without account sessions, API tokens or credentials',async()=>{
    const res=await call('/api/export');const text=await res.text();expect(text).toContain('settings');expect(text).not.toContain(secret);expect(text).not.toContain(password);expect(text).not.toContain('FAKE_RUNTIME_TOKEN');expect(text).not.toContain('"tokens"');
  });
  it('keeps demo strictly synthetic and read-only, including webhook rejection',async()=>{
    const demo=new Miniflare({modules:true,script:code,compatibilityDate:'2026-08-06',durableObjects:{NOVA:{className:'NovaBot',useSQLite:true}},bindings:{DEMO_MODE:'true'},serviceBindings:{ASSETS:()=>new Response('asset')}});
    try{
      const overview=await demo.dispatchFetch('https://demo.test/api/overview');expect((await overview.json() as {demo:boolean}).demo).toBe(true);
      const write=await demo.dispatchFetch('https://demo.test/api/messages',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});expect(write.status).toBe(409);
      expect((await demo.dispatchFetch('https://demo.test/telegram',{method:'POST',body:'{}'})).status).toBe(503);
    }finally{await demo.dispose();}
  });
});
