export interface Env {
  NOVA: DurableObjectNamespace;
  ASSETS: Fetcher;
  BOT_TOKEN?: string;
  WEBHOOK_SECRET?: string;
  PANEL_PASSWORD?: string;
  DEMO_MODE?: string;
  TELEGRAM?: Fetcher; // Test-only service binding; never supplied by a client.
}
export interface User { id: number; first_name: string; last_name?: string; username?: string; is_bot?: boolean }
export interface Chat { id: number; type: 'private' | 'group' | 'supergroup' | 'channel'; title?: string; username?: string; permissions?: Record<string,boolean> }
export interface Entity { type: string; offset: number; length: number; url?: string; user?: User }
export interface Message {
  message_id: number; date: number; chat: Chat; from?: User; sender_chat?: Chat;
  text?: string; caption?: string; entities?: Entity[]; caption_entities?: Entity[];
  reply_to_message?: Message; forward_origin?: unknown; via_bot?: User; edit_date?: number;
  dice?: { emoji: string; value: number };
  sticker?: { file_id: string; file_unique_id: string; is_animated?: boolean; is_video?: boolean };
  photo?: { file_id: string; file_unique_id: string }[];
  video?: unknown; animation?: unknown; audio?: unknown; voice?: unknown; video_note?: unknown;
  document?: { file_name?: string; mime_type?: string }; contact?: unknown; location?: unknown;
  venue?: unknown; poll?: unknown; game?: unknown;
  new_chat_members?: User[]; left_chat_member?: User;
  message_thread_id?: number;
}
export interface Update {
  update_id: number; message?: Message; edited_message?: Message;
  callback_query?: { id: string; from: User; data?: string; message?: Message };
  my_chat_member?: { chat: Chat; from: User; new_chat_member: ChatMember; old_chat_member?: ChatMember };
  chat_join_request?: { chat: Chat; from: User; user_chat_id: number; date: number };
}
export interface ChatMember {
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
  user: User; can_delete_messages?: boolean; can_restrict_members?: boolean;
  can_pin_messages?: boolean; can_change_info?: boolean; can_promote_members?: boolean;
  can_invite_users?: boolean; is_member?: boolean; can_send_messages?: boolean;
}
export type SqlValue = string | number | null | ArrayBuffer;
export interface GroupSettings {
  locks: string[]; welcome: string; goodbye: string; rules: string;
  antiflood: boolean; floodLimit: number; floodWindow: number;
  warnLimit: number; warnAction: 'mute' | 'ban'; muteMinutes: number;
  captcha: boolean; captchaSeconds: number; raid: boolean; quiet: boolean;
  games: boolean; chatbot: boolean; style: 'friendly' | 'formal' | 'playful';
  trusted: number[]; cooldown: number;
  maxBet: number; reports: boolean; joinMode: 'manual' | 'approve' | 'decline';
  nightStart: number; nightEnd: number; nightEnabled: boolean; timezone: number;
  commandsOnlySlash: boolean;
}
export interface GroupRow { id: number; title: string; settings: string; active: number; joined_at: number }
export interface UserRow {
  id: number; name: string; coins: number; diamonds: number; xp: number;
  wins: number; losses: number; daily_at: number; diamond_at: number; frozen: number; created_at: number;
}
export interface DuelRow {
  id: string; chat_id: number; message_id: number | null; creator: number; opponent: number | null;
  target: number | null; emoji: string; stake: number; state: string;
  roll1: number | null; roll2: number | null; created_at: number; expires_at: number; result: string | null;
}
export interface GlobalSettings { maintenance: boolean; maxBet: number; diamondOdds: number; duelSeconds: number; dailyCoins: number; brand: string }
export interface Session { user_id: number; kind: string; expires_at: number }
export interface Command { name: string; fa: string; aliases: string[]; role: 'member' | 'admin' | 'owner'; category: string; description: string; usage?: string }
