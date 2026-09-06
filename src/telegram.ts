import type { Env, Message, User } from './types';
import type { Database } from './database';
import { safeError } from './utils';

export class TelegramError extends Error {
  constructor(readonly code: number, description: string, readonly retryAfter = 0) { super(`تلگرام: ${description}`); }
}
export type Keyboard = { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] };
export class Telegram {
  constructor(readonly env: Env, readonly db: Database) {}
  async call<T = true>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.env.BOT_TOKEN || this.env.BOT_TOKEN.startsWith('REPLACE_')) throw new Error('بات هنوز ثبت نشده است؛ در پنل وب بخش «ثبت و اتصال بات»، توکن جدید را وارد کنید.');
    const url = `https://api.telegram.org/bot${this.env.BOT_TOKEN}/${method}`;
    let response: Response;
    try {
      const request = new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params), signal: AbortSignal.timeout(8000) });
      response = this.env.TELEGRAM ? await this.env.TELEGRAM.fetch(request) : await fetch(request);
    } catch { throw new TelegramError(503, 'ارتباط برقرار نشد؛ وضعیت ارسال ممکن است نامشخص باشد.'); }
    let data: { ok: boolean; result: T; error_code?: number; description?: string; parameters?: {retry_after?:number} };
    try { data = await response.json(); } catch { throw new TelegramError(502, 'پاسخ نامعتبر از API'); }
    if (!data.ok) throw new TelegramError(data.error_code || response.status, safeError(new Error(data.description || 'خطای نامشخص'), [this.env.BOT_TOKEN || '', this.env.WEBHOOK_SECRET || '', this.env.PANEL_PASSWORD || '']), data.parameters?.retry_after || 0);
    return data.result;
  }
  async me(): Promise<User> {
    const saved = this.db.meta<User | null>('bot.me', null);
    if (saved) return saved;
    const me = await this.call<User>('getMe'); this.db.setMeta('bot.me', me); return me;
  }
  async send(chat: number, text: string, keyboard?: Keyboard, extra: Record<string, unknown> = {}): Promise<Message> {
    const m = await this.call<Message>('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(keyboard ? { reply_markup: keyboard } : {}), ...extra });
    if (m.chat.type !== 'private') this.db.track(m); return m;
  }
  async edit(chat: number, id: number, text: string, keyboard?: Keyboard) {
    try {
      return await this.call('editMessageText', { chat_id: chat, message_id: id, text, parse_mode: 'HTML', reply_markup: keyboard || { inline_keyboard: [] }, link_preview_options: { is_disabled: true } });
    } catch (e) { if (e instanceof TelegramError && e.message.includes('message is not modified')) return; throw e; }
  }
  async answer(id: string, text = '', alert = false) {
    try { await this.call('answerCallbackQuery', { callback_query_id: id, text: text.slice(0, 180), show_alert: alert }); }
    catch (e) { if (!(e instanceof TelegramError && e.code === 400)) throw e; }
  }
  async document(chat: number, name: string, content: string) {
    if (!this.env.BOT_TOKEN || this.env.BOT_TOKEN.startsWith('REPLACE_')) throw new Error('توکن تنظیم نشده است.');
    const form = new FormData();
    form.set('chat_id', String(chat));
    form.set('document', new File([content], name, { type: 'application/json' }));
    const request = new Request(`https://api.telegram.org/bot${this.env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) });
    let response: Response;
    try { response = this.env.TELEGRAM ? await this.env.TELEGRAM.fetch(request) : await fetch(request); }
    catch { throw new TelegramError(503, 'ارسال فایل نامشخص است؛ اتصال برقرار نشد.'); }
    const data = await response.json() as {ok:boolean};
    if (!data.ok) throw new TelegramError(400, 'ارسال فایل انجام نشد.');
  }
  async remove(chat: number, id: number) {
    await this.call('deleteMessage', { chat_id: chat, message_id: id });
    this.db.exec('DELETE FROM messages WHERE chat_id=? AND id=?', chat, id);
  }
}
