// AdjitTime — Mobile Calendar + Pretty UI (Express + cookie, in-memory)
// - Root -> /login (full-name + DOB)
// - Cookie session (7 days)
// - Tabs: Calendar (read-only), "You're mine bitch" (agenda + delete), "Formal request for possession" (create; default 60; choose status)
// - Status: "set in stone" (stone) vs "set in pencil" (pencil) with clear color-coding
// - Show creator on every appointment
// - Fully in-memory (resets on restart)

const express = require('express');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// --------- Middleware ----------
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --------- Users (hardcoded) ----------
const USERS = [
  { id: 1, fullName: 'Adam Kiernan', slug: 'adam', dob: '2001-02-11' },
  { id: 2, fullName: 'Kuljit Dhami', slug: 'kuljit', dob: '1994-12-09' },
];

// appointment: {
//   id, title, startAtISO, durationMins, note, status: 'stone'|'pencil',
//   createdBySlug, createdAtISO
// }
let APPOINTMENTS = [];
let nextId = 1;

// --------- Helpers ----------
function getUserFromCookie(req) {
  const slug = req.cookies?.adjit_user;
  if (!slug) return null;
  return USERS.find((u) => u.slug === slug) || null;
}

function requireLogin(req, res, next) {
  const user = getUserFromCookie(req);
  if (!user) return res.redirect('/login');
  req.user = user;
  next();
}

