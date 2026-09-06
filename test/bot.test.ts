import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS } from '../src/commands';
import { OWNERS, HOUR, DEFAULT_GROUP } from '../src/config';
import { CHAT, fixture, message, update, user } from './helpers';
import type { DuelRow, Message, Update } from '../src/types';

let f:ReturnType<typeof fixture>;
beforeEach(()=>{f=fixture();f.db.ensureGroup(CHAT,'Test');for(const id of [1,2,3,10,...OWNERS])f.db.ensureUser(user(id));f.admins.set(10,{status:'administrator',can_delete_messages:true,can_change_info:true,can_restrict_members:true,can_invite_users:true,can_pin_messages:true});});
afterEach(()=>{f.close();vi.restoreAllMocks();});
const texts=()=>f.calls.filter(c=>c.method==='sendMessage').map(c=>String(c.data.text));
const methods=(name:string)=>f.calls.filter(c=>c.method===name);
async function callback(actor:number,data:string,m?:Message){await f.bot.handle({update_id:Math.floor(Math.random()*1e8),callback_query:{id:'cb',from:user(actor),data,message:m||message(999999,'panel')}});}

describe('authorization of messages and inline callbacks',()=>{
  it('blocks regular members from moderation and owner commands',async()=>{
    await f.bot.handle(update(1,'بن 2'));await f.bot.handle(update(1,'دادن الماس 2 100'));
    expect(methods('banChatMember')).toHaveLength(0);expect(f.db.user(2)?.diamonds).toBe(0);
  });
  it.each(OWNERS)('owner %s is authorized globally without becoming group admin',async owner=>{
    await f.bot.handle(update(owner,'سکوت 2 30'));
    expect(methods('restrictChatMember')).toHaveLength(1);expect(methods('restrictChatMember')[0].data.user_id).toBe(2);
  });
  it('protects owners and real Telegram admins from punitive operations',async()=>{
    await f.bot.handle(update(10,`بن ${OWNERS[0]}`));await f.bot.handle(update(OWNERS[0],'بن 10'));
    expect(methods('banChatMember')).toHaveLength(0);
  });
  it('checks the specific admin permission and rechecks revocation on every update',async()=>{
    f.admins.set(10,{status:'administrator',can_delete_messages:false});await f.bot.handle(update(10,'حذف 1000'));
    expect(f.db.one<{n:number}>('SELECT COUNT(*) n FROM confirmations')!.n).toBe(0);
    f.admins.set(10,{status:'administrator',can_change_info:true});await callback(10,'toggle:antiflood');expect(f.db.settings(CHAT).antiflood).toBe(false);
    f.admins.set(10,{status:'member'});await callback(10,'toggle:antiflood');expect(f.db.settings(CHAT).antiflood).toBe(false);
  });
  it('does not trust another user clicking an admin panel',async()=>{
    await callback(1,'toggle:games');expect(f.db.settings(CHAT).games).toBe(true);
    expect(methods('answerCallbackQuery').at(-1)?.data.show_alert).toBe(true);
  });
  it('does not execute anonymous, forwarded or edited owner commands',async()=>{
    await f.bot.handle(update(OWNERS[0],'دادن الماس 1 50',{sender_chat:{id:CHAT,type:'supergroup'}}));
    await f.bot.handle(update(OWNERS[0],'دادن الماس 1 50',{forward_origin:{type:'user'}}));
    await f.bot.handle({update_id:50,edited_message:message(OWNERS[0],'دادن الماس 1 50')});
    expect(f.db.user(1)?.diamonds).toBe(0);
  });
  it('supports free-form Persian send-and-pin and escapes message HTML',async()=>{
    await f.bot.handle(update(OWNERS[0],'پیام درخواست دسترسی کامل لطفا ؛پین'));
    expect(texts()).toContain('درخواست دسترسی کامل لطفا');expect(methods('pinChatMessage')).toHaveLength(1);
    await f.bot.handle(update(OWNERS[0],'پیام <b>متن</b>'));
    expect(texts()).toContain('&lt;b&gt;متن&lt;/b&gt;');
  });
  it('does not imply that a successful send failed when pinning fails',async()=>{
    f.failures.set('pinChatMessage',403);await f.bot.handle(update(OWNERS[0],'پیام متن ؛پین'));
    expect(texts().filter(t=>t==='متن')).toHaveLength(1);expect(texts().some(t=>t.includes('پیام ارسال شد، ولی سنجاق نشد'))).toBe(true);
  });
  it('keeps pairing codes out of group chats and permits private self onboarding',async()=>{
    await f.bot.handle(update(1,'سلف'));expect(f.db.one<{n:number}>('SELECT COUNT(*) n FROM tokens')!.n).toBe(0);
    await f.bot.handle(update(1,'سلف',{chat:{id:1,type:'private'}}));
    expect(texts().at(-1)).toMatch(/<code>[a-f0-9]{32}<\/code>/);
    expect(f.db.one<{n:number}>('SELECT COUNT(*) n FROM messages WHERE chat_id=1')!.n).toBe(0);
  });
});
describe('moderation behavior',()=>{
  it('adds exact text and sticker blacklist entries by replying to دیمن',async()=>{
    await f.bot.handle(update(10,'دیمن',{reply_to_message:message(1,'متن بد')}));
    await f.bot.handle(update(10,'دیمن',{reply_to_message:message(1,'',{sticker:{file_id:'a',file_unique_id:'stable'}})}));
    const text=message(1,'متن بد'),sticker=message(2,'',{sticker:{file_id:'b',file_unique_id:'stable'}});
    await f.bot.handle({update_id:70,message:text});await f.bot.handle({update_id:71,message:sticker});
    expect(methods('deleteMessage').map(c=>c.data.message_id)).toEqual([text.message_id,sticker.message_id]);
  });
  it('filters edited captions and never executes their text',async()=>{
    const m=message(1,'',{caption:'https://example.com',photo:[{file_id:'x',file_unique_id:'y'}]});
    await f.bot.handle({update_id:50,edited_message:m});expect(methods('deleteMessage')).toHaveLength(1);
  });
  it('exempts owners, admins and trusted members but grants no admin rights to trusted users',async()=>{
    f.db.patchGroup(CHAT,{trusted:[1]},OWNERS[0]);
    for(const id of [1,10,...OWNERS])await f.bot.handle(update(id,'https://example.org'));
    expect(methods('deleteMessage')).toHaveLength(0);
    await f.bot.handle(update(1,'قفل عکس'));expect(f.db.settings(CHAT).locks).not.toContain('photos');
  });
  it('enforces flood limit with rate-limited warning notices',async()=>{
    f.db.patchGroup(CHAT,{floodLimit:3},OWNERS[0]);
    for(let i=0;i<6;i++)await f.bot.handle(update(1,'ordinary message'));
    expect(methods('deleteMessage')).toHaveLength(3);expect(f.db.warning(CHAT,1)).toBe(1);
  });
  it('executes real warn-limit penalties without resetting on API failure',async()=>{
    f.db.patchGroup(CHAT,{warnLimit:2},OWNERS[0]);
    await f.bot.handle(update(10,'اخطار 1'));await f.bot.handle(update(10,'اخطار 1'));
    expect(methods('restrictChatMember')).toHaveLength(1);expect(f.db.warning(CHAT,1)).toBe(0);
    f.failures.set('restrictChatMember',403);await f.bot.handle(update(10,'اخطار 1'));await f.bot.handle(update(10,'اخطار 1'));
    expect(f.db.warning(CHAT,1)).toBe(2);
  });
  it('binds captcha to the joining user and validates the expected answer',async()=>{
    f.db.patchGroup(CHAT,{captcha:true},OWNERS[0]);await f.bot.handle(update(10,'',{new_chat_members:[user(1)]}));
    const row=f.db.one<{answer:string}>('SELECT answer FROM captchas WHERE user_id=1')!;
    await callback(2,`captcha:1:${row.answer}`);expect(f.db.one('SELECT * FROM captchas')).toBeDefined();
    await callback(1,`captcha:1:${row.answer}`);expect(f.db.one('SELECT * FROM captchas')).toBeUndefined();
    expect(methods('restrictChatMember').at(-1)?.data.permissions).toEqual({can_send_messages:true,can_send_other_messages:true,can_send_photos:true});
  });
  it('queues every member in a large join event without dropping the remainder',async()=>{
    const members=Array.from({length:12},(_,i)=>user(200+i));
    await f.bot.handle(update(10,'',{new_chat_members:members}));
    expect(texts().filter(t=>t.includes('خوش اومدی'))).toHaveLength(5);
    await f.bot.jobs();await f.bot.jobs();
    expect(texts().filter(t=>t.includes('خوش اومدی'))).toHaveLength(12);
    expect(f.db.one<{n:number}>("SELECT COUNT(*) n FROM jobs WHERE state='pending'")!.n).toBe(0);
  });
  it('night mode handles ranges crossing midnight',async()=>{
    vi.spyOn(Date,'now').mockReturnValue(Date.UTC(2026,8,5,23,0));f.db.patchGroup(CHAT,{nightEnabled:true,nightStart:22,nightEnd:7,timezone:0},OWNERS[0]);
    await f.bot.handle(update(1,'hello'));expect(methods('deleteMessage')).toHaveLength(1);
  });
  it('maintenance still moderates harmful content but stops new public games',async()=>{
    f.db.setGlobal({maintenance:true});await f.bot.handle(update(1,'https://example.com'));await f.bot.handle(update(2,'دوئل 🎲 50'));
    expect(methods('deleteMessage')).toHaveLength(1);expect(f.db.activeDuel(2)).toBeUndefined();
  });
});
describe('native dice and durable jobs',()=>{
  async function game(){await f.bot.handle(update(1,'دوئل 🎲 50'));const d=f.db.activeDuel(1)!;const prompt=message(999999,'challenge',{message_id:d.message_id!,from:{id:999999,first_name:'Nova',is_bot:true}});await callback(2,'join:'+d.id,prompt);return {d,prompt};}
  it('accepts only each participant’s first native dice reply to the challenge',async()=>{
    const {d,prompt}=await game();
    await f.bot.handle(update(3,'',{dice:{emoji:'🎲',value:6},reply_to_message:prompt}));
    await f.bot.handle(update(1,'',{dice:{emoji:'🎲',value:6},reply_to_message:prompt,forward_origin:{type:'user'}}));
    expect(f.db.duel(d.id)?.roll1).toBeNull();
    await f.bot.handle(update(1,'',{dice:{emoji:'🎲',value:5},reply_to_message:prompt}));
    await f.bot.handle(update(1,'',{dice:{emoji:'🎲',value:6},reply_to_message:prompt}));
    await f.bot.handle(update(2,'',{dice:{emoji:'🎲',value:1},reply_to_message:prompt}));
    expect(f.db.duel(d.id)?.state).toBe('settled');expect(f.db.duel(d.id)?.roll1).toBe(5);expect(f.db.user(1)?.coins).toBe(1050);
  });
  it('ignores dice replying to a different message',async()=>{
    const {d}=await game();await f.bot.handle(update(1,'',{dice:{emoji:'🎲',value:6},reply_to_message:message(999999,'other')}));expect(f.db.duel(d.id)?.roll1).toBeNull();
  });
  it('refunds the creator when posting a challenge fails',async()=>{
    f.failures.set('sendMessage',403);
    await f.bot.handle(update(1,'دوئل 🎲 50'));
    expect(f.db.user(1)?.coins).toBe(1000);expect(f.db.activeDuel(1)).toBeUndefined();
  });
  it('requires actor-bound confirmation before enqueuing and batches 1000 deletions',async()=>{
    for(let i=0;i<1100;i++)f.db.exec('INSERT INTO messages VALUES (?,?,?,?)',CHAT,10000+i,Date.now()-HOUR,1);
    await f.bot.handle(update(10,'حذف 1000'));
    expect(methods('deleteMessages')).toHaveLength(0);expect(f.db.one('SELECT * FROM jobs')).toBeUndefined();
    const confirmation=f.db.one<{id:string}>('SELECT id FROM confirmations')!;
    await callback(1,'confirm:'+confirmation.id);expect(f.db.one('SELECT * FROM jobs')).toBeUndefined();
    await callback(10,'confirm:'+confirmation.id);
    expect(f.db.one('SELECT * FROM jobs')).toBeDefined();
    for(let i=0;i<10;i++){f.db.exec('UPDATE jobs SET next_at=0');await f.bot.jobs();}
    expect(methods('deleteMessages')).toHaveLength(10);expect(methods('deleteMessages').every(c=>(c.data.message_ids as number[]).length<=100)).toBe(true);
    const ids=methods('deleteMessages').flatMap(c=>c.data.message_ids as number[]);expect(new Set(ids).size).toBe(1000);expect(ids[0]).toBe(10000);expect(ids.at(-1)).toBe(10999);
    expect(f.db.one<{state:string}>('SELECT state FROM jobs')?.state).toBe('done');
  });
  it('rechecks scheduled-message and pin permissions at execution time',async()=>{
    const id=f.db.job(CHAT,10,'schedule',{text:'future',pin:true},0);f.admins.set(10,{status:'administrator',can_pin_messages:false});await f.bot.jobs();
    expect(texts()).not.toContain('future');expect(f.db.one<{state:string}>('SELECT state FROM jobs WHERE id=?',id)?.state).toBe('failed');
  });
  it('never blindly retries scheduled sends after ambiguous network failure',async()=>{
    const id=f.db.job(CHAT,OWNERS[0],'schedule',{text:'once',pin:false},0);f.failures.set('sendMessage',503);await f.bot.jobs();await f.bot.jobs();
    expect(texts().filter(t=>t==='once')).toHaveLength(1);expect(f.db.one<{state:string}>('SELECT state FROM jobs WHERE id=?',id)?.state).toBe('failed');
  });
});
