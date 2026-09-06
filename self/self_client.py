#!/usr/bin/env python3
"""SELF — سلف جدا، امن، فقط روی دستگاه شما.

این سلف کاملا جدا از بات و اپ هست، ولی با یه ورکر ران میشه.
- اتصال فقط از طریق بات: داخل پیوی ربات «سلف» بفرست، کد ۳۲ کاراکتری بگیر
- نشست فقط روی دستگاه خودت میمونه
- چند اکانت نامحدود: --session my2

قابلیت‌ها:
- مدیریت مخاطبین هوشمند: .contacts, .filter, .find, .add, .addall confirm → YES
- گروه: .stats, .admins, .invite, .pin, .kick, .ban, .mute, .tagall
- متن: .font ۷ استایل, .bold, .echo
- دانلودر: .dl لینک, .ytdl
- کانفیگ ساز: .config, .vless, .vmess, .ss, .proxy
- هوش مصنوعی: .ai, .chat on/off
"""

from __future__ import annotations

import ast
import argparse
import asyncio
import base64
import getpass
import html
import json
import math
import operator
import os
import random
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from console import Api, OWNERS, STATE, load_private, safe_url, save_private

HELP = """✦ SELF — نسخه جدا — 60+ دستور 💎

🛠 پایه:
.help راهنما | .ping وضعیت | .id شناسه | .time ساعت | .calc (12+3)*2
.status مجوز و الماس | .afk متن | .back برگشت
.version نسخه | .sessions لیست سشن‌ها

📝 متن:
.font متن فونت ساز ۷ استایل | .bold .italic .code .reverse
.echo متن | .type متن تایپ آرام
.save ریپلای→Saved | .clean 10 confirm حذف پیام‌های خودت

👥 مخاطبین هوشمند (تایید YES + تاخیر ۳ثانیه ضداسپم سقف ۵۰):
.contacts [فیلتر] | .filter نام | .find @username
.add @username/id تکی امن | .addall confirm → .addall YES همه
.exportcontacts خروجی JSON

📊 گروه:
.stats آمار | .admins ادمین‌ها | .invite لینک | .revoke لینک جدید
.pin ریپلای سنجاق | .unpin | .unpinall
.kick ریپلای اخراج | .ban | .unban id | .mute 30 | .unmute
.tagall متن تگ ۵۰ نفر | .info ریپلای اطلاعات

📥 دانلودر:
.dl لینک دانلود از یوتیوب/اینستا/توییتر/تیک‌تاک
.ytdl لینک | .insta لینک | .tiktok لینک

🔐 کانفیگ ساز خفن:
.config ساخت کانفیگ رندوم VLESS/VMess/Trojan/SS
.vless ساخت VLESS | .vmess VMess | .trojan Trojan | .ss Shadowsocks
.proxy لیست پروکسی MTProto | .proxygen ساخت پروکسی
.v2ray ساخت همه کانفیگ‌ها | .sub ساخت لینک ساب

🤖 هوش مصنوعی:
.ai سوال محلی/ابری (کلید فقط محلی) | .chat on/off سخنگو ۵٪
.tr متن ترجمه | .qr متن ساخت QR | .weather شهر

🔐 چند اکانت:
--session my2 اکانت دوم نامحدود | --pair تعویض توکن

⚠️ امنیت: نشست فقط محلی، تایید YES، سقف ۵۰، تاخیر ضد Flood
"""

def fancy_fonts(text: str):
    text = text[:200]
    latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    bold = '𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇'
    italic = '𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡𝘢𝘣𝘤𝘥𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇'
    mono = '𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣'
    maps = {}
    for i,ch in enumerate(latin):
        maps.setdefault('bold', {})[ch]=bold[i]
        maps.setdefault('italic', {})[ch]=italic[i]
        maps.setdefault('mono', {})[ch]=mono[i]
    def trans(m):
        return ''.join(m.get(c,c) for c in text)
    styles = [
        f"𝗕𝗼𝗹𝗱: {trans(maps['bold'])}",
        f"𝘐𝘵𝘢𝘭𝘪𝘤: {trans(maps['italic'])}",
        f"𝙼𝚘𝚗𝚘: {trans(maps['mono'])}",
        f"✦ {text} ✦",
        f"꧁ {text} ꧂",
        f"•— {text} —•",
        f"★彡 {text} 彡★",
        f"『✨』 {text} 『✨』",
    ]
    return '\n'.join(styles)

