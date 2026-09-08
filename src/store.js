// ═══════════════════════════════════════════════════════════════════
//  NovaStore — دیتابیس SQLite داخل Durable Object
//  بدون نیاز به ساخت دستی D1/KV: با دیپلوی، خودکار ساخته می‌شود
//  (به‌همین دلیل دکمه Deploy بدون هیچ کلیدی کار می‌کند)
// ═══════════════════════════════════════════════════════════════════
import { DurableObject } from 'cloudflare:workers';

export class NovaStore extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.state = state;
    this.env = env;
  }

  /** اجرای کوئری و برگرداندن همه سطرها */
  async q(sql, args = []) {
    const cur = this.state.storage.sql.exec(sql, ...args);
    const rows = [];
    for (const r of cur) rows.push(r);
    return rows;
  }

  async q1(sql, args = []) {
    const rows = await this.q(sql, args);
    return rows[0] ?? null;
  }

  async run(sql, args = []) {
    this.state.storage.sql.exec(sql, ...args);
    return { success: true };
  }

  async batchRun(list = []) {
    for (const [sql, args] of list) this.state.storage.sql.exec(sql, ...(args || []));
    return { success: true };
  }

  // ─── کش سبک به‌جای KV ───
  async kvGet(key) {
    const row = await this.q1('SELECT value, exp FROM kv WHERE key=?', [key]);
    if (!row) return null;
    if (row.exp && row.exp < Math.floor(Date.now() / 1000)) {
      this.state.storage.sql.exec('DELETE FROM kv WHERE key=?', key);
      return null;
    }
    return row.value;
  }

  async kvPut(key, value, ttl = 0) {
    const exp = ttl ? Math.floor(Date.now() / 1000) + ttl : 0;
    this.state.storage.sql.exec('INSERT INTO kv (key, value, exp) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, exp=excluded.exp', key, value, exp);
    return true;
  }

  async kvDel(key) {
    this.state.storage.sql.exec('DELETE FROM kv WHERE key=?', key);
    return true;
  }
}

/** ساخت شیم سازگار با D1/KV روی DO تا بقیه کد دست‌نخورده بماند */
export function withStore(env) {
  if (env.__shimmed) return env;
  const stub = env.STORE.get(env.STORE.idFromName('nova-main'));

  const db = {
    prepare(sql) {
      const st = { __sql: sql, __args: [] };
      st.bind = (...args) => {
        st.__args = args;
        return st;
      };
      st.first = () => stub.q1(sql, st.__args);
      st.all = async () => ({ results: await stub.q(sql, st.__args) });
      st.run = () => stub.run(sql, st.__args);
      return st;
    },
    batch(stmts) {
      return stub.batchRun(stmts.map((s) => [s.__sql, s.__args]));
    },
  };

  const kv = {
    get: (k) => stub.kvGet(k),
    put: (k, v, opts = {}) => stub.kvPut(k, v, opts.expirationTtl || 0),
    delete: (k) => stub.kvDel(k),
  };

  const extra = { DB: db, KV: kv, __shimmed: true };
  return new Proxy(env, {
    get(t, k) {
      if (k in extra) return extra[k];
      const v = Reflect.get(t, k);
      return typeof v === 'function' ? v.bind(t) : v;
    },
    has(t, k) {
      return k in extra || Reflect.has(t, k);
    },
  });
}