function escapeHTML(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeName(s) {
  // Lowercase, collapse whitespace, trim
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function toHumanLocal(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

// --------- Layout ----------
function layoutHTML(title, body, user = null, extraHead = '', afterBody = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHTML(title)} · AdjitTime</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <style>
    :root{
      --bg: #ffffff;
      --fg: #0f1115;
      --muted: #6b7280;
      --border: #e5e7eb;
      --card: #fbfbfb;
      --accent: #111111;
      --accent-fg: #ffffff;
      --shadow: 0 10px 25px rgba(0,0,0,.06);

      --stone: #2563eb;      /* blue - set in stone */
      --pencil: #9ca3af;     /* gray - set in pencil */

      --adam: #8b5cf6;       /* subtle creator dot accent (optional) */
      --kuljit: #f59e0b;
    }
    @media (prefers-color-scheme: dark) {
      :root{
        --bg: #0b0b0c;
        --fg: #f3f4f6;
        --muted: #a1a1aa;
        --border: #1f2937;
        --card: #111214;
        --accent: #f3f4f6;
        --accent-fg: #0b0b0c;
        --shadow: 0 10px 25px rgba(0,0,0,.35);
      }
      input, textarea, select { background: #0f1115; color: var(--fg); }
    }

    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; }
    body{
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      color: var(--fg);
      background: radial-gradient(1200px 1200px at 10% -10%, rgba(99,102,241,.08), transparent 40%),
                  radial-gradient(900px 900px at 120% 10%, rgba(236,72,153,.08), transparent 40%),
                  var(--bg);
      min-height: 100vh;
    }
    .wrap { max-width: 900px; margin: 0 auto; padding: 22px 14px 60px; }

    header{
      position: sticky; top: 0; z-index: 30;
      background: color-mix(in srgb, var(--bg) 92%, transparent);
      backdrop-filter: blur(6px);
      display:flex; align-items:center; justify-content:space-between;
      gap:12px; padding: 10px 0 12px; border-bottom: 1px solid var(--border);
    }
    .brand { display:flex; align-items:center; gap:10px; }
    .logo{
      width:32px; height:32px; border-radius:10px; display:grid; place-items:center;
      background: linear-gradient(135deg,#111,#333);
      color:#fff; font-weight:700; box-shadow: var(--shadow);
    }
    h1{ font-size: 18px; margin:0; letter-spacing:.2px; }
    .who{ font-size: 13px; color: var(--muted); white-space: nowrap; }
    .who a{ color: inherit; }

    .tabs{ display:flex; gap:8px; margin: 12px 0 16px; overflow-x:auto; }
    .tab{
      flex: 0 0 auto;
      text-decoration:none; color: var(--fg);
      border:1px solid var(--border); padding:8px 12px; border-radius: 999px; font-size: 14px;
      background: var(--card);
    }
    .tab.active{ background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }

    .grid{ display:grid; gap:14px; }
    .card{
      background: var(--card); border:1px solid var(--border); border-radius: 16px; padding: 16px; box-shadow: var(--shadow);
    }
    .kicker{ text-transform: uppercase; letter-spacing:.12em; font-size:11px; color: var(--muted); }
    .muted{ color: var(--muted); font-size: 13px; }
    .row{ display:flex; flex-wrap:wrap; gap:10px; }
    a.button, button, input[type=submit]{
      appearance: none; border: none; text-decoration:none; cursor:pointer;
      padding: 10px 14px; border-radius: 12px; font-weight: 600;
      background: var(--accent); color: var(--accent-fg); box-shadow: var(--shadow);
    }
    .secondary{ background: transparent; color: var(--fg); border:1px solid var(--border); }

    form{ display:grid; gap: 12px; }
    label{ font-weight: 600; font-size: 13px; }
    input, textarea, select{
      width:100%; padding: 12px; border:1px solid var(--border); border-radius: 12px; font-size: 14px;
      outline: none;
    }
    textarea{ resize: vertical; min-height: 88px; }
    ul{ list-style:none; margin:0; padding:0; display:grid; gap:10px; }
    li.app{ border:1px solid var(--border); border-radius:14px; padding:14px; background: var(--bg); }
    .pill{ display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; border:1px solid var(--border); font-size:12px; color: var(--muted); }
    .pill .dot{ width:8px; height:8px; border-radius:999px; display:inline-block; }

    .inline-actions{ display:flex; gap:8px; align-items:center; }
    .danger { border:1px solid var(--border); background: transparent; }

    /* Calendar */
    .cal-header{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .cal-title{ font-weight:700; font-size:16px; }
    .cal-nav{ display:flex; gap:8px; }
    .cal-grid{
      display:grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
      margin-top: 10px;
    }
    .cal-dow{ text-align:center; font-size:11px; color: var(--muted); }
    .cal-cell{
      border:1px solid var(--border); border-radius:12px; padding:8px; min-height:56px; position:relative;
      background: var(--bg);
    }
    .cal-cell.out{ opacity:.45; }
    .cal-daynum{ font-size:12px; font-weight:700; }
    .cal-today{ outline: 2px solid color-mix(in srgb, var(--stone) 70%, transparent); border-radius:10px; }
    .cal-dots{ display:flex; gap:4px; margin-top:6px; flex-wrap:wrap; }
    .cal-dot{
      width:8px; height:8px; border-radius:999px;
      outline:1px solid color-mix(in srgb, black 8%, transparent);
    }
    .legend{ display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; }
    .legend .pill{ border-style:dashed; }
    .legend .pill.solid{ border-style:solid; }

    /* Day details area under calendar */
    .day-details{ margin-top: 10px; }
    .empty{ border:1px dashed var(--border); border-radius: 14px; padding: 16px; text-align:center; color: var(--muted); }

    /* Make tap targets comfortable on iPhone 12 mini */
    .tab, .button, button, input[type=submit]{ min-height: 40px; }
    .cal-cell { min-height: 64px; }
  </style>
  ${extraHead}
</head>
<body>
  <div class="wrap">
    <header>
      <div class="brand">
        <div class="logo">AT</div>
        <h1>AdjitTime</h1>
      </div>
      <div class="who">
        ${user ? `Logged in as <strong>${escapeHTML(user.fullName)}</strong> · <a href="/logout">Logout</a>` : `Not logged in`}
      </div>
    </header>
    ${body}
    <div class="footer muted" style="margin-top:18px; text-align:center;">© ${new Date().getFullYear()} AdjitTime</div>
  </div>
  ${afterBody}
</body>
</html>`;
}

// --------- Routes ----------

app.get('/', (_req, res) => res.redirect('/login'));

// Login form
app.get('/login', (_req, res) => {
  const body = `
    <div class="grid">
      <div class="card">
        <div class="kicker">Access</div>
        <h2>Login</h2>
        <form method="POST" action="/login">
          <div>
            <label for="fullName">Full Name</label>
            <input id="fullName" name="fullName" placeholder="Adam Kiernan or Kuljit Dhami" required />
            <div class="muted">Case doesn’t matter. Use full name.</div>
          </div>
          <div>
            <label for="dob">Date of Birth</label>
            <input id="dob" name="dob" type="date" required />
            <div class="muted">Format: YYYY-MM-DD</div>
          </div>
          <input type="submit" value="Log in" />
        </form>
      </div>
    </div>
  `;
  res.send(layoutHTML('Login', body, null));
});

// Login handler
app.post('/login', (req, res) => {
  const rawFull = normalizeName(req.body.fullName || '');
  const rawDob = (req.body.dob || '').trim();

  const user = USERS.find(
    (u) => normalizeName(u.fullName) === rawFull && u.dob === rawDob
  );

  if (!user) {
    const body = `
      <div class="grid">
        <div class="card">
          <h2>Login failed</h2>
          <p class="muted">Make sure you entered your full name and exact date of birth.</p>
          <a class="button secondary" href="/login">Try again</a>
        </div>
      </div>
    `;
    return res.send(layoutHTML('Login failed', body, null));
  }

  res.cookie('adjit_user', user.slug, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.redirect('/dashboard');
});

// Logout
app.get('/logout', (req, res) => {
  res.clearCookie('adjit_user');
  res.redirect('/login');
});

// Dashboard (Calendar + Agenda + Create)
app.get('/dashboard', requireLogin, (req, res) => {
  const user = req.user;
  const tab = req.query.tab === 'request' ? 'request' : (req.query.tab === 'calendar' ? 'calendar' : 'mine');

  // -------- Calendar tab (client-rendered) --------
  const calendarSection = `
    <div class="card">
      <div class="cal-header">
        <div class="cal-title" id="calTitle">Calendar</div>
        <div class="cal-nav">
          <button class="secondary" id="prevBtn" aria-label="Previous month">◀</button>
          <button class="secondary" id="todayBtn">Today</button>
          <button class="secondary" id="nextBtn" aria-label="Next month">▶</button>
        </div>
      </div>
      <div class="cal-grid" id="dowRow"></div>
      <div class="cal-grid" id="calGrid"></div>
      <div class="legend">
        <span class="pill solid"><span class="dot" style="background: var(--stone)"></span> Set in stone</span>
        <span class="pill"><span class="dot" style="background: var(--pencil)"></span> Set in pencil</span>
      </div>
      <div class="day-details" id="dayDetails"></div>
    </div>
  `;

  // -------- Agenda/List tab --------
  // Build appointment list (newest first)
  let listHTML = '';
  if (APPOINTMENTS.length === 0) {
    listHTML = `<div class="empty">No appointments yet. Create one in “Formal request for possession”.</div>`;
  } else {
    const ordered = [...APPOINTMENTS].sort((a, b) => b.id - a.id);
    listHTML = '<ul>';
    for (const appt of ordered) {
      const who = USERS.find((u) => u.slug === appt.createdBySlug)?.fullName || appt.createdBySlug;
      const human = toHumanLocal(appt.startAtISO);
      const statusPill = appt.status === 'stone'
        ? `<span class="pill"><span class="dot" style="background: var(--stone)"></span> set in stone</span>`
        : `<span class="pill"><span class="dot" style="background: var(--pencil)"></span> set in pencil</span>`;
      listHTML += `
        <li class="app">
          <div class="inline-actions" style="justify-content: space-between;">
            <div style="display:flex; gap:8px; align-items:center;">
              <strong>${escapeHTML(appt.title)}</strong>
              ${statusPill}
            </div>
            <form method="POST" action="/appointments/delete" onsubmit="return confirm('Delete this appointment?')">
              <input type="hidden" name="id" value="${appt.id}" />
              <button class="secondary danger" title="Delete">Delete</button>
            </form>
          </div>
          <div class="muted" style="margin-top:6px;">When: ${human} · Duration: ${appt.durationMins} mins</div>
          ${appt.note ? `<div style="margin-top:6px">${escapeHTML(appt.note)}</div>` : ``}
          <div class="muted" style="margin-top:6px">Created by ${escapeHTML(who)} · ${toHumanLocal(appt.createdAtISO)}</div>
        </li>
      `;
    }
    listHTML += '</ul>';
  }

  const agendaSection = `<div class="card"><div class="kicker">Appointments</div><h2>You're mine bitch</h2>${listHTML}</div>`;

  // -------- Create tab --------
  const formSection = `
    <div class="card">
      <div class="kicker">Create</div>
      <h2>Formal request for possession</h2>
      <form method="POST" action="/appointments/create">
        <div>
          <label for="title">Title</label>
          <input id="title" name="title" placeholder="e.g., Movie at 8" required />
        </div>
        <div>
          <label for="startAt">Date & Time</label>
          <input id="startAt" name="startAt" type="datetime-local" required />
          <div class="muted">Your device time zone will be used.</div>
        </div>
        <div>
          <label for="durationMins">Duration (minutes)</label>
          <input id="durationMins" name="durationMins" type="number" value="60" min="1" required />
        </div>
        <div>
          <label for="status">Status</label>
          <select id="status" name="status" required>
            <option value="stone">Set in stone</option>
            <option value="pencil">Set in pencil</option>
          </select>
        </div>
        <div>
          <label for="note">Note (optional)</label>
          <textarea id="note" name="note" rows="3" placeholder="Add any details…"></textarea>
        </div>
        <input type="submit" value="Create appointment" />
      </form>
    </div>
  `;

  // Tabs
  const tabsHTML = `
    <div class="tabs">
      <a class="tab ${tab === 'calendar' ? 'active' : ''}" href="/dashboard?tab=calendar">Calendar</a>
      <a class="tab ${tab === 'mine' ? 'active' : ''}" href="/dashboard?tab=mine">You're mine bitch</a>
      <a class="tab ${tab === 'request' ? 'active' : ''}" href="/dashboard?tab=request">Formal request for possession</a>
    </div>
  `;

  const content = `
    ${tabsHTML}
    <div class="grid">
      ${
        tab === 'calendar'
          ? calendarSection
          : tab === 'mine'
            ? agendaSection
            : formSection
      }
    </div>
  `;

  // Embed appointments + users for client calendar (safe string)
  const safeAppts = JSON.stringify(APPOINTMENTS).replace(/</g, '\\u003c');
  const safeUsers = JSON.stringify(USERS).replace(/</g, '\\u003c');
  const safeMe = JSON.stringify(user.slug);

  const afterBody = `
<script>
(function(){
  // State from server
  const APPTS = ${safeAppts};
  const USERS = ${safeUsers};
  const ME = ${safeMe};

  // Helpers (client)
  const fmtDayKey = (d) => {
    const y = d.getFullYear();
    const m = (d.getMonth()+1).toString().padStart(2,'0');
    const day = d.getDate().toString().padStart(2,'0');
    return \`\${y}-\${m}-\${day}\`;
  };
  const sameDay = (aDate, bDate) => {
    return aDate.getFullYear()===bDate.getFullYear() &&
           aDate.getMonth()===bDate.getMonth() &&
           aDate.getDate()===bDate.getDate();
  };
  const toLocalHuman = (iso) => {
    try{
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined,{
        weekday:'short', year:'numeric', month:'short', day:'2-digit',
        hour:'2-digit', minute:'2-digit'
      });
    }catch{ return iso; }
  };
  const byStartTime = (a,b) => new Date(a.startAtISO) - new Date(b.startAtISO);

  // Calendar DOM nodes
  const isCalendar = document.getElementById('calGrid') !== null;
  if(!isCalendar) return; // user on other tab

  const calTitle = document.getElementById('calTitle');
  const dowRow = document.getElementById('dowRow');
  const grid = document.getElementById('calGrid');
  const dayDetails = document.getElementById('dayDetails');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const todayBtn = document.getElementById('todayBtn');

  // Build DOW header (Mon-Sun)
  const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  DOW.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = d;
    dowRow.appendChild(el);
  });

  let viewDate = new Date(); // current month
  const firstDayOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const daysInMonth = (y,m) => new Date(y, m+1, 0).getDate();

  function buildMonthMatrix(baseDate){
    // Start with first of month
    const first = firstDayOfMonth(baseDate);
    // Convert JS Sunday(0) start to Monday(1) start index
    let weekday = first.getDay(); // 0-6 (Sun-Sat)
    if (weekday === 0) weekday = 7; // treat Sunday as 7
    const lead = weekday - 1; // days to fill from previous month

    const totalCells = 42; // 6 weeks grid
    const matrix = [];
    // Start date = first day minus lead
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
    for(let i=0;i<totalCells;i++){
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate()+i);
      matrix.push(d);
    }
    return matrix;
  }

  function render(){
    // Title
    const titleDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    calTitle.textContent = titleDate.toLocaleDateString(undefined,{ month:'long', year:'numeric' });

    // Build calendar day -> appts mapping
    const map = new Map(); // key: YYYY-MM-DD -> array of appts
    APPTS.forEach(a => {
      const d = new Date(a.startAtISO);
      if (isNaN(d.getTime())) return;
      const key = fmtDayKey(d);
      if(!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });

    // Grid
    grid.innerHTML = '';
    const today = new Date();
    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();
    const cells = buildMonthMatrix(viewDate);

    cells.forEach(d => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cal-cell';
      if (d.getMonth() !== month) cell.classList.add('out');
      if (sameDay(d, today)) cell.classList.add('cal-today');

      const num = document.createElement('div');
      num.className = 'cal-daynum';
      num.textContent = d.getDate();
      cell.appendChild(num);

      const dots = document.createElement('div');
      dots.className = 'cal-dots';

      const key = fmtDayKey(d);
      const list = (map.get(key) || []).slice().sort(byStartTime);
      // Up to 3 dots (stone then pencil)
      const stones = list.filter(a => a.status === 'stone');
      const pencils = list.filter(a => a.status === 'pencil');
      const addDot = (color) => {
        const dot = document.createElement('span');
        dot.className = 'cal-dot';
        dot.style.background = color;
        dots.appendChild(dot);
      };
      stones.slice(0,3).forEach(()=>addDot('var(--stone)'));
      if (stones.length < 3) {
        pencils.slice(0, 3 - stones.length).forEach(()=>addDot('var(--pencil)'));
      }

      if (list.length) cell.appendChild(dots);

      cell.addEventListener('click', () => showDayDetails(d, list));
      grid.appendChild(cell);
    });

    // Default select: today (if in month) or first day of this month
    const defaultKey = fmtDayKey(today);
    if (cells.some(c => fmtDayKey(c) === defaultKey && c.getMonth() === month)) {
      showDayDetails(today, map.get(defaultKey)||[]);
    } else {
      const first = new Date(year, month, 1);
      const key = fmtDayKey(first);
      showDayDetails(first, map.get(key)||[]);
    }
  }

  function showDayDetails(date, items){
    dayDetails.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'kicker';
    h.textContent = 'Day';
    const title = document.createElement('h2');
    title.style.margin = '4px 0 10px 0';
    title.textContent = date.toLocaleDateString(undefined,{ weekday:'long', year:'numeric', month:'long', day:'numeric' });
    dayDetails.appendChild(h);
    dayDetails.appendChild(title);

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No appointments on this day.';
      dayDetails.appendChild(empty);
      return;
    }

    const ul = document.createElement('ul');
    items.slice().sort(byStartTime).forEach(appt => {
      const li = document.createElement('li');
      li.className = 'app';

      const top = document.createElement('div');
      top.className = 'inline-actions';
      top.style.justifyContent = 'space-between';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.gap = '8px';
      left.style.alignItems = 'center';

      const strong = document.createElement('strong');
      strong.textContent = appt.title;

      const pill = document.createElement('span');
      pill.className = 'pill';
      const dot = document.createElement('span');
      dot.className = 'dot';
      if (appt.status === 'stone') dot.style.background = 'var(--stone)'; else dot.style.background = 'var(--pencil)';
      const text = document.createTextNode(appt.status === 'stone' ? ' set in stone' : ' set in pencil');
      pill.appendChild(dot); pill.appendChild(text);

      left.appendChild(strong);
      left.appendChild(pill);
      top.appendChild(left);

      // Delete form
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/appointments/delete';
      form.onsubmit = () => confirm('Delete this appointment?');
      const hid = document.createElement('input');
      hid.type = 'hidden';
      hid.name = 'id';
      hid.value = String(appt.id);
      const btn = document.createElement('button');
      btn.className = 'secondary danger';
      btn.textContent = 'Delete';
      form.appendChild(hid);
      form.appendChild(btn);
      top.appendChild(form);

      const meta = document.createElement('div');
      meta.className = 'muted';
      meta.style.marginTop = '6px';
      meta.textContent = 'When: ' + toLocalHuman(appt.startAtISO) + ' · Duration: ' + appt.durationMins + ' mins';

      const note = appt.note ? (()=>{
        const d = document.createElement('div');
        d.style.marginTop = '6px';
        d.textContent = appt.note;
        return d;
      })() : null;

      const who = document.createElement('div');
      who.className = 'muted';
      who.style.marginTop = '6px';
      const creator = USERS.find(u=>u.slug===appt.createdBySlug)?.fullName || appt.createdBySlug;
      who.textContent = 'Created by ' + creator + ' · ' + toLocalHuman(appt.createdAtISO);

      li.appendChild(top);
      li.appendChild(meta);
      if (note) li.appendChild(note);
      li.appendChild(who);
      ul.appendChild(li);
    });
    dayDetails.appendChild(ul);
  }

  prevBtn.addEventListener('click', ()=>{ viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()-1, 1); render(); });
  nextBtn.addEventListener('click', ()=>{ viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 1); render(); });
  todayBtn.addEventListener('click', ()=>{ viewDate = new Date(); render(); });

  render();
})();
</script>
  `;

  res.send(layoutHTML('Dashboard', content, user, '', afterBody));
});

// Create appointment
app.post('/appointments/create', requireLogin, (req, res) => {
  const user = req.user;
  const title = (req.body.title || '').trim();
  const startAtRaw = (req.body.startAt || '').trim();
  const durationMinsRaw = String(req.body.durationMins || '').trim();
  const status = (req.body.status === 'pencil') ? 'pencil' : 'stone';
  const note = (req.body.note || '').trim();

  if (!title || !startAtRaw) {
    const body = `
      <div class="grid">
        <div class="card">
          <h2>Missing info</h2>
          <p class="muted">Please provide a title and a date/time.</p>
          <a class="button secondary" href="/dashboard?tab=request">Back</a>
        </div>
      </div>
    `;
    return res.send(layoutHTML('Error', body, user));
  }

  // Convert datetime-local → ISO (assumes user's local timezone)
  const startDate = new Date(startAtRaw);
  const startAtISO = isNaN(startDate.getTime()) ? startAtRaw : startDate.toISOString();
  const durationMins = Math.max(1, parseInt(durationMinsRaw || '60', 10) || 60);

  const appt = {
    id: nextId++,
    title: escapeHTML(title),
    startAtISO,
    durationMins,
    status,
    note, // escaped on render where needed
    createdBySlug: user.slug,
    createdAtISO: new Date().toISOString(),
  };

  APPOINTMENTS.push(appt);
  // Return to Agenda so it's obvious it was added; Calendar will also show it
  res.redirect('/dashboard?tab=mine');
});

// Delete appointment
app.post('/appointments/delete', requireLogin, (req, res) => {
  const id = parseInt((req.body.id || '').trim(), 10);
  if (Number.isInteger(id)) {
    APPOINTMENTS = APPOINTMENTS.filter(a => a.id !== id);
  }
  res.redirect('/dashboard?tab=mine');
});

// --------- Start ----------
app.listen(PORT, () => {
  console.log(`✅ AdjitTime running at http://localhost:${PORT}`);
});
