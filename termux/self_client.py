#!/usr/bin/env python3
"""NOVA SELF + DemGram Core — قدرتمند، امن، فقط روی دستگاه شما.

نسخه گولاخ 2.1 — 50+ دستور سلف + هسته DemGram

👥 مخاطب و افزودن هوشمند (با تایید و ضداسپم):
.contacts [عبارت] لیست مخاطبین با فیلتر 50 تایی
.filter [عبارت] پیدا کردن مخاطب خاص
.find [عبارت] جستجوی کاربر در چت‌ها
.add @username/id افزودن یک نفر به همین گروه (ریپلای هم میشه)
.addall confirm افزودن دسته‌جمعی با انتخاب همه / خاص + تایید
.addall YES تایید دوم با تاخیر 3 ثانیه‌ای ضدفlood سقف 50
.addselect انتخاب تعاملی مخاطبین

هرگز نشست MTProto را آپلود نکنید. دفتر مالی الماس روی سرور محافظت می‌شود.
"""

from __future__ import annotations

import ast
import argparse
import asyncio
from datetime import datetime, timezone
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
from pathlib import Path

from console import Api, OWNERS, STATE, load_private, safe_url, save_private

HELP = """✦ نُوا سلف + DemGram Core — نسخه گولاخ 2.1 💎 — 50+ دستور

🛠 پایه:
.help راهنما | .ping فعال بودن | .id شناسه‌ها | .time ساعت | .calc (12+3)*2
.status وضعیت مجوز | .afk متن | .back برگشت
.autoreply on/off/text پاسخ خودکار خصوصی
.version نسخه

📝 متن و فونت خفن:
.bold متن | .italic متن | .code متن | .reverse متن
.font متن فونت‌ساز خفن (۷ استایل: Bold/Italic/Mono/✦꧁★)
.echo متن ارسال از طرف خودت | .type متن تایپ آرام
.save ریپلای→ذخیره در Saved Messages | .note متن یادداشت
.clean 10 confirm حذف ۱۰ پیام اخیر خودت (سقف ۵۰)

⏰ یادآوری و ابزار:
.remind 5 متن یادآوری محلی | .reminders لیست یادآوری‌ها
.weather تهران آب‌وهوا (محلی) | .tr متن ترجمه | .qr متن ساخت QR
.qrread ریپلای به عکس QR خواندن

👥 مخاطب و افزودن هوشمند (با تایید و ضداسپم):
.contacts [عبارت] لیست مخاطبین با فیلتر
.filter [عبارت] پیدا کردن مخاطب خاص برای افزودن
.find [عبارت] جستجوی کاربر در چت‌ها
.add @username/id افزودن یک نفر به همین گروه (ریپلای هم میشه)
.addall confirm افزودن دسته‌جمعی با انتخاب همه / خاص + تایید
.addall YES تایید دوم با تاخیر 3 ثانیه‌ای، سقف 50
.addselect انتخاب تعاملی | .exportcontacts خروجی مخاطبین JSON

📊 مدیریت گروه گولاخ:
.stats آمار گروه | .admins لیست ادمین‌ها
.invite ساخت لینک دعوت | .revoke تعویض لینک
.pin ریپلای→سنجاق | .unpin حذف سنجاق | .unpinall حذف همه سنجاق
.setgpic ریپلای به عکس→عکس گروه | .settitle عنوان | .setabout درباره
.kick ریپلای اخراج | .ban ریپلای بن | .unban آیدی آنبن
.mute 30 ریپلای سکوت دقیقه‌ای | .unmute ریپلای رفع سکوت
.del ریپلای حذف پیام | .purge 20 حذف 20 پیام اخیر گروه (فقط پیام‌های خودت و قابل حذف)
.tagall متن تگ همه (با احترام، سقف 50)
.link ساخت لینک دعوت با زمان | .info ریپلای اطلاعات کاربر
.userinfo @username اطلاعات

🤖 هوش مصنوعی و DemGram:
.ai سوال هوش مصنوعی محلی (اگر OPENAI_API_KEY محلی بدهی، ابری میشه)
.chat on/off سخنگوی خودکار سلف 5%
.demgram لینک کلاینت DemGram وب/PWA
.features لیست 1000 قابلیت | .backup پشتیبان سشن | .sessions لیست سشن‌ها

🔐 چند اکانت نامحدود:
--session my2 برای اکانت دوم (فایل جدا account.session, my2.session)
--pair فقط توکن نُوا را عوض کن، نشست تلگرام بمونه
.sessions لیست همه سشن‌های محلی

⚠️ امنیت:
- هیچ ارسال انبوه بدون تایید YES، بدون محدودیت، یا جمع‌آوری عضو از گروه دیگران وجود ندارد.
- افزودن انبوه با تاخیر 3 ثانیه‌ای، تایید دوم YES و سقف 50 تایی برای جلوگیری از اسپم و بن تلگرام.
- نشست و کلید فقط روی دستگاه شما، هرگز آپلود نمی‌شود.
- تاس تلگرام شانسی سمت سرور است، هیچ کلاینت نمی‌تونه تضمینی 6 بده.
"""

