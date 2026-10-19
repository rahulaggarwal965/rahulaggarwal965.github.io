// Data: plants.json (hand-edited) and log.json (care events).
//
// Visitors read the copy of log.json that ships with the site. The gardener
// signs in with a fine-grained GitHub token (Contents: read & write on this repo
// only), kept in this browser's localStorage. Logging care commits the updated
// log.json straight to the repo, so git history doubles as a plant diary.
export const REPO = { owner: 'rahulaggarwal965', repo: 'rahulaggarwal965.github.io', branch: 'main', path: 'plants/log.json' };

const TOKEN_KEY = 'plants:gardener-token';
const API = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}`;

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

export async function loadPlants() {
  const r = await fetch('plants.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(`plants.json: ${r.status}`);
  return (await r.json()).plants;
}

export async function loadPublicLog() {
  try {
    const r = await fetch('log.json', { cache: 'no-cache' });
    if (!r.ok) return [];
    return (await r.json()).events ?? [];
  } catch {
    return [];
  }
}

const decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const encode = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// One event per line keeps diffs readable.
export function serialize(events) {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const lines = sorted.map((e) => '    ' + JSON.stringify(e));
  return `{\n  "events": [\n${lines.join(',\n')}${lines.length ? '\n' : ''}  ]\n}\n`;
}

export class Gardener {
  constructor() {
    this.token = storage.get(TOKEN_KEY);
    this.queue = Promise.resolve();
  }

  get signedIn() { return !!this.token; }

  async request(path, init = {}) {
    const r = await fetch(`${API}${path}`, {
      cache: 'no-store',
      ...init,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, ...(init.headers || {}) },
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      const err = new Error(r.status === 401
        ? 'GitHub rejected the saved token (it may have expired). Sign in again from the gardener link.'
        : body.message || `GitHub ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return r.json();
  }

  async signIn(token) {
    this.token = token.trim();
    try {
      await this.read();
    } catch (e) {
      this.token = null;
      throw e.status === 401 ? new Error('GitHub rejected that token.') : e.status === 404 ? new Error("That token can't see this repo.") : e;
    }
    storage.set(TOKEN_KEY, this.token);
  }

  signOut() {
    this.token = null;
    storage.del(TOKEN_KEY);
  }

  async read() {
    const file = await this.request(`/contents/${REPO.path}?ref=${REPO.branch}`);
    return { sha: file.sha, events: JSON.parse(decode(file.content)).events ?? [] };
  }

  // Read-modify-write, serialised so quick double clicks can't race each other.
  mutate(fn, message) {
    const run = async () => {
      for (let attempt = 0; ; attempt++) {
        const { sha, events } = await this.read();
        const next = fn(events);
        try {
          await this.request(`/contents/${REPO.path}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, content: encode(serialize(next)), sha, branch: REPO.branch }),
          });
          return next;
        } catch (e) {
          if (e.status === 409 && attempt < 2) continue;
          if (e.status === 403 || e.status === 404) throw new Error('This token can read the repo but not write to it (needs Contents: read and write).');
          throw e;
        }
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
}

export const newId = () => Math.random().toString(36).slice(2, 8);
