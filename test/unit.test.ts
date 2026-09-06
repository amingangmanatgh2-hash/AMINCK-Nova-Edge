import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS, parseCommand } from '../src/commands';
import { DAY, DEFAULT_GROUP, GAMES, HOUR, LOCKS, OWNERS, diceScore, filterReason, validSettings } from '../src/config';
import { calculate, hash, normalize, secureEqual } from '../src/utils';
import * as utils from '../src/utils';
import { CHAT, fixture, message, openDuel, user } from './helpers';

let f:ReturnType<typeof fixture>;
beforeEach(()=>{f=fixture();for(const id of [1,2,3,...OWNERS])f.db.ensureUser(user(id));f.db.ensureGroup(CHAT,'Test');});
afterEach(()=>{f.close();vi.restoreAllMocks();});

describe('command parser and real catalog',()=>{
  it.each(COMMANDS.map(c=>[c.name,c.fa]))('recognizes %s and its Persian form %s',(name,fa)=>{
    for(const input of [`/${name}`,name,fa,`/${fa}`])expect(parseCommand(input)?.command.name).toBe(name);
  });
  it('has no duplicate canonical commands and at least 30 real owner commands',()=>{
    expect(new Set(COMMANDS.map(c=>c.name)).size).toBe(COMMANDS.length);
    expect(COMMANDS.filter(c=>c.role==='owner').length).toBeGreaterThanOrEqual(30);
  });
  it('normalizes Persian/Arabic digits, letters and spacing',()=>{
    expect(normalize('  كي ۱۲٣\u200c ')).toBe('کی 123');
    expect(parseCommand('حذف ۱۰۰۰')?.args).toBe('1000');
    expect(parseCommand('/DUEL@nova_test_bot 🎲 ۵۰','nova_test_bot')?.args).toBe('🎲 50');
    expect(parseCommand('/duel@another_bot 🎲 50','nova_test_bot')).toBeUndefined();
    expect(parseCommand('/duel@nova_test_bot')).toBeUndefined();
    expect(parseCommand('حذف پیام')?.command.name).toBe('delete');
    expect(parseCommand('پیام درخواست دسترسی کامل لطفا ؛پین')?.args).toBe('درخواست دسترسی کامل لطفا ؛پین');
    expect(parseCommand('pinging')).toBeUndefined();
  });
});
describe('safe utility and filter behavior',()=>{
  it.each([['(12+3)*2',30],['-(5+2)/2',-3.5],['۱۲ × ۳',36],['10%3',1]])('calculates %s safely',(expr,result)=>expect(calculate(expr as string)).toBe(result));
  it.each(['process.exit()','1/0','9**9**9','2+','(1+2','1e9','__proto__','('.repeat(30)+'1'+')'.repeat(30)])('rejects unsafe expression %s',expr=>expect(()=>calculate(expr)).toThrow());
  it('compares secrets without returning secret material',async()=>{expect(await secureEqual('abc','abc')).toBe(true);expect(await secureEqual('abc','abd')).toBe(false);expect(await hash('x')).toHaveLength(64);});
  it('validates all setting fields and rejects pollution',()=>{
    expect(validSettings({floodLimit:7,captcha:true}).floodLimit).toBe(7);
    for(const bad of [{locks:['fake']},{floodLimit:0},{games:'on'},{maxBet:-1},{trust:[]},JSON.parse('{"constructor":"polluted"}')])expect(()=>validSettings(bad)).toThrow();
    expect(DEFAULT_GROUP.captcha).toBe(false);
  });
  it('detects caption links, hidden links, stickers, file types and direction controls',()=>{
    const s=validSettings({locks:LOCKS.map(l=>l[0])});
    expect(filterReason(message(1,'',{caption:'https://example.org'}),s)).toBe('links');
    expect(filterReason(message(1,'click',{entities:[{type:'text_link',offset:0,length:5,url:'https://hidden.test'}]}),s)).toBe('links');
    expect(filterReason(message(1,'',{sticker:{file_id:'a',file_unique_id:'b'}}),s)).toBe('stickers');
    expect(filterReason(message(1,'',{document:{file_name:'payload.APK'}}),validSettings({locks:['executables']}))).toBe('executables');
    expect(filterReason(message(1,'safe\u202etxt'),s)).toBe('rtlspoof');
    expect(filterReason(message(1,'',{dice:{emoji:'🎲',value:6}}),s,true)).toBeUndefined();
  });
  it('blacklists normalized exact text and stable sticker unique IDs',()=>{
    f.db.exec('INSERT INTO blacklist VALUES (?,?,?,?)',CHAT,'text','سلام کی',OWNERS[0]);
    f.db.exec('INSERT INTO blacklist VALUES (?,?,?,?)',CHAT,'sticker','stable',OWNERS[0]);
    expect(f.db.blacklistMatch(CHAT,message(1,'سلام كي'))).toBe(true);
    expect(f.db.blacklistMatch(CHAT,message(1,'سلام کی خوبه'))).toBe(false);
    expect(f.db.blacklistMatch(CHAT,message(1,'',{sticker:{file_id:'new-file-id',file_unique_id:'stable'}}))).toBe(true);
    expect(f.db.blacklistMatch(-123,message(1,'سلام کی'))).toBe(false);
  });
  it.each(GAMES.map(g=>[g.emoji,g.max]))('validates Telegram dice bounds for %s',(emoji,max)=>{
    expect(()=>diceScore(emoji as string,Number(max))).not.toThrow();
    for(const invalid of [0,Number(max)+1,1.5,-1])expect(()=>diceScore(emoji as string,invalid)).toThrow();
  });
  it('scores slots by combinations, not misleading raw values',()=>{expect(diceScore('🎰',64)).toBe(100);expect(diceScore('🎰',1)).toBe(30);expect(diceScore('🎰',2)).toBe(10);expect(diceScore('🎰',7)).toBe(0);});
});
describe('atomic virtual economy and duels',()=>{
  it('rolls back balances and ledger together',()=>{
    expect(()=>f.db.atomic(()=>{f.db.money(1,'coins',-20,'test');f.db.money(2,'coins',-2000,'fail');})).toThrow();
    expect(f.db.user(1)?.coins).toBe(1000);expect(f.db.one<{n:number}>('SELECT COUNT(*) n FROM ledger')!.n).toBe(0);
  });
  it('rejects invalid stakes and negative balances',()=>{
    for(const n of [-1,0,1.1,NaN,Infinity,1000000000])expect(()=>openDuel(f.db,1,n)).toThrow();
    expect(f.db.user(1)?.coins).toBe(1000);
  });
  it('escrows both players once and settles exactly once',()=>{
    const d=openDuel(f.db);expect(f.db.user(1)?.coins).toBe(950);
    f.db.joinDuel(d.id,2);expect(f.db.user(2)?.coins).toBe(950);
    expect(()=>f.db.joinDuel(d.id,2)).toThrow();
    expect(()=>f.db.roll(d.id,3,'🎲',6)).toThrow();
    f.db.roll(d.id,1,'🎲',6);expect(()=>f.db.roll(d.id,1,'🎲',1)).toThrow();
    const result=f.db.roll(d.id,2,'🎲',2);expect(result.state).toBe('settled');
    expect(f.db.user(1)?.coins).toBe(1050);expect(f.db.user(2)?.coins).toBe(950);
    expect(()=>f.db.roll(d.id,2,'🎲',6)).toThrow();expect(f.db.user(1)?.wins).toBe(1);
    expect(f.db.one<{n:number}>('SELECT SUM(coins) n FROM users WHERE id IN (1,2)')!.n).toBe(2000);
  });
  it('still settles escrow if an owner raises the winner balance during a game',()=>{
    const d=openDuel(f.db);f.db.joinDuel(d.id,2);
    f.db.money(1,'coins',1_000_000_000-f.db.user(1)!.coins,'owner.adjust');
    f.db.roll(d.id,1,'🎲',6);f.db.roll(d.id,2,'🎲',1);
    expect(f.db.user(1)?.coins).toBe(1_000_000_100);expect(f.db.duel(d.id)?.state).toBe('settled');
  });
  it('refunds tied games and cancellations without manufacturing coins',()=>{
    const d=openDuel(f.db);f.db.joinDuel(d.id,2);f.db.roll(d.id,1,'🎲',4);f.db.roll(d.id,2,'🎲',4);
    expect(f.db.user(1)?.coins).toBe(1000);expect(f.db.user(2)?.coins).toBe(1000);
    const other=openDuel(f.db);f.db.cancelDuel(other.id,1);expect(f.db.user(1)?.coins).toBe(1000);expect(()=>f.db.cancelDuel(other.id,1)).toThrow();
  });
  it('prevents simultaneous games and post-join cancellation',()=>{
    const d=openDuel(f.db);expect(()=>openDuel(f.db)).toThrow();f.db.joinDuel(d.id,2);expect(()=>f.db.cancelDuel(d.id,1)).toThrow();expect(()=>openDuel(f.db,2)).toThrow();
  });
  it('awards forfeit to the player who rolls instead of allowing free losses',()=>{
    const time=Date.now(),d=openDuel(f.db,1,50,'🎲',time);f.db.joinDuel(d.id,2,time);f.db.roll(d.id,1,'🎲',2,time+1000);f.db.expireDuels(time+901000);
    expect(f.db.user(1)?.coins).toBe(1050);expect(JSON.parse(f.db.duel(d.id)!.result!).reason).toBe('forfeit');expect(f.db.user(1)?.diamonds).toBe(0);
  });
  it('refunds silent or unjoined expired games',()=>{
    const time=Date.now(),d=openDuel(f.db,1,50,'🎲',time);f.db.joinDuel(d.id,2,time);f.db.expireDuels(time+901000);
    expect(f.db.user(1)?.coins).toBe(1000);expect(f.db.user(2)?.coins).toBe(1000);
    openDuel(f.db,1,50,'🎲',time);f.db.expireDuels(time+901000);expect(f.db.user(1)?.coins).toBe(1000);
  });
  it('rejects stale, mismatched or invited-to-other-user joins and rolls',()=>{
    const time=Date.now(),d=openDuel(f.db,1,50,'🎲',time);
    f.db.exec('UPDATE duels SET target=3 WHERE id=?',d.id);expect(()=>f.db.joinDuel(d.id,2,time)).toThrow();
    f.db.joinDuel(d.id,3,time);expect(()=>f.db.roll(d.id,1,'🎯',6,time+1000)).toThrow();expect(()=>f.db.roll(d.id,1,'🎲',5,time+999000)).toThrow();
  });
  it('enforces rare reward daily cap and excludes repeated opponents',()=>{
    vi.spyOn(utils,'randomInt').mockReturnValue(0);const time=Date.now();
    const win=(opponent:number,t:number)=>{const d=openDuel(f.db,1,50,'🎲',t);f.db.joinDuel(d.id,opponent,t);f.db.roll(d.id,1,'🎲',6,t+1000);return f.db.roll(d.id,opponent,'🎲',1,t+2000);};
    win(2,time);expect(f.db.user(1)?.diamonds).toBe(1);
    win(3,time+3000);expect(f.db.user(1)?.diamonds).toBe(1);
    f.db.exec('UPDATE users SET diamond_at=0 WHERE id=1');win(2,time+6000);expect(f.db.user(1)?.diamonds).toBe(1);
    win(2,time+DAY+10000);expect(f.db.user(1)?.diamonds).toBe(2);
  });
  it('limits daily coins to once per rolling 24 hours',()=>{
    const time=Date.now();f.db.daily(1,time);expect(()=>f.db.daily(1,time+DAY-1)).toThrow();f.db.daily(1,time+DAY);expect(f.db.user(1)?.coins).toBe(1200);
  });
});
describe('self lease, tokens and destructive operation boundaries',()=>{
  it('charges 5 diamonds once per prepaid hour, never per heartbeat',async()=>{
    f.db.money(1,'diamonds',12,'seed');const time=Date.now();
    const results=await Promise.all(Array.from({length:10},()=>Promise.resolve().then(()=>f.db.lease(1,time))));
    expect(results.filter(r=>r.charged===5)).toHaveLength(1);expect(f.db.user(1)?.diamonds).toBe(7);
    expect(f.db.lease(1,time+HOUR-1).charged).toBe(0);expect(f.db.lease(1,time+HOUR).charged).toBe(5);
    expect(()=>f.db.lease(1,time+2*HOUR)).toThrow();expect(f.db.user(1)?.diamonds).toBe(2);
  });
  it.each(OWNERS)('owner %s has unlimited diamond access with no debit',id=>{
    expect(f.db.lease(id).unlimited).toBe(true);expect(f.db.lease(id).diamonds).toBeNull();expect(f.db.user(id)?.diamonds).toBe(0);
  });
  it('uses single-use, user-bound pairing and scoped revocation',async()=>{
    const pair=await hash('pair'),token=await hash('token'),time=Date.now();f.db.addToken(pair,1,'pair_self',time+60000);
    expect(()=>f.db.pair(pair,token,'self',2,time)).toThrow();
    f.db.pair(pair,token,'self',1,time);expect(f.db.session(token)?.kind).toBe('self');expect(()=>f.db.pair(pair,awaitNoop(),'self',1,time)).toThrow();
    f.db.addToken('terminal',1,'terminal',time+60000);f.db.revoke(1,'self');expect(f.db.session(token)).toBeUndefined();expect(f.db.session('terminal')).toBeDefined();
  });
  it('prevents frozen users from renting, earning daily or joining games',()=>{
    f.db.money(1,'diamonds',20,'seed');f.db.exec('UPDATE users SET frozen=1 WHERE id=1');
    expect(()=>f.db.lease(1)).toThrow();expect(()=>f.db.daily(1)).toThrow();expect(()=>openDuel(f.db)).toThrow();
  });
  it('indexes metadata only and selects oldest eligible messages first',()=>{
    const time=Date.now();f.db.track(message(1,'DO NOT STORE THIS',{message_id:1,date:Math.floor((time-49*HOUR)/1000)}));
    f.db.track(message(1,'new',{message_id:3,date:Math.floor((time-HOUR)/1000)}));
    f.db.track(message(1,'old',{message_id:2,date:Math.floor((time-2*HOUR)/1000)}));
    expect(f.db.eligibleMessages(CHAT,1,time)).toEqual([2]);expect(f.db.eligibleMessages(CHAT,1000,time)).toEqual([2,3]);
    expect(Object.keys(f.db.one('SELECT * FROM messages')!)).not.toContain('text');
    f.db.cleanup(time);expect(f.db.one<{n:number}>('SELECT COUNT(*) n FROM messages')!.n).toBe(2);
  });
  it('confirmation is actor-bound, chat-bound, expiring and single use',()=>{
    const id=f.db.confirm(1,CHAT,'purge',{ids:[1]});expect(()=>f.db.consumeConfirm(id,2,CHAT)).toThrow();expect(()=>f.db.consumeConfirm(id,1,123)).toThrow();
    expect(f.db.consumeConfirm(id,1,CHAT).action).toBe('purge');expect(()=>f.db.consumeConfirm(id,1,CHAT)).toThrow();
    const expired=f.db.confirm(1,CHAT,'purge',{});f.db.exec('UPDATE confirmations SET expires_at=0 WHERE id=?',expired);expect(()=>f.db.consumeConfirm(expired,1,CHAT)).toThrow();
  });
  it('deduplicates message XP and never awards it twice on edits',()=>{
    const m=message(1,'text');f.db.track(m);f.db.track(m);f.db.track({...m,text:'edit',edit_date:1});
    expect(f.db.user(1)?.xp).toBe(2);expect(f.db.one<{messages:number}>('SELECT messages FROM members WHERE user_id=1')!.messages).toBe(1);
  });
});
function awaitNoop(){return 'new-token';}