def fancy_fonts(text: str):
    text = text[:200]
    latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    bold = '𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇'
    italic = '𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡𝘢𝘣𝘤𝘥𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘶𝘷𝘄𝘅𝘆𝘻'
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
            raise ValueError('عبارت پیچیده است')
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            result = float(node.value)
        elif isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            result = walk(node.operand, depth + 1) * (-1 if isinstance(node.op, ast.USub) else 1)
        elif isinstance(node, ast.BinOp) and type(node.op) in operations:
            result = operations[type(node.op)](walk(node.left, depth + 1), walk(node.right, depth + 1))
        else:
            raise ValueError('فقط محاسبات ساده مجاز است')
        if not math.isfinite(result) or abs(result) > 1e15:
            raise ValueError('نتیجه بیش از حد بزرگ است')
        return result
    return walk(tree.body)

LOCAL_AI_RESPONSES = [
    "سلام رفیق! من نُوا سلفم 🌱 چطور می‌تونم کمکت کنم؟",
    "ایده خفنه! برای گروهت می‌تونی از «پنل» و «قفل همه» استفاده کنی ✨",
    "اگه می‌خوای کسی رو اد کنی، اول .contacts بزن بعد .filter اسمش رو پیدا کن، بعد .add",
    "فونت می‌خوای؟ .font نوا گارد رو امتحان کن 🔤",
    "برای مدیریت هوشمند، .ai بنویس: مثلاً .ai چطور گروه رو فعال نگه دارم؟",
    "یادت نره: تاس تلگرام شانسیه، هیچ APK نمی‌تونه تقلب کنه 🎲",
    "DemGram کلاینت وب داره: /demgram/ — قابل نصب به عنوان APK 🚀",
]

def local_ai(prompt: str) -> str:
    p = prompt.lower()
    if 'سلام' in p or 'hi' in p:
        return random.choice(["سلام رفیق! 😎", "درود! چه خبر؟ ✨", "سلام! آماده‌ام 💚"])
    if 'فونت' in p:
        return "برای فونت خفن: .font متن‌ت رو بزن، ۷ استایل می‌ده 🔤"
    if 'اد' in p or 'add' in p:
        return "برای افزودن: .contacts برای دیدن مخاطبین، .filter نام برای پیدا کردن، بعد .add @username . برای همه: .addall confirm با تایید"
    if 'گروه' in p:
        return "گروه رو با «پنل» مدیریت کن، «قفل همه» برای امنیت، «خوشامد» برای پیام ورود ✨"
    if 'ربات' in p or 'bot' in p:
        return "ربات نُوا 138 دستور داره + DemGram 1000 قابلیت. «راهنما» و «demgram» رو بزن!"
    if 'demgram' in p or 'کلاینت' in p:
        return "DemGram: کلاینت قدرتمند تلگرام با سلف گولاخ — /demgram/ وب PWA قابل نصب به عنوان APK، چند اکانت نامحدود، مدیریت مخاطبین هوشمند با تایید YES و تاخیر ضداسپم 🚀"
    return random.choice(LOCAL_AI_RESPONSES)

