// AdjitTime — Calendar + Agenda + Create + Criticism Page (notes)
// - Full-name + DOB login -> cookie (7 days)
// - Tabs: Calendar (read-only), "You're mine bitch" (agenda), "Formal request for possession" (create), "I can deal with criticism" (notes)
// - Appointments: status stone/pencil, creator shown, creator-only delete (server enforced)
// - Notes: either user can add; listed newest-first (in-memory)

const express = require('express');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---- Users (hardcoded) ----
const USERS = [
  { id: 1, fullName: 'Adam Kiernan', slug: 'adam', dob: '2001-02-11' },
  { id: 2, fullName: 'Kuljit Dhami', slug: 'kuljit', dob: '1994-12-09' },
];

// appointment: { id, title, startAtISO, durationMins, status: 'stone'|'pencil', note, createdBySlug, createdAtISO }
let APPOINTMENTS = [];
let nextApptId = 1;

// note: { id, content, createdBySlug, createdAtISO }
let NOTES = [];
let nextNoteId = 1;

// ---- Helpers ----
function getUserFromCookie(req) {
  const slug = req.cookies?.adjit_user;
  if (!slug) return null;
  return USERS.find(u => u.slug === slug) || null;
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
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}
function toHumanLocal(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      weekday: 'short', year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return iso; }
}

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
      /* Inviting palette with clear contrast */
      --bg: #faf9ff;
      --fg: #0b0b0c;
      --muted: #6b7280;
      --border: #e6e6f0;
      --card: #ffffff;
      --accent: #6d28d9;
      --accent-fg: #ffffff;
      --shadow: 0 10px 25px rgba(0,0,0,.06);

      /* Status colors */
      --stone: #2563eb;      /* blue for "set in stone" */
      --pencil: #9ca3af;     /* gray for "set in pencil" */

      /* Creator badges */
      --adam: #8b5cf6;       /* violet */
      --kuljit: #f59e0b;     /* amber */
    }
    @media (prefers-color-scheme: dark) {
      :root{
        --bg: #0c0c12;
        --fg: #f3f4f6;
        --muted: #a1a1aa;
        --border: #1f2330;
        --card: #0f1117;
        --accent: #a78bfa;
        --accent-fg: #0b0b0c;
        --shadow: 0 10px 25px rgba(0,0,0,.35);
      }
      input, textarea, select { background: #0f1117; color: var(--fg); }
    }

    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; }
    body{
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      color: var(--fg);
      background:
        radial-gradient(1100px 700px at 10% -10%, rgba(109,40,217,.10), transparent 40%),
        radial-gradient(1000px 900px at 120% 15%, rgba(99,102,241,.10), transparent 45%),
        var(--bg);
      min-height: 100vh;
    }
    .wrap { max-width: 900px; margin: 0 auto; padding: 18px 12px 56px; }

    header{
      position: sticky; top: 0; z-index: 30;
      background: color-mix(in srgb, var(--bg) 92%, transparent);
      backdrop-filter: blur(6px);
      display:flex; align-items:center; justify-content:space-between; gap:12px;
      padding: 10px 0 12px; border-bottom: 1px solid var(--border);
    }
    .brand { display:flex; align-items:center; gap:10px; }
    .logo{
      width:32px; height:32px; border-radius:10px; display:grid; place-items:center;
      background: linear-gradient(135deg,#111,#333); color:#fff; font-weight:700; box-shadow: var(--shadow);
    }
    h1{ font-size: 18px; margin:0; letter-spacing:.2px; }
    .who{ font-size: 13px; color: var(--muted); white-space: nowrap; }
    .who a{ color: inherit; }

    .tabs{ display:flex; gap:8px; margin: 12px 0 16px; overflow-x:auto; }
    .tab{
      flex: 0 0 auto;
      text-decoration:none; color: var(--fg);
      border:1px solid var(--border); padding:10px 14px; border-radius: 999px; font-size: 14px;
      background: var(--card);
      min-height: 44px;
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
      appearance: none; border: 1px solid transparent; text-decoration:none; cursor:pointer;
      padding: 12px 14px; border-radius: 12px; font-weight: 600;
      background: var(--accent); color: var(--accent-fg); box-shadow: var(--shadow);
      min-height: 44px;
    }
    .secondary{ background: transparent; color: var(--fg); border-color: var(--border); }

    form{ display:grid; gap: 12px; }
    label{ font-weight: 600; font-size: 13px; }
    input, textarea, select{
      width:100%; padding: 12px; border:1px solid var(--border); border-radius: 12px; font-size: 14px; outline: none;
      min-height: 44px;
    }
    textarea{ resize: vertical; min-height: 88px; }

    ul{ list-style:none; margin:0; padding:0; display:grid; gap:10px; }
    li.app{ border:1px solid var(--border); border-radius:14px; padding:14px; background: var(--bg); }

    .pill{ display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; border:1px solid var(--border); font-size:12px; color: var(--muted); background: color-mix(in srgb, var(--card) 80%, transparent); }
    .pill .dot{ width:8px; height:8px; border-radius:999px; display:inline-block; }

    .creator{ display:inline-flex; align-items:center; gap:6px; padding:3px 8px; border-radius:999px; font-size:12px; color:#fff; }
    .creator.adam{ background: var(--adam); }
    .creator.kuljit{ background: var(--kuljit); }

    .inline-actions{ display:flex; gap:8px; align-items:center; }
    .danger { background: transparent; color: var(--fg); border-color: var(--border); }

    /* Calendar */
    .cal-header{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .cal-title{ font-weight:700; font-size:16px; }
    .cal-nav{ display:flex; gap:8px; }
    .cal-row{ display:grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-top: 10px; }
    .cal-dow{ text-align:center; font-size:12px; color: var(--muted); font-weight: 700; padding: 6px 0; }
    .cal-grid{ display:grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
    .cal-cell{
      display:flex; flex-direction: column; align-items:flex-start; justify-content:flex-start;
      border:1px solid var(--border); border-radius:12px; padding:8px; min-height:66px; background: var(--card);
      color: var(--fg);
    }
    .cal-daynum{ font-size:14px; font-weight:800; line-height:1; color: var(--fg); }
    .cal-out .cal-daynum{ opacity:.58; }
    .cal-today{ outline: 2px solid color-mix(in srgb, var(--stone) 70%, transparent); border-radius:10px; }
    .cal-dots{ display:flex; gap:4px; margin-top:6px; flex-wrap:wrap; }
    .cal-dot{ width:9px; height:9px; border-radius:999px; outline:1px solid color-mix(in srgb, black 8%, transparent); }

    .legend{ display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; }
    .legend .pill{ border-style:dashed; }
    .legend .pill.solid{ border-style:solid; }

    .day-details{ margin-top: 12px; }
    .empty{ border:1px dashed var(--border); border-radius: 14px; padding: 16px; text-align:center; color: var(--muted); }
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
    <div class="muted" style="margin-top:18px; text-align:center;">© ${new Date().getFullYear()} AdjitTime</div>
  </div>
  ${afterBody}
</body>
</html>`;
}

// ---- Routes ----
app.get('/', (_req, res) => res.redirect('/login'));

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

app.post('/login', (req, res) => {
  const rawFull = normalizeName(req.body.fullName || '');
  const rawDob = (req.body.dob || '').trim();
  const user = USERS.find(u => normalizeName(u.fullName) === rawFull && u.dob === rawDob);
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
  res.cookie('adjit_user', user.slug, { httpOnly: true, sameSite: 'lax', maxAge: 7*24*60*60*1000 });
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  res.clearCookie('adjit_user');
  res.redirect('/login');
});

app.get('/dashboard', requireLogin, (req, res) => {
  const user = req.user;
  const tab = (req.query.tab === 'calendar')
    ? 'calendar'
    : (req.query.tab === 'request')
      ? 'request'
      : (req.query.tab === 'criticism')
        ? 'criticism'
        : 'mine';

  // ----- Calendar section -----
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
      <div class="cal-row" id="dowRow"></div>
      <div class="cal-grid" id="calGrid"></div>
      <div class="legend">
        <span class="pill solid"><span class="dot" style="background: var(--stone)"></span> Set in stone</span>
        <span class="pill"><span class="dot" style="background: var(--pencil)"></span> Set in pencil</span>
      </div>
      <div class="day-details" id="dayDetails"></div>
    </div>
  `;

  // ----- Agenda section -----
  let listHTML = '';
  if (APPOINTMENTS.length === 0) {
    listHTML = `<div class="empty">No appointments yet. Create one in “Formal request for possession”.</div>`;
  } else {
    const ordered = [...APPOINTMENTS].sort((a, b) => b.id - a.id);
    listHTML = '<ul>';
    for (const appt of ordered) {
      const whoUser = USERS.find(u => u.slug === appt.createdBySlug);
      const whoChip = whoUser ? `<span class="creator ${whoUser.slug}">${whoUser.fullName}</span>` : '';
      const human = toHumanLocal(appt.startAtISO);
      const statusPill = appt.status === 'stone'
        ? `<span class="pill"><span class="dot" style="background: var(--stone)"></span> set in stone</span>`
        : `<span class="pill"><span class="dot" style="background: var(--pencil)"></span> set in pencil</span>`;
      const showDelete = appt.createdBySlug === user.slug;

      listHTML += `
        <li class="app">
          <div class="inline-actions" style="justify-content: space-between;">
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <strong>${escapeHTML(appt.title)}</strong>
              ${statusPill}
              ${whoChip}
            </div>
            ${showDelete ? `
              <form method="POST" action="/appointments/delete" onsubmit="return confirm('Delete this appointment?')">
                <input type="hidden" name="id" value="${appt.id}" />
                <button class="secondary danger" title="Delete">Delete</button>
              </form>` : ``}
          </div>
          <div class="muted" style="margin-top:6px;">When: ${human} · Duration: ${appt.durationMins} mins</div>
          ${appt.note ? `<div style="margin-top:6px">${escapeHTML(appt.note)}</div>` : ``}
          <div class="muted" style="margin-top:6px">Created at ${toHumanLocal(appt.createdAtISO)}</div>
        </li>
      `;
    }
    listHTML += '</ul>';
  }
  const agendaSection = `<div class="card"><div class="kicker">Appointments</div><h2>You're mine bitch</h2>${listHTML}</div>`;

  // ----- Create section -----
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

  // ----- Criticism (notes) section -----
  let notesHTML = '';
  if (NOTES.length === 0) {
    notesHTML = `<div class="empty">No notes yet. Add your ideas, complaints, or wild feature requests below.</div>`;
  } else {
    const orderedNotes = [...NOTES].sort((a,b) => b.id - a.id);
    notesHTML = '<ul>';
    for (const n of orderedNotes) {
      const whoUser = USERS.find(u => u.slug === n.createdBySlug);
      const whoChip = whoUser ? `<span class="creator ${whoUser.slug}">${whoUser.fullName}</span>` : '';
      notesHTML += `
        <li class="app">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <strong>Note</strong> ${whoChip}
            </div>
            <div class="muted">${toHumanLocal(n.createdAtISO)}</div>
          </div>
          <div style="margin-top:8px; white-space:pre-wrap;">${escapeHTML(n.content)}</div>
        </li>
      `;
    }
    notesHTML += '</ul>';
  }

  const criticismSection = `
    <div class="card">
      <div class="kicker">Feedback</div>
      <h2>I can deal with criticism</h2>
      <form method="POST" action="/feedback/create">
        <div>
          <label for="content">Add a note</label>
          <textarea id="content" name="content" rows="4" placeholder="Tell us what would make this app better…" required></textarea>
        </div>
        <input type="submit" value="Add note" />
      </form>
    </div>
    <div class="card">
      <div class="kicker">Notes</div>
      ${notesHTML}
    </div>
  `;

  // ----- Tabs -----
  const tabsHTML = `
    <div class="tabs">
      <a class="tab ${tab === 'calendar' ? 'active' : ''}" href="/dashboard?tab=calendar">Calendar</a>
      <a class="tab ${tab === 'mine' ? 'active' : ''}" href="/dashboard?tab=mine">You're mine bitch</a>
      <a class="tab ${tab === 'request' ? 'active' : ''}" href="/dashboard?tab=request">Formal request for possession</a>
      <a class="tab ${tab === 'criticism' ? 'active' : ''}" href="/dashboard?tab=criticism">I can deal with criticism</a>
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
            : tab === 'request'
              ? formSection
              : criticismSection
      }
    </div>
  `;

  // embed data for client calendar
  const safeAppts = JSON.stringify(APPOINTMENTS).replace(/</g, '\\u003c');
  const safeUsers = JSON.stringify(USERS).replace(/</g, '\\u003c');
  const safeMe = JSON.stringify(user.slug);

  const afterBody = `
<script>
(function(){
  const APPTS = ${safeAppts};
  const USERS = ${safeUsers};
  const ME = ${safeMe};

  // Only run calendar logic on the calendar tab
  const grid = document.getElementById('calGrid');
  if (!grid) return;

  const dowRow = document.getElementById('dowRow');
  const titleEl = document.getElementById('calTitle');
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
    document.getElementById('dowRow').appendChild(el);
  });

  const fmtDayKey = (d) => {
    const y = d.getFullYear();
    const m = (d.getMonth()+1).toString().padStart(2,'0');
    const day = d.getDate().toString().padStart(2,'0');
    return \`\${y}-\${m}-\${day}\`;
  };
  const sameDay = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  const toLocalHuman = (iso) => {
    try { const d = new Date(iso); if (isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined,{ weekday:'short', year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    } catch { return iso; }
  };
  const byStart = (a,b) => new Date(a.startAtISO) - new Date(b.startAtISO);

  let viewDate = new Date();

  function firstOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function buildMatrix(base) {
    const first = firstOfMonth(base);
    let wd = first.getDay(); if (wd===0) wd=7; // Sun->7
    const lead = wd-1;
    const total = 42;
    const start = new Date(first.getFullYear(), first.getMonth(), 1-lead);
    const cells = [];
    for (let i=0;i<total;i++){
      cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate()+i));
    }
    return cells;
  }

  function render(){
    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();
    titleEl.textContent = new Date(year, month, 1).toLocaleDateString(undefined,{ month:'long', year:'numeric' });

    // Map day -> items
    const map = new Map();
    APPTS.forEach(a => {
      const d = new Date(a.startAtISO);
      if (isNaN(d.getTime())) return;
      const key = fmtDayKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });

    grid.innerHTML = '';
    const today = new Date();
    const cells = buildMatrix(viewDate);

    cells.forEach(d => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cal-cell';
      if (d.getMonth() !== month) cell.classList.add('cal-out');
      if (sameDay(d, today)) cell.classList.add('cal-today');

      const num = document.createElement('div');
      num.className = 'cal-daynum';
      num.textContent = d.getDate();
      cell.appendChild(num);

      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'cal-dots';

      const key = fmtDayKey(d);
      const list = (map.get(key) || []).slice().sort(byStart);

      const stones = list.filter(a=>a.status==='stone');
      const pencils = list.filter(a=>a.status==='pencil');

      const addDot = (color) => {
        const dot = document.createElement('span');
        dot.className = 'cal-dot';
        dot.style.background = color;
        dotsWrap.appendChild(dot);
      };
      stones.slice(0,3).forEach(()=>addDot('var(--stone)'));
      if (stones.length < 3) {
        pencils.slice(0, 3 - stones.length).forEach(()=>addDot('var(--pencil)'));
      }
      if (list.length) cell.appendChild(dotsWrap);

      cell.addEventListener('click', ()=> showDay(d, list));
      grid.appendChild(cell);
    });

    // Auto-select today if visible, else first of month
    const todayKey = fmtDayKey(today);
    const hasToday = cells.some(c => fmtDayKey(c)===todayKey && c.getMonth()===month);
    showDay(hasToday ? today : new Date(year, month, 1), map.get(hasToday ? todayKey : fmtDayKey(new Date(year,month,1))) || []);
  }

  function showDay(date, items){
    const container = dayDetails;
    container.innerHTML = '';
    const h = document.createElement('div'); h.className='kicker'; h.textContent='Day';
    const t = document.createElement('h2'); t.style.margin='4px 0 10px 0';
    t.textContent = date.toLocaleDateString(undefined,{ weekday:'long', year:'numeric', month:'long', day:'numeric' });
    container.appendChild(h); container.appendChild(t);

    if (!items.length) {
      const empty = document.createElement('div'); empty.className='empty'; empty.textContent='No appointments on this day.'; container.appendChild(empty); return;
    }

    const ul = document.createElement('ul');
    items.slice().sort(byStart).forEach(appt => {
      const li = document.createElement('li'); li.className='app';

      const whoUser = USERS.find(u=>u.slug===appt.createdBySlug);
      const whoChip = document.createElement('span');
      whoChip.className = 'creator ' + (whoUser ? whoUser.slug : '');
      whoChip.textContent = whoUser ? whoUser.fullName : appt.createdBySlug;

      const top = document.createElement('div'); top.className='inline-actions'; top.style.justifyContent='space-between';
      const left = document.createElement('div'); left.style.display='flex'; left.style.gap='8px'; left.style.alignItems='center'; left.style.flexWrap='wrap';

      const strong = document.createElement('strong'); strong.textContent = appt.title;

      const pill = document.createElement('span'); pill.className='pill';
      const dot = document.createElement('span'); dot.className='dot';
      dot.style.background = (appt.status==='stone') ? 'var(--stone)' : 'var(--pencil)';
      pill.appendChild(dot); pill.appendChild(document.createTextNode(appt.status==='stone' ? ' set in stone' : ' set in pencil'));

      left.appendChild(strong);
      left.appendChild(pill);
      left.appendChild(whoChip);
      top.appendChild(left);

      if (appt.createdBySlug === ME) {
        const form = document.createElement('form'); form.method='POST'; form.action='/appointments/delete'; form.onsubmit=()=>confirm('Delete this appointment?');
        const hid = document.createElement('input'); hid.type='hidden'; hid.name='id'; hid.value=String(appt.id);
        const btn = document.createElement('button'); btn.className='secondary danger'; btn.textContent='Delete';
        form.appendChild(hid); form.appendChild(btn);
        top.appendChild(form);
      }

      const meta = document.createElement('div'); meta.className='muted'; meta.style.marginTop='6px';
      meta.textContent = 'When: ' + toLocalHuman(appt.startAtISO) + ' · Duration: ' + appt.durationMins + ' mins';

      if (appt.note) {
        const note = document.createElement('div'); note.style.marginTop='6px'; note.textContent = appt.note;
        li.appendChild(top); li.appendChild(meta); li.appendChild(note);
      } else {
        li.appendChild(top); li.appendChild(meta);
      }
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  document.getElementById('prevBtn').addEventListener('click', ()=>{ viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()-1, 1); render(); });
  document.getElementById('nextBtn').addEventListener('click', ()=>{ viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 1); render(); });
  document.getElementById('todayBtn').addEventListener('click', ()=>{ viewDate = new Date(); render(); });

  render();
})();
</script>
  `;

  res.send(layoutHTML('Dashboard', content, user, '', afterBody));
});

// ---- Create appointment ----
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

  const startDate = new Date(startAtRaw);
  const startAtISO = isNaN(startDate.getTime()) ? startAtRaw : startDate.toISOString();
  const durationMins = Math.max(1, parseInt(durationMinsRaw || '60', 10) || 60);

  const appt = {
    id: nextApptId++,
    title: escapeHTML(title),
    startAtISO,
    durationMins,
    status,
    note,
    createdBySlug: user.slug,
    createdAtISO: new Date().toISOString(),
  };

  APPOINTMENTS.push(appt);
  res.redirect('/dashboard?tab=mine');
});

