import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BotConnection, botLinks, groupCapabilities, groupReference, validBotToken } from '../src/connection';
import type { BotInfo } from '../src/connection';
import { openCredentials, sealCredentials, passwordStamp } from '../src/vault';
import type { VaultEnvelope } from '../src/vault';
import { OWNERS } from '../src/config';
import type { ChatMember, Env } from '../src/types';
import { safeError, hash } from '../src/utils';
import { CHAT, fixture, message, update, user } from './helpers';

const PASSWORD = 'long-unit-test-panel-password-not-production';
const TOKEN = '999999:FAKE_SETUP_TOKEN_TEST_ONLY_1234567890';
const SECRET = 'fake_internal_webhook_secret_32_chars';
const ORIGIN = 'https://unit.test';
let f: ReturnType<typeof fixture>;
let env: Env;
let connection: BotConnection;
beforeEach(()=>{f=fixture();env={...f.env,BOT_TOKEN:undefined,WEBHOOK_SECRET:undefined,PANEL_PASSWORD:PASSWORD};connection=new BotConnection(f.db,env);});
afterEach(()=>f.close());

describe('credential encryption and safe error handling',()=>{
  it('encrypts authenticated credentials with randomized salt/nonce, readable only with the owner password',async()=>{
    const data={botToken:TOKEN,webhookSecret:SECRET};
    const first=await sealCredentials(data,PASSWORD),second=await sealCredentials(data,PASSWORD);
    expect(JSON.stringify(first)).not.toContain(TOKEN);expect(JSON.stringify(first)).not.toContain(SECRET);
    expect(first.salt).not.toBe(second.salt);expect(first.iv).not.toBe(second.iv);expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(await openCredentials(first,PASSWORD)).toEqual(data);
    await expect(openCredentials(first,'different-password-12345')).rejects.toThrow('دوباره ثبت');
  });
  it('rejects modified ciphertext, unsupported envelope versions and attacker-controlled KDF costs',async()=>{
    const sealed=await sealCredentials({botToken:TOKEN,webhookSecret:SECRET},PASSWORD);
    for(const patch of [{ciphertext:'A'.repeat(100)},{version:2},{iterations:999999999},{iv:''}]) {
      await expect(openCredentials({...sealed,...patch} as VaultEnvelope,PASSWORD)).rejects.toThrow();
    }
  });
  it('uses a salted slow password-rotation stamp rather than an offline fast-hash oracle',async()=>{
    const a=await passwordStamp(PASSWORD,'01'.repeat(16)),b=await passwordStamp(PASSWORD,'02'.repeat(16));
    expect(a).not.toBe(b);expect(a).not.toBe(await hash(PASSWORD));
    expect(await passwordStamp(PASSWORD,'01'.repeat(16))).toBe(a);
    expect(await passwordStamp(PASSWORD+'x','01'.repeat(16))).not.toBe(a);
  });
  it('redacts known credentials and Bot API tokens before surfacing errors',()=>{
    const error=new Error(`bad ${TOKEN} ${SECRET} ${PASSWORD}`);
    const result=safeError(error,[TOKEN,SECRET,PASSWORD]);
    expect(result).not.toContain(TOKEN);expect(result).not.toContain(SECRET);expect(result).not.toContain(PASSWORD);
    expect(safeError(new Error(TOKEN))).not.toContain(TOKEN);
  });
  it.each(['','bad','999999:short','999999:invalid/slash/token_1234567890','000000:INVALID_TOKEN_LONG_ENOUGH_123456'])('rejects malformed bot token %s',value=>expect(validBotToken(value)).toBe(false));
});

