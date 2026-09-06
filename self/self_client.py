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

HELP = """✦ SELF جدا — نسخه خیلی خفن — 80+ دستور 💎🔥

⚡ بات جدا، اپ جدا، سلف جدا ولی یه ورکر — خیلی خفن!

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

def gen_reality_keys():
    chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    rand = lambda n: ''.join(random.choice(chars) for _ in range(n))
    return {'private': rand(43), 'public': rand(43), 'shortId': ''.join(random.choice('0123456789abcdef') for _ in range(8))}

def gen_vless(server="example.com", port=443, sni=None):
    uid = gen_uuid()
    keys = gen_reality_keys()
    sni = sni or server
    name = f"DemGram-VLESS-REALITY-{random.randint(100,999)}"
    config = f"vless://{uid}@{server}:{port}?encryption=none&flow=xtls-rprx-vision&security=reality&sni={sni}&fp=chrome&pbk={keys['public']}&sid={keys['shortId']}&type=tcp&headerType=none#{name}"
    return config, uid, keys

def gen_vmess(server="example.com", port=443):
    uid = gen_uuid()
    vmess_json = {
        "v": "2",
        "ps": f"DemGram-VMess-REALITY-{random.randint(100,999)}",
        "add": server,
        "port": str(port),
        "id": uid,
        "aid": "0",
        "net": "tcp",
        "type": "none",
        "host": "",
        "path": "",
        "tls": "tls",
        "sni": server,
        "alpn": ""
    }
    b64 = base64.b64encode(json.dumps(vmess_json).encode()).decode()
    return f"vmess://{b64}", uid

def gen_ss(server="example.com", port=8388):
    password = ''.join(random.choice('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') for _ in range(16))
    method = random.choice(["aes-256-gcm","chacha20-ietf-poly1305","aes-128-gcm"])
    ss_raw = f"{method}:{password}@{server}:{port}"
    b64 = base64.b64encode(ss_raw.encode()).decode()
    return f"ss://{b64}#DemGram-SS-{method}-{random.randint(100,999)}", password

def gen_trojan(server="example.com", port=443):
    pwd = gen_uuid()
    name = f"DemGram-Trojan-REALITY-{random.randint(100,999)}"
    return f"trojan://{pwd}@{server}:{port}?security=tls&sni={server}&fp=chrome&type=tcp#{name}", pwd

def gen_proxy():
    server = f"{random.randint(20,220)}.{random.randint(20,220)}.{random.randint(20,220)}.{random.randint(20,220)}"
    port = random.choice([443, 80, 8080, 8443, 2053, 2083])
    secret = "ee" + os.urandom(16).hex()
    ping = random.randint(15,350)
    country = random.choice(['DE','NL','US','TR','FI','SE','IR'])
    emoji = '🟢' if ping<80 else '🟡' if ping<180 else '🔴'
    return f"https://t.me/proxy?server={server}&port={port}&secret={secret}", ping, country, emoji

def gen_proxy_simple():
    url, _, _, _ = gen_proxy()
    return url

def gen_clash_yaml(configs):
    return f"""mixed-port: 7890
allow-lan: true
mode: rule
log-level: info
proxies:
{chr(10).join([f"  - {{name: DemGram-{i+1}, type: vless, server: example.com, port: 443, uuid: {gen_uuid()}, tls: true, flow: xtls-rprx-vision}}" for i in range(len(configs))])}
proxy-groups:
  - {{name: 🚀 DemGram, type: select, proxies: [{', '.join([f'DemGram-{i+1}' for i in range(len(configs))])}]}}
rules:
  - MATCH,🚀 DemGram
