// Watering / feeding schedule math. Intervals are guides for when to *check*
// the soil; the log records what actually happened.
const DAY = 86400000;

export function season(date) {
  const m = date.getMonth() + 1;
  if (m >= 4 && m <= 9) return 'growing';
  if (m === 3 || m === 10) return 'shoulder';
  return 'rest';
}

export function waterInterval(plant, date) {
  const { growing, rest } = plant.water.every;
  const s = season(date);
  return s === 'growing' ? growing : s === 'rest' ? rest : Math.round((growing + rest) / 2);
}

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
export const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY);

const last = (events, type) => {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === type) return events[i];
  return null;
};

export function eventsFor(plant, events) {
  return events.filter((e) => e.plant === plant.id).sort((a, b) => a.at.localeCompare(b.at));
}

// When the next check is due. The interval is in "typical days"; given `dry`
// (date -> how fast pots dry that day, 1 = typical; see weather.js), a hot,
// sunny day uses up more than one and a cool, foggy one less.
function dueAfter(start, interval, dry) {
  if (!dry) return addDays(start, interval);
  let used = 0, n = 0;
  while (used < interval - 1e-9 && n < interval * 3) used += dry(addDays(start, ++n));
  return addDays(start, n);
}

export function status(plant, events, now = new Date(), dry = null) {
  const mine = eventsFor(plant, events);
  const interval = waterInterval(plant, now);
  const lastWater = last(mine, 'water');
  const lastCheck = last(mine, 'check');
  const out = { interval, lastWater, mine, season: season(now) };

  if (!lastWater) return { ...out, state: 'unknown', fill: null, label: 'No waterings logged yet' };

  let due = dueAfter(lastWater.at, interval, dry);
  if (lastCheck && lastCheck.at > lastWater.at) {
    const snoozed = addDays(lastCheck.at, plant.water.snooze ?? 3);
    if (snoozed > due) due = snoozed;
  }
  const since = daysBetween(lastWater.at, now);
  const dueIn = daysBetween(now, due);
  const state = dueIn > 2 ? 'ok' : dueIn > 0 ? 'soon' : dueIn >= -2 ? 'due' : 'late';
  const fill = Math.max(0, Math.min(1, dueIn / interval));
  let label;
  if (state === 'ok') label = `Fine for ~${dueIn} days`;
  else if (state === 'soon') label = dueIn === 1 ? 'Check soil tomorrow' : `Check soil in ${dueIn} days`;
  else if (state === 'due') label = dueIn === 0 ? 'Check soil today' : `Due ${-dueIn} day${dueIn === -1 ? '' : 's'} ago`;
  else label = `${-dueIn} days overdue`;
  return { ...out, state, fill, label, since, dueIn, due };
}

export function feedStatus(plant, events, now = new Date()) {
  const f = plant.feed;
  if (!f) return null;
  const month = now.getMonth() + 1;
  const lastFeed = last(eventsFor(plant, events), 'feed');
  if (!f.months.includes(month)) {
    const next = f.months.find((m) => m > month) ?? f.months[0];
    const name = new Date(2000, next - 1, 1).toLocaleString('en-US', { month: 'long' });
    return { resting: true, lastFeed, label: `Resting — start again in ${name}` };
  }
  if (!lastFeed) return { resting: false, lastFeed, label: 'Feed with the next watering' };
  const dueIn = daysBetween(now, addDays(lastFeed.at, f.every));
  return { resting: false, lastFeed, dueIn, label: dueIn > 0 ? `Next feed in ${dueIn} days` : 'Feed with the next watering' };
}

export function ago(iso, now = new Date()) {
  const d = daysBetween(iso, now);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const URGENCY = { late: 0, due: 1, unknown: 2, soon: 3, ok: 4 };