describe('owner setup and diagnostics',()=>{
  it('starts without a bot token or webhook secret and asks for a token in the authenticated panel',async()=>{
    const status=await connection.status(ORIGIN);expect(status.stage).toBe('needs_token');expect(status.configured).toBe(false);
    expect(f.calls).toHaveLength(0);expect((await connection.runtimeEnv()).BOT_TOKEN).toBeUndefined();
  });
  it('validates then encrypts the token, creates a secret, registers the webhook and installs the command menu',async()=>{
    f.hook.url='';const result=await connection.setup(ORIGIN,TOKEN,OWNERS[0]);
    expect(result.ok).toBe(true);expect(result.connection.stage).toBe('waiting_for_update');expect(result.connection.receiving).toBe(false);
    const webhook=f.calls.find(c=>c.method==='setWebhook')!.data;
    expect(webhook.url).toBe(ORIGIN+'/telegram');expect(webhook.secret_token).toMatch(/^[a-f0-9]{64}$/);expect(webhook.drop_pending_updates).toBe(false);
    expect(f.calls.some(c=>c.method==='setMyCommands')).toBe(true);
    expect(result.connection.addGroupUrl).toBe('https://t.me/nova_test_bot?startgroup=setup');
    expect(result.connection.panelCommand).toBe('/panel@nova_test_bot');
    const stored=JSON.stringify(f.db.all('SELECT * FROM meta'));
    expect(stored).not.toContain(TOKEN);expect(stored).not.toContain(webhook.secret_token);
    expect(JSON.stringify(result)).not.toContain(TOKEN);expect(JSON.stringify(result)).not.toContain(webhook.secret_token);
    const current=await connection.current();expect(current.credentials?.botToken).toBe(TOKEN);
  });
  it('recovers the encrypted token after object restart and prioritizes it over legacy environment bindings',async()=>{
    await connection.setup(ORIGIN,TOKEN,OWNERS[0]);
    const reopened=new BotConnection(f.db,{...env,BOT_TOKEN:'777777:FAKE_STALE_ENVIRONMENT_TOKEN_1234567890',WEBHOOK_SECRET:SECRET});
    expect((await reopened.current()).credentials?.botToken).toBe(TOKEN);expect((await reopened.current()).credentials?.source).toBe('panel');
  });
  it('supports existing deployment secrets without forcing a migration or accepting any nonempty webhook as connected',async()=>{
    const legacy=new BotConnection(f.db,{...env,BOT_TOKEN:TOKEN,WEBHOOK_SECRET:SECRET});
    f.hook.url='https://elsewhere.test/path?secret='+SECRET;
    const state=await legacy.status(ORIGIN);
    expect(state.stage).toBe('webhook_elsewhere');expect(state.registeredHere).toBe(false);expect(state.canReceive).toBe(false);
    expect(state.webhook?.url).toBe('https://elsewhere.test/…');expect(JSON.stringify(state)).not.toContain(SECRET);
    const repaired=await legacy.setup(ORIGIN,undefined,OWNERS[0]);expect(repaired.ok).toBe(true);
    expect(f.calls.find(c=>c.method==='setWebhook')?.data.secret_token).toBe(SECRET);
  });
  it('distinguishes registration from a delivered Telegram update and ignores stale historical delivery errors',async()=>{
    await connection.setup(ORIGIN,TOKEN,OWNERS[0]);
    expect((await connection.status(ORIGIN)).receiving).toBe(false);
    f.db.setMeta('connection.lastReceivedAt',Date.now()+1);f.hook.last_error_date=Math.floor(Date.now()/1000)-300;f.hook.last_error_message='old error';
    const status=await connection.status(ORIGIN);expect(status.stage).toBe('connected');expect(status.receiving).toBe(true);
    f.hook.last_error_date=Math.floor(Date.now()/1000)+120;
    expect((await connection.status(ORIGIN)).stage).toBe('webhook_error');
  });
  it('does not save invalid tokens or overwrite a working connection when validation fails',async()=>{
    await connection.setup(ORIGIN,TOKEN,OWNERS[0]);const before=f.db.meta('bot.credentials.v1',null);
    f.failures.set('getMe',401);
    await expect(connection.setup(ORIGIN,'999999:FAKE_REVOKED_TOKEN_TEST_ONLY_1234567',OWNERS[0])).rejects.toThrow('نامعتبر');
    expect(f.db.meta('bot.credentials.v1',null)).toEqual(before);
  });
  it('keeps a validated token when webhook setup fails so repair does not require repasting it',async()=>{
    f.hook.url='';f.failures.set('setWebhook',400);
    const result=await connection.setup(ORIGIN,TOKEN,OWNERS[0]);
    expect(result.saved).toBe(true);expect(result.ok).toBe(false);expect(result.warning).toContain('ذخیره شد');
    expect((await connection.current()).credentials?.botToken).toBe(TOKEN);
    f.failures.delete('setWebhook');expect((await connection.setup(ORIGIN,undefined,OWNERS[0])).ok).toBe(true);
  });
  it('does not erase group/economy state by silently binding a different bot',async()=>{
    await connection.setup(ORIGIN,TOKEN,OWNERS[0]);const before=f.db.meta('bot.credentials.v1',null);
    await expect(connection.setup(ORIGIN,'777777:FAKE_DIFFERENT_BOT_TOKEN_1234567890',OWNERS[0])).rejects.toThrow('بات جدید');
    expect(f.db.meta('bot.credentials.v1',null)).toEqual(before);
  });
  it('fails closed after password rotation, explains recovery, and allows re-entering the same bot token',async()=>{
    await connection.setup(ORIGIN,TOKEN,OWNERS[0]);const rotated=new BotConnection(f.db,{...env,PANEL_PASSWORD:'rotated-secure-test-password'});
    expect((await rotated.status(ORIGIN)).stage).toBe('vault_locked');expect((await rotated.runtimeEnv()).BOT_TOKEN).toBeUndefined();
    expect((await rotated.setup(ORIGIN,TOKEN,OWNERS[0])).ok).toBe(true);
    expect((await new BotConnection(f.db,{...env,PANEL_PASSWORD:'rotated-secure-test-password'}).current()).credentials?.botToken).toBe(TOKEN);
  });
  it('refuses saving bot credentials over an HTTP origin',async()=>{
    await expect(connection.setup('http://localhost:8787',TOKEN,OWNERS[0])).rejects.toThrow('HTTPS');
    expect(f.db.meta('bot.credentials.v1',null)).toBeNull();expect(f.calls).toHaveLength(0);
  });
});