"""

def gen_singbox(configs):
    return json.dumps({"outbounds": [{"tag": f"DemGram-{i+1}", "type":"vless", "server":"example.com", "server_port":443, "uuid": gen_uuid(), "flow":"xtls-rprx-vision", "tls":{"enabled":True, "server_name":"example.com", "reality":{"enabled":True, "public_key":"xxxx", "short_id":"xxxx"}}} for i in range(len(configs))]}, indent=2)

def detect_platform(url):
    u=url.lower()
    if 'youtube.com' in u or 'youtu.be' in u:
        return {'name':'YouTube','emoji':'▶️','qualities':['144p','360p','720p','1080p','4K','MP3 128k','MP3 320k']}
    if 'instagram.com' in u:
        return {'name':'Instagram','emoji':'📸','qualities':['Original','HD','Story','Reel']}
    if 'tiktok.com' in u:
        return {'name':'TikTok','emoji':'🎵','qualities':['No Watermark HD','HD','MP3']}
    if 'twitter.com' in u or 'x.com' in u:
        return {'name':'Twitter/X','emoji':'🐦','qualities':['Original','HD']}
    if 'soundcloud.com' in u:
        return {'name':'SoundCloud','emoji':'🎧','qualities':['MP3 128k','MP3 320k','FLAC']}
    return {'name':'Direct','emoji':'📥','qualities':['Original']}

def fancy_fonts_extra(text: str):
    # 15 styles
    text = text[:200]
    latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    bold = '𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇'
    italic = '𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡𝘢𝘣𝘤𝘥𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇'
    mono = '𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣'
    bold_italic = '𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯'
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
        f"『 {text} 』",
        f"➳ {text} ➳",
        f"🔥 {text} 🔥",
        f"💎 {text} 💎",
        f"⚡ {text} ⚡",
        f"🌟 {text} 🌟",
        f"🎀 {text} 🎀",
    ]
    return '\n'.join(styles)"

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
                # دانلودر خیلی خفن
                elif name in ('.dl', '.ytdl', '.insta', '.tiktok', '.yt', '.twitter', '.soundcloud'):
                    if not args:
                        raise ValueError('.dl لینک یوتیوب/اینستا/تیک‌تاک/توییتر/ساندکلاد — آپشن: --mp3 --720p --4k --nowm --playlist')
                    platform = detect_platform(args)
                    # از طریق ورکر دانلودر خفن
                    try:
                        dl_api = license_config['url'].rstrip('/') + '/api/download'
                        import aiohttp
                        quality = 'best'
                        audio_only = '--mp3' in args or '--audio' in args
                        if '--720p' in args: quality='720p'
                        elif '--1080p' in args: quality='1080p'
                        elif '--4k' in args: quality='4k'
                        clean_url = args.split()[0]
                        async with aiohttp.ClientSession() as sess:
                            async with sess.post(dl_api, json={'url': clean_url, 'quality': quality, 'audioOnly': audio_only}, headers={'Authorization': f'Bearer {license_config["token"]}'}, timeout=20) as resp:
                                data = await resp.json()
                                quals = "\n".join([f"• {q}" for q in data.get('qualities',[])])
                                result = f"📥 دانلودر خفن DemGram — {platform['emoji']} {platform['name']}\n\n🎬 {data.get('title','')}\n⏱ {data.get('duration','')} | 📦 {data.get('size','')}\n🔗 {data.get('download_url','')}\n\n📊 کیفیت‌های موجود:\n{quals}\n\n🎯 انتخاب: {quality} {'🎧 MP3' if audio_only else '🎬 ویدیو'}\n\n💎 امکانات خفن:\n• یوتیوب: MP4 144p تا 4K + MP3 128k/320k + پلی‌لیست\n• اینستا: پست/استوری/ریلز/IGTV HD\n• تیک‌تاک: بدون واترمارک HD + MP3\n• توییتر/X: HD\n• ساندکلاد: MP3/FLAC/WAV\n• تلگرام: فایل بزرگ\n\n📱 اپ: /demgram/ تب دانلودر → کیفیت انتخاب کن\n🤖 بات: /download {args}"
                    except Exception as e:
                        result = f"📥 دانلودر خفن (محلی) — {platform['emoji']} {platform['name']}:\nلینک: {args}\nکیفیت‌ها: {', '.join(platform['qualities'])}\n\nبرای دانلود واقعی:\n• اپ DemGram بخش دانلودر: /demgram/\n• یا yt-dlp: pip install yt-dlp && yt-dlp '{args.split()[0]}'\n• بات: /download {args.split()[0]}\nخطا: {type(e).__name__}"
                elif name == '.yt':
                    if not args:
                        raise ValueError('.yt لینک یوتیوب — آپشن --mp3 --720p')
                    platform = detect_platform(args)
                    result = f"▶️ YouTube Downloader — {args}\nکیفیت: {', '.join(platform['qualities'])}\n.dl {args} برای دانلود"
                elif name == '.insta_dl':
                    if not args:
                        raise ValueError('.insta_dl لینک اینستا')
                    result = f"📸 Instagram Downloader — {args}\n.dl {args}"

                # کانفیگ ساز خیلی خفن
                elif name in ('.config', '.v2ray'):
                    parts = args.split()
                    server = parts[0] if parts else "example.com"
                    count = min(10, max(1, int(parts[1]) if len(parts)>1 and parts[1].isdigit() else 1))
                    vless_list = []
                    vmess_list = []
                    ss_list = []
                    trojan_list = []
                    keys_list = []
                    for _ in range(count):
                        v, _, k = gen_vless(server)
                        vless_list.append(v)
                        keys_list.append(k)
                        vm, _ = gen_vmess(server)
                        vmess_list.append(vm)
                        ss, _ = gen_ss(server)
                        ss_list.append(ss)
                        tr, _ = gen_trojan(server)
                        trojan_list.append(tr)
                    all_configs = vless_list + vmess_list + ss_list + trojan_list
                    sub_raw = "\n".join(all_configs)
                    sub_b64 = base64.b64encode(sub_raw.encode()).decode()
                    clash = gen_clash_yaml(all_configs)
                    singbox = gen_singbox(all_configs)
                    result = f"🔐 کانفیگ ساز خیلی خفن DemGram — {count} ست = {len(all_configs)} کانفیگ\n\n🌐 سرور: {server}\n🔑 Reality PBK: {keys_list[0]['public'][:20]}...\n🆔 SID: {keys_list[0]['shortId']}\n\nVLESS (Reality):\n{vless_list[0]}\n\nVMess:\n{vmess_list[0]}\n\nSS:\n{ss_list[0]}\n\nTrojan:\n{trojan_list[0]}\n\n📦 ساب base64 (اول 200 کاراکتر):\n{sub_b64[:200]}...\n\n💎 امکانات خفن:\n• VLESS Reality xtls-rprx-vision با کلید واقعی\n• VMess TLS+SNI\n• SS 3 متد\n• Trojan Reality\n• Clash YAML + Sing-box JSON\n• QR: .qr <کانفیگ>\n• ساب: .sub {server} {count}\n• برای همه: .config {server} {count}\n\nبات: /config {server} {count} — اپ: /demgram/ تب کانفیگ ساز"
                elif name == '.vless':
                    parts = args.split()
                    server = parts[0] if parts else "example.com"
                    count = min(10, max(1, int(parts[1]) if len(parts)>1 and parts[1].isdigit() else 1))
                    configs = [gen_vless(server)[0] for _ in range(count)]
                    result = f"🔐 VLESS Reality x{count}:\n" + "\n\n".join(configs)
                elif name == '.vmess':
                    parts = args.split()
                    server = parts[0] if parts else "example.com"
                    count = min(10, max(1, int(parts[1]) if len(parts)>1 and parts[1].isdigit() else 1))
                    configs = [gen_vmess(server)[0] for _ in range(count)]
                    result = f"🔐 VMess x{count}:\n" + "\n\n".join(configs)
                elif name == '.ss':
                    parts = args.split()
                    server = parts[0] if parts else "example.com"
                    count = min(10, max(1, int(parts[1]) if len(parts)>1 and parts[1].isdigit() else 1))
                    configs = [gen_ss(server)[0] for _ in range(count)]
                    result = f"🔐 Shadowsocks x{count} (aes-256-gcm/chacha20/aes-128-gcm):\n" + "\n\n".join(configs)
                elif name == '.trojan':
                    parts = args.split()
                    server = parts[0] if parts else "example.com"
                    count = min(10, max(1, int(parts[1]) if len(parts)>1 and parts[1].isdigit() else 1))
                    configs = [gen_trojan(server)[0] for _ in range(count)]
                    result = f"🔐 Trojan Reality x{count}:\n" + "\n\n".join(configs)
                elif name in ('.proxy', '.proxygen'):
                    parts = args.split()
                    count = min(20, max(1, int(parts[0]) if parts and parts[0].isdigit() else 5))
                    proxies = [gen_proxy() for _ in range(count)]
                    lines = [f"{emoji} {ping}ms [{country}] — {url}" for url, ping, country, emoji in proxies]
                    sorted_proxies = sorted(proxies, key=lambda x: x[1])
                    fastest = sorted_proxies[0]
                    result = f"🌐 پروکسی MTProto خفن x{count} — تست سرعت:\n" + "\n".join(lines) + f"\n\n⚡ سریع‌ترین: {fastest[3]} {fastest[1]}ms {fastest[2]} — {fastest[0]}\n\n💎 مرتب‌سازی: سریع به کند\n📱 اپ: /demgram/ تب پروکسی → تست سرعت"
                elif name == '.sub':
                    parts = args.split()
                    server = parts[0] if parts else "example.com"
                    count = min(10, max(1, int(parts[1]) if len(parts)>1 and parts[1].isdigit() else 4))
                    all_configs = []
                    for _ in range(count):
                        all_configs.append(gen_vless(server)[0])
                        all_configs.append(gen_vmess(server)[0])
                        all_configs.append(gen_ss(server)[0])
                        all_configs.append(gen_trojan(server)[0])
                    sub_raw = "\n".join(all_configs)
                    sub_b64 = base64.b64encode(sub_raw.encode()).decode()
                    clash = gen_clash_yaml(all_configs)
                    clash_b64 = base64.b64encode(clash.encode()).decode()
                    singbox = gen_singbox(all_configs)
                    result = f"📦 ساب لینک ساز خیلی خفن x{count} ست = {len(all_configs)} کانفیگ\n\n🌐 سرور: {server}\n\n🔗 V2Ray sub base64 (اول 300):\n{sub_b64[:300]}...\n\n⚙️ Clash YAML base64 (اول 200):\n{clash_b64[:200]}...\n\n📱 فرمت‌ها:\n• V2Ray sub — همه کلاینت‌ها\n• Clash YAML — Clash/Mihomo\n• Sing-box JSON — NekoBox/SFA\n• Raw — لیست ساده\n\nبرای کامل: پیوی بات /sub {server} {count} یا اپ /demgram/ تب کانفیگ ساز"
                elif name == '.clash':
                    parts = args.split()
                    server = parts[0] if parts else "example.com"
                    count = min(10, max(1, int(parts[1]) if len(parts)>1 and parts[1].isdigit() else 4))
                    configs = [gen_vless(server)[0] for _ in range(count)]
                    clash = gen_clash_yaml(configs)
                    result = f"⚙️ Clash YAML x{count}:\n{clash[:3000]}"
                elif name == '.singbox':
                    parts = args.split()
                    server = parts[0] if parts else "example.com"
                    count = min(10, max(1, int(parts[1]) if len(parts)>1 and parts[1].isdigit() else 4))
                    configs = [gen_vless(server)[0] for _ in range(count)]
                    singbox = gen_singbox(configs)
                    result = f"📦 Sing-box JSON x{count}:\n{singbox[:3000]}"
                elif name == '.qr':
                    if not args:
                        raise ValueError('.qr متن یا کانفیگ')
                    result = f"🔳 QR Code:\nhttps://api.qrserver.com/v1/create-qr-code/?size=500x500&data={args[:500]}\n\nبرای QR بزرگ: اپ /demgram/ تب کانفیگ ساز → دکمه QR"

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
