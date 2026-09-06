import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { OWNERS } from '../src/config';

const TOKEN='999999:FAKE_PANEL_SETUP_TOKEN_NOT_A_LIVE_KEY_123';
const PASSWORD='test-panel-password-only-no-bot-secrets';
let code='', mf:Miniflare, cookie='', webhookURL='', webhookSecret='', failWebhook=false, failToken=false, pendingError='';
let mid=50;
const calls:{method:string;data:Record<string,unknown>}[]=[];
beforeAll(async()=>{code=(await build({entryPoints:['src/index.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;});
beforeEach(async()=>{
  calls.length=0;cookie='';webhookURL='';webhookSecret='';failWebhook=false;failToken=false;pendingError='';
  mf=new Miniflare({modules:true,script:code,compatibilityDate:'2026-08-06',durableObjects:{NOVA:{className:'NovaBot',useSQLite:true}},bindings:{PANEL_PASSWORD:PASSWORD},serviceBindings:{
    ASSETS:()=>new Response('asset'),
    TELEGRAM:async(request:Request)=>{
      const method=new URL(request.url).pathname.split('/').pop()!,data=await request.json() as Record<string,unknown>;
      calls.push({method,data});
      if(method==='getMe'&&failToken)return new Response(JSON.stringify({ok:false,error_code:401,description:'Rejected '+TOKEN}));
      if(method==='setWebhook'&&failWebhook)return new Response(JSON.stringify({ok:false,error_code:400,description:'bad webhook '+TOKEN}));
      let result:unknown=true;
      if(method==='getMe')result={id:999999,is_bot:true,first_name:'Setup Bot',username:'nova_setup_test_bot',can_join_groups:true,can_read_all_group_messages:false};
      if(method==='setWebhook'){webhookURL=String(data.url);webhookSecret=String(data.secret_token);}
      if(method==='getWebhookInfo')result={url:webhookURL,pending_update_count:0,...(pendingError?{last_error_message:pendingError,last_error_date:Math.floor(Date.now()/1000)+60}:{})};
      if(method==='getChat')result={id:-10055001,type:'supergroup',title:'Already added group',permissions:{can_send_messages:true}};
      if(method==='getChatMember')result={status:'administrator',user:{id:Number(data.user_id),first_name:'Admin'},can_delete_messages:true,can_pin_messages:true,can_restrict_members:false};
      if(method==='sendMessage')result={message_id:mid++,date:Math.floor(Date.now()/1000),chat:{id:data.chat_id,type:Number(data.chat_id)<0?'supergroup':'private'},from:{id:999999,first_name:'Setup Bot',is_bot:true},text:data.text};
      return new Response(JSON.stringify({ok:true,result}),{headers:{'content-type':'application/json'}});
    },
  }});
  const login=await request('/api/login',{password:PASSWORD});expect(login.status).toBe(200);cookie=login.headers.get('set-cookie')!.split(';')[0];
});
afterEach(async()=>{await mf.dispose();});
function request(path:string,body?:unknown,headers:Record<string,string>={}){return mf.dispatchFetch('https://setup.test'+path,{method:body===undefined?'GET':'POST',headers:{origin:'https://setup.test',cookie,...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}
async function setup(){const response=await request('/api/setup',{botToken:TOKEN});expect(response.status).toBe(200);return response.json() as Promise<{ok:boolean;saved:boolean;connection:{stage:string;canReceive:boolean;receiving:boolean;addGroupUrl:string;panelCommand:string};warning?:string}>;}

describe('password-only deployment / panel token setup, in real Workers runtime',()=>{
  it('requires authenticated owner and same-origin JSON before accepting any token',async()=>{
    for(const path of ['/api/setup','/api/groups/lookup']){
      expect((await request(path,{botToken:TOKEN,reference:'@a_group'},{cookie:''})).status).toBe(401);
      expect((await request(path,{botToken:TOKEN,reference:'@a_group'},{origin:'https://evil.test'})).status).toBe(403);
    }
    expect(calls).toHaveLength(0);
    expect((await request('/api/connection')).status).toBe(200);
  });
  it('sets up a working webhook with only PANEL_PASSWORD configured and never returns the bot token/secret',async()=>{
    const initial=await (await request('/api/connection')).json() as {stage:string};expect(initial.stage).toBe('needs_token');
    const result=await setup();expect(result.ok).toBe(true);expect(result.connection.stage).toBe('waiting_for_update');expect(result.connection.receiving).toBe(false);
    expect(webhookSecret).toMatch(/^[a-f0-9]{64}$/);expect(webhookURL).toBe('https://setup.test/telegram');
    expect(result.connection.addGroupUrl).toBe('https://t.me/nova_setup_test_bot?startgroup=setup');
    for(const path of ['/api/session','/api/connection','/api/logs','/api/export','/api/overview']){
      const text=await (await request(path)).text();expect(text).not.toContain(TOKEN);expect(text).not.toContain(webhookSecret);expect(text).not.toContain(PASSWORD);
    }
  });
  it('receives and processes Telegram messages using the encrypted token instead of environment BOT_TOKEN',async()=>{
    await setup();
    const payload={update_id:701,message:{message_id:31,date:Math.floor(Date.now()/1000),chat:{id:-10055001,type:'supergroup',title:'Working Group'},from:{id:OWNERS[0],first_name:'Owner'},text:'/panel@nova_setup_test_bot'}};
    expect((await request('/telegram',payload,{'x-telegram-bot-api-secret-token':'wrong'})).status).toBe(401);
    expect((await request('/telegram',payload,{'x-telegram-bot-api-secret-token':webhookSecret})).status).toBe(200);
    await request('/api/queue/run',{});
    const status=await (await request('/api/connection')).json() as {stage:string;lastReceivedAt:number;lastProcessedAt:number;lastGroupAt:number};
    expect(status.stage).toBe('connected');expect(status.lastReceivedAt).toBeGreaterThan(0);expect(status.lastProcessedAt).toBeGreaterThan(0);expect(status.lastGroupAt).toBeGreaterThan(0);
    expect(calls.some(c=>c.method==='sendMessage'&&String(c.data.text).includes('اتاق فرمان گروه'))).toBe(true);
    const groups=await (await request('/api/groups')).json() as {groups:{id:number}[]};expect(groups.groups.some(g=>g.id===-10055001)).toBe(true);
  });
  it('repairs an old/mismatched webhook without pasting the token again',async()=>{
    await setup();webhookURL='https://old-worker.example/other-path?private=hidden';
    const before=await (await request('/api/connection')).json() as {stage:string;registeredHere:boolean};expect(before.stage).toBe('webhook_elsewhere');expect(before.registeredHere).toBe(false);
    const after=await (await request('/api/setup',{})).json() as {ok:boolean};expect(after.ok).toBe(true);expect(webhookURL).toBe('https://setup.test/telegram');
  });
  it('keeps a verified credential if Telegram rejects webhook registration and reports partial completion honestly',async()=>{
    failWebhook=true;const result=await setup();expect(result.saved).toBe(true);expect(result.ok).toBe(false);expect(result.warning).not.toContain(TOKEN);
    failWebhook=false;expect((await (await request('/api/setup',{})).json() as {ok:boolean}).ok).toBe(true);
  });
  it('rejects invalid bot credentials with a helpful redacted error and no configuration side effects',async()=>{
    failToken=true;const res=await request('/api/setup',{botToken:TOKEN});expect(res.status).toBe(400);expect(await res.text()).not.toContain(TOKEN);
    failToken=false;expect((await (await request('/api/connection')).json() as {stage:string}).stage).toBe('needs_token');expect(calls.filter(c=>c.method==='setWebhook')).toHaveLength(0);
  });
  it('recovers a group that was joined before webhook registration and diagnoses no-Ban access correctly',async()=>{
    await setup();const res=await request('/api/groups/lookup',{reference:'https://t.me/already_group'});expect(res.status).toBe(200);
    const data=await res.json() as {group:{id:number};capabilities:{panel:boolean;restrict:boolean};warnings:string[]};
    expect(data.group.id).toBe(-10055001);expect(data.capabilities.panel).toBe(true);expect(data.capabilities.restrict).toBe(false);
    const diagnostic=await request('/api/groups/-10055001/diagnostics');expect(diagnostic.status).toBe(200);
    expect(data.warnings.some(w=>w.includes('پنل به این دسترسی نیاز ندارد'))).toBe(true);
    expect((await request('/api/groups/lookup',{reference:'https://t.me/+private-invite'})).status).toBe(400);
  });
  it('does not expose raw tokens even if Telegram includes them in webhook error descriptions',async()=>{
    await setup();pendingError='delivery failure '+TOKEN+' '+webhookSecret;
    const res=await request('/api/connection');const text=await res.text();expect(text).not.toContain(TOKEN);expect(text).not.toContain(webhookSecret);expect(JSON.parse(text).stage).toBe('webhook_error');
  });
  it('recognizes group addition and produces a visible in-group setup acknowledgement',async()=>{
    await setup();
    const event={update_id:901,my_chat_member:{chat:{id:-10055001,type:'supergroup',title:'Group link'},from:{id:OWNERS[0],first_name:'Owner'},old_chat_member:{status:'left',user:{id:999999}},new_chat_member:{status:'administrator',user:{id:999999},can_delete_messages:true,can_restrict_members:false}}};
    expect((await request('/telegram',event,{'x-telegram-bot-api-secret-token':webhookSecret})).status).toBe(200);
    await request('/api/queue/run',{});
    expect(calls.some(c=>c.method==='sendMessage'&&String(c.data.text).includes('نُوا به این گروه وصل شد'))).toBe(true);
    const groups=await (await request('/api/groups')).json() as {groups:{id:number}[]};expect(groups.groups.some(g=>g.id===-10055001)).toBe(true);
  });
});