describe('group links and independent permissions',()=>{
  it.each(['@my_group','https://t.me/my_group','t.me/my_group/'])('accepts a public group reference %s',value=>expect(groupReference(value)).toBe('@my_group'));
  it('supports Persian numeric IDs without fetching arbitrary URLs or accepting private invitations',()=>{
    expect(groupReference('-۱۰۰۱۲۳۴')).toBe(-1001234);
    for(const value of ['https://evil.test/group','https://t.me/group?secret=x','https://t.me/+invite','https://t.me/joinchat/invite','https://t.me/c/123/4','https://t.me/my_group?x=1','https://t.me/my_group/other'])expect(()=>groupReference(value)).toThrow();
  });
  it('generates a normal add link without requiring Ban Users and a separate opt-in admin-rights link',()=>{
    const links=botLinks({username:'nova_test_bot'});
    expect(links.addGroupUrl).toBe('https://t.me/nova_test_bot?startgroup=setup');expect(links.addGroupUrl).not.toContain('restrict_members');
    expect(links.adminGroupUrl).toContain('restrict_members');expect(links.startUrl).toBe('https://t.me/nova_test_bot?start=setup');
    expect(botLinks({username:'bad/user'}).addGroupUrl).toBeNull();
  });
  it('reports a usable panel independently of missing restrict/ban permission',()=>{
    const member={status:'administrator',user:user(999999),can_delete_messages:true,can_restrict_members:false,can_pin_messages:true} satisfies ChatMember;
    const caps=groupCapabilities(member,{...user(999999),is_bot:true,can_read_all_group_messages:false} as BotInfo);
    expect(caps.panel).toBe(true);expect(caps.readAllMessages).toBe(true);expect(caps.delete).toBe(true);expect(caps.restrict).toBe(false);
  });
  it('does not confuse privacy restrictions, inability to send and not being a group member',()=>{
    const me={...user(999999),is_bot:true,can_read_all_group_messages:false} as BotInfo;
    expect(groupCapabilities({status:'member',user:me},me).readAllMessages).toBe(false);
    expect(groupCapabilities({status:'member',user:me},me,{can_send_messages:false}).panel).toBe(false);
    expect(groupCapabilities({status:'restricted',is_member:false,user:me},me).isMember).toBe(false);
  });
  it('recovers a pre-existing group after checking actual membership, without requiring ban permission',async()=>{
    await connection.setup(ORIGIN,TOKEN,OWNERS[0]);f.admins.set(999999,{status:'administrator',can_restrict_members:false,can_delete_messages:true});
    const result=await connection.recoverGroup('https://t.me/my_group',OWNERS[0]);
    expect(result.group.id).toBe(CHAT);expect(result.active).toBe(1);expect(result.capabilities.panel).toBe(true);expect(result.capabilities.restrict).toBe(false);
    expect(f.db.group(CHAT)).toBeDefined();expect(result.warnings.some(w=>w.includes('پنل به این دسترسی نیاز ندارد'))).toBe(true);
  });
  it('does not register groups the bot has left or undo a deliberate owner block',async()=>{
    await connection.setup(ORIGIN,TOKEN,OWNERS[0]);f.admins.set(999999,{status:'left'});
    await expect(connection.recoverGroup('@my_group',OWNERS[0])).rejects.toThrow('عضو');expect(f.db.group(CHAT)).toBeUndefined();
    f.admins.set(999999,{status:'administrator'});f.db.ensureGroup(CHAT,'blocked');f.db.exec('UPDATE groups SET active=-1 WHERE id=?',CHAT);
    const result=await connection.recoverGroup('@my_group',OWNERS[0]);expect(result.active).toBe(-1);
  });
  it('opens the real in-group panel with no Ban Users right and acknowledges group joins',async()=>{
    f.admins.set(999999,{status:'administrator',can_restrict_members:false});f.admins.set(10,{status:'administrator',can_delete_messages:true});
    await f.bot.handle({update_id:55,my_chat_member:{chat:{id:CHAT,type:'supergroup',title:'Panel works'},from:user(10),old_chat_member:{status:'left',user:user(999999)},new_chat_member:{status:'administrator',user:user(999999),can_delete_messages:true,can_restrict_members:false}}});
    expect(f.db.group(CHAT)?.active).toBe(1);
    expect(f.calls.some(c=>c.method==='sendMessage'&&String(c.data.text).includes('ندادن Ban Users مانع پنل نیست'))).toBe(true);
    await f.bot.handle(update(10,'/panel@nova_test_bot'));
    expect(f.calls.some(c=>c.method==='sendMessage'&&String(c.data.text).includes('اتاق فرمان گروه'))).toBe(true);
  });
  it('handles the group deep-link start payload and explains anonymous panel commands without granting authority',async()=>{
    f.admins.set(10,{status:'administrator'});
    await f.bot.handle(update(10,'/start setup'));
    expect(f.calls.some(c=>c.method==='sendMessage'&&String(c.data.text).includes('گروه در پنل وب ثبت شد'))).toBe(true);
    await f.bot.handle(update(10,'پنل',{sender_chat:{id:CHAT,type:'supergroup'}}));
    expect(f.calls.some(c=>c.method==='sendMessage'&&String(c.data.text).includes('از حالت ناشناس خارج شوید'))).toBe(true);
  });
  it('discovers a pre-existing group from an old panel callback only after checking current bot membership',async()=>{
    f.admins.set(10,{status:'administrator'});
    const panel=message(999999,'old panel');
    await f.bot.handle({update_id:777,callback_query:{id:'legacy',from:user(10),data:'panel:home',message:panel}});
    expect(f.db.group(CHAT)?.active).toBe(1);
    f.db.exec('DELETE FROM groups WHERE id=?',CHAT);f.admins.set(999999,{status:'left'});
    await f.bot.handle({update_id:778,callback_query:{id:'removed',from:user(10),data:'panel:home',message:panel}});
    expect(f.db.group(CHAT)).toBeUndefined();
  });
  it('does not let missing restriction rights break join welcomes when captcha was enabled',async()=>{
    f.db.ensureGroup(CHAT,'group');f.db.patchGroup(CHAT,{captcha:true},OWNERS[0]);f.admins.set(999999,{status:'administrator',can_restrict_members:false});
    await f.bot.handle(update(10,'',{new_chat_members:[user(1)]}));
    expect(f.calls.filter(c=>c.method==='restrictChatMember')).toHaveLength(0);
    expect(f.calls.some(c=>c.method==='sendMessage'&&String(c.data.text).includes('خوش اومدی'))).toBe(true);
    expect(f.db.one<{n:number}>('SELECT COUNT(*) n FROM captchas')!.n).toBe(0);
  });
});
