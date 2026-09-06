import { build } from 'esbuild';
import { writeFile, readFile } from 'node:fs/promises';
const built = await build({ stdin: { contents: "export { COMMANDS } from './src/commands'; export { LOCKS, GAMES } from './src/config';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { COMMANDS, LOCKS, GAMES } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const roles = { member: 'همهٔ اعضا', admin: 'مدیر گروه', owner: 'مالک سراسری' };
const safe = s => String(s || '').replace(/\|/g, ' / ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let doc = `# فهرست واقعی قابلیت‌های نُوا گارد\n\nاین فایل با \`npm run catalog\` از رجیستری واقعی کد تولید می‌شود.\n\n- **${COMMANDS.length} دستور مستقل**؛ نام فارسی، انگلیسی و aliasها یک قابلیت حساب می‌شوند.\n- **${COMMANDS.filter(c => c.role === 'owner').length} دستور مخصوص مالک** (زیرمجموعهٔ همان دستورها).\n- **${LOCKS.length} فیلتر محتوا** و **${GAMES.length} بازی بومی تلگرام**.\n- این نسخه ادعای ۴۰۰ یا ۱۰۰۰ قابلیت مستقل ندارد. تعداد بالا به‌تنهایی معیار کیفیت نیست.\n\nهر دستور انگلیسی یا فارسی، با یا بدون / کار می‌کند؛ مگر مدیر گروه \`commandmode slash\` را فعال کند.\n\n`;
for (const role of ['member','admin','owner']) {
  doc += `## ${roles[role]}\n\n| فرمان انگلیسی | فرمان فارسی | کارکرد | نمونه |\n|---|---|---|---|\n`;
  for (const c of COMMANDS.filter(c => c.role === role)) doc += `| \`/${c.name}\` | ${safe(c.fa)} | ${safe(c.description)} | \`${safe(c.usage || c.name)}\` |\n`;
  doc += '\n';
}
doc += '## قفل‌های محتوا\n\n| کلید | نام | رفتار |\n|---|---|---|\n';
for (const [key,name,desc] of LOCKS) doc += `| \`${key}\` | ${name} | ${desc} |\n`;
doc += '\n## بازی‌ها\n\n' + GAMES.map(g => `- ${g.emoji} ${g.name}: مقدار بومی تلگرام ۱ تا ${g.max}`).join('\n');
doc += '\n\nاسلات با «مقدار خام بزرگ‌تر» قضاوت نمی‌شود: ۷۷۷ = ۱۰۰، سه نماد یکسان = ۳۰، یک جفت = ۱۰، بقیه = صفر.\n\n## امکانات سلف محلی\n\n۱۷ فرمان واقعی: `.help`، `.ping`، `.id`، `.time`، `.calc`، `.afk`، `.back`، `.autoreply`، `.save`، `.note`، `.clean`، `.bold`، `.italic`، `.code`، `.reverse`، `.remind`، `.status`.\n\nاین دستورها فقط از پیام‌های خروجی صاحب حساب اجرا می‌شوند. پاسخ خصوصی opt-in و برای هر فرد به یک پاسخ در ۳۰ دقیقه محدود است. این بخش ادعای کپی کامل سلف‌سازهای دیگر ندارد.\n';
if (process.argv.includes('--check')) {
  const existing = await readFile('docs/FEATURES.fa.md','utf8');
  if (existing !== doc) throw new Error('Feature catalog is out of date. Run npm run catalog.');
} else await writeFile('docs/FEATURES.fa.md',doc);
console.log(`${COMMANDS.length} commands · ${COMMANDS.filter(c=>c.role==='owner').length} owner-only · ${LOCKS.length} locks · ${GAMES.length} games`);
