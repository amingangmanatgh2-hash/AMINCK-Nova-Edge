# سلف جدا و کنسول مالک — بات جدا، اپ جدا، سلف جدا ولی یه ورکر

## معماری جدا
- بات جدا: روی ورکر Cloudflare
- اپ جدا: DemGram — دانلودر + کانفیگ ساز خفن — از بات دانلود میشه
- سلف جدا: self/self_client.py — از بات فعال میشه

فقط دو اتصال: اپ→بات، سلف→بات

## کنسول مالک
python self/console.py

## سلف جدا
pip install -r self/requirements.txt
python self/self_client.py --session my2

60+ دستور: .contacts .filter .add .addall confirm→YES 3s cap50 .addselect .stats .admins .invite .pin .unpin .font 7 styles .ai local .tr .chat on/off 5%

## اپ جدا
/demgram/ PWA + /demgram/DemGram.apk
دانلودر: یوتیوب/اینستا/تیک‌تاک/توییتر
کانفیگ ساز: VLESS/VMess/SS/Trojan/sub/proxy MTProto

هر ساعت سلف 5 الماس، مالک نامحدود
