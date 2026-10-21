// Everything outside the canvas: the floating plant tags, the sidebar that
// opens when you pick a plant, and the gardener controls inside it.
import { status, feedStatus, ago, eventsFor, daysBetween, addDays } from './care.js';
import { dryingFactor, recap } from './weather.js';
import { newId } from './store.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------------------------------------------------------- icons

const ICONS = {
  drop: ['...a...', '..aaa..', '..aaa..', '.aaaaa.', 'aabaaaa', 'aabaaaa', 'aaabaaa', '.aaaaa.', '..aaa..'],
  leaf: ['....aa', '..aaaa', '.aaaba', 'aaaba.', 'aaba..', 'ab....', 'a.....'],
  what: ['.aaa.', 'a...a', '...a.', '..a..', '..a..', '.....', '..a..'],
  sun: ['...a...', '.a...a.', '..aaa..', 'a.aaa.a', '..aaa..', '.a...a.', '...a...'],
  moon: ['..aaa.', '.aa...', 'aa....', 'aa....', 'aa....', '.aa...', '..aaa.'],
  cloud: ['........', '...aa...', '.aaaaa..', 'aaaaaaa.', 'aaaaaaaa', '.aaaaaa.', '........'],
  rain: ['...aa...', '.aaaaa..', 'aaaaaaaa', '.aaaaaa.', '........', '.a..a..a', 'a..a..a.'],
  fog: ['aaaaaa..', '........', '.aaaaaaa', '........', 'aaaaa...', '........', '..aaaaaa'],
};
export function icon(name, color, scale = 2, cls = '') {
  const rows = ICONS[name];
  const w = rows[0].length, h = rows.length;
  const paths = { a: '', b: '' };
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (paths[c] !== undefined) paths[c] += `M${x} ${y}h1v1h-1z`; }));
  return `<svg class="px ${cls}" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges" aria-hidden="true">`
    + `<path d="${paths.a}" fill="${color}"/>${paths.b ? `<path d="${paths.b}" fill="rgba(255,255,255,.75)"/>` : ''}</svg>`;
}

const STATE_ICON = {
  ok: () => icon('leaf', 'var(--ok)'),
  soon: () => icon('drop', 'var(--water)'),
  due: () => icon('drop', 'var(--water)', 2, 'bounce'),
  late: () => icon('drop', 'var(--late)', 2, 'bounce'),
  unknown: () => icon('what', 'var(--muted)'),
};

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function meter(st, blocks = 10) {
  const n = st.fill == null ? 0 : Math.round(st.fill * blocks);
  let cells = '';
  for (let i = 0; i < blocks; i++) cells += `<i class="${i < n ? 'on' : ''}"></i>`;
  return `<span class="meter state-${st.state}" role="img" aria-label="Water left: ${n} of ${blocks}">${cells}</span>`;
}

// ---------------------------------------------------------------------- UI

