#!/usr/bin/env python3
"""NOVA Guard owner console. No Telegram credentials are collected by the server."""
from __future__ import annotations

import argparse
import getpass
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

OWNERS = {8882866473, 7856615968}
STATE = Path(os.environ.get('NOVA_STATE_DIR', str(Path.home() / '.nova-guard')))
os.umask(0o077)


def safe_url(value: str) -> str:
    url = urlsplit(value.strip())
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ('', '/'):
        raise ValueError('فقط آدرس اصلی HTTPS ورکر خودتان، بدون مسیر، رمز یا query مجاز است.')
    return f'https://{url.netloc}'


def save_private(name: str, value: dict) -> None:
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    STATE.chmod(0o700)
    path = STATE / name
    temp = path.with_suffix('.tmp')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as file:
        json.dump(value, file, ensure_ascii=False)
    temp.chmod(0o600)
    os.replace(temp, path)
    path.chmod(0o600)


def load_private(name: str) -> dict:
    path = STATE / name
    if not path.exists():
        return {}
    path.chmod(0o600)
    return json.loads(path.read_text(encoding='utf-8'))


class Api:
    def __init__(self, url: str, token: str = ''):
        self.url = safe_url(url)
        self.token = token

    def request(self, path: str, body: dict | None = None) -> dict:
        if not path.startswith('/api/') or '..' in path:
            raise ValueError('مسیر نامعتبر')
        headers = {'Accept': 'application/json', 'User-Agent': 'NovaGuard-Termux/2.0'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        data = None
        if body is not None:
            headers['Content-Type'] = 'application/json'
            data = json.dumps(body).encode()
        req = Request(self.url + path, data=data, headers=headers, method='POST' if body is not None else 'GET')
        try:
            with urlopen(req, timeout=15) as response:
                return json.load(response)
        except HTTPError as error:
            try:
                message = json.loads(error.read(8192)).get('error', f'HTTP {error.code}')
            except (ValueError, AttributeError):
                message = f'HTTP {error.code}'
            raise RuntimeError(str(message)[:400]) from None
        except (URLError, TimeoutError, OSError):
            # Mutations are NOT retried: an interrupted send may already have succeeded.
            raise RuntimeError('ارتباط نامشخص است. قبل از تکرار عملیات، وضعیت پنل یا گروه را بررسی کنید.') from None


def setup() -> Api:
    print('\n✦ اتصال امن کنسول مالک\nدر خصوصی بات «کنسول مالک» یا «ترمینال» بفرستید و کد یک‌بارمصرف را اینجا وارد کنید.')
    url = safe_url(input('آدرس HTTPS ورکر خودتان: '))
    code = getpass.getpass('کد اتصال کنسول (نه کد ورود تلگرام): ').strip()
    result = Api(url).request('/api/terminal/pair', {'code': code})
    if result.get('userId') not in OWNERS:
        raise RuntimeError('پاسخ اتصال متعلق به مالک مورد انتظار نیست.')
    save_private('terminal.json', {'url': url, 'token': result['token'], 'userId': result['userId']})
    print('✓ وصل شد. اعتبار مجوز: ۳۰ روز. فایل تنظیمات را هرگز به کسی ندهید.')
    return Api(url, result['token'])


def connect() -> Api:
    config = load_private('terminal.json')
    return Api(config['url'], config['token']) if config.get('token') else setup()


def groups(api: Api) -> list[dict]:
    items = api.request('/api/groups')['groups']
    for index, group in enumerate(items, 1):
        print(f"{index:>2}. {group['title']} | {group['id']} | {'فعال' if group['active'] == 1 else 'غیرفعال'}")
    if not items:
        print('ابتدا بات را به گروه اضافه و ادمین کنید.')
    return items


def pick_group(api: Api) -> dict:
    items = groups(api)
    if not items:
        raise ValueError('گروهی برای انتخاب نیست.')
    index = int(input('شمارهٔ گروه در فهرست: ')) - 1
    if index < 0 or index >= len(items):
        raise ValueError('انتخاب نامعتبر')
    return items[index]


def confirmed(text: str) -> bool:
    print('\n' + text)
    return input('برای تأیید دقیقاً YES بنویسید: ').strip() == 'YES'


def send(api: Api, chat: int, text: str, pin: bool) -> None:
    if not confirmed(f'مقصد: {chat}\nمتن: {text}\nسنجاق: {pin}'):
        print('لغو شد.')
        return
    result = api.request('/api/messages', {'chatId': chat, 'text': text, 'pin': pin})
    print('✓ ارسال شد. شناسهٔ پیام:', result.get('messageId'))


def status(api: Api) -> None:
    data = api.request('/api/overview')
    print(json.dumps(data['stats'], ensure_ascii=False, indent=2))
    print('صف:', data['queue'])


def menu(api: Api) -> None:
    while True:
        print('''\n╭──────────────────────────────────╮
│     ✦ NOVA GUARD · اتاق فرمان    │
╰──────────────────────────────────╯
  1  وضعیت ربات        2  گروه‌ها
  3  ارسال پیام        4  ارسال + سنجاق
  5  قفل‌های گروه      6  پاک‌سازی با تأیید
  7  دادن الماس        8  زمان‌بندی پیام
  9  رویدادها         10  ثبت وبهوک
 11  اجرای سلف محلی   12  قطع اتصال این کنسول
  0  خروج''')
        choice = input('انتخاب: ').strip()
        try:
            if choice == '0':
                return
            if choice == '1':
                status(api)
            elif choice == '2':
                groups(api)
            elif choice in ('3', '4'):
                group = pick_group(api)
                send(api, group['id'], input('متن پیام: '), choice == '4')
            elif choice == '5':
                group = pick_group(api)
                locks = api.request('/api/catalog')['locks']
                current = set(group['settings']['locks'])
                for lock in locks:
                    print(('🔒' if lock[0] in current else '🔓'), lock[0], '·', lock[1])
                key = input('کلید انگلیسی قفل برای تغییر: ').strip()
                if key not in {item[0] for item in locks}:
                    raise ValueError('قفل نامعتبر')
                current.remove(key) if key in current else current.add(key)
                if confirmed(f'تغییر قفل {key} در {group["title"]}'):
                    api.request(f'/api/groups/{group["id"]}/settings', {'locks': sorted(current)})
                    print('✓ ذخیره شد.')
            elif choice == '6':
                group = pick_group(api)
                count = int(input('تعداد قدیمی‌ترین پیام‌های ثبت‌شده، ۱ تا ۵۰۰۰: '))
                draft = api.request('/api/purge/prepare', {'chatId': group['id'], 'count': count})
                if confirmed(f"⚠ حذف برگشت‌ناپذیر {draft['count']} پیام ثبت‌شدهٔ کمتر از ۴۸ ساعت در {group['title']}؟"):
                    result = api.request('/api/confirm', {'confirmationId': draft['confirmationId'], 'chatId': group['id']})
                    print(result['message'])
            elif choice == '7':
                user, amount = int(input('شناسهٔ کاربر: ')), int(input('تعداد الماس: '))
                if confirmed(f'افزودن {amount} الماس غیرنقدی به {user}؟'):
                    print(api.request('/api/economy', {'userId': user, 'currency': 'diamonds', 'action': 'add', 'amount': amount}))
            elif choice == '8':
                group = pick_group(api)
                minutes, text = int(input('چند دقیقه بعد؟ ')), input('متن: ')
                if confirmed(f'ارسال در {group["title"]} پس از {minutes} دقیقه:\n{text}'):
                    print(api.request('/api/jobs', {'chatId': group['id'], 'minutes': minutes, 'text': text}))
            elif choice == '9':
                for row in api.request('/api/logs')['logs'][:20]:
                    print(row['action'], '|', row['actor'], '|', row['detail'])
            elif choice == '10':
                if confirmed('وبهوک این بات روی همین ورکر ثبت شود؟ وبهوک قبلی جابه‌جا می‌شود.'):
                    print(api.request('/api/setup', {}))
            elif choice == '11':
                subprocess.run([sys.executable, str(Path(__file__).with_name('self_client.py'))], check=False)
            elif choice == '12':
                if confirmed('مجوز این کنسول ابطال شود؟ برای بازگشت کد اتصال جدید لازم است.'):
                    api.request('/api/logout', {})
                    (STATE / 'terminal.json').unlink(missing_ok=True)
                    return
            else:
                print('یکی از گزینه‌های فهرست را انتخاب کنید.')
        except (ValueError, KeyError, RuntimeError) as error:
            print('⚠', error)


def main() -> None:
    parser = argparse.ArgumentParser(description='NOVA Guard • کنسول مالک')
    parser.add_argument('command', choices=['menu', 'setup', 'status', 'groups', 'send'], nargs='?', default='menu')
    parser.add_argument('--chat', type=int)
    parser.add_argument('--text')
    parser.add_argument('--pin', action='store_true')
    args = parser.parse_args()
    api = setup() if args.command == 'setup' else connect()
    if args.command in ('setup', 'menu'):
        menu(api)
    elif args.command == 'groups':
        groups(api)
    elif args.command == 'status':
        status(api)
    elif args.command == 'send':
        if args.chat is None or not args.text:
            parser.error('send به --chat و --text نیاز دارد.')
        send(api, args.chat, args.text, args.pin)


if __name__ == '__main__':
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print('\nخروج امن؛ تا بعد ✦')
    except (ValueError, RuntimeError) as error:
        print('⚠', error, file=sys.stderr)
        sys.exit(1)