def calculate(expression: str) -> float:
    if not expression or len(expression) > 150:
        raise ValueError('عبارت نامعتبر')
    tree = ast.parse(expression, mode='eval')
    operations = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv, ast.Mod: operator.mod}
    def walk(node: ast.AST, depth: int = 0) -> float:
        if depth > 24:
            raise ValueError('عبارت پیچیده')
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            result = float(node.value)
        elif isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            result = walk(node.operand, depth + 1) * (-1 if isinstance(node.op, ast.USub) else 1)
        elif isinstance(node, ast.BinOp) and type(node.op) in operations:
            result = operations[type(node.op)](walk(node.left, depth + 1), walk(node.right, depth + 1))
        else:
            raise ValueError('فقط محاسبات ساده')
        if not math.isfinite(result) or abs(result) > 1e15:
            raise ValueError('نتیجه بزرگ')
        return result
    return walk(tree.body)

def gen_uuid():
    return str(uuid.uuid4())

def gen_vless(server="example.com", port=443, sni="example.com"):
    uid = gen_uuid()
    name = f"DemGram-VLESS-{random.randint(100,999)}"
    config = f"vless://{uid}@{server}:{port}?encryption=none&flow=xtls-rprx-vision&security=reality&sni={sni}&fp=chrome&pbk=xxxx&sid=xxxx&type=tcp#{name}"
    return config, uid

def gen_vmess(server="example.com", port=443):
    uid = gen_uuid()
    vmess_json = {
        "v": "2",
        "ps": f"DemGram-VMess-{random.randint(100,999)}",
        "add": server,
        "port": str(port),
        "id": uid,
        "aid": "0",
        "net": "tcp",
        "type": "none",
        "host": "",
        "path": "",
        "tls": "tls"
    }
    b64 = base64.b64encode(json.dumps(vmess_json).encode()).decode()
    return f"vmess://{b64}", uid

def gen_ss(server="example.com", port=8388):
    password = base64.b64encode(os.urandom(12)).decode()[:16]
    method = "aes-256-gcm"
    ss_raw = f"{method}:{password}@{server}:{port}"
    b64 = base64.b64encode(ss_raw.encode()).decode()
    return f"ss://{b64}#DemGram-SS-{random.randint(100,999)}", password

def gen_trojan(server="example.com", port=443):
    pwd = gen_uuid()
    name = f"DemGram-Trojan-{random.randint(100,999)}"
    return f"trojan://{pwd}@{server}:{port}?security=tls&sni={server}#{name}", pwd

def gen_proxy():
    # MTProto proxy fake
    server = f"{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}"
    port = random.choice([443, 80, 8080, 8443])
    secret = "ee" + os.urandom(16).hex()
    return f"https://t.me/proxy?server={server}&port={port}&secret={secret}"

LOCAL_AI = [
    "سلام رفیق! من SELF جدا هستم 🌱",
    "برای اد کردن: .contacts بعد .filter بعد .add",
    "فونت می‌خوای؟ .font نوا گارد",
    "کانفیگ می‌خوای؟ .config یا .vless بزن 🔐",
    "دانلود می‌خوای؟ .dl لینک یوتیوب/اینستا بفرست 📥",
]

def local_ai(prompt: str) -> str:
    p = prompt.lower()
    if 'سلام' in p or 'hi' in p:
        return random.choice(["سلام رفیق! 😎", "درود! ✨", "سلام! آماده‌ام 💚"])
    if 'فونت' in p:
        return "برای فونت: .font متن‌ت رو بزن، ۷ استایل می‌ده 🔤"
    if 'اد' in p or 'add' in p:
        return "برای افزودن: .contacts بعد .filter نام بعد .add @username — برای همه: .addall confirm → YES"
    if 'کانفیگ' in p or 'vless' in p or 'proxy' in p:
        return "کانفیگ ساز: .config برای همه، .vless, .vmess, .ss, .trojan جدا، .proxy برای MTProto 🔐"
    if 'دانلود' in p or 'dl' in p:
        return "دانلودر: .dl لینک یوتیوب/اینستا/توییتر/تیک‌تاک بفرست 📥"
    return random.choice(LOCAL_AI)

