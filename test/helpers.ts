import { DatabaseSync } from 'node:sqlite';
import { Database } from '../src/database';
import type { Env, Message, SqlValue, Update, User } from '../src/types';
import { Bot } from '../src/bot';

export function fixture() {
  const sqlite = new DatabaseSync(':memory:'); let nested=0;
  const storage = {
    sql:{exec(query:string,...params:SqlValue[]) {
      if(query.trim().split(';').filter(v=>v.trim()).length>1){sqlite.exec(query);return {toArray:()=>[],rowsWritten:0};}
      const statement=sqlite.prepare(query);
      if(statement.columns().length){const rows=statement.all(...params as (string|number|null)[]);return {toArray:()=>rows,rowsWritten:0};}
      const result=statement.run(...params as (string|number|null)[]);return {toArray:()=>[],rowsWritten:Number(result.changes)};
    }},
    transactionSync<T>(fn:()=>T):T { const name='tx'+(++nested);sqlite.exec(`SAVEPOINT ${name}`);try{const result=fn();sqlite.exec(`RELEASE ${name}`);return result;}catch(e){sqlite.exec(`ROLLBACK TO ${name}`);sqlite.exec(`RELEASE ${name}`);throw e;}},
  } as unknown as DurableObjectStorage;
  const db=new Database(storage);
  const calls:{method:string;data:Record<string,unknown>}[]=[];
  const admins=new Map<number,Record<string,unknown>>();
  const failures=new Map<string,number>();
  const hook:{url:string;pending_update_count:number;last_error_date?:number;last_error_message?:string}={url:'https://unit.test/telegram',pending_update_count:0};
  let mid=5000;
  const env={BOT_TOKEN:'999999:FAKE_TEST_TOKEN_NOT_A_REAL_TELEGRAM_KEY',TELEGRAM:{async fetch(request:Request){
    const method=new URL(request.url).pathname.split('/').pop()!;
    let data:Record<string,unknown>;
    if(request.headers.get('content-type')?.includes('multipart'))data={};else data=await request.json() as Record<string,unknown>;
    calls.push({method,data});
    if(failures.has(method)){const code=failures.get(method)!;return new Response(JSON.stringify({ok:false,error_code:code,description:'test failure'}));}
    let result:unknown=true;
    if(method==='getMe'){const id=Number(new URL(request.url).pathname.match(/bot(\d+):/)?.[1]||999999);result={id,is_bot:true,first_name:'Nova',username:id===999999?'nova_test_bot':'other_test_bot',can_join_groups:true,can_read_all_group_messages:false};}
    if(method==='getChatMember')result={user:{id:data.user_id},status:'member',...(Number(data.user_id)===999999 ? {status:'administrator',can_restrict_members:true,can_delete_messages:true,can_pin_messages:true,can_change_info:true} : {}),...(admins.get(Number(data.user_id))||{})};
    if(method==='getChatAdministrators')result=[{user:{id:10,first_name:'Admin',is_bot:false}}];
    if(method==='getChatMemberCount')result=20;
    if(method==='getChat')result={id:Number(data.chat_id)||CHAT,type:'supergroup',title:'Test Group',permissions:{can_send_messages:true,can_send_other_messages:true,can_send_photos:true}};
    if(method==='sendMessage'||method==='sendDice')result={message_id:mid++,date:Math.floor(Date.now()/1000),chat:{id:data.chat_id,type:Number(data.chat_id)<0?'supergroup':'private'},from:{id:999999,first_name:'Nova',is_bot:true},text:data.text,dice:method==='sendDice'?{emoji:data.emoji,value:3}:undefined};
    if(method==='setWebhook')hook.url=String(data.url);
    if(method==='getWebhookInfo')result=hook;
    if(method==='createChatInviteLink')result={invite_link:'https://t.me/+test'};
    if(method==='exportChatInviteLink')result='https://t.me/+test';
    return new Response(JSON.stringify({ok:true,result}),{headers:{'content-type':'application/json'}});
  }}} as unknown as Env;
  const bot=new Bot(db,env);
  return {db,bot,env,sqlite,calls,admins,failures,hook,close:()=>sqlite.close()};
}
export const CHAT=-1001234567890;
export const user=(id:number):User=>({id,first_name:'User '+id});
let seq=1;
export function message(id:number,text='',extra:Partial<Message>={}):Message{return {message_id:seq++,date:Math.floor(Date.now()/1000),chat:{id:CHAT,type:'supergroup',title:'Test Group'},from:user(id),text,...extra};}
export function update(id:number,text='',extra:Partial<Message>={}):Update{return {update_id:seq++,message:message(id,text,extra)};}
export function openDuel(db:Database,creator=1,stake=50,emoji='🎲',time=Date.now()) {
  const d=db.createDuel(CHAT,creator,null,emoji,stake,time);db.exec("UPDATE duels SET state='open',message_id=777 WHERE id=?",d.id);return db.duel(d.id)!;
}
