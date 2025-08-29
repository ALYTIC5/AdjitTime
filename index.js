// AdjitTime — Full-name login only (Express + cookie, no DB)
// - Root redirects to /login (no pre-login content)
// - Login requires Full Name + DOB
//   * Full name must be "Adam Kiernan" or "Kuljit Dhami" (case/spacing-insensitive)
//   * DOB must be exact: Adam 2001-02-11, Kuljit 1994-12-09
// - Cookie session (7 days)
// - Dashboard with two tabs:
//    * "You're mine bitch"  (list + delete)
//    * "Formal request for possession" (create; duration default 60)
// - Minimal, modern UI with inline CSS

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

// appointment: { id, title, startAtISO, durationMins, note, createdBySlug, createdAtISO }
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
  // Lowercase, collapse internal whitespace to single spaces, trim ends
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function layoutHTML(title, body, user = null) {
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
      --fg: #0f0f0f;
      --muted: #6b7280;
      --border: #e5e7eb;
      --card: #fbfbfb;
      --accent: #111111;
      --accent-fg: #ffffff;
      --shadow: 0 10px 25px rgba(0,0,0,.06);
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
      input, textarea { background: #0f1115; color: var(--fg); }
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
    .wrap { max-width: 900px; margin: 0 auto; padding: 28px 18px 60px; }
    header{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 18px; }
    .brand { display:flex; align-items:center; gap:10px; }
    .logo{ width:32px; height:32px; border-radius:10px; display:grid; place-items:center; background: linear-gradient(135deg,#111,#333); color:#fff; font-weight:700; box-shadow: var(--shadow); }
    h1{ font-size: 18px; margin:0; letter-spacing:.2px; }
    .who{ font-size: 14px; color: var(--muted); }
    .who a{ color: inherit; }
    .grid{ display:grid; gap:14px; }
    .row{ display:flex; flex-wrap:wrap; gap:10px; }
    .card{ background: var(--card); border:1px solid var(--border); border-radius: 16px; padding: 18px; box-shadow: var(--shadow); }
    .card h2{ margin: 0 0 8px 0; font-size: 16px; }
    .muted{ color: var(--muted); font-size: 13px; }
    .tabs{ display:flex; gap:10px; margin: 8px 0 12px; flex-wrap: wrap; }
    .tab{ text-decoration:none; color: var(--fg); border:1px solid var(--border); padding:8px 12px; border-radius: 999px; font-size: 14px; transition: transform .05s ease; background: var(--card); }
    .tab:hover{ transform: translateY(-1px); }
    .tab.active{ background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    a.button, button, input[type=submit]{ appearance: none; border: none; text-decoration:none; cursor:pointer; padding: 10px 14px; border-radius: 12px; font-weight: 600; background: var(--accent); color: var(--accent-fg); box-shadow: var(--shadow); }
    a.button.secondary, button.secondary, input.secondary{ background: transparent; color: var(--fg); border:1px solid var(--border); }
    form{ display:grid; gap: 12px; }
    label{ font-weight: 600; font-size: 13px; }
    input, textarea, select{ width:100%; padding: 12px 12px; border:1px solid var(--border); border-radius: 12px; font-size: 14px; outline: none; }
    textarea{ resize: vertical; min-height: 88px; }
    ul{ list-style:none; margin:0; padding:0; display:grid; gap:10px; }
    li.app{ border:1px solid var(--border); border-radius:14px; padding:14px; background: var(--bg); }
    .pill{ display:inline-block; padding:4px 8px; border-radius:999px; border:1px solid var(--border); font-size:12px; color: var(--muted); }
    .split{ display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
    .kicker{ text-transform: uppercase; letter-spacing:.12em; font-size:11px; color: var(--muted); }
    .empty{ border:1px dashed var(--border); border-radius: 14px; padding: 16px; text-align:center; color: var(--muted); }
    .footer{ margin-top: 24px; text-align:center; color: var(--muted); font-size:12px; }
    .inline-actions{ display:flex; gap:8px; align-items:center; }
    .danger { border:1px solid var(--border); background: transparent; }
  </style>
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
    <div class="footer">© ${new Date().getFullYear()} AdjitTime</div>
  </div>
</body>
</html>`;
}

// --------- Routes ----------

// Root: no pre-login content, just go to /login
app.get('/', (_req, res) => res.redirect('/login'));

// Login form (no prefill)
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

// Login handler — verify full name + dob
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

// Dashboard with tabs
app.get('/dashboard', requireLogin, (req, res) => {
  const user = req.user;
  const tab = req.query.tab === 'request' ? 'request' : 'mine';

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
      listHTML += `
        <li class="app">
          <div class="split">
            <div><strong>${escapeHTML(appt.title)}</strong></div>
            <div class="inline-actions">
              <span class="pill">Duration: ${appt.durationMins}m</span>
              <form method="POST" action="/appointments/delete" onsubmit="return confirm('Delete this appointment?')">
                <input type="hidden" name="id" value="${appt.id}" />
                <button class="secondary danger" title="Delete">Delete</button>
              </form>
            </div>
          </div>
          <div class="muted">When: ${human}</div>
          ${appt.note ? `<div style="margin-top:6px">${escapeHTML(appt.note)}</div>` : ``}
          <div class="muted" style="margin-top:6px">Created by ${escapeHTML(who)} · ${toHumanLocal(appt.createdAtISO)}</div>
        </li>
      `;
    }
    listHTML += '</ul>';
  }

  // Form to create appointment
  const formHTML = `
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
          <label for="note">Note (optional)</label>
          <textarea id="note" name="note" rows="3" placeholder="Add any details…"></textarea>
        </div>
        <input type="submit" value="Create appointment" />
      </form>
    </div>
  `;

  const tabsHTML = `
    <div class="tabs">
      <a class="tab ${tab === 'mine' ? 'active' : ''}" href="/dashboard?tab=mine">You're mine bitch</a>
      <a class="tab ${tab === 'request' ? 'active' : ''}" href="/dashboard?tab=request">Formal request for possession</a>
    </div>
  `;

  const body = `
    ${tabsHTML}
    <div class="grid">
      ${tab === 'mine' ? `<div class="card"><div class="kicker">Appointments</div><h2>You're mine bitch</h2>${listHTML}</div>` : formHTML}
    </div>
  `;

  res.send(layoutHTML('Dashboard', body, user));
});

// Create appointment
app.post('/appointments/create', requireLogin, (req, res) => {
  const user = req.user;

  const title = (req.body.title || '').trim();
  const startAtRaw = (req.body.startAt || '').trim();
  const durationMinsRaw = String(req.body.durationMins || '').trim();
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
    note, // escape on render
    createdBySlug: user.slug,
    createdAtISO: new Date().toISOString(),
  };

  APPOINTMENTS.push(appt);
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

// --------- Small util: pretty local time ----------
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

// --------- Start ----------
app.listen(PORT, () => {
  console.log(`✅ AdjitTime running at http://localhost:${PORT}`);
});
