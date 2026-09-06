import { DEFAULT_GROUP, DEFAULT_GLOBAL, OWNERS } from './config';
export function demoData(path: string) {
  const time = Date.now();
  const groups = [
    { id: -1002100010001, title: 'کافه رفقا ☕', active: 1, members: 248, messages: 1824, settings: { ...DEFAULT_GROUP, captcha: true, chatbot: true, locks: ['links','invites','forward','executables','rtlspoof','inline'] } },
    { id: -1002100010002, title: 'گیم‌زون | GAME ZONE', active: 1, members: 512, messages: 3240, settings: { ...DEFAULT_GROUP, locks: ['invites','executables'], maxBet: 5000 } },
    { id: -1002100010003, title: 'تیم نُوا ✦', active: 1, members: 86, messages: 946, settings: { ...DEFAULT_GROUP, captcha: true, games: false } },
    { id: -1002100010004, title: 'اتاق گفتگو 🌱', active: 1, members: 174, messages: 1418, settings: { ...DEFAULT_GROUP, chatbot: true, locks: ['links','invites','forward','photos','videos','gifs'] } },
  ].map(g => ({ ...g, joined_at: time - 7 * 86400000 }));
  const users = [
    { id: OWNERS[0], name: 'امین', coins: 12480, diamonds: null, unlimited: true, xp: 8200, wins: 146, losses: 38, frozen: 0 },
    { id: 1001, name: 'آراد', coins: 8640, diamonds: 7, xp: 7200, wins: 128, losses: 54, frozen: 0 },
    { id: 1002, name: 'نیلوفر', coins: 7210, diamonds: 4, xp: 6350, wins: 112, losses: 62, frozen: 0 },
    { id: 1003, name: 'پارسا', coins: 6450, diamonds: 3, xp: 5820, wins: 94, losses: 71, frozen: 0 },
    { id: 1004, name: 'رها', coins: 5820, diamonds: 2, xp: 4940, wins: 87, losses: 60, frozen: 0 },
  ];
  const logs = [
    { id: 1, actor: 1001, chat_id: groups[0].id, action: 'message.filtered', detail: 'لینک دعوت', created_at: time - 120000 },
    { id: 2, actor: OWNERS[0], chat_id: groups[1].id, action: 'settings.update', detail: 'maxBet', created_at: time - 420000 },
    { id: 3, actor: 1002, chat_id: groups[0].id, action: 'duel.settled', detail: 'دوئل دارت', created_at: time - 780000 },
    { id: 4, actor: OWNERS[0], chat_id: groups[2].id, action: 'message.send', detail: 'pin requested', created_at: time - 1560000 },
    { id: 5, actor: 1003, chat_id: groups[3].id, action: 'self.hour', detail: '5 diamonds', created_at: time - 2200000 },
  ];
  const duels = [
    { id: 'demo01', chat_id: groups[1].id, creator: 1001, opponent: 1002, creator_name: 'آراد', opponent_name: 'نیلوفر', emoji: '🎲', stake: 100, state: 'active', roll1: 5, roll2: null, created_at: time - 60000, expires_at: time + 120000 },
    { id: 'demo02', chat_id: groups[0].id, creator: 1003, opponent: 1004, creator_name: 'پارسا', opponent_name: 'رها', emoji: '🎯', stake: 50, state: 'settled', roll1: 6, roll2: 4, result: JSON.stringify({winner:1003,diamond:false}), created_at: time - 180000, expires_at: time },
    { id: 'demo03', chat_id: groups[1].id, creator: 1002, opponent: null, creator_name: 'نیلوفر', opponent_name: null, emoji: '🎳', stake: 200, state: 'open', roll1: null, roll2: null, created_at: time - 30000, expires_at: time + 180000 },
  ];
  if (path === '/api/overview') return {
    stats: { groups: 4, users: 1020, messages: 7428, blocked: 186, duels: 248, activeDuels: 3, leases: 2, diamonds: 32 },
    groups, logs, duels, leaderboard: users, series: [24,42,31,65,48,80,63].map((v,i)=>({day:new Date(time-(6-i)*86400000).toISOString().slice(0,10),count:v})),
    global: DEFAULT_GLOBAL, queue: {pending:0,failed:0}, demo:true,
  };
  if (path === '/api/groups') return { groups };
  if (path === '/api/leaderboard' || path === '/api/users') return { users };
  if (path === '/api/duels') return { duels };
  if (path === '/api/logs') return { logs };
  if (path === '/api/jobs') return { jobs: [] };
  if (path === '/api/connection') return {
    configured:false,tokenValid:false,source:null,stage:'needs_token',
    message:'در نسخهٔ نصب‌شده، توکن را همین‌جا وارد می‌کنی و اتصال خودکار انجام می‌شود.',
    webhook:null,bot:null,registeredHere:false,canReceive:false,receiving:false,
    addGroupUrl:null,adminGroupUrl:null,startUrl:null,panelCommand:'/panel',
    lastReceivedAt:null,lastProcessedAt:null,lastGroupAt:null,groupCount:0,queue:{pending:0,failed:0},warnings:[],demo:true,
  };
  if (path === '/api/global') return { settings:DEFAULT_GLOBAL };
  return null;
}