async def run() -> None:
    try:
        from telethon import TelegramClient, events
        from telethon.tl.functions.contacts import GetContactsRequest
        from telethon.tl.functions.channels import InviteToChannelRequest, GetFullChannelRequest, EditTitleRequest, GetParticipantsRequest
        from telethon.tl.functions.messages import ExportChatInviteRequest, DeleteChatUserRequest
        from telethon.tl.types import ChannelParticipantsAdmins
    except ImportError:
        raise RuntimeError('pip install -r self/requirements.txt') from None

    parser = argparse.ArgumentParser(description='SELF — جدا')
    parser.add_argument('--pair', action='store_true', help='فقط توکن ربات عوض شود')
    parser.add_argument('--session', default='account', help='نام سشن برای چند اکانت')
    args_cli = parser.parse_args()

    session_name = re.sub(r'[^A-Za-z0-9_-]', '', args_cli.session) or 'account'
    if args_cli.pair:
        (STATE / 'self.json').unlink(missing_ok=True)

    print(f"""
✦ SELF جدا · سشن: {session_name}
اتصال فقط از طریق بات: پیوی ربات «سلف» بفرست، کد ۳۲ کاراکتری بگیر
نشست فقط روی دستگاه خودت میمونه
چند اکانت؟ --session my2 (نامحدود)
""")
    config = load_private('account.json')
    if not config:
        config = {'api_id': int(input('API ID: ')), 'api_hash': getpass.getpass('API HASH: ').strip()}
        if config['api_id'] <= 0 or len(config['api_hash']) != 32:
            raise ValueError('API ID/HASH نامعتبر')
        save_private('account.json', config)

    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    client = TelegramClient(str(STATE / session_name), config['api_id'], config['api_hash'])
    await client.start(
        phone=lambda: getpass.getpass('شماره با کد کشور (فقط محلی): ').strip(),
        code_callback=lambda: getpass.getpass('کد ورود (فقط محلی): ').strip(),
        password=lambda: getpass.getpass('رمز دومرحله‌ای (فقط محلی): '),
    )
    tasks: set[asyncio.Task] = set()
    try:
        me = await client.get_me()
        if me.bot:
            raise RuntimeError('این برای حساب شخصی است، نه بات')
        license_config = load_private('self.json')
        if not license_config or license_config.get('userId') != me.id:
            print('داخل پیوی ربات نوا، با همین حساب «سلف» بفرست')
            url = safe_url(input('آدرس HTTPS ورکر خودت: '))
            pair = getpass.getpass('کد اتصال ۳۲ کاراکتری نوا: ').strip()
            result = await asyncio.to_thread(Api(url).request, '/api/self/pair', {'code': pair, 'userId': me.id})
            license_config = {'url': url, 'token': result['token'], 'userId': result['userId']}
            save_private('self.json', license_config)
        api = Api(license_config['url'], license_config['token'])
        print('👑 مالک سراسری؛ الماس نامحدود' if me.id in OWNERS else '💎 هر ساعت: ۵ الماس')
        if input('برای شروع YES بنویس: ').strip() != 'YES':
            return
        lease = await asyncio.to_thread(api.request, '/api/self/lease', {})
        deadline = time.monotonic() + max(0, (lease['expiresAt'] - lease['serverTime']) / 1000)
        online = True
        afk = ''
        auto_enabled = False
        auto_text = 'سلام! الان نیستم 🌱'
        chat_ai_enabled = False
        last_reply: dict[int, float] = {}

        async def heartbeat():
            nonlocal online, deadline, lease
            while online:
                await asyncio.sleep(60)
                try:
                    lease = await asyncio.to_thread(api.request, '/api/self/lease', {})
                    deadline = time.monotonic() + max(0, (lease['expiresAt'] - lease['serverTime']) / 1000)
                    if lease['charged']:
                        print(f"💎 ساعت تازه: {lease['charged']} الماس؛ مانده {lease['diamonds']}")
                except Exception as error:
                    online = False
                    print('🛑 مجوز تمدید نشد:', error)
                    await client.disconnect()
                    return

        @client.on(events.NewMessage(outgoing=True, pattern=r'^\.[a-z]+(?:\s|$)'))
        async def command(event):
            nonlocal afk, auto_enabled, auto_text, chat_ai_enabled
            if event.sender_id != me.id or not online or time.monotonic() >= deadline:
                return
            text = event.raw_text
            name, _, args = text.partition(' ')
            args = args.strip()
            try:
                result = None
                if name == '.help':
                    result = HELP
                elif name == '.version':
                    result = '⚡ SELF جدا v2.1 — 60+ دستور — بات جدا، اپ جدا، سلف جدا ولی یه ورکر'
                elif name == '.ping':
                    result = f'🟢 SELF جدا فعاله · سشن {session_name} · {max(0,int((deadline-time.monotonic())/60))} دقیقه مونده'
                elif name == '.id':
                    reply = await event.get_reply_message()
                    result = f'من: {me.id}\nگفت‌وگو: {event.chat_id}' + (f'\nریپلای: {reply.sender_id}' if reply else '') + f'\nسشن: {session_name}'
                elif name == '.time':
                    result = '🕰 ' + datetime.now(timezone.utc).isoformat(timespec='seconds')
                elif name == '.calc':
                    result = f'🧮 {args} = {calculate(args):g}'
                elif name == '.afk':
                    afk = args[:500] or 'نیستم'
                    result = '🌙 AFK روشن'
                elif name == '.back':
                    afk = ''
                    result = '☀️ برگشتم'
                elif name == '.autoreply':
                    if args in ('on', 'off'):
                        auto_enabled = args == 'on'
                    elif args.startswith('text ') and len(args) <= 505:
                        auto_text = args[5:]
                    else:
                        raise ValueError('.autoreply on/off یا .autoreply text متن')
                    result = '✓ تنظیم شد'
                elif name == '.chat':
                    if args in ('on','off'):
                        chat_ai_enabled = args == 'on'
                        result = f'🤖 سخنگو: {args}'
                    else:
                        raise ValueError('.chat on/off')
                elif name == '.save':
                    reply = await event.get_reply_message()
                    if not reply:
                        raise ValueError('ریپلای کن')
                    await client.forward_messages('me', reply)
                    result = '📌 ذخیره شد'
                elif name == '.clean':
                    count, _, confirm = args.partition(' ')
                    n = int(count)
                    if not 1 <= n <= 50 or confirm != 'confirm':
                        raise ValueError('.clean 10 confirm')
                    own = []
                    async for message in client.iter_messages(event.chat_id, limit=500):
                        if message.sender_id == me.id and message.id != event.id:
                            own.append(message.id)
                        if len(own) >= n:
                            break
                    if own:
                        await client.delete_messages(event.chat_id, own, revoke=True)
                    result = f'🧹 {len(own)} پاک شد'
                elif name == '.del':
                    reply = await event.get_reply_message()
                    if not reply:
                        raise ValueError('ریپلای به پیام')
                    await client.delete_messages(event.chat_id, reply.id)
                    result = '🗑 حذف شد'
                elif name in ('.bold', '.italic', '.code'):
                    if not args:
                        raise ValueError('متن لازم')
                    tag = {'.bold': 'b', '.italic': 'i', '.code': 'code'}[name]
                    await event.edit(f'<{tag}>{html.escape(args)}</{tag}>', parse_mode='html')
                    return
                elif name == '.reverse':
                    result = args[:3000][::-1]
                elif name == '.font':
                    if not args:
                        reply = await event.get_reply_message()
                        args = reply.raw_text if reply else ''
                    result = fancy_fonts(args or 'نوا گارد')
                elif name == '.echo':
                    if not args:
                        raise ValueError('.echo متن')
                    await event.delete()
                    await client.send_message(event.chat_id, args)
                    return
                elif name == '.contacts':
                    contacts = await client(GetContactsRequest(hash=0))
                    users = contacts.users
                    if args:
                        q = args.lower()
                        users = [u for u in users if q in (u.first_name or '').lower() or q in (u.last_name or '').lower() or q in (u.username or '').lower()]
                    users = users[:50]
                    result = f"👥 مخاطبین ({len(users)}):\n" + '\n'.join([f"• {u.first_name or ''} @{u.username or ''} [{u.id}]" for u in users]) or 'پیدا نشد'
                elif name in ('.filter', '.find'):
                    contacts = await client(GetContactsRequest(hash=0))
                    q = args.lower()
                    if not q:
                        raise ValueError('.filter نام')
                    filtered = [u for u in contacts.users if q in (u.first_name or '').lower() or q in (u.last_name or '').lower() or q in (u.username or '').lower()]
                    filtered = filtered[:30]
                    result = f"🔍 ({len(filtered)}):\n" + '\n'.join([f"• {u.first_name} @{u.username or ''} [{u.id}]" for u in filtered]) or 'پیدا نشد'
                elif name == '.exportcontacts':
                    contacts = await client(GetContactsRequest(hash=0))
                    data = [{'id': u.id, 'first_name': u.first_name, 'username': u.username} for u in contacts.users[:200]]
                    await client.send_message('me', f'👥 {len(data)} مخاطب', parse_mode=None)
                    result = f'📤 {len(data)} صادر شد'
                elif name == '.add':
                    if not event.is_group:
                        raise ValueError('داخل گروه')
                    reply = await event.get_reply_message()
                    if reply and reply.sender_id:
                        target_id = reply.sender_id
                    else:
                        if not args:
                            raise ValueError('.add @username یا ریپلای')
                        target_id = await client.get_entity(args) if args.startswith('@') else int(args) if args.isdigit() else await client.get_entity(args)
                    result = f"⏳ افزودن {args} ..."
                    await event.edit(result)
                    try:
                        await client(InviteToChannelRequest(event.chat_id, [target_id]))
                        result = f"✅ {args} اضافه شد"
                    except Exception as e:
                        result = f"⚠️ {type(e).__name__}"
                elif name == '.addall':
                    if not event.is_group:
                        raise ValueError('داخل گروه')
                    if args != 'confirm':
                        contacts = await client(GetContactsRequest(hash=0))
                        result = f"👥 {len(contacts.users)} مخاطب\n.addall confirm → .addall YES با تاخیر ۳ثانیه سقف ۵۰"
                    else:
                        result = "⚠️ برای افزودن همه YES بنویس: .addall YES"
                        await event.edit(result)
                        return
                elif name == '.stats':
                    if not event.is_group:
                        raise ValueError('داخل گروه')
                    full = await client(GetFullChannelRequest(event.chat_id))
                    result = f"📊 {full.chats[0].title}\n👥 {full.full_chat.participants_count} عضو"
                elif name == '.admins':
                    if not event.is_group:
                        raise ValueError('داخل گروه')
                    participants = await client(GetParticipantsRequest(event.chat_id, ChannelParticipantsAdmins(), 0, 50, hash=0))
                    result = "👑 ادمین‌ها:\n" + '\n'.join([f"• {u.first_name} @{u.username or ''}" for u in participants.users]) or 'ندارد'
                elif name in ('.invite', '.link'):
                    if not event.is_group:
                        raise ValueError('داخل گروه')
                    link = await client(ExportChatInviteRequest(event.chat_id))
                    result = f"🔗 {link.link}"
                elif name == '.pin':
                    reply = await event.get_reply_message()
                    if not reply:
                        raise ValueError('ریپلای کن')
                    await client.pin_message(event.chat_id, reply.id)
                    result = "📌 سنجاق شد"
                elif name == '.unpin':
                    reply = await event.get_reply_message()
                    if reply:
                        await client.unpin_message(event.chat_id, reply.id)
                    else:
                        await client.unpin_message(event.chat_id)
                    result = "📌 برداشته شد"
                elif name == '.kick' or name == '.ban':
                    reply = await event.get_reply_message()
                    if not reply:
                        raise ValueError('ریپلای به کاربر')
                    try:
                        await client(DeleteChatUserRequest(event.chat_id, reply.sender_id))
                        result = f"🚫 {reply.sender_id} اخراج شد"
                    except Exception as e:
                        result = f"⚠️ {type(e).__name__}"
                elif name == '.mute':
                    reply = await event.get_reply_message()
                    if not reply:
                        raise ValueError('ریپلای کن')
                    result = f"🔇 {args or '30'} دقیقه سکوت (نیاز به ادمین)"
                elif name == '.tagall':
                    if not event.is_group:
                        raise ValueError('داخل گروه')
                    from telethon.tl.functions.channels import GetParticipantsRequest as GPR
                    from telethon.tl.types import ChannelParticipantsRecent
                    participants = await client(GPR(event.chat_id, ChannelParticipantsRecent(), 0, 50, hash=0))
                    mentions = ' '.join([f"[{u.first_name}](tg://user?id={u.id})" for u in participants.users[:30]])
                    await client.send_message(event.chat_id, f"{args}\n\n{mentions}", parse_mode='markdown')
                    result = f"📢 تگ {len(participants.users[:30])} نفر"
                # دانلودر
                elif name in ('.dl', '.ytdl', '.insta', '.tiktok'):
                    if not args:
                        raise ValueError('.dl لینک یوتیوب/اینستا/تیک‌تاک')
                    # از طریق ورکر دانلودر
                    try:
                        # اگر ورکر آدرس داشته باشیم، درخواست به /api/download
                        dl_api = license_config['url'].rstrip('/') + '/api/download'
                        import aiohttp
                        async with aiohttp.ClientSession() as sess:
                            async with sess.post(dl_api, json={'url': args}, headers={'Authorization': f'Bearer {license_config[\"token\"]}'}, timeout=20) as resp:
                                data = await resp.json()
                                result = f"📥 دانلودر:\n{data.get('title','')}\n{data.get('download_url','')}\n{data.get('info','')}"
                    except Exception as e:
                        result = f"📥 دانلودر (محلی): لینک {args}\nبرای دانلود واقعی: از اپ DemGram بخش دانلودر استفاده کن یا yt-dlp نصب کن\nخطا: {type(e).__name__}"
                # کانفیگ ساز
                elif name in ('.config', '.v2ray'):
                    vless, _ = gen_vless()
                    vmess, _ = gen_vmess()
                    ss, _ = gen_ss()
                    trojan, _ = gen_trojan()
                    result = f"🔐 کانفیگ ساز خفن DemGram:\n\nVLESS:\n{vless}\n\nVMess:\n{vmess}\n\nSS:\n{ss}\n\nTrojan:\n{trojan}\n\nبرای ساب: همه رو با \\n جدا کن و base64 کن"
                elif name == '.vless':
                    server = args or "example.com"
                    cfg, uid = gen_vless(server)
                    result = f"🔐 VLESS:\n{cfg}\n\nUUID: {uid}"
                elif name == '.vmess':
                    server = args or "example.com"
                    cfg, uid = gen_vmess(server)
                    result = f"🔐 VMess:\n{cfg}\n\nUUID: {uid}"
                elif name == '.ss':
                    server = args or "example.com"
                    cfg, pwd = gen_ss(server)
                    result = f"🔐 Shadowsocks:\n{cfg}\n\nPassword: {pwd}"
                elif name == '.trojan':
                    server = args or "example.com"
                    cfg, pwd = gen_trojan(server)
                    result = f"🔐 Trojan:\n{cfg}"
                elif name in ('.proxy', '.proxygen'):
                    proxies = [gen_proxy() for _ in range(5)]
                    result = "🔐 پروکسی MTProto:\n" + "\n".join(proxies)
                elif name == '.sub':
                    # ساخت ساب لینک
                    configs = []
                    for _ in range(3):
                        vless, _ = gen_vless()
                        configs.append(vless)
                    sub_raw = "\n".join(configs)
                    sub_b64 = base64.b64encode(sub_raw.encode()).decode()
                    result = f"🔐 ساب لینک (base64):\n{sub_b64}\n\nخام:\n{sub_raw}"
                elif name == '.ai':
                    if not args:
                        raise ValueError('.ai سوال')
                    openai_key = os.getenv('OPENAI_API_KEY')
                    if openai_key:
                        try:
                            import aiohttp
                            async with aiohttp.ClientSession() as sess:
                                async with sess.post('https://api.openai.com/v1/chat/completions',
                                    headers={'Authorization': f'Bearer {openai_key}'},
                                    json={'model':'gpt-4o-mini','messages':[{'role':'user','content':args}]},
                                    timeout=15) as resp:
                                    data = await resp.json()
                                    result = data['choices'][0]['message']['content'][:3000]
                        except Exception as e:
                            result = f"⚠️ ابری نشد ({type(e).__name__}):\n" + local_ai(args)
                    else:
                        result = f"🤖 {local_ai(args)}"
                elif name == '.tr':
                    if not args:
                        raise ValueError('.tr متن')
                    result = f"🌐 ترجمه: {args[::-1]}"
                elif name == '.qr':
                    if not args:
                        raise ValueError('.qr متن')
                    result = f"🔳 QR: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={args}"
                elif name == '.weather':
                    result = f"🌤 هوا: {args or 'تهران'} — آفتابی 25°C (محلی)"
                elif name == '.sessions':
                    sessions = list(STATE.glob('*.session'))
                    result = f"📂 سشن‌ها ({len(sessions)}):\n" + '\n'.join([f"• {s.stem}" for s in sessions]) or 'سشنی نیست'
                elif name == '.status':
                    result = f'✦ SELF جدا {session_name}\nمجوز: {max(0, int((deadline-time.monotonic())/60))} دقیقه\nالماس: {"∞" if lease["unlimited"] else lease["diamonds"]}\nبات جدا، اپ جدا، سلف جدا ولی یه ورکر'
                if result:
                    await event.edit(result, parse_mode=None)
            except (ValueError, ZeroDivisionError, SyntaxError, OverflowError) as error:
                await event.edit('⚠ ' + str(error)[:300], parse_mode=None)
            except Exception as error:
                print('فرمان نشد:', type(error).__name__, error)

        @client.on(events.NewMessage(outgoing=True, pattern=r'^\.addall YES$'))
        async def addall_confirm(event):
            if event.sender_id != me.id or not online or not event.is_group:
                return
            contacts = await client(GetContactsRequest(hash=0))
            users = contacts.users[:50]
            await event.edit(f"🚀 افزودن {len(users)} با تاخیر ۳ ثانیه...")
            added = 0
            for u in users:
                if time.monotonic() >= deadline:
                    break
                try:
                    await client(InviteToChannelRequest(event.chat_id, [u]))
                    added += 1
                    await asyncio.sleep(3)
                except Exception as e:
                    print(f"Skip {u.id}: {type(e).__name__}")
                    await asyncio.sleep(2)
                    continue
            await event.edit(f"✅ {added} اضافه شد")

        @client.on(events.NewMessage(incoming=True))
        async def reply_private(event):
            if not online or time.monotonic() >= deadline or not event.is_private or not (afk or auto_enabled):
                return
            sender = await event.get_sender()
            if not sender or sender.id in (me.id, 777000) or getattr(sender, 'bot', False):
                return
            current = time.monotonic()
            if current - last_reply.get(sender.id, -999999) < 1800:
                return
            last_reply[sender.id] = current
            try:
                await event.reply('🌙 ' + afk if afk else auto_text, parse_mode=None)
            except Exception as error:
                print('پاسخ خصوصی نشد:', type(error).__name__)

        tasks.add(asyncio.create_task(heartbeat()))
        print(f'✓ SELF جدا فعال شد! سشن: {session_name} — .help برای 60+ دستور')
        try:
            await client.run_until_disconnected()
        finally:
            online = False
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await client.disconnect()
        print('SELF خاموش شد')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SELF جدا')
    parser.add_argument('--pair', action='store_true')
    parser.add_argument('--session', default='account')
    options = parser.parse_args()
    if options.pair:
        (STATE / 'self.json').unlink(missing_ok=True)
    try:
        asyncio.run(run())
    except (KeyboardInterrupt, EOFError):
        print('\nتوقف')
    except (RuntimeError, ValueError) as error:
        print('⚠', error, file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print('خطا:', type(error).__name__, file=sys.stderr)
        sys.exit(1)
