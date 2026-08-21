/**
 * AMINNOVA browser panel (vanilla JavaScript, Persian RTL, no external CDN).
 *
 * The UI and JSON API share the same HttpOnly session and backend permission
 * checks. This module is the single source of truth for the generated static
 * assets. The embedded JS avoids template literals so it can safely live in
 * this TypeScript string and be checked independently with `node --check`.
 */

export const UI_APP_CSS = `/*NOVA-CSS-START*/
:root {
  --bg: #0b1020;
  --bg2: #121a2e;
  --bg3: #1a243c;
  --fg: #e8eefc;
  --fg2: #93a0bd;
  --line: #2a3550;
  --brand: #0ea5e9;
  --brand2: #38bdf8;
  --ok: #22c55e;
  --warn: #f59e0b;
  --err: #ef4444;
  --card: #121a2e;
  --shadow: 0 12px 40px rgba(0,0,0,.45);
}
html[data-theme="light"] {
  --bg: #f3f6fb;
  --bg2: #ffffff;
  --bg3: #e8eef8;
  --fg: #0f172a;
  --fg2: #5b6b86;
  --line: #d5deee;
  --card: #ffffff;
  --shadow: 0 8px 28px rgba(15,30,60,.10);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Vazirmatn", "Segoe UI", Tahoma, sans-serif;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(14,165,233,.18), transparent 55%),
    radial-gradient(900px 500px at 100% 0%, rgba(56,189,248,.12), transparent 50%),
    var(--bg);
  color: var(--fg);
  font-size: 14px;
  line-height: 1.75;
  min-height: 100vh;
}
a { color: var(--brand2); text-decoration: none; }
a:hover { text-decoration: underline; }
button { font-family: inherit; cursor: pointer; }
code, .mono {
  direction: ltr;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
}
.wrap {
  max-width: 920px;
  margin: 0 auto;
  padding: 48px 20px 64px;
}
.hero {
  display: flex;
  gap: 18px;
  align-items: center;
  margin-bottom: 28px;
}
.mark {
  width: 64px; height: 64px; border-radius: 18px; flex: 0 0 64px;
  background: linear-gradient(135deg, var(--brand), #6366f1);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 900; font-size: 22px;
  box-shadow: var(--shadow);
}
h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: -.02em; }
.sub { color: var(--fg2); font-size: 13px; }
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 20px 22px;
  box-shadow: var(--shadow);
  margin-bottom: 16px;
}
.card h2 { margin: 0 0 10px; font-size: 16px; }
.muted { color: var(--fg2); font-size: 13px; }
.grid { display: grid; gap: 12px; grid-template-columns: repeat(2, 1fr); }
.pill {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px 14px;
  background: var(--bg3);
}
.pill b { display: block; margin-bottom: 2px; }
.pill span { color: var(--fg2); font-size: 12px; }
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--line);
  background: var(--bg3);
  color: var(--fg);
  border-radius: 12px;
  padding: 9px 14px;
  font-size: 13px;
  transition: all .15s;
}
.btn:hover { border-color: var(--brand2); color: var(--brand2); }
.btn.primary {
  background: linear-gradient(135deg, var(--brand), #6366f1);
  border: none; color: #fff;
}
.btn.primary:hover { filter: brightness(1.08); color: #fff; }
.uri {
  direction: ltr; text-align: left;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  overflow-x: auto;
  font-family: Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 10px 0 0;
}
.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--brand2);
  color: var(--brand2);
  margin-left: 6px;
}
.sub-result {
  border: 1px solid var(--line);
  background: var(--bg3);
  border-radius: 14px;
  padding: 14px;
  margin-top: 12px;
}
.alert {
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 13px;
  border: 1px solid var(--brand2);
  color: var(--brand2);
  margin: 0 0 16px;
}
.topbar {
  display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;
}
.tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 16px; }
.tab {
  border: 1px solid var(--line); background: var(--bg3); color: var(--fg);
  border-radius: 999px; padding: 7px 12px; font-size: 12px;
}
.tab.on { background: linear-gradient(135deg, var(--brand), #6366f1); color: #fff; border: none; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
input, select, textarea {
  font-family: inherit; font-size: 13px; color: var(--fg);
  background: var(--bg); border: 1px solid var(--line); border-radius: 10px;
  padding: 8px 10px;
}
label { font-size: 12px; color: var(--fg2); display: block; margin-bottom: 4px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: right; padding: 8px 6px; border-bottom: 1px solid var(--line); }
.login-box { max-width: 380px; margin: 24px auto; }
ul.api { margin: 8px 0 0; padding-right: 18px; color: var(--fg2); font-size: 13px; }
ul.api li { margin: 4px 0; }
ul.api code { color: var(--fg); }
@media (max-width: 700px) {
  .grid { grid-template-columns: 1fr; }
  .hero { flex-direction: column; align-items: flex-start; }
  h1 { font-size: 22px; }
  .wrap { padding: 24px 14px 40px; }
  .card { padding: 16px 14px; border-radius: 14px; }
  .btn { padding: 12px 16px; font-size: 14px; min-height: 44px; }
  .pill { padding: 14px 12px; }
  .topbar { margin-bottom: 14px; }
}
/* Mobile panel enhancements for AMINCK Nova Edge */
@media (max-width: 480px) {
  body { font-size: 15px; }
  .hero .mark { width: 48px; height: 48px; font-size: 16px; border-radius: 14px; }
  h1 { font-size: 20px; line-height: 1.25; }
  .sub { font-size: 12px; }
  .card h2 { font-size: 15px; }
  .uri { font-size: 11px; padding: 10px; border-radius: 8px; }
  .badge { font-size: 10px; padding: 2px 8px; }
  .btn { border-radius: 10px; }
}
/* Liquid Glass Pro layer */
:root {
  --bg: #060815;
  --bg2: rgba(13, 18, 40, .72);
  --bg3: rgba(32, 39, 72, .54);
  --card: rgba(15, 21, 48, .62);
  --line: rgba(255,255,255,.13);
  --brand: #7c3aed;
  --brand2: #22d3ee;
  --pink: #ec4899;
  --glass: blur(22px) saturate(145%);
  --shadow: 0 20px 70px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.08);
}
html[data-theme="light"] {
  --bg: #eaf0ff;
  --bg2: rgba(255,255,255,.72);
  --bg3: rgba(255,255,255,.56);
  --card: rgba(255,255,255,.64);
  --line: rgba(58,75,118,.17);
  --shadow: 0 24px 60px rgba(42,58,110,.16), inset 0 1px 0 rgba(255,255,255,.8);
}
html { scroll-behavior: smooth; }
body { overflow-x: hidden; background-color: var(--bg); }
body::before, body::after {
  content: ""; position: fixed; border-radius: 999px; filter: blur(8px); opacity: .34;
  pointer-events: none; z-index: -1; animation: liquidFloat 14s ease-in-out infinite alternate;
}
body::before { width: 38vw; height: 38vw; min-width: 320px; min-height: 320px; top: -14vw; right: -9vw; background: radial-gradient(circle, #7c3aed, transparent 66%); }
body::after { width: 34vw; height: 34vw; min-width: 280px; min-height: 280px; bottom: -16vw; left: -8vw; background: radial-gradient(circle, #06b6d4, transparent 67%); animation-delay: -5s; }
.wrap { max-width: 1220px; position: relative; padding-top: 32px; }
.card, .pill, .sub-result, .top-glass, .mobile-nav {
  backdrop-filter: var(--glass); -webkit-backdrop-filter: var(--glass);
}
.card { position: relative; overflow: hidden; background: linear-gradient(145deg, rgba(255,255,255,.075), transparent 45%), var(--card); }
.card::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: linear-gradient(115deg, rgba(255,255,255,.1), transparent 25%, transparent 74%, rgba(34,211,238,.05)); }
.card > * { position: relative; }
.card:hover { transform: translateY(-2px); border-color: rgba(34,211,238,.34); }
.card, .pill, .btn, input, select, textarea { transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease, background .22s ease; }
.pill { min-height: 100px; display: flex; flex-direction: column; justify-content: center; border-color: rgba(255,255,255,.14); background: linear-gradient(145deg, rgba(124,58,237,.16), rgba(34,211,238,.06)), var(--bg3); }
.pill b { font-size: 25px; line-height: 1.2; background: linear-gradient(90deg, var(--brand2), #a78bfa, #f472b6); -webkit-background-clip: text; background-clip: text; color: transparent; }
.btn { position: relative; overflow: hidden; font-weight: 650; }
.btn::after { content: ""; position: absolute; inset: 0; transform: translateX(-110%); background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent); transition: transform .5s; }
.btn:hover::after { transform: translateX(110%); }
.btn:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(34,211,238,.12); text-decoration: none; }
.btn.primary { background: linear-gradient(125deg, #06b6d4, #7c3aed 52%, #db2777); box-shadow: 0 12px 32px rgba(124,58,237,.28); }
.btn.danger { color: #fecaca; border-color: rgba(239,68,68,.38); }
.btn.big { min-height: 50px; padding: 12px 20px; font-size: 14px; }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--brand2); box-shadow: 0 0 0 4px rgba(34,211,238,.11); }
input, select, textarea { background: rgba(4,8,24,.52); }
html[data-theme="light"] input, html[data-theme="light"] select, html[data-theme="light"] textarea { background: rgba(255,255,255,.68); }
.hero { padding: 16px 4px; }
.mark { position: relative; overflow: hidden; background: linear-gradient(145deg, #22d3ee, #7c3aed 54%, #ec4899); box-shadow: 0 18px 45px rgba(124,58,237,.34); animation: logoPulse 5s ease-in-out infinite; }
.mark svg { width: 38px; height: 38px; }
.topbar { position: sticky; top: 10px; z-index: 30; padding: 9px; border: 1px solid var(--line); border-radius: 16px; background: var(--bg2); backdrop-filter: var(--glass); -webkit-backdrop-filter: var(--glass); box-shadow: var(--shadow); }
.tabs { padding: 7px; border: 1px solid var(--line); border-radius: 18px; background: var(--bg2); backdrop-filter: var(--glass); -webkit-backdrop-filter: var(--glass); position: sticky; top: 80px; z-index: 25; }
.tab { display: inline-flex; gap: 7px; align-items: center; }
.tab svg, .btn svg, .status-dot svg, .alert svg, .section-title > svg { width: 17px; height: 17px; flex: 0 0 17px; }
.section-title > svg { width: 28px; height: 28px; color: var(--brand2); }
.tab.on { box-shadow: 0 9px 24px rgba(124,58,237,.24); }
.section-title { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 15px; }
.section-title h2 { font-size: 19px; }
.eyebrow { color: var(--brand2); text-transform: uppercase; letter-spacing: .12em; font-size: 10px; font-weight: 800; }
.hero-panel { padding: 24px; background: linear-gradient(125deg, rgba(34,211,238,.09), rgba(124,58,237,.14), rgba(236,72,153,.08)), var(--card); }
.status-dot { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--line); color: var(--fg2); font-size: 11px; }
.status-dot::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 13px var(--ok); }
.status-dot.offline::before { background: var(--err); box-shadow: 0 0 13px var(--err); }
.endpoint-pick { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 9px; margin: 10px 0; }
.check { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 11px; background: rgba(255,255,255,.035); }
.check input { accent-color: #7c3aed; }
.progress-line { height: 4px; border-radius: 99px; overflow: hidden; background: rgba(255,255,255,.08); }
.progress-line span { display: block; height: 100%; background: linear-gradient(90deg, #22d3ee, #7c3aed, #ec4899); animation: progressGlow 2s linear infinite; }
.feature-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
.feature-tile { border: 1px solid var(--line); border-radius: 16px; padding: 15px; background: var(--bg3); min-height: 126px; }
.feature-tile svg { width: 24px; height: 24px; color: var(--brand2); }
.mobile-nav, .mobile-sheet { display: none; }
.skeleton { min-height: 18px; border-radius: 8px; background: linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.14), rgba(255,255,255,.05)); background-size: 220% 100%; animation: shimmer 1.4s infinite; }
.install-banner { border-color: rgba(167,139,250,.35); background: linear-gradient(120deg, rgba(124,58,237,.2), rgba(34,211,238,.09)), var(--card); }
.guide-step { display: grid; grid-template-columns: 38px 1fr; gap: 12px; align-items: start; margin: 14px 0; }
.guide-step strong:first-child { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 11px; background: linear-gradient(135deg,#06b6d4,#7c3aed); color: white; }
.cap-toolbar { display: grid; grid-template-columns: 1fr 220px; gap: 10px; margin-bottom: 14px; }
.cap-list { display: grid; gap: 9px; }
.cap-item { border: 1px solid var(--line); border-radius: 13px; padding: 11px 13px; background: rgba(255,255,255,.035); }
.mode-deck { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin: 14px 0; }
.mode-card { position: relative; display: block; min-height: 118px; padding: 16px; border: 1px solid var(--line); border-radius: 18px; background: linear-gradient(145deg, rgba(34,211,238,.07), rgba(124,58,237,.12)), var(--bg3); cursor: pointer; overflow: hidden; }
.mode-card input { position: absolute; opacity: 0; pointer-events: none; }
.mode-card:has(input:checked) { border-color: var(--brand2); box-shadow: 0 0 0 3px rgba(34,211,238,.09), 0 18px 38px rgba(6,182,212,.12); }
.mode-card b { display: flex; align-items: center; gap: 8px; font-size: 17px; margin-bottom: 5px; }
.mode-card svg { width: 23px; height: 23px; color: var(--brand2); }
.game-picker { display: none; margin-top: 12px; padding: 13px; border: 1px solid var(--line); border-radius: 17px; background: rgba(3,7,22,.3); }
.game-picker.open { display: block; animation: rise .25s both; }
.game-toolbar { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 8px; }
.game-list { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 7px; max-height: 350px; overflow: auto; overscroll-behavior: contain; padding: 5px 2px 5px 5px; margin-top: 10px; }
.game-item { display: flex; align-items: center; gap: 7px; min-height: 44px; padding: 8px; border: 1px solid var(--line); border-radius: 12px; color: var(--fg2); background: rgba(255,255,255,.03); font-size: 11px; cursor: pointer; }
.game-item:has(input:checked) { color: var(--fg); border-color: rgba(34,211,238,.55); background: rgba(34,211,238,.09); }
.game-item input { width: 17px; min-height: 17px; accent-color: #22d3ee; }
.performance-strip { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 9px; margin: 12px 0; }
.performance-strip > div { padding: 11px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,.035); }
.performance-strip b { display: block; color: var(--brand2); font-size: 17px; }
.app-stage { background: radial-gradient(circle at 15% 10%, rgba(34,211,238,.14), transparent 35%), radial-gradient(circle at 90% 90%, rgba(236,72,153,.12), transparent 32%), var(--card); }
.warning-honest { border-color: rgba(245,158,11,.52); color: var(--warn); }
@keyframes liquidFloat { from { transform: translate3d(0,0,0) scale(.94); } to { transform: translate3d(5vw,4vh,0) scale(1.08); } }
@keyframes logoPulse { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-4px) rotate(2deg); } }
@keyframes progressGlow { to { filter: hue-rotate(360deg); } }
@keyframes shimmer { to { background-position: -220% 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(13px); } to { opacity: 1; transform: none; } }
#app .card, #app .pill { animation: rise .42s both; }
#app .card:nth-child(2) { animation-delay: .04s; }
#app .card:nth-child(3) { animation-delay: .08s; }
@media (max-width: 820px) {
  .feature-grid { grid-template-columns: 1fr 1fr; }
  .tabs { display: none; }
  .mobile-nav { display: flex; overflow-x: auto; scrollbar-width: none; position: fixed; right: 10px; left: 10px; bottom: max(10px, env(safe-area-inset-bottom)); z-index: 45; padding: 7px; border: 1px solid var(--line); border-radius: 20px; background: var(--bg2); box-shadow: var(--shadow); }
  .mobile-nav::-webkit-scrollbar { display: none; }
  .mobile-nav button { border: 0; color: var(--fg2); background: transparent; display: grid; justify-items: center; gap: 2px; font: inherit; font-size: 9px; padding: 5px 8px; min-width: 66px; flex: 1 0 66px; }
  .mobile-nav button.on { color: var(--brand2); }
  .mobile-nav svg { width: 20px; height: 20px; }
  .mobile-sheet { position: fixed; right: 12px; left: 12px; bottom: calc(92px + env(safe-area-inset-bottom)); z-index: 44; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: 20px; background: var(--bg2); backdrop-filter: var(--glass); -webkit-backdrop-filter: var(--glass); box-shadow: var(--shadow); opacity: 0; visibility: hidden; transform: translateY(12px) scale(.98); transition: .2s ease; }
  .mobile-sheet.open { opacity: 1; visibility: visible; transform: none; }
  .mobile-sheet button { min-height: 48px; border: 1px solid var(--line); border-radius: 14px; color: var(--fg); background: var(--bg3); font: inherit; display: flex; align-items: center; justify-content: center; gap: 7px; }
  .mobile-sheet button.on { border-color: var(--brand2); color: var(--brand2); }
  .mobile-sheet svg { width: 19px; height: 19px; }
  .wrap { padding-bottom: 105px; }
  .topbar { top: 5px; }
}
@media (max-width: 560px) {
  body { font-size: 14px; line-height: 1.68; }
  .wrap { width: 100%; padding: 12px 10px calc(96px + env(safe-area-inset-bottom)); }
  .feature-grid, .cap-toolbar, .grid { grid-template-columns: minmax(0, 1fr); }
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .endpoint-pick { grid-template-columns: minmax(0, 1fr); }
  .hero-panel { padding: 16px 14px; }
  .hero { gap: 11px; margin-bottom: 14px; align-items: center; flex-direction: row; }
  .hero .mark { width: 52px; height: 52px; flex-basis: 52px; border-radius: 16px; }
  .hero .mark svg { width: 29px; height: 29px; }
  .eyebrow { font-size: 8px; letter-spacing: .08em; }
  h1 { font-size: 20px; }
  .sub { max-width: 72vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card { padding: 15px 13px; border-radius: 17px; margin-bottom: 11px; }
  .card:hover { transform: none; }
  .section-title { margin-bottom: 10px; }
  .section-title h2, .card h2 { font-size: 16px; line-height: 1.45; }
  .pill { min-height: 82px; padding: 12px; border-radius: 15px; }
  .pill b { font-size: 20px; }
  .pill span { font-size: 11px; }
  input, select, textarea { width: 100%; min-width: 0; min-height: 47px; padding: 11px 12px; font-size: 16px; border-radius: 13px; }
  textarea { min-height: 84px; }
  label { margin-top: 8px; font-size: 12px; }
  .row { width: 100%; gap: 7px; align-items: stretch; }
  .row > input, .row > select, .row > textarea { flex: 1 1 100%; }
  .row > .btn, .row > a.btn { flex: 1 1 auto; justify-content: center; }
  .btn { min-height: 45px; padding: 10px 12px; border-radius: 13px; justify-content: center; }
  .btn.big { width: 100%; min-height: 52px; }
  .check { min-height: 48px; padding: 10px 11px; line-height: 1.45; }
  .check input { width: 20px; min-height: 20px; flex: 0 0 20px; }
  .topbar { position: sticky; top: max(5px, env(safe-area-inset-top)); display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 6px; padding: 7px; border-radius: 17px; margin-bottom: 12px; }
  .topbar .btn { min-height: 39px; padding: 8px 9px; font-size: 0; }
  .topbar .btn svg { width: 19px; height: 19px; margin: 0; }
  .topbar #hot-btn { grid-column: 1 / -1; font-size: 12px; min-height: 42px; }
  .topbar .badge { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
  .topbar .badge.mono { display: none; }
  .status-dot { white-space: nowrap; padding: 5px 7px; font-size: 10px; }
  .domain-menu-card .mono { max-width: 56vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .domain-menu-card .row { align-items: center; }
  .domain-menu-card #cf-menu-btn { flex-basis: 100%; }
  .sub-result { padding: 12px 10px; border-radius: 15px; }
  .uri { max-height: 150px; padding: 10px; font-size: 10px; line-height: 1.55; }
  .alert { padding: 11px; font-size: 12px; }
  table { display: block; width: 100%; overflow-x: auto; white-space: nowrap; scrollbar-width: thin; }
  th, td { padding: 10px 8px; }
  #toasts { right: 10px !important; left: 10px !important; top: calc(10px + env(safe-area-inset-top)) !important; }
  #toasts > div { max-width: none !important; }
  .mobile-nav { right: 8px; left: 8px; bottom: max(7px, env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); overflow: visible; padding: 7px 5px; border-radius: 22px; }
  .mobile-nav button { min-width: 0; width: 100%; padding: 4px 2px; font-size: 9px; border-radius: 14px; }
  .mobile-nav button.on { color: #fff; background: linear-gradient(145deg, rgba(34,211,238,.22), rgba(124,58,237,.62)); }
  .mobile-nav svg { width: 21px; height: 21px; }
  .mobile-sheet { position: fixed; right: 10px; left: 10px; bottom: calc(85px + env(safe-area-inset-bottom)); z-index: 44; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: 20px; background: var(--bg2); backdrop-filter: var(--glass); -webkit-backdrop-filter: var(--glass); box-shadow: var(--shadow); opacity: 0; visibility: hidden; transform: translateY(12px) scale(.98); transition: .2s ease; }
  .mobile-sheet.open { opacity: 1; visibility: visible; transform: none; }
  .mobile-sheet button { min-height: 48px; border: 1px solid var(--line); border-radius: 14px; color: var(--fg); background: var(--bg3); font: inherit; display: flex; align-items: center; justify-content: center; gap: 7px; }
  .mobile-sheet button.on { border-color: var(--brand2); color: var(--brand2); }
  .mobile-sheet svg { width: 19px; height: 19px; }
  .mode-deck { grid-template-columns: 1fr; gap: 8px; }
  .mode-card { min-height: 94px; padding: 13px; }
  .game-toolbar { grid-template-columns: 1fr 1fr; }
  .game-toolbar input { grid-column: 1 / -1; }
  .game-list { grid-template-columns: 1fr; max-height: 310px; }
  .performance-strip { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
}
/*NOVA-CSS-END*/
`;

