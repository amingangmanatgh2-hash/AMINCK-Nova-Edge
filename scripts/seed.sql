-- ═══════════════════════════════════════════════════════════════
--  داده نمونه: محصولات و سرورها (قابل تغییر از پنل مدیریت)
--  اجرا: npx wrangler d1 execute nova-bot-db --remote --file scripts/seed.sql
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO settings (key, value) VALUES
 ('usd_rate_manual', '0'),
 ('margin', '1.30'),
 ('referral_percent', '10'),
 ('referral_goal', '5'),
 ('ad_interval_hours', '12'),
 ('league_prize_coins', '10000');

INSERT INTO products (title, category, protocol, days, traffic_gb, price_usd, sort) VALUES
 ('⚡ VLESS برنزی — ۱ ماهه', 'vless', 'vless', 30, 0, 0.9, 1),
 ('⚡ VLESS نقره‌ای — ۳ ماهه', 'vless', 'vless', 90, 0, 2.2, 2),
 ('⚡ VLESS طلایی — ۶ ماهه', 'vless', 'vless', 180, 0, 3.9, 3),
 ('⚡ VLESS الماس — ۱ ساله', 'vless', 'vless', 365, 0, 6.9, 4),
 ('🛰 V2ray VMess — ۱ ماهه', 'vmess', 'vmess', 30, 0, 0.9, 5),
 ('🐴 Trojan — ۱ ماهه', 'trojan', 'trojan', 30, 0, 1.1, 6),
 ('🧩 Shadowsocks — ۱ ماهه', 'ss', 'ss', 30, 0, 1.0, 7),
 ('🔐 OpenVPN — ۱ ماهه', 'openvpn', 'openvpn', 30, 0, 1.2, 8),
 ('📡 MTProto اختصاصی تلگرام — ۱ ماهه', 'mtproto', 'mtproto', 30, 0, 0.8, 9),
 ('🧦 SOCKS5 اختصاصی — ۱ ماهه', 'socks5', 'socks5', 30, 0, 0.8, 10);

INSERT INTO products (title, category, protocol, days, traffic_gb, price_usd, coin_price, sort) VALUES
 ('🪙 کانفیگ اقتصادی — ۱۰ روزه', 'coin', 'vless', 10, 5, 0, 3000, 100),
 ('🪙 کانفیگ اقتصادی — ۳۰ روزه', 'coin', 'vless', 30, 20, 0, 8000, 101);

INSERT INTO servers (name, country, protocol, ip, template, health_url, speed_rank) VALUES
 ('آلمان ۱', '🇩🇪 آلمان', 'vless', 'de1.example.com', 'vless://{uuid}@de1.example.com:443?type=ws&security=tls&path=%2Fvless#{name}', '', 1),
 ('هلند ۱', '🇳🇱 هلند', 'vless', 'nl1.example.com', 'vless://{uuid}@nl1.example.com:443?type=ws&security=tls&path=%2Fvless#{name}', '', 2),
 ('فنلاند ۱', '🇫🇮 فنلاند', 'vless', 'fi1.example.com', 'vless://{uuid}@fi1.example.com:443?type=ws&security=tls&path=%2Fvless#{name}', '', 3),
 ('انگلیس ۱', '🇬🇧 انگلیس', 'vmess', 'uk1.example.com', '', '', 4),
 ('آمریکا ۱', '🇺🇸 آمریکا', 'trojan', 'us1.example.com', 'trojan://{uuid}@us1.example.com:443?type=tcp&security=tls#{name}', '', 4),
 ('کانادا ۱', '🇨🇦 کانادا', 'ss', 'ca1.example.com', 'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTp7dXVpZH0@ca1.example.com:8388#{name}', '', 5),
 ('آلمان ۲ (بکاپ)', '🇩🇪 آلمان', 'vless', 'de2.example.com', 'vless://{uuid}@de2.example.com:443?type=ws&security=tls&path=%2Fvless#{name}', '', 2),
 ('هلند ۲ (بکاپ)', '🇳🇱 هلند', 'vmess', 'nl2.example.com', '', '', 3),
 ('فرانسه ۱ (بکاپ)', '🇫🇷 فرانسه', 'trojan', 'fr1.example.com', 'trojan://{uuid}@fr1.example.com:443?type=tcp&security=tls#{name}', '', 4),
 ('سوئد ۱ (بکاپ)', '🇸🇪 سوئد', 'vless', 'se1.example.com', 'vless://{uuid}@se1.example.com:443?type=ws&security=tls&path=%2Fvless#{name}', '', 5);