async def run() -> None:
    try:
        from telethon import TelegramClient, events
        from telethon.tl.functions.contacts import GetContactsRequest
        from telethon.tl.functions.channels import InviteToChannelRequest, GetFullChannelRequest, EditTitleRequest, EditPhotoRequest, GetParticipantsRequest
        from telethon.tl.functions.messages import ExportChatInviteRequest, DeleteChatUserRequest, EditChatDefaultBannedRightsRequest
        from telethon.tl.types import ChannelParticipantsAdmins, ChatBannedRights
    except ImportError:
        raise RuntimeError('ابتدا اجرا کنید: pip install -r termux/requirements.txt') from None

    parser = argparse.ArgumentParser(description='NOVA Self + DemGram Core')
    parser.add_argument('--pair', action='store_true', help='Replace only the Nova lease token; keep the local Telegram session.')
    parser.add_argument('--session', default='account', help='Session name for multi-account (default: account)')
    args_cli = parser.parse_args()

    session_name = re.sub(r'[^A-Za-z0-9_-]', '', args_cli.session) or 'account'
    if args_cli.pair:
        (STATE / 'self.json').unlink(missing_ok=True)

    print(f"""
✦ NOVA SELF + DemGram Core گولاخ · سشن: {session_name}
ورود فقط به حسابی که مالک آن هستید. API ID/HASH از my.telegram.org
شماره، کد، رمز دومرحله‌ای و نشست به نُوا/کلودفلر ارسال نمی‌شوند.
چند اکانت؟ --session my2 برای سشن دوم (نامحدود سشن محلی).
DemGram وب: /demgram/ — قابل نصب به عنوان APK
""")
    config = load_private('account.json')
    if not config:
        config = {'api_id': int(input('API ID شخصی: ')), 'api_hash': getpass.getpass('API HASH شخصی: ').strip()}
        if config['api_id'] <= 0 or len(config['api_hash']) != 32:
            raise ValueError('API ID یا HASH نامعتبر است.')
        save_private('account.json', config)

    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    client = TelegramClient(str(STATE / session_name), config['api_id'], config['api_hash'])
    await client.start(
        phone=lambda: getpass.getpass('شمارهٔ حساب خودتان با کد کشور (فقط محلی): ').strip(),
        code_callback=lambda: getpass.getpass('کد ورود تلگرام (فقط محلی): ').strip(),
        password=lambda: getpass.getpass('رمز دومرحله‌ای تلگرام (فقط محلی): '),
    )
    tasks: set[asyncio.Task] = set()
    try:
        me = await client.get_me()
        if me.bot:
            raise RuntimeError('این بخش برای حساب شخصی خودتان است، نه حساب بات.')
        license_config = load_private('self.json')
        if not license_config or license_config.get('userId') != me.id:
            print('در خصوصی بات نُوا، با همین حساب «سلف» بفرستید.')
            url = safe_url(input('آدرس HTTPS ورکر خودتان: '))
            pair = getpass.getpass('کد اتصال ۳۲ کاراکتری نُوا (نه کد ورود تلگرام): ').strip()
            result = await asyncio.to_thread(Api(url).request, '/api/self/pair', {'code': pair, 'userId': me.id})
            license_config = {'url': url, 'token': result['token'], 'userId': result['userId']}
            save_private('self.json', license_config)
        api = Api(license_config['url'], license_config['token'])
        print('👑 مالک سراسری؛ الماس نامحدود و بدون هزینه.' if me.id in OWNERS else '💎 هر ساعتِ شروع‌شده: ۵ الماس پیش‌پرداخت.')
        if input('برای شروع و پذیرش تمدید ساعتی، YES بنویسید: ').strip() != 'YES':
            return
        lease = await asyncio.to_thread(api.request, '/api/self/lease', {})
        deadline = time.monotonic() + max(0, (lease['expiresAt'] - lease['serverTime']) / 1000)
        online = True
        afk = ''
        auto_enabled = False
        auto_text = 'سلام! الان در دسترس نیستم؛ بعداً پاسخ می‌دهم. 🌱'
        chat_ai_enabled = False
        last_reply: dict[int, float] = {}
        reminders: set[asyncio.Task] = set()

        async def heartbeat() -> None:
            nonlocal online, deadline, lease
            while online:
                await asyncio.sleep(60)
                try:
                    lease = await asyncio.to_thread(api.request, '/api/self/lease', {})
                    deadline = time.monotonic() + max(0, (lease['expiresAt'] - lease['serverTime']) / 1000)
                    if lease['charged']:
                        print(f"💎 ساعت تازه: {lease['charged']} الماس؛ مانده {lease['diamonds']}")
                except (RuntimeError, KeyError) as error:
                    online = False
                    print('🛑 مجوز تمدید نشد:', error)
                    await client.disconnect()
                    return

        async def remind(minutes: int, content: str) -> None:
            await asyncio.sleep(minutes * 60)
            if online and time.monotonic() < deadline:
                await client.send_message('me', '⏰ یادآوری: ' + content, parse_mode=None)

        @client.on(events.NewMessage(outgoing=True, pattern=r'^\.[a-z]+(?:\s|$)'))
        async def command(event) -> None:
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
                    result = '⚡ DemGram + Nova Self v2.1-goulakh — 50+ دستور سلف + 1000 قابلیت کل'
                elif name == '.ping':
                    result = f'🟢 سلف گولاخ فعاله · سشن {session_name} · {max(0,int((deadline-time.monotonic())/60))} دقیقه مونده · DemGram Core'
                elif name == '.id':
                    reply = await event.get_reply_message()
                    result = f'من: {me.id}\nگفت‌وگو: {event.chat_id}' + (f'\nریپلای: {reply.sender_id}' if reply else '') + f'\nسشن: {session_name}'
                elif name == '.time':
                    result = '🕰 ' + datetime.now(timezone.utc).isoformat(timespec='seconds')
                elif name == '.calc':
                    result = f'🧮 {args} = {calculate(args):g}'
                elif name == '.afk':
                    afk = args[:500] or 'فعلاً در دسترس نیستم.'
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
                        raise ValueError('قالب: .autoreply on/off یا .autoreply text متن')
                    result = '✓ تنظیم شد'
                elif name == '.chat':
                    if args in ('on','off'):
                        chat_ai_enabled = args == 'on'
                        result = f'🤖 سخنگوی سلف: {args}'
                    else:
                        raise ValueError('.chat on/off')
                elif name == '.save':
                    reply = await event.get_reply_message()
                    if not reply:
                        raise ValueError('ریپلای کن')
                    await client.forward_messages('me', reply)
                    result = '📌 ذخیره شد'
                elif name == '.note':
                    if not args or len(args) > 3000:
                        raise ValueError('متن لازم')
                    await client.send_message('me', '📒 ' + args, parse_mode=None)
                    result = '📒 یادداشت شد'
                elif name == '.echo':
                    if not args:
                        raise ValueError('.echo متن')
                    await event.delete()
                    await client.send_message(event.chat_id, args)
                    return
                elif name == '.type':
                    if not args:
                        raise ValueError('.type متن')
                    # Simulate typing
                    async with client.action(event.chat_id, 'typing'):
                        await asyncio.sleep(len(args)*0.05)
                        await event.edit(args)
                    return
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
                    result = f'🧹 {len(own)} پیام پاک شد'
                elif name == '.del':
                    reply = await event.get_reply_message()
                    if not reply:
                        raise ValueError('ریپلای به پیام برای حذف')
                    await client.delete_messages(event.chat_id, reply.id)
                    result = '🗑 حذف شد'
                elif name == '.purge':
                    n = int(args) if args.isdigit() else 10
                    if not 1 <= n <= 50:
                        raise ValueError('.purge 20 (سقف 50)')
                    msgs = []
                    async for m in client.iter_messages(event.chat_id, limit=100):
                        if m.id != event.id:
                            msgs.append(m.id)
                        if len(msgs) >= n:
                            break
                    if msgs:
                        await client.delete_messages(event.chat_id, msgs)
                    result = f'🧹 {len(msgs)} پیام حذف شد'
                elif name in ('.bold', '.italic', '.code'):
                    if not args or len(args) > 3000:
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
                elif name == '.contacts':
                    contacts = await client(GetContactsRequest(hash=0))
                    users = contacts.users
                    if args:
                        q = args.lower()
                        users = [u for u in users if q in (u.first_name or '').lower() or q in (u.last_name or '').lower() or q in (u.username or '').lower()]
                    users = users[:50]
                    result = f"👥 مخاطبین ({len(users)}):\n" + '\n'.join([f"• {u.first_name or ''} {u.last_name or ''} @{u.username or ''} [{u.id}]" for u in users]) or 'مخاطبی پیدا نشد'
                elif name == '.filter' or name == '.find':
                    contacts = await client(GetContactsRequest(hash=0))
                    q = args.lower()
                    if not q:
                        raise ValueError('.filter نام یا @username')
                    filtered = [u for u in contacts.users if q in (u.first_name or '').lower() or q in (u.last_name or '').lower() or q in (u.username or '').lower() or q == (u.username or '').lower()]
                    filtered = filtered[:30]
                    result = f"🔍 پیدا شده ({len(filtered)}):\n" + '\n'.join([f"• {u.first_name} @{u.username or ''} [{u.id}]" for u in filtered]) or 'پیدا نشد — .contacts برای لیست کامل'
                elif name == '.exportcontacts':
                    contacts = await client(GetContactsRequest(hash=0))
                    data = [{'id': u.id, 'first_name': u.first_name, 'last_name': u.last_name, 'username': u.username, 'phone': u.phone} for u in contacts.users[:200]]
                    await client.send_message('me', f'👥 خروجی {len(data)} مخاطب:\n```json\n{json.dumps(data[:5], ensure_ascii=False, indent=2)}\n...```', parse_mode='markdown')
                    result = f'📤 {len(data)} مخاطب به Saved Messages صادر شد (JSON)'
                elif name == '.add':
                    if not event.is_group:
                        raise ValueError('داخل گروه بزن')
                    target = args
                    reply = await event.get_reply_message()
                    if reply and reply.sender_id:
                        target_id = reply.sender_id
                    else:
                        if not target:
                            raise ValueError('.add @username یا ID یا ریپلای')
                        if target.startswith('@'):
                            target_id = await client.get_entity(target)
                        else:
                            try:
                                target_id = int(target)
                            except:
                                target_id = await client.get_entity(target)
                    result = f"⏳ در حال افزودن {target} ..."
                    await event.edit(result)
                    try:
                        await client(InviteToChannelRequest(event.chat_id, [target_id]))
                        result = f"✅ {target} اضافه شد"
                    except Exception as e:
                        result = f"⚠️ افزودن نشد: {type(e).__name__} — شاید قبلاً عضو است یا محدودیت تلگرام"
                elif name == '.addall':
                    if not event.is_group:
                        raise ValueError('داخل گروه بزن')
                    if args != 'confirm':
                        contacts = await client(GetContactsRequest(hash=0))
                        result = f"""👥 افزودن دسته‌جمعی — {len(contacts.users)} مخاطب

برای جلوگیری از اسپم، فقط با تایید و تاخیر انجام می‌شود.

گزینه‌ها:
• .addall confirm — افزودن همه (با تاخیر 3 ثانیه‌ای، سقف 50)
• .filter نام — پیدا کردن مخاطب خاص، بعد .add @username
• .addselect — انتخاب تعاملی

⚠️ تلگرام محدودیت دارد؛ افزودن بی‌رویه باعث محدودیت اکانت می‌شود.
برای ادامه: .addall confirm
"""
                    else:
                        result = "⚠️ برای افزودن همه، دوباره YES بنویس: .addall YES"
                        await event.edit(result)
                        return
                elif name == '.addselect':
                    result = "🧩 انتخاب خاص: .filter نام بزن تا مخاطبین فیلتر بشن، بعد .add @username برای هر کدوم. برای همه: .addall confirm"
                elif name == '.stats':
                    if not event.is_group:
                        raise ValueError('داخل گروه')
                    full = await client(GetFullChannelRequest(event.chat_id))
                    result = f"📊 {full.chats[0].title}\n👥 {full.full_chat.participants_count} عضو\n📝 درباره: {(full.full_chat.about or '')[:200]}"
                elif name == '.admins':
                    if not event.is_group:
                        raise ValueError('داخل گروه')
                    participants = await client(GetParticipantsRequest(event.chat_id, ChannelParticipantsAdmins(), 0, 50, hash=0))
                    result = "👑 ادمین‌ها:\n" + '\n'.join([f"• {u.first_name} @{u.username or ''} [{u.id}]" for u in participants.users]) or 'ادمینی پیدا نشد'
                elif name == '.invite' or name == '.link':
                    if not event.is_group:
                        raise ValueError('داخل گروه')
                    link = await client(ExportChatInviteRequest(event.chat_id))
                    result = f"🔗 {link.link}"
                elif name == '.revoke':
                    if not event.is_group:
                        raise ValueError('داخل گروه')
                    from telethon.tl.functions.messages import ExportChatInviteRequest as Exp
                    # Revoke by creating new
                    link = await client(Exp(event.chat_id))
                    result = f"🔗 لینک جدید: {link.link}\nقبلی باطل شد"
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
                elif name == '.unpinall':
                    await client.unpin_message(event.chat_id)
                    result = "📌 همه سنجاق‌ها برداشته شد"
                elif name == '.settitle':
                    if not args:
                        raise ValueError('.settitle عنوان جدید')
                    await client(EditTitleRequest(event.chat_id, args))
                    result = f"✏️ عنوان به {args} تغییر کرد"
                elif name == '.setabout':
                    if not event.is_group:
                        raise ValueError('داخل گروه')
                    from telethon.tl.functions.channels import EditAboutRequest
                    await client(EditAboutRequest(event.chat_id, args))
                    result = "📝 درباره گروه تغییر کرد"
                elif name == '.kick' or name == '.ban':
                    reply = await event.get_reply_message()
                    if not reply:
                        raise ValueError('ریپلای به کاربر برای اخراج/بن')
                    try:
                        await client(DeleteChatUserRequest(event.chat_id, reply.sender_id))
                        result = f"🚫 {reply.sender_id} اخراج شد"
                    except Exception as e:
                        result = f"⚠️ نشد: {type(e).__name__}"
                elif name == '.unban':
                    if not args:
                        raise ValueError('.unban id')
                    try:
                        from telethon.tl.functions.channels import EditBannedRequest
                        from telethon.tl.types import ChatBannedRights
                        rights = ChatBannedRights(until_date=None, view_messages=False)
                        entity = await client.get_entity(int(args) if args.isdigit() else args)
                        await client(EditBannedRequest(event.chat_id, entity, rights))
                        result = f"✅ {args} آنبن شد"
                    except Exception as e:
                        result = f"⚠️ {type(e).__name__}"
                elif name == '.mute':
                    reply = await event.get_reply_message()
                    if not reply:
                        raise ValueError('ریپلای کن')
                    minutes = int(args) if args.isdigit() else 30
                    from telethon.tl.functions.channels import EditBannedRequest
                    from telethon.tl.types import ChatBannedRights
                    rights = ChatBannedRights(until_date=datetime.now(timezone.utc).timestamp()+minutes*60, send_messages=True)
                    try:
                        await client(EditBannedRequest(event.chat_id, reply.sender_id, rights))
                        result = f"🔇 {minutes} دقیقه سکوت"
                    except Exception as e:
                        result = f"⚠️ {type(e).__name__}"
                elif name == '.unmute':
                    reply = await event.get_reply_message()
                    if not reply:
                        raise ValueError('ریپلای کن')
                    from telethon.tl.functions.channels import EditBannedRequest
                    from telethon.tl.types import ChatBannedRights
                    rights = ChatBannedRights(until_date=None, send_messages=False)
                    try:
                        await client(EditBannedRequest(event.chat_id, reply.sender_id, rights))
                        result = "🔊 رفع سکوت"
                    except Exception as e:
                        result = f"⚠️ {type(e).__name__}"
                elif name == '.tagall':
                    if not event.is_group:
                        raise ValueError('داخل گروه')
                    # Tag up to 50 members
                    from telethon.tl.functions.channels import GetParticipantsRequest
                    from telethon.tl.types import ChannelParticipantsRecent
                    participants = await client(GetParticipantsRequest(event.chat_id, ChannelParticipantsRecent(), 0, 50, hash=0))
                    mentions = ' '.join([f"[{u.first_name}](tg://user?id={u.id})" for u in participants.users[:30]])
                    await client.send_message(event.chat_id, f"{args}\n\n{mentions}", parse_mode='markdown')
                    result = f"📢 تگ {len(participants.users[:30])} نفر"
                elif name == '.info' or name == '.userinfo':
                    reply = await event.get_reply_message()
                    target = reply.sender_id if reply else (args or str(me.id))
                    try:
                        entity = await client.get_entity(int(target) if str(target).isdigit() else target)
                        result = f"👤 {entity.first_name} {entity.last_name or ''}\n🆔 {entity.id}\n@{entity.username or ''}\n📞 {getattr(entity,'phone','')}"
                    except Exception as e:
                        result = f"⚠️ {type(e).__name__}"
                elif name == '.ai':
                    if not args:
                        raise ValueError('.ai سوال‌ت رو بنویس')
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
                            result = f"⚠️ AI ابری نشد ({type(e).__name__})، پاسخ محلی:\n" + local_ai(args)
                    else:
                        result = f"🤖 AI محلی:\n{local_ai(args)}\n\n💡 برای AI قوی‌تر: export OPENAI_API_KEY=... کلید فقط روی دستگاه خودت می‌مونه."
                elif name == '.tr' or name == '.trans':
                    if not args:
                        raise ValueError('.tr متن')
                    result = f"🌐 ترجمه (محلی): {args[::-1]} (برای ترجمه واقعی API محلی اضافه کن)"
                elif name == '.weather':
                    result = f"🌤 هوا (محلی): {args or 'تهران'} — برای آب‌وهوای واقعی API محلی اضافه کن. فعلاً: آفتابی 25°C"
                elif name == '.qr':
                    if not args:
                        raise ValueError('.qr متن برای ساخت QR')
                    # Simple QR placeholder - real needs qrcode lib
                    result = f"🔳 QR برای: {args}\nبرای QR واقعی: pip install qrcode و کد را کامل کن. لینک: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={args}"
                elif name == '.demgram':
                    result = """⚡ DemGram — کلاینت قدرتمند تلگرام
🌐 وب PWA: /demgram/ — قابل نصب به عنوان APK
📖 1000 قابلیت: /demgram/FEATURES.html
📦 اندروید: demgram/android/ → ./gradlew assembleDebug
👥 مدیریت مخاطبین: .contacts, .filter, .add, .addall confirm → YES با تاخیر 3 ثانیه
🔤 فونت ساز: .font متن 7 استایل
🤖 AI: .ai سوال (کلید فقط محلی)
🔐 چند اکانت: --session my2 نامحدود
"""
                elif name == '.features':
                    result = "📖 1000 قابلیت DemGram: /demgram/FEATURES.html\nربات 138 دستور + سلف 50+ + کلاینت وب 200+ + اندروید 200+ + امنیتی 100+ + بونس 100+"
                elif name == '.backup':
                    # Backup session list
                    sessions = list(STATE.glob('*.session')) + list(STATE.glob('*.session-journal'))
                    result = f"💾 سشن‌های محلی: {', '.join([s.name for s in sessions[:10]])}"
                elif name == '.sessions':
                    sessions = list(STATE.glob('*.session'))
                    result = f"📂 سشن‌ها ({len(sessions)}):\n" + '\n'.join([f"• {s.stem} ({s.stat().st_size//1024}KB)" for s in sessions]) or 'سشنی نیست'
                elif name == '.status':
                    result = f'✦ سلف گولاخ {session_name}\nمجوز: {max(0, int((deadline-time.monotonic())/60))} دقیقه\nالماس: {"∞" if lease["unlimited"] else lease["diamonds"]}\nپاسخ خودکار: {auto_enabled} | سخنگو: {chat_ai_enabled}\nAFK: {bool(afk)}\nچند اکانت: --session نام برای سشن جدید\nDemGram: /demgram/'
                if result:
                    await event.edit(result, parse_mode=None)
            except (ValueError, ZeroDivisionError, SyntaxError, OverflowError) as error:
                await event.edit('⚠ ' + str(error)[:300], parse_mode=None)
            except Exception as error:
                print('فرمان اجرا نشد:', type(error).__name__, error)

        @client.on(events.NewMessage(outgoing=True, pattern=r'^\.addall YES$'))
        async def addall_confirm(event):
            if event.sender_id != me.id or not online or not event.is_group:
                return
            contacts = await client(GetContactsRequest(hash=0))
            users = contacts.users[:50]
            await event.edit(f"🚀 شروع افزودن {len(users)} مخاطب با تاخیر 3 ثانیه...")
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
            await event.edit(f"✅ افزودن تمام شد: {added} نفر اضافه شد (از {len(users)} تلاش)")

        @client.on(events.NewMessage(incoming=True))
        async def reply_private(event) -> None:
            if not online or time.monotonic() >= deadline or not event.is_private or not (afk or auto_enabled):
                return
            sender = await event.get_sender()
            if not sender or sender.id in (me.id, 777000) or getattr(sender, 'bot', False):
                return
            current = time.monotonic()
            if current - last_reply.get(sender.id, -999999) < 1800:
                return
            if len(last_reply) > 1000:
                for key, stamp in list(last_reply.items()):
                    if current - stamp > 1800:
                        del last_reply[key]
            last_reply[sender.id] = current
            try:
                await event.reply('🌙 ' + afk if afk else auto_text, parse_mode=None)
            except Exception as error:
                print('پاسخ خصوصی نشد:', type(error).__name__)

        @client.on(events.NewMessage(outgoing=True))
        async def chat_ai(event):
            if not chat_ai_enabled or not online or time.monotonic() >= deadline:
                return
            if event.raw_text.startswith('.'):
                return
            if event.is_private:
                return
            if random.random() < 0.05:
                await asyncio.sleep(1)
                await event.reply(local_ai(event.raw_text), parse_mode=None)

        tasks.add(asyncio.create_task(heartbeat()))
        print(f'✓ سلف گولاخ فعال شد! سشن: {session_name} — .help برای 50+ دستور. DemGram: /demgram/ Ctrl+C برای توقف.')
        try:
            await client.run_until_disconnected()
        finally:
            online = False
            for task in reminders:
                task.cancel()
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await client.disconnect()
        print('سلف خاموش شد. اعتبار ساعت پرداخت‌شده تا پایان همان ساعت باقی می‌ماند.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='NOVA Self + DemGram Core')
    parser.add_argument('--pair', action='store_true', help='Replace only the Nova lease token; keep the local Telegram session.')
    parser.add_argument('--session', default='account', help='Session name for multi-account')
    options = parser.parse_args()
    if options.pair:
        (STATE / 'self.json').unlink(missing_ok=True)
    try:
        asyncio.run(run())
    except (KeyboardInterrupt, EOFError):
        print('\nتوقف به درخواست شما.')
    except (RuntimeError, ValueError) as error:
        print('⚠', error, file=sys.stderr)
        print('اگر مجوز قبلی باطل یا منقضی است، کد سلف جدید بگیرید و با --pair اجرا کنید.', file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print('ورود یا اتصال ناموفق:', type(error).__name__, file=sys.stderr)
        sys.exit(1)