// ---- Delete appointment (creator only) ----
app.post('/appointments/delete', requireLogin, (req, res) => {
  const user = req.user;
  const id = parseInt((req.body.id || '').trim(), 10);
  if (Number.isInteger(id)) {
    const appt = APPOINTMENTS.find(a => a.id === id);
    if (appt && appt.createdBySlug === user.slug) {
      APPOINTMENTS = APPOINTMENTS.filter(a => a.id !== id);
    }
  }
  res.redirect('/dashboard?tab=mine');
});

// ---- Create feedback note ----
app.post('/feedback/create', requireLogin, (req, res) => {
  const user = req.user;
  const content = (req.body.content || '').trim();
  if (!content) {
    const body = `
      <div class="grid">
        <div class="card">
          <h2>Missing note</h2>
          <p class="muted">Please write something before submitting.</p>
          <a class="button secondary" href="/dashboard?tab=criticism">Back</a>
        </div>
      </div>
    `;
    return res.send(layoutHTML('Error', body, user));
  }

  NOTES.push({
    id: nextNoteId++,
    content,
    createdBySlug: user.slug,
    createdAtISO: new Date().toISOString(),
  });

  res.redirect('/dashboard?tab=criticism');
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`✅ AdjitTime running at http://localhost:${PORT}`);
});
