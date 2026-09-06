import { DAY, VERSION, DEFAULT_GLOBAL, DEFAULT_GROUP, HOUR, SELF_HOURLY_DIAMONDS, diceScore, isOwner, validSettings } from './config';
import type { DuelRow, GlobalSettings, GroupRow, GroupSettings, Message, Session, SqlValue, User, UserRow } from './types';
import { normalize, randomInt, token } from './utils';

export class Database {
  constructor(readonly storage: DurableObjectStorage) {
    this.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY, title TEXT NOT NULL, settings TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, joined_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, coins INTEGER NOT NULL DEFAULT 1000 CHECK(coins >= 0), diamonds INTEGER NOT NULL DEFAULT 0 CHECK(diamonds >= 0), xp INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, daily_at INTEGER NOT NULL DEFAULT 0, diamond_at INTEGER NOT NULL DEFAULT 0, frozen INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS members (chat_id INTEGER NOT NULL, user_id INTEGER NOT NULL, messages INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, last_xp INTEGER NOT NULL DEFAULT 0, flood_start INTEGER NOT NULL DEFAULT 0, flood_count INTEGER NOT NULL DEFAULT 0, last_message INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(chat_id,user_id));
      CREATE TABLE IF NOT EXISTS messages (chat_id INTEGER NOT NULL, id INTEGER NOT NULL, date INTEGER NOT NULL, user_id INTEGER, PRIMARY KEY(chat_id,id));
      CREATE INDEX IF NOT EXISTS message_age ON messages(date);
      CREATE TABLE IF NOT EXISTS blacklist (chat_id INTEGER NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, actor INTEGER NOT NULL, PRIMARY KEY(chat_id,kind,value));
      CREATE TABLE IF NOT EXISTS warnings (chat_id INTEGER NOT NULL, user_id INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(chat_id,user_id));
      CREATE TABLE IF NOT EXISTS duels (id TEXT PRIMARY KEY, chat_id INTEGER NOT NULL, message_id INTEGER, creator INTEGER NOT NULL, opponent INTEGER, target INTEGER, emoji TEXT NOT NULL, stake INTEGER NOT NULL CHECK(stake > 0), state TEXT NOT NULL, roll1 INTEGER, roll2 INTEGER, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, result TEXT);
      CREATE INDEX IF NOT EXISTS duel_state ON duels(state,expires_at);
      CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, currency TEXT NOT NULL, delta INTEGER NOT NULL, balance INTEGER NOT NULL, reason TEXT NOT NULL, reference TEXT, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id,created_at);
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor INTEGER NOT NULL, chat_id INTEGER, action TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS leases (user_id INTEGER PRIMARY KEY, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, error TEXT);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, chat_id INTEGER NOT NULL, actor INTEGER NOT NULL, type TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', payload TEXT NOT NULL, next_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS confirmations (id TEXT PRIMARY KEY, actor INTEGER NOT NULL, chat_id INTEGER NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS captchas (chat_id INTEGER NOT NULL, user_id INTEGER NOT NULL, answer TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(chat_id,user_id));
      CREATE TABLE IF NOT EXISTS notes (chat_id INTEGER NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY(chat_id,name));
      CREATE TABLE IF NOT EXISTS answers (chat_id INTEGER NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY(chat_id,name));
      CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, starts INTEGER NOT NULL, count INTEGER NOT NULL);
    `);
  }
  exec(query: string, ...params: SqlValue[]) { return this.storage.sql.exec(query, ...params); }
  all<T = Record<string, unknown>>(query: string, ...params: SqlValue[]): T[] { return this.exec(query, ...params).toArray() as unknown as T[]; }
  one<T = Record<string, unknown>>(query: string, ...params: SqlValue[]): T | undefined { return this.all<T>(query, ...params)[0]; }
  atomic<T>(fn: () => T): T { return this.storage.transactionSync(fn); }
  meta<T>(key: string, fallback: T): T { const row = this.one<{value:string}>('SELECT value FROM meta WHERE key=?', key); return row ? JSON.parse(row.value) : fallback; }
  setMeta(key: string, value: unknown) { this.exec('INSERT OR REPLACE INTO meta(key,value) VALUES (?,?)', key, JSON.stringify(value)); }
  global(): GlobalSettings { return { ...DEFAULT_GLOBAL, ...this.meta('global', {}) }; }
  setGlobal(patch: Partial<GlobalSettings>) { this.setMeta('global', { ...this.global(), ...patch }); }
  log(actor: number, chat: number | null, action: string, detail = '') {
    this.exec('INSERT INTO audit(actor,chat_id,action,detail,created_at) VALUES (?,?,?,?,?)', actor, chat, action, detail.slice(0, 400), Date.now());
  }
  ensureUser(user: User, time = Date.now()): UserRow {
    this.exec('INSERT INTO users(id,name,created_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name', user.id, [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 100), time);
    return this.user(user.id)!;
  }
  user(id: number): UserRow | undefined { return this.one<UserRow>('SELECT * FROM users WHERE id=?', id); }
  requireUser(id: number): UserRow { const u = this.user(id); if (!u) throw new Error('کاربر هنوز ربات را شروع نکرده یا در گروه دیده نشده است.'); return u; }
  ensureGroup(id: number, title: string): GroupRow {
    this.exec('INSERT INTO groups(id,title,settings,joined_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title', id, title.slice(0, 128), JSON.stringify(DEFAULT_GROUP), Date.now());
    return this.group(id)!;
  }
  group(id: number): GroupRow | undefined { return this.one<GroupRow>('SELECT * FROM groups WHERE id=?', id); }
  settings(id: number): GroupSettings { const g = this.group(id); return { ...structuredClone(DEFAULT_GROUP), ...(g ? JSON.parse(g.settings) : {}) }; }
  patchGroup(id: number, patch: unknown, actor: number) {
    if (!this.group(id)) throw new Error('گروه شناخته‌شده نیست؛ ابتدا بات را به گروه اضافه کنید.');
    const settings = validSettings(patch, this.settings(id));
    this.exec('UPDATE groups SET settings=? WHERE id=?', JSON.stringify(settings), id);
    this.log(actor, id, 'settings.update', Object.keys(patch as object).join(', '));
    return settings;
  }
  member(chat: number, user: number) { this.exec('INSERT OR IGNORE INTO members(chat_id,user_id) VALUES (?,?)', chat, user); }
  track(m: Message, time = Date.now()): boolean {
    const inserted = this.exec('INSERT OR IGNORE INTO messages(chat_id,id,date,user_id) VALUES (?,?,?,?)', m.chat.id, m.message_id, m.date * 1000, m.from?.id || null).rowsWritten > 0;
    if (inserted && m.from && !m.from.is_bot && !m.sender_chat && !m.edit_date) {
      this.member(m.chat.id, m.from.id);
      this.exec('UPDATE members SET messages=messages+1 WHERE chat_id=? AND user_id=?', m.chat.id, m.from.id);
      const member = this.one<{last_xp:number}>('SELECT last_xp FROM members WHERE chat_id=? AND user_id=?', m.chat.id, m.from.id)!;
      if (time - member.last_xp >= 60_000) {
        this.exec('UPDATE members SET xp=xp+2,last_xp=? WHERE chat_id=? AND user_id=?', time, m.chat.id, m.from.id);
        this.exec('UPDATE users SET xp=xp+2 WHERE id=?', m.from.id);
      }
    }
    return inserted;
  }
  money(id: number, currency: 'coins' | 'diamonds', delta: number, reason: string, reference: string | null = null, time = Date.now()): number {
    if (!Number.isSafeInteger(delta)) throw new Error('مبلغ نامعتبر');
    const user = this.requireUser(id);
    if (currency === 'diamonds' && isOwner(id)) return user.diamonds;
    const balance = user[currency] + delta;
    if (balance < 0) throw new Error(currency === 'coins' ? 'سکه کافی نداری؛ جایزهٔ روزانه را امتحان کن.' : 'الماس کافی نیست؛ هر ساعت سلف ۵ الماس می‌خواهد.');
    if (!Number.isSafeInteger(balance)) throw new Error('موجودی از محدودهٔ عدد صحیح امن فراتر می‌رود.');
    this.exec(`UPDATE users SET ${currency}=? WHERE id=?`, balance, id);
    this.exec('INSERT INTO ledger(user_id,currency,delta,balance,reason,reference,created_at) VALUES (?,?,?,?,?,?,?)', id, currency, delta, balance, reason, reference, time);
    return balance;
  }
  daily(id: number, time = Date.now()): number {
    return this.atomic(() => {
      const user = this.requireUser(id);
      if (user.frozen) throw new Error('دسترسی اقتصادی شما متوقف است.');
      if (time - user.daily_at < DAY) throw new Error(`جایزهٔ بعدی حدود ${Math.ceil((DAY - time + user.daily_at) / HOUR)} ساعت دیگر آماده است.`);
      const amount = this.global().dailyCoins;
      this.money(id, 'coins', amount, 'daily', String(Math.floor(time / DAY)), time);
      this.exec('UPDATE users SET daily_at=? WHERE id=?', time, id); return amount;
    });
  }
  duel(id: string): DuelRow | undefined { return this.one<DuelRow>('SELECT * FROM duels WHERE id=?', id); }
  activeDuel(user: number): DuelRow | undefined { return this.one<DuelRow>("SELECT * FROM duels WHERE state IN ('creating','open','active') AND (creator=? OR opponent=?) LIMIT 1", user, user); }
  createDuel(chat: number, user: number, target: number | null, emoji: string, stake: number, time = Date.now()): DuelRow {
    return this.atomic(() => {
      if (this.requireUser(user).frozen) throw new Error('دسترسی بازی متوقف است.');
      if (this.activeDuel(user)) throw new Error('اول دوئل قبلی را تمام کن یا لغو کن.');
      if (target === user) throw new Error('حریف باید شخص دیگری باشد.');
      diceScore(emoji, 1);
      if (!Number.isSafeInteger(stake) || stake < 1 || stake > Math.min(this.global().maxBet, this.settings(chat).maxBet)) throw new Error('شرط از سقف گروه بالاتر است یا نامعتبر است.');
      const id = token(6);
      this.money(user, 'coins', -stake, 'duel.escrow', id, time);
      this.exec("INSERT INTO duels(id,chat_id,creator,target,emoji,stake,state,created_at,expires_at) VALUES (?,?,?,?,?,?,'creating',?,?)", id, chat, user, target, emoji, stake, time, time + this.global().duelSeconds * 1000);
      return this.duel(id)!;
    });
  }
  joinDuel(id: string, user: number, time = Date.now()): DuelRow {
    return this.atomic(() => {
      const d = this.duel(id);
      if (!d || d.state !== 'open' || d.expires_at <= time) throw new Error('این دوئل دیگر قابل پیوستن نیست.');
      if (d.creator === user || (d.target && d.target !== user)) throw new Error('این صندلی برای حریف دیگری است.');
      if (this.requireUser(user).frozen || this.activeDuel(user)) throw new Error('یک دوئل فعال داری یا دسترسی بازی‌ات متوقف است.');
      this.money(user, 'coins', -d.stake, 'duel.escrow', id, time);
      this.exec("UPDATE duels SET opponent=?,state='active',expires_at=? WHERE id=?", user, time + this.global().duelSeconds * 1000, id);
      this.member(d.chat_id, user); this.member(d.chat_id, d.creator);
      return this.duel(id)!;
    });
  }
  roll(id: string, user: number, emoji: string, value: number, time = Date.now()): DuelRow {
    return this.atomic(() => {
      const d = this.duel(id);
      if (!d || d.state !== 'active' || d.expires_at <= time) throw new Error('دوئل فعال نیست یا زمانش تمام شده.');
      if (emoji !== d.emoji) throw new Error(`فقط ایموجی ${d.emoji} را روی پیام چالش ریپلای کن.`);
      diceScore(emoji, value);
      const col = d.creator === user ? 'roll1' : d.opponent === user ? 'roll2' : null;
      if (!col) throw new Error('شما بازیکن این دوئل نیستید.');
      if (d[col] !== null) throw new Error('پرتاب اولت ثبت شده؛ پرتاب دوباره حساب نمی‌شود.');
      this.exec(`UPDATE duels SET ${col}=? WHERE id=?`, value, id);
      const updated = this.duel(id)!;
      if (updated.roll1 !== null && updated.roll2 !== null) {
        const a = diceScore(emoji, updated.roll1), b = diceScore(emoji, updated.roll2);
        this.finishDuel(updated, a === b ? null : a > b ? updated.creator : updated.opponent, 'played', time);
      }
      return this.duel(id)!;
    });
  }
  private finishDuel(d: DuelRow, winner: number | null, reason: string, time: number) {
    if (!['creating', 'open', 'active'].includes(d.state)) return;
    let diamond = false;
    if (winner && d.opponent) {
      const loser = winner === d.creator ? d.opponent : d.creator;
      this.money(winner, 'coins', d.stake * 2, 'duel.win', d.id, time);
      this.exec('UPDATE users SET wins=wins+1,xp=xp+20 WHERE id=?', winner);
      this.exec('UPDATE users SET losses=losses+1,xp=xp+5 WHERE id=?', loser);
      this.member(d.chat_id, winner); this.member(d.chat_id, loser);
      this.exec('UPDATE members SET wins=wins+1,xp=xp+20 WHERE chat_id=? AND user_id=?', d.chat_id, winner);
      this.exec('UPDATE members SET losses=losses+1,xp=xp+5 WHERE chat_id=? AND user_id=?', d.chat_id, loser);
      const prior = this.one<{n:number}>("SELECT COUNT(*) n FROM duels WHERE state='settled' AND created_at>? AND ((creator=? AND opponent=?) OR (creator=? AND opponent=?))", time - DAY, winner, loser, loser, winner)!.n;
      const u = this.requireUser(winner);
      if (reason === 'played' && d.stake >= 50 && !prior && time - u.diamond_at >= DAY && !isOwner(winner) && randomInt(this.global().diamondOdds) === 0) {
        this.money(winner, 'diamonds', 1, 'duel.rare_reward', d.id, time);
        this.exec('UPDATE users SET diamond_at=? WHERE id=?', time, winner); diamond = true;
      }
    } else {
      this.money(d.creator, 'coins', d.stake, 'duel.refund', d.id, time);
      if (d.opponent) this.money(d.opponent, 'coins', d.stake, 'duel.refund', d.id, time);
    }
    this.log(winner || d.creator, d.chat_id, 'duel.settled', `${d.id}: ${reason}`);
    this.exec('UPDATE duels SET state=?,result=? WHERE id=?', d.opponent ? 'settled' : 'cancelled', JSON.stringify({ winner, reason, diamond }), d.id);
  }
  cancelDuel(id: string, user: number, time = Date.now()): DuelRow {
    return this.atomic(() => {
      const d = this.duel(id);
      if (!d || d.creator !== user || !['creating', 'open'].includes(d.state)) throw new Error('فقط سازنده و قبل از پیوستن حریف می‌تواند لغو کند.');
      this.finishDuel(d, null, 'cancelled', time); return this.duel(id)!;
    });
  }
  expireDuels(time = Date.now()): DuelRow[] {
    return this.atomic(() => this.all<DuelRow>("SELECT * FROM duels WHERE state IN ('creating','open','active') AND expires_at<=? LIMIT 5", time).map(d => {
      const winner = d.opponent ? d.roll1 !== null && d.roll2 === null ? d.creator : d.roll2 !== null && d.roll1 === null ? d.opponent : null : null;
      this.finishDuel(d, winner, winner ? 'forfeit' : 'expired', time); return this.duel(d.id)!;
    }));
  }
  eligibleMessages(chat: number, count = 5000, time = Date.now()): number[] {
    return this.all<{id:number}>('SELECT id FROM messages WHERE chat_id=? AND date>? AND date<=? ORDER BY date,id LIMIT ?', chat, time - 48 * HOUR + 120000, time, count).map(r => r.id);
  }
  blacklistMatch(chat: number, m: Message): boolean {
    const text = normalize(m.text || m.caption || '').toLowerCase();
    return this.all<{kind:string;value:string}>('SELECT kind,value FROM blacklist WHERE chat_id=?', chat).some(r => r.kind === 'sticker' ? m.sticker?.file_unique_id === r.value : r.kind === 'text' ? !!text && r.value === text : text.includes(r.value));
  }
  warning(chat: number, user: number, delta = 0, reset = false): number {
    const old = this.one<{count:number}>('SELECT count FROM warnings WHERE chat_id=? AND user_id=?', chat, user)?.count || 0;
    const n = reset ? 0 : Math.max(0, old + delta);
    this.exec('INSERT OR REPLACE INTO warnings(chat_id,user_id,count) VALUES (?,?,?)', chat, user, n); return n;
  }
  rate(key: string, max: number, window: number, time = Date.now()): boolean {
    const old = this.one<{starts:number;count:number}>('SELECT starts,count FROM limits WHERE key=?', key);
    if (!old || time - old.starts >= window) { this.exec('INSERT OR REPLACE INTO limits(key,starts,count) VALUES (?,?,1)', key, time); return true; }
    if (old.count >= max) return false;
    this.exec('UPDATE limits SET count=count+1 WHERE key=?', key); return true;
  }
  addToken(digest: string, user: number, kind: string, expires: number) { this.exec('INSERT INTO tokens(hash,user_id,kind,expires_at) VALUES (?,?,?,?)', digest, user, kind, expires); }
  session(digest: string, time = Date.now()): Session | undefined { return this.one<Session>('SELECT user_id,kind,expires_at FROM tokens WHERE hash=? AND expires_at>?', digest, time); }
  pair(digest: string, newDigest: string, kind: string, user: number | undefined, time = Date.now()): Session {
    return this.atomic(() => {
      const s = this.session(digest, time);
      if (!s || s.kind !== `pair_${kind}` || (user !== undefined && user !== s.user_id)) throw new Error('کد نامعتبر، منقضی یا متعلق به حساب دیگری است.');
      this.exec('DELETE FROM tokens WHERE hash=?', digest);
      this.addToken(newDigest, s.user_id, kind, time + 30 * DAY);
      this.log(s.user_id, null, `${kind}.paired`); return s;
    });
  }
  revoke(user: number, kind?: string) {
    if (kind) this.exec('DELETE FROM tokens WHERE user_id=? AND kind IN (?,?)', user, kind, `pair_${kind}`);
    else this.exec("DELETE FROM tokens WHERE user_id=? AND kind!='panel'", user);
    if (!kind || kind === 'self') this.exec('DELETE FROM leases WHERE user_id=?', user);
  }
  lease(user: number, time = Date.now()): { expiresAt: number; charged: number; diamonds: number | null; unlimited: boolean } {
    return this.atomic(() => {
      const u = this.requireUser(user);
      if (u.frozen && !isOwner(user)) throw new Error('دسترسی سلف متوقف است.');
      const existing = this.one<{expires_at:number}>('SELECT expires_at FROM leases WHERE user_id=?', user);
      const active = !!existing && existing.expires_at > time;
      if (!active) {
        this.money(user, 'diamonds', -SELF_HOURLY_DIAMONDS, 'self.hour', String(time), time);
        this.exec('INSERT OR REPLACE INTO leases(user_id,expires_at) VALUES (?,?)', user, time + HOUR);
        this.log(user, null, 'self.hour', isOwner(user) ? 'owner-exempt' : '5 diamonds');
      }
      return { expiresAt: active ? existing!.expires_at : time + HOUR, charged: active || isOwner(user) ? 0 : SELF_HOURLY_DIAMONDS, diamonds: isOwner(user) ? null : this.requireUser(user).diamonds, unlimited: isOwner(user) };
    });
  }
  confirm(actor: number, chat: number, action: string, payload: unknown): string {
    const id = token(8);
    this.exec('INSERT INTO confirmations(id,actor,chat_id,action,payload,expires_at) VALUES (?,?,?,?,?,?)', id, actor, chat, action, JSON.stringify(payload), Date.now() + 90000); return id;
  }
  consumeConfirm(id: string, actor: number, chat: number): {action:string;payload:string} {
    return this.atomic(() => {
      const c = this.one<{action:string;payload:string}>('SELECT action,payload FROM confirmations WHERE id=? AND actor=? AND chat_id=? AND expires_at>?', id, actor, chat, Date.now());
      if (!c) throw new Error('تأیید منقضی شده یا برای شخص دیگری است.');
      this.exec('DELETE FROM confirmations WHERE id=?', id); return c;
    });
  }
  job(chat: number, actor: number, type: string, payload: unknown, at = Date.now()): string {
    const count = this.one<{n:number}>("SELECT COUNT(*) n FROM jobs WHERE chat_id=? AND state='pending'", chat)!.n;
    if (count >= 20) throw new Error('حداکثر ۲۰ کار هم‌زمان برای هر گروه مجاز است.');
    const id = token(5);
    this.exec('INSERT INTO jobs(id,chat_id,actor,type,payload,next_at,created_at) VALUES (?,?,?,?,?,?,?)', id, chat, actor, type, JSON.stringify(payload), at, Date.now()); return id;
  }
  cleanup(time = Date.now()) {
    this.exec('DELETE FROM messages WHERE date<?', time - 48 * HOUR);
    this.exec('DELETE FROM tokens WHERE expires_at<?', time);
    this.exec('DELETE FROM confirmations WHERE expires_at<?', time);
    this.exec('DELETE FROM limits WHERE starts<?', time - DAY);
    this.exec("DELETE FROM updates WHERE created_at<? AND status!='pending'", time - 7 * DAY);
    this.exec("DELETE FROM jobs WHERE created_at<? AND state!='pending'", time - 7 * DAY);
    this.exec('DELETE FROM audit WHERE created_at<?', time - 30 * DAY);
    this.exec('DELETE FROM ledger WHERE created_at<?', time - 90 * DAY);
    this.exec("DELETE FROM duels WHERE created_at<? AND state IN ('settled','cancelled')", time - 30 * DAY);
  }
  snapshot() {
    return {
      version: VERSION, exportedAt: new Date().toISOString(), global: this.global(),
      groups: this.all<GroupRow>('SELECT * FROM groups ORDER BY joined_at DESC').map(g => ({ ...g, settings: this.settings(g.id) })),
      notes: this.all('SELECT * FROM notes'), answers: this.all('SELECT * FROM answers'), blacklist: this.all('SELECT * FROM blacklist'),
    };
  }
}