export class UI {
  constructor(state, { onSelect, onHover, onAction }) {
    this.s = state;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.onAction = onAction;
    this.tags = new Map();
    this.card = $('card');
    this.toastTimer = 0;

    for (const p of state.plants) {
      const b = document.createElement('button');
      b.className = 'tag';
      b.type = 'button';
      b.addEventListener('click', (e) => { e.stopPropagation(); onSelect(p); });
      b.addEventListener('pointerenter', () => onHover(p));
      b.addEventListener('pointerleave', () => onHover(null));
      $('tags').appendChild(b);
      this.tags.set(p.def.id, b);
    }

    this.card.addEventListener('click', (e) => this.cardClick(e));
    $('login-form').addEventListener('submit', (e) => this.submitLogin(e));
    $('login-cancel').addEventListener('click', () => $('login').close());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.s.selected && !$('login').open) onSelect(null); });
  }

  // ------------------------------------------------------------ render

  render() {
    const now = new Date();
    const dry = dryingFactor(this.s.weather);
    for (const p of this.s.plants) p.status = status(p.def, this.s.events, now, dry);
    this.renderTags();
    this.renderCard();
  }

  renderTags() {
    for (const p of this.s.plants) {
      const b = this.tags.get(p.def.id);
      b.innerHTML = `${STATE_ICON[p.status.state]()}<span>${esc(p.def.short)}</span>`;
      b.title = `${p.def.name} — ${p.status.label}`;
      b.classList.toggle('selected', this.s.selected === p);
      b.dataset.state = p.status.state;
    }
  }

  positionTags(project) {
    // plants that stand together (the stand) can put tags on top of each other;
    // stack any that overlap, the higher plant's tag on top
    const placed = [];
    const items = this.s.plants.map((p) => ({ b: this.tags.get(p.def.id), pt: project(p.top) }))
      .sort((a, c) => (a.pt?.y ?? 0) - (c.pt?.y ?? 0));
    for (const { b, pt } of items) {
      b.style.visibility = pt ? 'visible' : 'hidden';
      if (!pt) continue;
      const w = b.offsetWidth, h = b.offsetHeight;
      let y = pt.y;
      for (const q of placed) {
        if (Math.abs(q.x - pt.x) < (w + q.w) / 2 + 4 && y > q.y - h - 2 && y - h < q.y + 2) y = q.y + h + 2;
      }
      placed.push({ x: pt.x, y, w });
      b.style.transform = `translate(${Math.round(pt.x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    }
  }

  // last 8 weeks, one square per day, newest bottom-right
  calendar(p) {
    const now = new Date();
    const byDay = new Map();
    for (const e of eventsFor(p.def, this.s.events)) {
      const d = daysBetween(e.at, now);
      if (d < 56) byDay.set(d, [...(byDay.get(d) || []), e.type]);
    }
    let cells = '';
    for (let d = 55; d >= 0; d--) {
      const types = byDay.get(d) || [];
      const cls = types.includes('water') ? 'w' : types.includes('feed') ? 'f' : types.length ? 'n' : '';
      cells += `<i class="${cls}" title="${fmtDate(addDays(now, -d))}${types.length ? ': ' + types.join(', ') : ''}"></i>`;
    }
    return `<div class="cal" aria-label="Care over the last 8 weeks">${cells}</div>`;
  }

  renderCard() {
    const p = this.s.selected;
    if (!p) { this.card.hidden = true; return; }
    const d = p.def, st = p.status, fs = feedStatus(d, this.s.events);
    const notes = eventsFor(d, this.s.events).filter((e) => e.type === 'note').slice(-3).reverse();
    const signedIn = this.s.gardener.signedIn;
    this.card.hidden = false;
    this.card.innerHTML = `
      <button type="button" class="close" data-act="close" aria-label="Close">×</button>
      <nav class="switch" aria-label="Plants">${this.s.plants.map((q) => `
        <button type="button" data-plant="${q.def.id}" class="${q === p ? 'on' : ''}" title="${esc(q.status.label)}">${STATE_ICON[q.status.state]()}<span>${esc(q.def.short)}</span></button>`).join('')}
      </nav>
      <p class="eyebrow">${esc(d.spot)}</p>
      <h2>${esc(d.name)}</h2>
      <p class="latin"><i>${esc(d.latin)}</i></p>
      <div class="water">
        ${meter(st)}
        <p class="water-label state-${st.state}">${esc(st.label)}</p>
        <p class="muted small">${st.lastWater ? `Last watered ${ago(st.lastWater.at)}. ` : ''}Check every ~${d.water.every.growing} days in summer, ~${d.water.every.rest} in winter.</p>
        ${this.weatherLine(st)}
      </div>
      ${signedIn ? `
        <div class="actions">
          <label class="when">When <select data-when>
            ${['today', 'yesterday', '2 days ago', '3 days ago', '4 days ago', '5 days ago', '6 days ago', 'a week ago'].map((l, i) => `<option value="${i}">${l}</option>`).join('')}
          </select></label>
          <button type="button" class="px-btn primary" data-act="water">${icon('drop', 'currentColor')} Water</button>
          <button type="button" class="px-btn" data-act="check">Still damp</button>
          <button type="button" class="px-btn" data-act="feed">Fed</button>
          <button type="button" class="px-btn" data-act="note">Note…</button>
          <form class="note-form" hidden><input name="note" maxlength="200" placeholder="New leaf! / repotted / …" aria-label="Note"><button class="px-btn">Save</button></form>
        </div>` : ''}
      ${this.calendar(p)}
      <dl class="care">
        <dt>Water</dt><dd>${esc(d.water.when)}</dd>
        <dt>Light</dt><dd>${esc(d.light)}</dd>
        ${d.feed ? `<dt>Feed</dt><dd>${esc(d.feed.what)}<br><span class="muted">${esc(fs.label)}</span></dd>` : ''}
      </dl>
      ${d.notes?.length ? `<ul class="tips">${d.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${notes.length ? `<ul class="log-notes">${notes.map((n) => `<li><time>${fmtDate(n.at)}</time> ${esc(n.note)}</li>`).join('')}</ul>` : ''}
      ${d.id_note ? `<p class="idnote"><b>ID:</b> ${esc(d.id_note)}</p>` : ''}
      ${signedIn ? '' : '<p class="muted small gated">Watering is gardener-only.</p>'}
      <footer class="card-foot">
        <a href="/">← home</a>
        <button type="button" class="link-btn" data-act="gardener">${signedIn ? 'gardener: signed in' : 'gardener sign-in'}</button>
      </footer>`;
    const form = this.card.querySelector('.note-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = form.note.value.trim();
      if (text) this.act('note', text);
    });
  }

  // How the weather since the last watering is changing the schedule.
  weatherLine(st) {
    const w = this.s.weather;
    const text = st.lastWater
      ? recap(w, new Date(st.lastWater.at), 'Since the last watering:')
      : recap(w, addDays(new Date(), -7), 'This past week:');
    if (!text) return '';
    return `<p class="muted small wx">${icon('sun', 'var(--warn)')}<span>${esc(text)} <a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather: Open-Meteo</a></span></p>`;
  }

  cardClick(e) {
    const pick = e.target.closest('[data-plant]');
    if (pick) return this.onSelect(this.s.plants.find((p) => p.def.id === pick.dataset.plant));
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'close') return this.onSelect(null);
    if (act === 'gardener') return this.openLogin();
    if (act === 'note') {
      const form = this.card.querySelector('.note-form');
      form.hidden = !form.hidden;
      if (!form.hidden) form.note.focus();
      return;
    }
    this.act(act);
  }

  async act(type, note) {
    const p = this.s.selected;
    const back = +(this.card.querySelector('[data-when]')?.value || 0);
    const at = addDays(new Date(), -back).toISOString();
    const event = { id: newId(), plant: p.def.id, type, at, ...(note ? { note } : {}) };
    this.card.querySelectorAll('.actions button, .actions select').forEach((b) => (b.disabled = true));
    this.toast('Saving…');
    try {
      await this.onAction(event);
      const msg = { water: `Watered the ${p.def.short.toLowerCase()}.`, feed: `Fed the ${p.def.short.toLowerCase()}.`, check: `Pushed the next check back ${p.def.water.snooze ?? 3} days.`, note: 'Note saved.' }[type];
      this.toast(msg, () => this.onAction(null, event.id));
    } catch (err) {
      this.toast(err.message);
      this.renderCard();
    }
  }

  toast(text, undo) {
    const t = $('toast');
    clearTimeout(this.toastTimer);
    t.hidden = false;
    t.innerHTML = `<span>${esc(text)}</span>${undo ? '<button type="button" class="link-btn">undo</button>' : ''}`;
    if (undo) {
      t.querySelector('button').addEventListener('click', async () => {
        this.toast('Undoing…');
        try { await undo(); this.toast('Undone.'); } catch (err) { this.toast(err.message); }
      }, { once: true });
    }
    if (text !== 'Saving…' && text !== 'Undoing…') this.toastTimer = setTimeout(() => (t.hidden = true), undo ? 9000 : 4000);
  }

  // ---------------------------------------------------------- gardener

  openLogin() {
    const g = this.s.gardener;
    $('login-signed-in').hidden = !g.signedIn;
    $('login-form').hidden = g.signedIn;
    $('login-msg').textContent = '';
    $('login').showModal();
    if (g.signedIn) {
      $('login-signout').onclick = () => { g.signOut(); $('login').close(); this.render(); };
      $('login-close').onclick = () => $('login').close();
    } else {
      $('login-token').value = '';
      $('login-token').focus();
    }
  }

  async submitLogin(e) {
    e.preventDefault();
    const token = $('login-token').value;
    if (!token.trim()) return;
    $('login-msg').textContent = 'Checking…';
    try {
      await this.s.gardener.signIn(token);
      $('login').close();
      await this.onAction(null); // refresh from the repo
      this.toast('Signed in. Pick a plant to log care.');
    } catch (err) {
      $('login-msg').textContent = err.message;
    }
  }
}