export const UI_MANIFEST_JSON = JSON.stringify({
  id: '/',
  name: 'AMINNOVA Liquid Glass',
  short_name: 'AMINNOVA',
  description: 'پنل نصب‌پذیر مدیریت Subscription و پروفایل‌های AMINCK',
  lang: 'fa',
  dir: 'rtl',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
  orientation: 'any',
  background_color: '#060815',
  theme_color: '#7c3aed',
  categories: ['utilities', 'productivity'],
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
  ],
  shortcuts: [
    { name: 'ساخت ساب', short_name: 'ساخت', url: '/?tab=dash', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }] },
    { name: 'مدیریت کاربران', short_name: 'کاربران', url: '/?tab=sell', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }] },
  ],
});

export const UI_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22d3ee"/><stop offset=".48" stop-color="#7c3aed"/><stop offset="1" stop-color="#ec4899"/></linearGradient><filter id="s"><feGaussianBlur stdDeviation="14"/></filter></defs>
<rect width="512" height="512" rx="116" fill="#080b19"/><circle cx="118" cy="100" r="75" fill="#22d3ee" opacity=".24" filter="url(#s)"/><circle cx="405" cy="412" r="105" fill="#ec4899" opacity=".2" filter="url(#s)"/>
<path d="M103 356V156c0-29 24-53 53-53h200c29 0 53 24 53 53v200c0 29-24 53-53 53H156c-29 0-53-24-53-53Z" fill="url(#g)"/>
<path d="M169 341V171h37l100 104V171h38v170h-34L207 234v107h-38Z" fill="white"/><path d="M131 131h250v250H131z" fill="none" stroke="white" stroke-opacity=".28" stroke-width="5" rx="35"/>
</svg>`;

export const UI_SW_JS = `/* AMINNOVA privacy-safe PWA service worker */
'use strict';
var CACHE = 'aminnova-shell-v7-giant-gaming';
var SHELL = ['/', '/app.css', '/app.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];
var PRIVATE_PREFIXES = ['/api/', '/sub/', '/ws', '/healthz', '/connect', '/e'];
function isPrivatePath(path) { return PRIVATE_PREFIXES.some(function (prefix) { return path.indexOf(prefix) === 0; }); }
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key !== CACHE; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || isPrivatePath(url.pathname)) return;
  if (req.mode === 'navigate') {
    if (url.pathname !== '/') return;
    event.respondWith(fetch(req).then(function (res) {
      if (!res.ok) return res;
      var copy = res.clone();
      return caches.open(CACHE).then(function (cache) { return cache.put('/', copy); }).then(function () { return res; });
    }).catch(function () { return caches.match('/'); }));
    return;
  }
  if (url.search || SHELL.indexOf(url.pathname) < 0) return;
  event.respondWith(caches.match(req).then(function (cached) {
    var network = fetch(req).then(function (res) {
      if (!res.ok) return res;
      return caches.open(CACHE).then(function (cache) { return cache.put(req, res.clone()); }).then(function () { return res; });
    });
    if (cached) { event.waitUntil(network.catch(function () {})); return cached; }
    return network;
  }));
});
`;

export const UI_SHELL_HTML = `<!--NOVA-SHELL-START-->
<!doctype html>
<html lang="fa" dir="rtl" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{TITLE}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="AMINNOVA — پنل نصب‌پذیر مدیریت ساب VLESS روی Cloudflare Workers">
<meta name="theme-color" content="#7c3aed">
<meta name="color-scheme" content="dark light">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="AMINNOVA">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="stylesheet" href="/app.css">
</head>
<body>
<div id="app"></div>
<script src="/app.js" defer></script>
</body>
</html>
<!--NOVA-SHELL-END-->
`;

export function uiShell(title: string): string {
  return UI_SHELL_HTML.replace('{TITLE}', escAttr(title));
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export const UI_APP_JS = `/*NOVA-UI-START*/
(function () {
  'use strict';

  var APP = 'AMINNOVA';
  var EDITION = 'AMINNOVA — پنل فروش ساب AMINCK';
  var TAB = 'dash';
  var INSTALL_EVENT = null;
  var MONITOR_TIMER = null;
  var STATE = { me: null, users: [], stats: null, endpoints: [], probe: {}, settings: null, iron: null, clean: [], games: [], ironUser: '', launch: null, caps: [] };
  var ICON_PATHS = {
    dash: '<path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    iron: '<path d="m12 2 8 4v6c0 5-3.4 9.2-8 10-4.6-.8-8-5-8-10V6l8-4Zm-3 10 2 2 4-5"/>',
    scan: '<path d="M4 17V7m4 10v-6m4 6V4m4 13v-9m4 9v-3M3 21h18"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a8 8 0 0 0-1.7-1L14.7 3h-4l-.4 3a8 8 0 0 0-1.7 1L6.1 6 4 9.4 6.1 11a7 7 0 0 0 0 2L4 14.6 6 18l2.5-1a8 8 0 0 0 1.7 1l.4 3h4l.4-3a8 8 0 0 0 1.7-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z"/>',
    app: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4M9 6h6"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.7 2.7 0 1 1 4.4 2.1c-1.2.8-1.9 1.3-1.9 2.9M12 18h.01"/>',
    install: '<path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14"/>',
    spark: '<path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Zm7 11 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14ZM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4"/>',
    shield: '<path d="m12 2 8 4v6c0 5-3.4 9.2-8 10-4.6-.8-8-5-8-10V6l8-4Z"/><path d="m9 12 2 2 4-5"/>',
    infinity: '<path d="M8.5 8.5c-5-4-8 5-3 7 3 1 5-2 6.5-4 1.5-2 3.5-5 6.5-4 5 2 2 11-3 7l-7-6Z"/>',
    cloud: '<path d="M17.5 19H6a4 4 0 0 1-.6-8A7 7 0 0 1 19 9.5 4.8 4.8 0 0 1 17.5 19Z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Zm0 0A2.5 2.5 0 0 0 6.5 22H20"/>',
    logout: '<path d="M10 17l5-5-5-5m5 5H3m10-9h7v18h-7"/>',
    theme: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || ICON_PATHS.spark) + '</svg>';
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg, ok) {
    var box = $('#toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.style.cssText = 'position:fixed;top:16px;left:16px;z-index:50;display:flex;flex-direction:column;gap:8px';
      document.body.appendChild(box);
    }
    var t = document.createElement('div');
    t.style.cssText = 'background:var(--bg2);border:1px solid ' + (ok ? 'var(--ok)' : 'var(--err)') + ';border-radius:12px;padding:10px 14px;font-size:13px;box-shadow:var(--shadow);max-width:320px';
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3800);
  }
  function copyText(text, label) {
    function done() { toast((label || 'متن') + ' کپی شد', true); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  function downloadJson(data, name) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function installApp() {
    if (isStandalone()) { toast('AMINNOVA همین حالا به‌صورت اپ اجرا شده', true); return; }
    if (!INSTALL_EVENT) { toast('از منوی مرورگر گزینه Add to Home Screen / نصب برنامه را بزنید'); return; }
    INSTALL_EVENT.prompt();
    INSTALL_EVENT.userChoice.then(function (choice) {
      if (choice.outcome === 'accepted') toast('اپ AMINNOVA نصب شد', true);
      INSTALL_EVENT = null;
    });
  }
  function registerPwa() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function (reg) {
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.addEventListener('updatefound', function () {
        var worker = reg.installing;
        if (worker) worker.addEventListener('statechange', function () {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) toast('نسخه جدید اپ آماده شد', true);
        });
      });
    }).catch(function () {});
  }
  function shareValue(title, text, url) {
    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url }).catch(function () {});
    } else copyText(url || text, title);
  }
  function api(method, path, body) {
    var opts = { method: method || 'GET', headers: { 'content-type': 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.message || data.error || ('HTTP ' + res.status));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }
  function can(me, p) { return me && me.permissions && me.permissions.indexOf(p) >= 0; }
  function subLink(token, fmt) { return location.origin + '/sub/' + token + (fmt ? '/' + fmt : ''); }
  function testWsRoute(user) {
    return new Promise(function (resolve) {
      if (!user || !user.routes || !user.routes[0]) { resolve({ ok: false, error: 'مسیر ساخته نشد' }); return; }
      var uuidHex = String(user.uuid || '').replace(/-/g, '');
      if (!/^[0-9a-f]{32}$/i.test(uuidHex)) { resolve({ ok: false, error: 'UUID نامعتبر است' }); return; }
      var started = Date.now();
      var scheme = location.protocol === 'https:' ? 'wss://' : 'ws://';
      var socket;
      var settled = false;
      function finish(result) { if (settled) return; settled = true; clearTimeout(timer); resolve(result); }
      function packet() {
        var domain = new TextEncoder().encode('connectivitycheck.gstatic.com');
        var request = new TextEncoder().encode('GET /generate_204 HTTP/1.1\\r\\nHost: connectivitycheck.gstatic.com\\r\\nConnection: close\\r\\n\\r\\n');
        var header = new Uint8Array(23 + domain.length);
        var off = 0; header[off++] = 0;
        for (var i = 0; i < 16; i++) header[off++] = parseInt(uuidHex.slice(i * 2, i * 2 + 2), 16);
        header[off++] = 0; header[off++] = 1; header[off++] = 0; header[off++] = 80;
        header[off++] = 2; header[off++] = domain.length; header.set(domain, off);
        var frame = new Uint8Array(header.length + request.length); frame.set(header); frame.set(request, header.length);
        return frame;
      }
      function inspect(buffer) {
        var bytes = new Uint8Array(buffer);
        if (bytes.length >= 2 && bytes[0] === 0) finish({ ok: true, latencyMs: Date.now() - started, bytes: bytes.length });
        else finish({ ok: false, error: 'پاسخ VLESS معتبر دریافت نشد' });
        try { socket.close(); } catch (e) {}
      }
      var timer = setTimeout(function () {
        try { if (socket) socket.close(); } catch (e) {}
        finish({ ok: false, error: 'Timeout تست کامل تونل؛ فقط Handshake کافی نیست' });
      }, 20000);
      try {
        socket = new WebSocket(scheme + location.host + user.routes[0].path);
        socket.binaryType = 'arraybuffer';
        socket.onopen = function () { socket.send(packet()); };
        socket.onmessage = function (event) {
          if (event.data instanceof ArrayBuffer) inspect(event.data);
          else if (event.data && event.data.arrayBuffer) event.data.arrayBuffer().then(inspect).catch(function () { finish({ ok: false, error: 'پاسخ باینری خوانده نشد' }); });
        };
        socket.onclose = function (event) {
          if (settled) return;
          if (event.code === 1000 && event.reason === 'upstream-closed') {
            finish({ ok: false, tcpOpened: true, latencyMs: Date.now() - started, error: 'TCP باز شد اما مقصد تست بدون ارسال داده بسته شد' });
            return;
          }
          finish({ ok: false, error: 'تونل بسته شد: ' + event.code + (event.reason ? ' / ' + event.reason : '') });
        };
        socket.onerror = function () { finish({ ok: false, error: 'WebSocket روی این دامنه/ISP باز نشد' }); };
      } catch (e) { finish({ ok: false, error: String(e.message || e) }); }
    });
  }
  function numOrZero(id) {
    var el = $('#' + id);
    if (!el) return 0;
    var n = Number(el.value);
    return isFinite(n) && n > 0 ? n : 0;
  }
  function limRow(label, id) {
    return '<label>' + label + ' (۰ = نامحدود)</label><div class="row"><input id="' + id + '" value="0"><button class="btn" type="button" data-inf="' + id + '">∞ نامحدود</button></div>';
  }
  function bindInf() {
    document.querySelectorAll('[data-inf]').forEach(function (el) {
      el.onclick = function () {
        var t = $('#' + el.getAttribute('data-inf'));
        if (t) t.value = '0';
      };
    });
  }
  function ironOptions(sel) {
    var h = '';
    [0, 1, 2, 3, 4, 5].forEach(function (n) {
      h += '<option value="' + n + '"' + (n === sel ? ' selected' : '') + '>' + n + ' آهنین JSON</option>';
    });
    return h;
  }
  function subscriptionOptions(sel) {
    var h = '';
    [1, 2, 3, 5, 10].forEach(function (n) {
      h += '<option value="' + n + '"' + (n === sel ? ' selected' : '') + '>' + n + ' ساب</option>';
    });
    return h;
  }

  function domainMenuHtml() {
    var html = '<div class="card domain-menu-card" style="position:relative">';
    html += '<div class="row" style="justify-content:space-between">';
    html += '<div><b>دامنه این پنل</b><div class="mono">' + esc(location.host) + '</div></div>';
    html += '<button class="btn primary" id="cf-menu-btn">راه‌اندازی امن کلودفلر ▾</button></div>';
    html += '<div id="cf-menu" style="display:none;margin-top:12px;border-top:1px solid var(--line);padding-top:12px">';
    html += '<div class="row">';
    html += '<a class="btn primary" id="btn-deploy" target="_blank" rel="noopener">Deploy رسمی روی Cloudflare</a>';
    html += '<a class="btn" id="btn-repo" target="_blank" rel="noopener">مشاهده مخزن</a>';
    html += '</div>';
    html += '<p class="muted">توکن API را داخل هیچ پنل عمومی Paste نکنید. Deploy رسمی یا GitHub Actions توکن را در Secret رمزگذاری‌شده نگه می‌دارد.</p>';
    html += '<ol class="muted"><li>Deploy را باز کنید.</li><li>همان‌جا فقط رمز ADMIN_PASSWORD را وارد کنید.</li><li>دامنه Worker را باز کنید و ساب بسازید.</li></ol>';
    html += '</div></div>';
    return html;
  }
  function bindDomainMenu() {
    var L = STATE.launch || {};
    var depA = $('#btn-deploy');
    var repoA = $('#btn-repo');
    if (depA) depA.href = L.deployUrl || 'https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/tree/arena/01a01b70-aminck-nova-edge';
    if (repoA) repoA.href = L.repo || 'https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/tree/arena/01a01b70-aminck-nova-edge';
    var mb = $('#cf-menu-btn');
    if (mb) mb.onclick = function () {
      var box = $('#cf-menu');
      if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
    };
  }

  function renderLogin() {
    var theme = localStorage.getItem('edge-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var html = '<div class="wrap">';
    html += '<div class="topbar"><span class="status-dot' + (navigator.onLine ? '' : ' offline') + '">' + (navigator.onLine ? 'Cloudflare Online' : 'Offline') + '</span><button class="btn" id="install-btn">' + icon('install') + 'نصب اپ</button><button class="btn" id="theme-btn">' + icon('theme') + (theme === 'dark' ? 'روشن' : 'تاریک') + '</button></div>';
    html += '<div class="hero hero-panel card"><div class="mark">' + icon('cloud') + '</div><div><div class="eyebrow">AMINCK NOVA EDGE</div><h1>AMINNOVA Liquid</h1><div class="sub">' + esc(EDITION) + ' · PWA امن و نصب‌پذیر</div></div></div>';
    html += '<div class="grid"><div>' + domainMenuHtml() + '</div><div class="card login-box"><div class="section-title"><div><div class="eyebrow">Secure Access</div><h2>ورود مرکز کنترل</h2></div>' + icon('shield') + '</div>';
    html += '<p class="muted">مالک: <b>AMINCK</b> · رمز فقط در Secret امن <code>ADMIN_PASSWORD</code></p>';
    html += '<label>نام کاربری</label><input id="u" value="AMINCK" autocomplete="username" style="width:100%;margin-bottom:8px">';
    html += '<label>رمز</label><input id="p" type="password" autocomplete="current-password" style="width:100%;margin-bottom:12px">';
    html += '<button class="btn primary big" id="login-btn" style="width:100%;justify-content:center">' + icon('shield') + 'ورود امن</button></div></div>';
    html += '<div class="feature-grid"><div class="feature-tile">' + icon('infinity') + '<h3>Smart Pool ∞</h3><p class="muted">پنجره فعال سبک با چرخش دوره‌ای بدون خروجی بی‌نهایت و Crash کلاینت.</p></div><div class="feature-tile">' + icon('app') + '<h3>اپ موبایل PWA</h3><p class="muted">نصب مستقیم، اشتراک‌گذاری و مدیریت ساب از Home Screen.</p></div><div class="feature-tile">' + icon('shield') + '<h3>امنیت Edge</h3><p class="muted">نشست HttpOnly، SameSite، CSP و عدم Cache داده حساس.</p></div></div></div>';
    $('#app').innerHTML = html;
    $('#theme-btn').onclick = function () {
      localStorage.setItem('edge-theme', theme === 'dark' ? 'light' : 'dark');
      renderLogin();
    };
    var install = $('#install-btn');
    if (install) install.onclick = installApp;
    bindDomainMenu();
    $('#login-btn').onclick = function () {
      api('POST', '/api/login', { username: $('#u').value, password: $('#p').value })
        .then(function () { toast('ورود موفق', true); boot(); })
        .catch(function (e) { toast(e.message); });
    };
  }

  function shell(inner) {
    if (TAB !== 'app' && MONITOR_TIMER) { clearInterval(MONITOR_TIMER); MONITOR_TIMER = null; }
    var me = STATE.me;
    var theme = localStorage.getItem('edge-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var tabs = [['dash', 'داشبورد', 'dash'], ['sell', 'مشترک‌ها', 'users'], ['iron', 'آهنین', 'iron'], ['scan', 'شبکه', 'scan'], ['app', 'اپ موبایل', 'app'], ['recovery', 'بکاپ', 'shield'], ['settings', 'تنظیمات', 'settings'], ['caps', 'قابلیت‌ها', 'spark'], ['help', 'راهنما', 'book']];
    var mobileTabs = tabs.filter(function (t) { return ['dash', 'sell', 'scan', 'app'].indexOf(t[0]) >= 0; });
    var moreTabs = tabs.filter(function (t) { return ['dash', 'sell', 'scan', 'app'].indexOf(t[0]) < 0; });
    var moreActive = moreTabs.some(function (t) { return TAB === t[0]; });
    var html = '<div class="wrap"><div class="topbar">';
    html += '<span id="network-state" class="status-dot' + (navigator.onLine ? '' : ' offline') + '">' + (navigator.onLine ? 'آنلاین' : 'آفلاین') + '</span>';
    html += '<button class="btn" id="install-btn">' + icon('install') + (isStandalone() ? 'نصب‌شده' : 'نصب اپ') + '</button>';
    html += '<button class="btn" id="theme-btn" aria-label="تعویض پوسته">' + icon('theme') + (theme === 'dark' ? 'روشن' : 'تاریک') + '</button>';
    html += '<span class="badge">' + esc(me.role) + ' · ' + esc(me.username) + '</span>';
    if (STATE.launch && STATE.launch.release) html += '<span class="badge mono">' + esc(STATE.launch.release) + '</span>';
    html += '<button class="btn" id="logout-btn">' + icon('logout') + 'خروج</button>';
    if (can(me, 'settings:manage')) html += '<button class="btn primary" id="hot-btn">' + icon('shield') + 'تعمیر همه کانفیگ‌ها روی دامنه فعلی</button>';
    html += '</div><div class="hero"><div class="mark">' + icon('cloud') + '</div><div><div class="eyebrow">Liquid Glass Control Center</div><h1>' + esc(APP) + '</h1><div class="sub">Cloudflare Edge · ' + esc(location.host) + '</div></div></div>';
    html += domainMenuHtml();
    html += '<div class="tabs">';
    tabs.forEach(function (t) {
      html += '<button class="tab' + (TAB === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + icon(t[2]) + t[1] + '</button>';
    });
    html += '</div>' + inner;
    html += '<nav class="mobile-nav" aria-label="ناوبری موبایل">';
    mobileTabs.forEach(function (t) {
      html += '<button class="' + (TAB === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + icon(t[2]) + '<span>' + t[1] + '</span></button>';
    });
    html += '<button id="mobile-more-btn" class="' + (moreActive ? 'on' : '') + '" aria-expanded="false">' + icon('menu') + '<span>بیشتر</span></button></nav>';
    html += '<div class="mobile-sheet" id="mobile-sheet" aria-label="بخش‌های بیشتر">';
    moreTabs.forEach(function (t) {
      html += '<button class="' + (TAB === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + icon(t[2]) + '<span>' + t[1] + '</span></button>';
    });
    html += '</div></div>';
    $('#app').innerHTML = html;
    document.querySelectorAll('[data-tab]').forEach(function (el) {
      el.addEventListener('click', function () { TAB = el.getAttribute('data-tab'); history.replaceState(null, '', '/?tab=' + TAB); paint(); });
    });
    var moreButton = $('#mobile-more-btn');
    if (moreButton) moreButton.onclick = function () {
      var sheet = $('#mobile-sheet');
      if (!sheet) return;
      var open = !sheet.classList.contains('open');
      sheet.classList.toggle('open', open);
      moreButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    var install = $('#install-btn');
    if (install) install.onclick = installApp;
    $('#theme-btn').onclick = function () {
      localStorage.setItem('edge-theme', theme === 'dark' ? 'light' : 'dark');
      paint();
    };
    $('#logout-btn').onclick = function () {
      api('POST', '/api/logout').then(function () { STATE.me = null; renderLogin(); }).catch(function (e) { toast(e.message); });
    };
    bindDomainMenu();
    var hot = $('#hot-btn');
    if (hot) hot.onclick = function () {
      hot.disabled = true;
      api('POST', '/api/hot-update', { speedPreset: 'stable', rescue: true }).then(function (d) {
        toast(d.message || ('تعمیر شد · gen=' + d.configGeneration), true);
        return Promise.all([loadUsers(), loadScan()]).then(function () { paint(); });
      }).catch(function (e) { toast(e.message); }).finally(function () { hot.disabled = false; });
    };
  }

  function viewDash() {
    var s = STATE.stats || {};
    var html = '<div class="grid stats-grid">';
    html += '<div class="pill"><b>' + (s.users || 0) + '</b><span>مشترک</span></div>';
    html += '<div class="pill"><b>' + (s.activeUsers || 0) + '</b><span>فعال</span></div>';
    html += '<div class="pill"><b>' + (STATE.caps.length || '۵۵۰+') + '</b><span>قابلیت مستند</span></div>';
    html += '<div class="pill"><b>∞ Pool</b><span>چرخش پنجره فعال</span></div></div>';
    html += '<div class="card hero-panel" style="margin-top:16px"><div class="section-title"><div><div class="eyebrow">Smart Subscription Studio</div><h2>ساخت اتومات حرفه‌ای AMINNOVA</h2></div>' + icon('spark') + '</div>';
    html += '<p class="muted">Probe واقعی Edge، مسیر مستقیم + Anycast، خروجی‌های چندکلاینت و Smart Pool چرخان. هیچ سرویس اینترنتی نمی‌تواند نبود قطعی روی همه ISPها را تضمین کند؛ Failover احتمال قطعی را کم می‌کند.</p>';
    html += '<div class="alert deployment-doctor">' + icon('shield') + '<b>دامنه فعال:</b> <span class="mono">' + esc(location.hostname) + '</span> · Release <span class="mono">' + esc((STATE.launch && STATE.launch.release) || 'نامشخص') + '</span><br><span class="muted">اگر کانفیگ به دامنه حذف‌شده قبلی اشاره کند، همیشه Timeout می‌شود. حالت نجات فقط دامنه همین پنل را استفاده می‌کند.</span></div>';
    html += '<div class="row"><button class="btn primary" id="safe-preset" type="button">' + icon('shield') + 'حالت نجات DIRECT SAFE</button><button class="btn" id="heavy-preset" type="button">' + icon('iron') + 'MAX Giant پیشرفته</button></div>';
    html += '<div class="mode-deck"><label class="mode-card"><input type="radio" name="usage-mode" id="usage-normal" value="normal" checked><b>' + icon('cloud') + 'ساب معمولی پرقدرت</b><span class="muted">سازگاری بیشتر، Direct Safe و انتخاب خودکار مسیر سالم.</span></label>';
    html += '<label class="mode-card"><input type="radio" name="usage-mode" id="usage-gaming" value="gaming"><b>' + icon('scan') + 'Gaming Route Studio</b><span class="muted">Rule دامنه‌های رسمی بازی/ناشر در Clash، sing-box و Xray؛ بدون ادعای Ping تضمینی.</span></label></div>';
    html += '<label class="check"><input id="iron-sub" type="checkbox"> ' + icon('iron') + '<b>کل Subscription آهنین باشد</b> · همه Routeها با برچسب IRON و گروه Auto/Fallback</label>';
    html += '<div class="game-picker" id="game-picker"><div class="section-title"><div><div class="eyebrow">Gaming TCP Content Routing</div><h2>انتخاب بازی‌ها</h2></div><span class="badge" id="game-count">۰ انتخاب</span></div>';
    html += '<div class="alert warning-honest">Ping زیر ۹۰، IP خارجی ثابت یا UDP بازی قابل تضمین نیست. این بخش فقط Login، Launcher، Store و Content دامنه‌های رسمی را روی بهترین Route موجود می‌فرستد؛ فاصله واقعی تا سرور بازی تغییر نمی‌کند.</div>';
    html += '<div class="game-toolbar"><input id="game-search" placeholder="جست‌وجوی Call of Duty، Minecraft، Valorant…"><button class="btn" id="games-all" type="button">انتخاب همه</button><button class="btn" id="games-none" type="button">پاک‌کردن</button></div><div class="game-list" id="game-list">';
    STATE.games.forEach(function (game) { html += '<label class="game-item" data-game-text="' + esc((game.title + ' ' + game.publisher + ' ' + game.category).toLowerCase()) + '"><input type="checkbox" data-game-id="' + esc(game.id) + '"><span><b>' + esc(game.title) + '</b><br>' + esc(game.publisher) + '</span></label>'; });
    html += '</div></div>';
    html += '<label>نام ساب</label><input id="n" placeholder="VIP-علی" style="width:100%;margin-bottom:8px">';
    html += '<label>قالب نام کانفیگ</label><input id="tpl" value="{brand} AMINCK {profile} {index}" style="width:100%;margin-bottom:8px">';
    html += limRow('حجم بایت', 'lim-b') + limRow('ثانیه اعتبار', 'lim-s') + limRow('سقف اتصال', 'lim-c') + limRow('سقف درخواست ساب', 'lim-r');
    html += '<div class="card"><label>دامنه‌های متصل به همین Worker</label><p class="muted">فقط workers.dev یا Custom Domain متعلق به خودت و Route‌شده به همین Worker. دامنه شخص ثالث با TLS کار نمی‌کند.</p><div class="endpoint-pick">';
    if (STATE.endpoints.length === 0) html += '<span class="muted">Endpoint ثبت نشده؛ دامنه فعلی خودکار اضافه می‌شود.</span>';
    STATE.endpoints.forEach(function (endpoint) {
      var result = STATE.probe[endpoint.id];
      html += '<label class="check"><input type="checkbox" data-build-endpoint="' + esc(endpoint.id) + '" checked> ' + esc((endpoint.label || endpoint.host) + ' · ' + endpoint.host + ':' + endpoint.port) + ' <span class="badge">' + (result && result.ok ? ('سالم ' + Math.round(result.latencyMs || 0) + 'ms') : 'نیازمند تست') + '</span></label>';
    });
    html += '</div><div class="row"><button class="btn" id="domains-all" type="button">انتخاب همه</button><button class="btn" id="domains-none" type="button">لغو همه</button></div></div>';
    html += '<div class="card"><label class="check"><input id="clean-auto" type="checkbox"> افزودن کاندیدهای Cloudflare Anycast برای تست واقعی داخل کلاینت</label>';
    html += '<p class="muted">این IPها تضمین «تمیز» نیستند؛ direct + Anycast با SNI واقعی Worker ساخته می‌شود و url-test/leastPing روی ISP خودت بهترین را انتخاب می‌کند.</p>';
    html += '<label>IPv4 دستی از بازه رسمی Cloudflare (اختیاری، با فاصله یا ویرگول)</label><textarea id="clean-manual" rows="2" placeholder="مثال: 162.159.36.1"></textarea></div>';
    html += '<div class="card install-banner"><label class="check"><input id="dynamic-pool" type="checkbox"> ' + icon('infinity') + ' Smart Pool نامحدود زمانی</label>';
    html += '<div class="grid"><div><label>تعویض پنجره کاندیدها (دقیقه)</label><input id="rotation-minutes" type="number" min="1" max="60" value="5" style="width:100%"></div><div><label>پنجره فعال هم‌زمان</label><div class="muted">تا ۲۰۰۰؛ برای موبایل ۲۰۰ یا کمتر پیشنهاد می‌شود</div></div></div>';
    html += '<p class="muted">∞ یعنی نسل‌های نامحدود در Refreshهای متوالی، نه بی‌نهایت خط در یک پاسخ. URL و Path معتبر می‌مانند تا چرخش باعث قطع عمدی نشود. کلاینت باید ساب را Refresh کند؛ Clash/sing-box بین مسیرهای حاضر خودکار تست می‌کنند.</p></div>';
    html += '<div class="card"><label class="check"><input id="cf-ai" type="checkbox"> کمک اختیاری Cloudflare Workers AI برای انتخاب Profile</label>';
    html += '<p class="muted">AI فقط از عددهای Probe بین Profileهای معتبر انتخاب می‌کند؛ ساخت به AI وابسته نیست و استفاده ممکن است سهمیه/هزینه Workers AI داشته باشد.</p></div>';
    html += '<div class="grid"><div><label>حالت اتصال</label><select id="build-speed" style="width:100%"><option value="stable" selected>Stable · پیشنهادی موبایل</option><option value="balanced">Balanced</option><option value="turbo">Turbo</option><option value="god">GOD · پیشرفته</option></select></div>';
    html += '<div><label>مدیریت مسیر</label><select id="build-mode" style="width:100%"><option value="auto" selected>Auto</option><option value="fallback">Fallback</option><option value="balance">Balance</option></select></div></div>';
    html += '<div class="grid"><div><label>تعداد ساب مستقل</label><select id="sub-count" style="width:100%">' + subscriptionOptions(1) + '</select></div>';
    html += '<div><label>تعداد کانفیگ داخل هر ساب (۱ تا ۲۰۰۰)</label><input id="paths" type="number" min="1" max="2000" value="3" style="width:100%"></div></div>';
    html += '<div class="alert warning-honest">بالاتر از ۲۰۰ Route حالت Giant است و ممکن است Import، حافظه یا تست سرعت بعضی موبایل‌ها را کند کند. سقف ۲۰۰۰ واقعی است، اما Route بیشتر به‌تنهایی کیفیت یا Ping را بهتر نمی‌کند.</div>';
    html += '<label>تعداد بسته JSON آهنین برای ساب اول</label><select id="iron-n">' + ironOptions(1) + '</select> ';
    html += '<button class="btn primary big" id="auto">' + icon('spark') + 'ساخت Smart Subscription</button><div id="mk-out"></div></div>';
    shell(html);
    bindInf();
    var domainsAll = $('#domains-all');
    if (domainsAll) domainsAll.onclick = function () {
      document.querySelectorAll('[data-build-endpoint]').forEach(function (input) { input.checked = true; });
    };
    var domainsNone = $('#domains-none');
    if (domainsNone) domainsNone.onclick = function () {
      document.querySelectorAll('[data-build-endpoint]').forEach(function (input) { input.checked = false; });
    };
    function updateGameCount() {
      var count = document.querySelectorAll('[data-game-id]:checked').length;
      var badge = $('#game-count'); if (badge) badge.textContent = count + ' انتخاب';
    }
    function toggleGamePicker() {
      var picker = $('#game-picker'); if (picker) picker.classList.toggle('open', !!($('#usage-gaming') && $('#usage-gaming').checked));
    }
    if ($('#usage-normal')) $('#usage-normal').onchange = toggleGamePicker;
    if ($('#usage-gaming')) $('#usage-gaming').onchange = toggleGamePicker;
    document.querySelectorAll('[data-game-id]').forEach(function (input) { input.onchange = updateGameCount; });
    var gameSearch = $('#game-search');
    if (gameSearch) gameSearch.oninput = function () {
      var query = gameSearch.value.trim().toLowerCase();
      document.querySelectorAll('[data-game-text]').forEach(function (item) {
        item.style.display = !query || item.getAttribute('data-game-text').indexOf(query) >= 0 ? 'flex' : 'none';
      });
    };
    if ($('#games-all')) $('#games-all').onclick = function () {
      document.querySelectorAll('[data-game-id]').forEach(function (input) { input.checked = true; }); updateGameCount();
    };
    if ($('#games-none')) $('#games-none').onclick = function () {
      document.querySelectorAll('[data-game-id]').forEach(function (input) { input.checked = false; }); updateGameCount();
    };
    var safe = $('#safe-preset');
    if (safe) safe.onclick = function () {
      $('#paths').value = '1'; $('#iron-n').value = '0'; $('#dynamic-pool').checked = false; $('#clean-auto').checked = false; $('#iron-sub').checked = false;
      $('#usage-normal').checked = true; $('#usage-gaming').checked = false; $('#game-picker').classList.remove('open');
      $('#cf-ai').checked = false; $('#build-speed').value = 'stable'; $('#build-mode').value = 'auto'; $('#clean-manual').value = '';
      var matchedCurrent = false;
      document.querySelectorAll('[data-build-endpoint]').forEach(function (input) {
        var endpoint = STATE.endpoints.find(function (item) { return item.id === input.getAttribute('data-build-endpoint'); });
        input.checked = !!endpoint && endpoint.host === location.hostname;
        if (input.checked) matchedCurrent = true;
      });
      if (!matchedCurrent) {
        var firstEndpoint = $('[data-build-endpoint]');
        if (firstEndpoint) firstEndpoint.checked = true;
      }
      toast('حالت نجات: فقط دامنه فعلی، یک مسیر مستقیم و بدون Anycast', true);
    };
    var heavy = $('#heavy-preset');
    if (heavy) heavy.onclick = function () {
      $('#paths').value = '2000'; $('#iron-n').value = '5'; $('#dynamic-pool').checked = true; $('#clean-auto').checked = true; $('#iron-sub').checked = true;
      $('#build-speed').value = 'god'; $('#build-mode').value = 'fallback'; $('#rotation-minutes').value = '5'; toast('پروفایل MAX Giant فعال شد؛ تعداد بالا ممکن است کلاینت را کند کند', true);
    };
    $('#auto').onclick = function () {
      var name = $('#n').value || ('AMINCK-' + Date.now());
      var button = $('#auto');
      button.disabled = true; button.textContent = 'در حال تست و ساخت…';
      var payload = {
        name: name,
        subscriptionCount: Number($('#sub-count').value || 1),
        paths: Number($('#paths').value || 5),
        ironCount: Number($('#iron-n').value || 0),
        speedPreset: $('#build-speed').value,
        profileMode: $('#build-mode').value,
        usageMode: $('#usage-gaming').checked ? 'gaming' : 'normal',
        gameIds: Array.prototype.slice.call(document.querySelectorAll('[data-game-id]:checked')).map(function (input) { return input.getAttribute('data-game-id'); }),
        ironMode: $('#iron-sub').checked,
        configNameTemplate: $('#tpl').value,
        endpointIds: Array.prototype.slice.call(document.querySelectorAll('[data-build-endpoint]:checked')).map(function (input) { return input.getAttribute('data-build-endpoint'); }),
        useCleanCatalog: !!($('#clean-auto') && $('#clean-auto').checked),
        cleanIps: $('#clean-manual') ? $('#clean-manual').value : '',
        dynamicPool: !!($('#dynamic-pool') && $('#dynamic-pool').checked),
        rotationMinutes: Number($('#rotation-minutes').value || 1),
        useCloudflareAi: !!($('#cf-ai') && $('#cf-ai').checked),
        limitBytes: numOrZero('lim-b'),
        limitSeconds: numOrZero('lim-s'),
        maxConnections: numOrZero('lim-c'),
        limitRequests: numOrZero('lim-r')
      };
      if (payload.usageMode === 'gaming' && payload.gameIds.length === 0) {
        button.disabled = false; button.textContent = 'ساخت Smart Subscription';
        toast('برای Gaming حداقل یک بازی انتخاب کن'); return;
      }
      api('POST', '/api/auto-build', payload).then(function (d) {
        var subs = d.subscriptions || [{ name: d.user.name, token: d.user.token, subUrl: d.subUrl }];
        var out = '<div class="alert">' + esc(String(subs.length)) + ' ساب AMINCK آماده شد · ' + esc(String((d.selectedEndpoints || []).length)) + ' دامنه · ' + esc(String((d.cleanIpsUsed || []).length)) + ' کاندید Anycast</div>';
        if (d.rollingPool && d.rollingPool.enabled) {
          out += '<div class="alert">' + icon('infinity') + ' Smart Pool فعال: ' + esc(d.rollingPool.activeWindow) + ' مسیر در پنجره فعال، چرخش هر ' + esc(d.rollingPool.rotationMinutes) + ' دقیقه هنگام Refresh ساب.</div>';
        }
        if (d.aiAssistance && d.aiAssistance.requested) {
          out += '<div class="alert">Workers AI: ' + (d.aiAssistance.applied ? ('پیشنهاد اعمال شد (' + esc(d.aiAssistance.recommendation) + ')') : 'در دسترس نبود؛ موتور Probe تعیین‌پذیر استفاده شد') + '</div>';
        }
        out += '<div class="alert" id="ws-live-test">در حال تست WebSocket از اینترنت همین مرورگر…</div>';
        subs.forEach(function (sub, i) {
          var link = sub.subUrl || subLink(sub.token, '');
          out += '<div class="sub-result"><b>' + esc(sub.name) + '</b><div class="uri">' + esc(link) + '</div>';
          var rawLink = sub.rawUrl || subLink(sub.token, 'raw');
          out += '<div class="row"><button class="btn" data-copy-url="' + esc(link) + '">' + icon('copy') + 'کپی ساب</button>';
          out += '<button class="btn" data-share-url="' + esc(link) + '">' + icon('share') + 'ارسال به موبایل</button>';
          out += '<button class="btn" data-copy-url="' + esc(rawLink) + '">کپی VLESS خام</button>';
          out += '<a class="btn" target="_blank" rel="noopener" href="' + esc(rawLink) + '">تست و نمایش</a>';
          out += '<button class="btn" data-copy-url="' + esc(sub.clashUrl || subLink(sub.token, 'clash')) + '">Clash</button>';
          out += '<button class="btn" data-copy-url="' + esc(sub.singboxUrl || subLink(sub.token, 'singbox')) + '">sing-box</button></div></div>';
        });
        (d.iron || []).forEach(function (p, ironIndex) {
          out += '<div class="card"><b>' + esc(p.name) + '</b> <span class="badge">' + esc(p.client) + '</span> ';
          out += '<button class="btn" data-copy-iron="' + ironIndex + '">کپی JSON آهنین</button>';
          out += '<div class="uri">' + esc(p.json) + '</div></div>';
        });
        $('#mk-out').innerHTML = out;
        document.querySelectorAll('[data-copy-url]').forEach(function (el) {
          el.onclick = function () { copyText(el.getAttribute('data-copy-url'), 'لینک'); };
        });
        document.querySelectorAll('[data-share-url]').forEach(function (el) {
          el.onclick = function () { shareValue('AMINNOVA Subscription', 'لینک خصوصی ساب را فقط برای صاحب آن ارسال کنید.', el.getAttribute('data-share-url')); };
        });
        document.querySelectorAll('[data-copy-iron]').forEach(function (el) {
          el.onclick = function () {
            var item = (d.iron || [])[Number(el.getAttribute('data-copy-iron'))];
            if (item) copyText(item.json, 'JSON آهنین');
          };
        });
        testWsRoute((d.users || [d.user])[0]).then(function (result) {
          var box = $('#ws-live-test');
          if (!box) return;
          box.textContent = result.ok
            ? ('تست کامل WSS + VLESS + TCP موفق شد: ' + result.latencyMs + 'ms')
            : result.tcpOpened
              ? ('مسیر WSS + VLESS + TCP باز شد (' + result.latencyMs + 'ms)، ولی مقصد آزمایشی داده نفرستاد. خود Gateway Timeout نیست.')
              : ('هشدار واقعی تونل: ' + result.error + '؛ اول حالت نجات DIRECT SAFE و سپس دامنه Worker را بررسی کن.');
          box.style.borderColor = result.ok ? 'var(--ok)' : (result.tcpOpened ? 'var(--warn)' : 'var(--err)');
        });
        toast(String(subs.length) + ' ساب ساخته شد', true);
        return loadUsers();
      }).catch(function (e) { toast(e.message); }).finally(function () {
        button.disabled = false; button.innerHTML = icon('spark') + 'ساخت Smart Subscription';
      });
    };
  }

  function viewSell() {
    var html = '<div class="card"><h2>مشترک‌ها و ویرایش</h2><table><thead><tr><th>نام</th><th>مسیر</th><th></th></tr></thead><tbody>';
    STATE.users.forEach(function (u) {
      html += '<tr><td>' + esc(u.name) + (u.dynamicPool ? ' <span class="badge">∞ ' + esc(u.rotationMinutes || 1) + 'm</span>' : '') + (u.ironMode ? ' <span class="badge">IRON</span>' : '') + (u.usageMode === 'gaming' ? ' <span class="badge">GAMING</span>' : '') + '</td><td>' + (u.routes ? u.routes.length : 0) + '</td>';
      html += '<td><button class="btn" data-copy="' + esc(u.token) + '">کپی ساب</button> ';
      html += '<button class="btn" data-edit="' + esc(u.id) + '">ویرایش</button></td></tr>';
    });
    html += '</tbody></table><div id="edit-box"></div></div>';
    shell(html);
    document.querySelectorAll('[data-copy]').forEach(function (el) {
      el.onclick = function () { copyText(subLink(el.getAttribute('data-copy'), ''), 'ساب'); };
    });
    document.querySelectorAll('[data-edit]').forEach(function (el) {
      el.onclick = function () { showEdit(el.getAttribute('data-edit')); };
    });
  }

  function showEdit(id) {
    var u = STATE.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    var box = $('#edit-box');
    var h = '<h2>ویرایش ' + esc(u.name) + '</h2>';
    h += '<label>نام</label><input id="en" value="' + esc(u.name) + '" style="width:100%">';
    h += '<label>قالب نام</label><input id="et" value="' + esc(u.configNameTemplate || '{brand} AMINCK {profile} {index}') + '" style="width:100%">';
    h += '<label>تعداد مسیر فعال (۱ تا ۲۰۰۰)</label><input id="ep" type="number" min="1" max="2000" value="' + esc(u.routes ? u.routes.length : 3) + '">';
    h += '<div class="grid"><div><label>نوع مصرف</label><select id="eusage"><option value="normal">معمولی</option><option value="gaming">Gaming Rules</option></select></div><div><label class="check"><input id="eiron" type="checkbox"' + (u.ironMode ? ' checked' : '') + '> کل ساب IRON</label></div></div>';
    h += '<div id="edit-games" class="game-picker' + (u.usageMode === 'gaming' ? ' open' : '') + '"><div class="row"><b>بازی‌های این ساب</b><button class="btn" id="edit-games-all" type="button">همه</button><button class="btn" id="edit-games-none" type="button">پاک‌کردن</button></div><div class="game-list">';
    STATE.games.forEach(function (game) { h += '<label class="game-item"><input type="checkbox" data-edit-game="' + esc(game.id) + '"' + ((u.gameIds || []).indexOf(game.id) >= 0 ? ' checked' : '') + '><span>' + esc(game.title) + '</span></label>'; });
    h += '</div></div>';
    h += '<label class="check"><input id="edyn" type="checkbox"' + (u.dynamicPool ? ' checked' : '') + '> Smart Pool چرخان</label>';
    h += '<label>چرخش (دقیقه)</label><input id="erot" type="number" min="1" max="60" value="' + esc(u.rotationMinutes || 1) + '">';
    h += limRow('حجم', 'eb') + limRow('ثانیه', 'es') + limRow('اتصال', 'ec') + limRow('سقف درخواست', 'er');
    h += '<button class="btn primary" id="esave">ذخیره ویرایش</button>';
    box.innerHTML = h;
    if ($('#eusage')) {
      $('#eusage').value = u.usageMode || 'normal';
      $('#eusage').onchange = function () { $('#edit-games').classList.toggle('open', $('#eusage').value === 'gaming'); };
    }
    if ($('#edit-games-all')) $('#edit-games-all').onclick = function () { document.querySelectorAll('[data-edit-game]').forEach(function (input) { input.checked = true; }); };
    if ($('#edit-games-none')) $('#edit-games-none').onclick = function () { document.querySelectorAll('[data-edit-game]').forEach(function (input) { input.checked = false; }); };
    if ($('#eb')) $('#eb').value = String(u.limitBytes || 0);
    if ($('#es')) $('#es').value = String(u.limitSeconds || 0);
    if ($('#ec')) $('#ec').value = String(u.maxConnections || 0);
    if ($('#er')) $('#er').value = String(u.limitRequests || 0);
    bindInf();
    $('#esave').onclick = function () {
      var editGameIds = Array.prototype.slice.call(document.querySelectorAll('[data-edit-game]:checked')).map(function (input) { return input.getAttribute('data-edit-game'); });
      if ($('#eusage').value === 'gaming' && editGameIds.length === 0) { toast('برای Gaming حداقل یک بازی انتخاب کن'); return; }
      api('POST', '/api/user-update', {
        id: id,
        name: $('#en').value,
        configNameTemplate: $('#et').value,
        paths: Number($('#ep').value || 3),
        usageMode: $('#eusage').value,
        gameIds: editGameIds,
        ironMode: $('#eiron').checked,
        dynamicPool: $('#edyn').checked,
        rotationMinutes: Number($('#erot').value || 1),
        limitBytes: numOrZero('eb'),
        limitSeconds: numOrZero('es'),
        maxConnections: numOrZero('ec'),
        limitRequests: numOrZero('er'),
        speedPreset: u.speedPreset || 'stable'
      }).then(function () { toast('ذخیره شد', true); return loadUsers().then(paint); })
        .catch(function (e) { toast(e.message); });
    };
  }

  function viewIron() {
    var html = '<div class="card"><h2>کانفیگ آهنین</h2><div class="row"><select id="uid">';
    STATE.users.forEach(function (u) {
      html += '<option value="' + esc(u.id) + '">' + esc(u.name) + '</option>';
    });
    html += '</select><select id="ic">' + ironOptions(3) + '</select><button class="btn primary" id="ib">ساخت آهنین</button></div><div id="iron-out"></div></div>';
    shell(html);
    var ib = $('#ib');
    if (ib) ib.onclick = function () {
      api('POST', '/api/iron-build', { id: $('#uid').value, count: Number($('#ic').value) })
        .then(function (d) {
          STATE.iron = d.iron;
          var out = '';
          (d.iron || []).forEach(function (p) {
            out += '<div class="card"><b>' + esc(p.name) + '</b> <span class="badge">' + esc(p.client) + '</span><div class="uri">' + esc(p.json) + '</div></div>';
          });
          $('#iron-out').innerHTML = out;
        }).catch(function (e) { toast(e.message); });
    };
  }

  function viewScan() {
    var html = '<div class="card"><h2>پینگ و Multi-Endpoint</h2><p class="muted">برای هر Deploy واقعی خودت یک Host اضافه کن. برچسب مکان فقط اطلاعاتی است که خود اپراتور تأیید می‌کند؛ AMINNOVA از IP Anycast کشور جعلی حدس نمی‌زند.</p><div class="row"><input id="el" placeholder="برچسب واقعی، مثال Frankfurt Primary"><input id="eh" placeholder="host"><input id="ep" value="443" style="width:80px"><button class="btn" id="add-ep">افزودن</button><button class="btn primary" id="pr">پینگ</button></div><table><tbody>';
    (STATE.endpoints || []).forEach(function (e) {
      var r = (STATE.probe || {})[e.id] || {};
      html += '<tr><td><b>' + esc(e.label || e.host) + '</b><br><span class="mono muted">' + esc(e.host) + '</span></td><td>' + esc(String(r.ok ? (r.latencyMs + ' ms') : (r.error || '—'))) + '</td></tr>';
    });
    html += '</tbody></table><p class="muted">این عدد HTTPS از Edge کلودفلر است، نه Ping اینترنت کاربر. نتیجه ISP کاربر می‌تواند متفاوت باشد. Auto Build Endpointهای سالم را با کمترین عدد اندازه‌گیری‌شده جلوتر می‌گذارد.</p></div>';
    html += '<div class="card"><h2>مخزن کاندیدهای Anycast</h2><p class="muted">IP تمیز ثابت وجود ندارد. با فعال بودن گزینه Anycast در ساخت اتومات، این کاندیدها کنار مسیر مستقیم وارد می‌شوند تا خود کلاینت از شبکه واقعی تست کند.</p><div class="row">';
    (STATE.clean || []).slice(0, 18).forEach(function (c) { html += '<span class="badge mono">' + esc(c.ip) + '</span>'; });
    html += '</div></div>';
    shell(html);
    $('#add-ep').onclick = function () {
      api('POST', '/api/endpoints', { action: 'add', label: $('#el').value, host: $('#eh').value, port: Number($('#ep').value || 443) })
        .then(function () { toast('OK', true); loadScan(); }).catch(function (e) { toast(e.message); });
    };
    $('#pr').onclick = function () {
      api('POST', '/api/probe', {}).then(function (d) { STATE.probe = d.results || {}; toast('پینگ شد', true); paint(); }).catch(function (e) { toast(e.message); });
    };
  }

  function viewApp() {
    var html = '<div class="card hero-panel app-stage"><div class="section-title"><div><div class="eyebrow">Installable Mobile Companion</div><h2>اپ موبایل AMINNOVA</h2></div>' + icon('app') + '</div>';
    html += '<p class="muted">این نسخه PWA روی Android، iOS و دسکتاپ نصب می‌شود و پنل، ساب‌ها، Share، Gaming Preset و مانیتور Refresh را داخل یک اپ نگه می‌دارد.</p>';
    html += '<div class="performance-strip"><div><b>' + esc((STATE.launch && STATE.launch.version) || '—') + '</b><span class="muted">نسخه پنل</span></div><div><b>' + esc(STATE.games.length) + '</b><span class="muted">Preset بازی</span></div><div><b>۲۰۰۰</b><span class="muted">سقف Route مالک</span></div></div>';
    html += '<div class="row"><button class="btn primary big" id="app-install">' + icon('install') + (isStandalone() ? 'اپ نصب شده' : 'نصب روی صفحه اصلی') + '</button><button class="btn" id="app-update">' + icon('spark') + 'آپدیت Shell اپ</button><button class="btn" id="source-update">' + icon('cloud') + 'بررسی GitHub / Deploy</button></div><div id="source-update-state" class="alert" style="margin-top:12px">نسخه Source هنوز بررسی نشده است.</div></div>';
    html += '<div class="grid"><div class="card"><h2>انتخاب مشترک</h2><select id="app-user" style="width:100%">';
    STATE.users.forEach(function (u) { html += '<option value="' + esc(u.token) + '">' + esc(u.name) + (u.dynamicPool ? ' · ∞ Pool' : '') + '</option>'; });
    html += '</select><div id="app-links"></div></div>';
    html += '<div class="card"><h2>مانیتور چرخش یک‌دقیقه‌ای</h2><p class="muted">فقط وقتی اپ باز است، هر دقیقه ساب انتخابی را Refresh و هدر Rotation را نمایش می‌دهد. اپ بسته یا Client خارجی را سیستم‌عامل کنترل می‌کند.</p><button class="btn primary" id="monitor-btn">شروع مانیتور</button><div id="monitor-state" class="uri">خاموش</div></div></div>';
    html += '<div class="card"><h2>اتصال به کانفیگ</h2><div class="alert">مرورگر/PWA اجازه ساخت VPN سیستمی ندارد. برای اتصال واقعی باید لینک را در V2RayNG، V2Box، MahsaNG، Clash/Mihomo یا sing-box Import کنید. AMINNOVA هیچ‌وقت اتصال جعلی یا VPN مرورگری ادعا نمی‌کند.</div>';
    html += '<div class="feature-grid"><div class="feature-tile">' + icon('copy') + '<h3>V2Ray / Raw</h3><p class="muted">کپی Base64 یا VLESS خام برای کلاینت‌های V2Ray.</p></div><div class="feature-tile">' + icon('scan') + '<h3>Clash / Mihomo</h3><p class="muted">YAML کامل با url-test و fallback.</p></div><div class="feature-tile">' + icon('iron') + '<h3>sing-box / Iron</h3><p class="muted">JSON استاندارد با Selector و URLTest.</p></div></div></div>';
    shell(html);
    var install = $('#app-install'); if (install) install.onclick = installApp;
    var update = $('#app-update'); if (update) update.onclick = function () {
      if (!navigator.serviceWorker) { toast('Service Worker پشتیبانی نمی‌شود'); return; }
      navigator.serviceWorker.getRegistration('/').then(function (reg) { if (reg) return reg.update(); }).then(function () { toast('Shell اپ بررسی شد', true); });
    };
    var sourceUpdate = $('#source-update'); if (sourceUpdate) sourceUpdate.onclick = function () {
      sourceUpdate.disabled = true;
      api('GET', '/api/update-check').then(function (d) {
        var box = $('#source-update-state'); if (!box) return;
        if (!d.ok) { box.textContent = d.message || 'GitHub در دسترس نیست'; box.style.borderColor = 'var(--warn)'; return; }
        box.innerHTML = 'نسخه نصب‌شده: <b class="mono">' + esc(d.currentVersion) + '</b> · نسخه GitHub: <b class="mono">' + esc(d.latestVersion) + '</b>' + (d.updateAvailable ? '<br><a class="btn primary" target="_blank" rel="noopener" href="' + esc(d.deployUrl) + '">نصب نسخه جدید از Cloudflare</a>' : '<br>پنل به‌روز است.');
        box.style.borderColor = d.updateAvailable ? 'var(--warn)' : 'var(--ok)';
      }).catch(function (e) { toast(e.message); }).finally(function () { sourceUpdate.disabled = false; });
    };
    function paintLinks() {
      var token = $('#app-user') ? $('#app-user').value : '';
      if (!token) { $('#app-links').innerHTML = '<div class="alert">اول از داشبورد یک مشترک بساز.</div>'; return; }
      var base = subLink(token, '');
      var links = [
        ['ساب خودکار', base], ['VLESS خام', subLink(token, 'raw')], ['Clash/Mihomo', subLink(token, 'clash')], ['sing-box', subLink(token, 'singbox')]
      ];
      var out = '';
      links.forEach(function (item) {
        out += '<div class="sub-result"><b>' + item[0] + '</b><div class="uri">' + esc(item[1]) + '</div><div class="row"><button class="btn" data-app-copy="' + esc(item[1]) + '">' + icon('copy') + 'کپی</button><button class="btn" data-app-share="' + esc(item[1]) + '">' + icon('share') + 'Share</button></div></div>';
      });
      $('#app-links').innerHTML = out;
      document.querySelectorAll('[data-app-copy]').forEach(function (el) { el.onclick = function () { copyText(el.getAttribute('data-app-copy'), 'لینک Import'); }; });
      document.querySelectorAll('[data-app-share]').forEach(function (el) { el.onclick = function () { shareValue('AMINNOVA', 'Subscription خصوصی', el.getAttribute('data-app-share')); }; });
    }
    if ($('#app-user')) { $('#app-user').onchange = paintLinks; paintLinks(); }
    var monitor = $('#monitor-btn');
    function runMonitor() {
      var token = $('#app-user') ? $('#app-user').value : '';
      if (!token) return;
      fetch(subLink(token, 'raw'), { cache: 'no-store', credentials: 'omit' }).then(function (res) {
        if (res.body && res.body.cancel) res.body.cancel().catch(function () {});
        var box = $('#monitor-state'); if (!box) return;
        box.textContent = 'HTTP ' + res.status + ' · mode=' + (res.headers.get('x-aminck-pool-mode') || 'fixed') + ' · epoch=' + (res.headers.get('x-aminck-rotation-epoch') || '—') + ' · ' + new Date().toLocaleTimeString('fa-IR');
      }).catch(function () { var box = $('#monitor-state'); if (box) box.textContent = 'شبکه در دسترس نیست'; });
    }
    if (monitor) monitor.onclick = function () {
      if (MONITOR_TIMER) { clearInterval(MONITOR_TIMER); MONITOR_TIMER = null; monitor.textContent = 'شروع مانیتور'; $('#monitor-state').textContent = 'خاموش'; return; }
      runMonitor(); MONITOR_TIMER = setInterval(runMonitor, 60000); monitor.textContent = 'توقف مانیتور';
    };
  }

  function viewRecovery() {
    if (!can(STATE.me, 'backup:export')) { shell('<div class="card">دسترسی بکاپ ندارید.</div>'); return; }
    var html = '<div class="card"><h2>بکاپ و بازیابی ساب‌ها</h2>';
    html += '<p class="muted">اگر حساب Cloudflare حذف شود، Worker و دامنه workers.dev آن حساب هم از بین می‌رود. برای بازیابی: این فایل را نگه دارید، AMINNOVA را روی حساب جدید Deploy و همین‌جا Restore کنید.</p>';
    html += '<p class="muted">این فایل شامل Token و UUID مشترک‌هاست؛ آن را محرمانه نگه دارید.</p>';
    html += '<div class="row"><button class="btn primary" id="backup-download">دانلود بکاپ JSON</button></div>';
    if (STATE.me.role === 'owner') {
      html += '<hr style="border:0;border-top:1px solid var(--line);margin:18px 0">';
      html += '<label>فایل بکاپ AMINNOVA</label><input id="backup-file" type="file" accept="application/json,.json">';
      html += '<button class="btn" id="backup-restore">بازیابی روی این دامنه</button>';
      html += '<p class="muted">Token و UUID حفظ می‌شوند و مسیرها به دامنه فعلی متصل می‌شوند. برای ثابت ماندن لینک قدیمی باید از Custom Domain خودتان استفاده و DNS آن را به Deploy جدید منتقل کنید.</p>';
    }
    html += '</div>';
    shell(html);
    $('#backup-download').onclick = function () {
      api('POST', '/api/backup', {}).then(function (d) {
        downloadJson(d, 'AMINNOVA-backup-' + new Date().toISOString().slice(0, 10) + '.json');
        toast('بکاپ دانلود شد', true);
      }).catch(function (e) { toast(e.message); });
    };
    var restore = $('#backup-restore');
    if (restore) restore.onclick = function () {
      var input = $('#backup-file');
      if (!input.files || !input.files[0]) { toast('اول فایل بکاپ را انتخاب کنید'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var backup = JSON.parse(String(reader.result || ''));
          api('POST', '/api/restore', { backup: backup }).then(function (d) {
            toast(d.message || 'بازیابی شد', true);
            return Promise.all([loadUsers(), loadScan()]).then(function () { TAB = 'sell'; paint(); });
          }).catch(function (e) { toast(e.message); });
        } catch (e) { toast('JSON بکاپ نامعتبر است'); }
      };
      reader.readAsText(input.files[0]);
    };
  }

  function viewSettings() {
    var s = STATE.settings || {};
    if (!can(STATE.me, 'settings:manage')) { shell('<div class="card">دسترسی تنظیمات ندارید.</div>'); return; }
    var anti = s.antiDetect || {};
    var ports = s.tlsPorts || [443];
    var html = '<div class="card"><h2>تنظیمات خروجی و فروش</h2>';
    html += '<label>عنوان پنل</label><input id="st-title" value="' + esc(s.title || 'AMINNOVA') + '" style="width:100%">';
    html += '<label>برند کانفیگ</label><input id="st-brand" value="' + esc(s.brand || 'AMINCK GOD Edition') + '" style="width:100%">';
    html += '<label>لینک پشتیبانی</label><input id="st-support" value="' + esc(s.supportUrl || '') + '" style="width:100%">';
    html += '<label>Health Check مستقل</label><input id="st-health" value="' + esc(s.healthUrl || '') + '" placeholder="خالی = https://www.gstatic.com/generate_204" style="width:100%"><p class="muted">آدرس خود Worker را اینجا نگذار؛ Loop خروجی باعث Timeout کاذب می‌شود.</p>';
    html += '<label>قالب نام</label><input id="st-template" value="' + esc(s.configNameTemplate || '{brand} AMINCK {profile} {index}') + '" style="width:100%">';
    html += '<div class="grid"><div><label>تعداد پیش‌فرض</label><input id="st-paths" type="number" min="1" max="2000" value="' + esc(s.defaultPaths || 3) + '"></div>';
    html += '<div><label>آپدیت ساب (ساعت)</label><input id="st-up" type="number" min="1" max="720" value="' + esc(s.updateIntervalHours || 24) + '"></div></div>';
    html += '<div class="row" style="margin-top:12px"><select id="st-speed"><option value="stable">Stable</option><option value="balanced">Balanced</option><option value="turbo">Turbo</option><option value="god">GOD</option></select>';
    html += '<select id="st-mode"><option value="auto">Auto</option><option value="fallback">Fallback</option><option value="balance">Balance</option></select>';
    html += '<select id="st-fp"><option value="chrome">Chrome</option><option value="firefox">Firefox</option><option value="safari">Safari</option><option value="edge">Edge</option><option value="random">Random</option></select></div>';
    html += '<h2 style="margin-top:18px">پورت‌های دامنه Worker</h2><div class="row">';
    [443,2053,2083,2087,2096,8443].forEach(function (p) { html += '<label class="check"><input type="checkbox" data-port="' + p + '"' + (ports.indexOf(p) >= 0 ? ' checked' : '') + '> ' + p + '</label>'; });
    html += '</div><p class="muted">برای workers.dev فقط 443 پیشنهاد می‌شود. مولتی‌پورت فقط با Custom Domain سازگار فعال شود.</p>';
    html += '<div class="row"><label class="check"><input id="st-pad" type="checkbox"' + (anti.pathPadding ? ' checked' : '') + '> Path padding</label>';
    html += '<label class="check"><input id="st-jitter" type="checkbox"' + (anti.pathJitter ? ' checked' : '') + '> Path jitter</label>';
    html += '<label class="check"><input id="st-frag" type="checkbox"' + (anti.fragment ? ' checked' : '') + '> Fragment hint</label>';
    html += '<label class="check"><input id="st-multi" type="checkbox"' + (anti.multiPort ? ' checked' : '') + '> Multi-port</label></div>';
    html += '<label>Host aliasهای متعلق به شما (باید در Endpointها باشند؛ با کاما)</label><input id="st-alias" value="' + esc((s.hostAliases || []).join(', ')) + '" style="width:100%">';
    html += '<p class="muted">دامنه شخص ثالث یا SNI جعلی پشتیبانی نمی‌شود؛ باعث شکست TLS/Route و ریسک سوءاستفاده می‌شود.</p>';
    html += '<button class="btn primary" id="st-save">ذخیره تنظیمات</button></div>';
    shell(html);
    if ($('#st-speed')) $('#st-speed').value = s.speedPreset || 'god';
    if ($('#st-mode')) $('#st-mode').value = s.profileMode || 'auto';
    if ($('#st-fp')) $('#st-fp').value = s.fingerprint || 'chrome';
    $('#st-save').onclick = function () {
      var selectedPorts = [];
      document.querySelectorAll('[data-port]:checked').forEach(function (el) { selectedPorts.push(Number(el.getAttribute('data-port'))); });
      var aliases = $('#st-alias').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      api('POST', '/api/settings', { settings: {
        title: $('#st-title').value,
        brand: $('#st-brand').value,
        supportUrl: $('#st-support').value,
        healthUrl: $('#st-health').value,
        configNameTemplate: $('#st-template').value,
        defaultPaths: Number($('#st-paths').value || 3),
        updateIntervalHours: Number($('#st-up').value || 24),
        speedPreset: $('#st-speed').value,
        profileMode: $('#st-mode').value,
        fingerprint: $('#st-fp').value,
        tlsPorts: selectedPorts,
        hostAliases: aliases,
        antiDetect: {
          pathPadding: $('#st-pad').checked,
          pathJitter: $('#st-jitter').checked,
          fragment: $('#st-frag').checked,
          hostCamouflage: aliases.length > 0,
          multiPort: $('#st-multi').checked
        }
      }}).then(function (d) { STATE.settings = d.settings; toast('تنظیمات ذخیره شد', true); paint(); }).catch(function (e) { toast(e.message); });
    };
  }

  function viewCaps() {
    var categories = [];
    STATE.caps.forEach(function (c) { if (categories.indexOf(c.category) < 0) categories.push(c.category); });
    var html = '<div class="card hero-panel"><div class="section-title"><div><div class="eyebrow">Verified Feature Manifest</div><h2>' + STATE.caps.length + '+ قابلیت واقعی</h2></div>' + icon('spark') + '</div><p class="muted">همه موارد به کد، API، UI، امنیت، خروجی یا PWA موجود متصل‌اند؛ شعار و قابلیت خیالی ثبت نمی‌شود.</p></div>';
    html += '<div class="card"><div class="cap-toolbar"><input id="cap-search" placeholder="جست‌وجوی قابلیت…"><select id="cap-cat"><option value="">همه دسته‌ها</option>';
    categories.forEach(function (cat) { html += '<option value="' + esc(cat) + '">' + esc(cat) + '</option>'; });
    html += '</select></div><div id="cap-count" class="muted"></div><div id="cap-list" class="cap-list"></div></div>';
    shell(html);
    function filterCaps() {
      var q = ($('#cap-search').value || '').trim().toLowerCase();
      var cat = $('#cap-cat').value;
      var list = STATE.caps.filter(function (c) {
        return (!cat || c.category === cat) && (!q || (c.title + ' ' + c.description).toLowerCase().indexOf(q) >= 0);
      });
      $('#cap-count').textContent = list.length + ' مورد نمایش داده می‌شود';
      $('#cap-list').innerHTML = list.map(function (c) {
        return '<article class="cap-item"><span class="badge">' + esc(c.category) + '</span><b>' + esc(c.title) + '</b><div class="muted">' + esc(c.description) + '</div></article>';
      }).join('');
    }
    $('#cap-search').oninput = filterCaps; $('#cap-cat').onchange = filterCaps; filterCaps();
  }

  function viewHelp() {
    var html = '<div class="card hero-panel"><div class="section-title"><div><div class="eyebrow">AMINNOVA Academy</div><h2>راهنمای کامل از Deploy تا اتصال</h2></div>' + icon('book') + '</div><p class="muted">قدم‌ها را به ترتیب انجام بده؛ هیچ Cloudflare Token داخل پنل وارد نکن.</p><a class="btn primary big" id="easy" target="_blank" rel="noopener">' + icon('cloud') + 'Deploy رسمی</a></div>';
    html += '<div class="grid"><div class="card"><h2>راه‌اندازی</h2>';
    html += '<div class="guide-step"><strong>۱</strong><div><b>Deploy</b><p class="muted">لینک رسمی را باز و فقط ADMIN_PASSWORD قوی تعیین کن.</p></div></div>';
    html += '<div class="guide-step"><strong>۲</strong><div><b>ورود</b><p class="muted">با نام AMINCK وارد شو؛ دامنه جاری خودکار Endpoint می‌شود.</p></div></div>';
    html += '<div class="guide-step"><strong>۳</strong><div><b>ساخت</b><p class="muted">Endpoint، تعداد مسیر، Anycast و Smart Pool را انتخاب و ساخت را بزن.</p></div></div></div>';
    html += '<div class="card"><h2>Import در کلاینت</h2><div class="guide-step"><strong>۱</strong><div><b>لینک مناسب</b><p class="muted">V2Ray Base64 برای V2RayNG/V2Box؛ YAML برای Clash؛ JSON برای sing-box.</p></div></div><div class="guide-step"><strong>۲</strong><div><b>Refresh</b><p class="muted">برای Pool یک‌دقیقه‌ای، Refresh ساب کلاینت را روی کمترین بازه پشتیبانی‌شده تنظیم کن. url-test خودش مسیر حاضر را انتخاب می‌کند.</p></div></div><div class="guide-step"><strong>۳</strong><div><b>تست</b><p class="muted">نتیجه تست کامل WSS + VLESS + TCP پنل و تست داخل همان ISP را بررسی کن؛ Edge Ping معادل وضعیت اینترنت کاربر نیست.</p></div></div></div></div>';
    html += '<div class="card"><h2>Smart Pool و پایداری</h2><ul class="api"><li>∞ به معنی تولید نامحدود پنجره‌های جدید در طول زمان است؛ پاسخ واقعاً بی‌نهایت باعث مصرف حافظه و Crash کلاینت می‌شود.</li><li>Path و Token در چرخش خودکار ثابت می‌مانند تا اتصال‌های موجود عمداً شکسته نشوند.</li><li>همیشه مسیر DIRECT SAFE بدون Early Data میان Anycastها حفظ می‌شود.</li><li>Health Check پیش‌فرض از gstatic استفاده می‌کند؛ تست‌کردن Worker از داخل تونل خودش باعث TCP Loop و Timeout می‌شود.</li><li>هیچ Worker، IP یا ISP بدون قطعی تضمین نمی‌شود؛ Custom Domain، بکاپ و Deploy دوم راهکار واقعی Failover هستند.</li></ul></div>';
    html += '<div class="card"><h2>اپ موبایل</h2><p class="muted">در تب «اپ موبایل» PWA را نصب، لینک‌ها را Share و Rotation را مانیتور کن. PWA مرورگر مجوز VpnService سیستم‌عامل ندارد؛ اتصال واقعی با کلاینت استاندارد انجام می‌شود.</p></div>';
    shell(html);
    var a = $('#easy');
    if (a && STATE.launch) a.href = STATE.launch.deployUrl;
  }

  function paint() {
    if (!STATE.me) { renderLogin(); return; }
    if (TAB === 'sell') viewSell();
    else if (TAB === 'iron') viewIron();
    else if (TAB === 'scan') viewScan();
    else if (TAB === 'app') viewApp();
    else if (TAB === 'recovery') viewRecovery();
    else if (TAB === 'settings') viewSettings();
    else if (TAB === 'caps') viewCaps();
    else if (TAB === 'help') viewHelp();
    else viewDash();
  }

  function loadUsers() {
    return api('POST', '/api/users', {}).then(function (d) { STATE.users = d.users || []; });
  }
  function loadScan() {
    return Promise.all([
      api('POST', '/api/endpoints', { action: 'view' }).then(function (d) {
        STATE.endpoints = d.endpoints || [];
        STATE.probe = d.probeResults || {};
      }).catch(function () {}),
      api('POST', '/api/clean-ips', {}).then(function (d) { STATE.clean = d.ips || []; }).catch(function () {})
    ]).then(function () { if (TAB === 'scan') paint(); });
  }

  function render(me) {
    STATE.me = me;
    if (!me) { renderLogin(); return; }
    Promise.all([
      api('POST', '/api/stats', {}).then(function (d) { STATE.stats = d; }).catch(function () {}),
      loadUsers().catch(function () {}),
      loadScan(),
      api('POST', '/api/get-settings', {}).then(function (d) { STATE.settings = d.settings || null; }).catch(function () {}),
      api('POST', '/api/capabilities', {}).then(function (d) { STATE.caps = d.capabilities || []; }).catch(function () {}),
      api('POST', '/api/game-catalog', {}).then(function (d) { STATE.games = d.games || []; }).catch(function () { STATE.games = []; })
    ]).then(function () { paint(); });
  }

  function boot() {
    var requestedTab = new URLSearchParams(location.search).get('tab');
    if (['dash','sell','iron','scan','app','recovery','settings','caps','help'].indexOf(requestedTab) >= 0) TAB = requestedTab;
    registerPwa();
    api('GET', '/api/launch').then(function (d) { STATE.launch = d; }).catch(function () {}).finally(function () {
      api('GET', '/api/me').then(function (d) { render(d && d.me ? d.me : null); }).catch(function () { render(null); });
    });
  }

  window.addEventListener('beforeinstallprompt', function (event) { event.preventDefault(); INSTALL_EVENT = event; });
  window.addEventListener('appinstalled', function () { INSTALL_EVENT = null; toast('AMINNOVA روی دستگاه نصب شد', true); });
  function updateNetworkState() {
    var badge = $('#network-state'); if (!badge) return;
    badge.className = 'status-dot' + (navigator.onLine ? '' : ' offline');
    badge.textContent = navigator.onLine ? 'آنلاین' : 'آفلاین';
  }
  window.addEventListener('online', updateNetworkState);
  window.addEventListener('offline', updateNetworkState);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
/*NOVA-UI-END*/
`;

export function uiAppJsForCheck(): string {
  return UI_APP_JS;
}
