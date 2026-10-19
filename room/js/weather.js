// Real weather outside the window, from Open-Meteo (free, no API key, and it
// allows requests from the browser). It feeds two things: what the room looks
// like (clouds, fog, rain, how hard the breeze blows) and how fast the pots dry.
// The location comes from place.js (rounded to ~1 km).
import { CLOCK } from './place.js';

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'plants:weather';
const FRESH = 15 * 60 * 1000;

// Typical daily reference evapotranspiration (ET₀, mm/day) for each month here,
// averaged over 2015–2024 from Open-Meteo's historical archive.
const ET0_NORMAL = [1.34, 2.04, 2.49, 3.23, 3.7, 4.22, 3.97, 3.68, 3.43, 2.8, 1.8, 1.27];

function url() {
  return `${ENDPOINT}?${new URLSearchParams({
    latitude: CLOCK.latitude,
    longitude: CLOCK.longitude,
    timezone: CLOCK.timeZone,
    current: 'temperature_2m,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,precipitation',
    hourly: 'temperature_2m,weather_code,cloud_cover,wind_speed_10m,precipitation',
    daily: 'temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration,precipitation_sum,weather_code',
    past_days: 21,
    forecast_days: 7,
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
  })}`;
}

function parse(j) {
  const h = j.hourly, d = j.daily, c = j.current;
  return {
    current: { time: c.time, temp: c.temperature_2m, humidity: c.relative_humidity_2m, code: c.weather_code, cloud: c.cloud_cover / 100, wind: c.wind_speed_10m, rain: c.precipitation },
    hourly: new Map(h.time.map((t, i) => [t, { time: t, temp: h.temperature_2m[i], code: h.weather_code[i], cloud: h.cloud_cover[i] / 100, wind: h.wind_speed_10m[i], rain: h.precipitation[i] }])),
    daily: new Map(d.time.map((t, i) => [t, { date: t, hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i], et0: d.et0_fao_evapotranspiration[i], rain: d.precipitation_sum[i], code: d.weather_code[i] }])),
  };
}

// Returns null when the weather can't be fetched; everything works without it.
export async function loadWeather() {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { /* private mode */ }
  if (cached && Date.now() - cached.at < FRESH) return parse(cached.json);
  try {
    const res = await fetch(url());
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), json })); } catch { /* full or blocked */ }
    return parse(json);
  } catch {
    return cached ? parse(cached.json) : null;
  }
}

// WMO weather codes, boiled down to what the room can show.
export function describe(code) {
  if (code === 0) return { kind: 'clear', label: 'clear' };
  if (code === 1) return { kind: 'clear', label: 'mostly clear' };
  if (code === 2) return { kind: 'partly', label: 'partly cloudy' };
  if (code === 3) return { kind: 'cloudy', label: 'overcast' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'fog' };
  if (code >= 51 && code <= 57) return { kind: 'rain', label: 'drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { kind: 'rain', label: code >= 80 ? 'showers' : 'rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: 'snow' };
  if (code >= 95) return { kind: 'rain', label: 'thunderstorms' };
  return { kind: 'partly', label: '' };
}

// The weather to show: right now when the clock is live, otherwise the hourly
// record (or forecast) for the hour the slider is on, today.
export function sample(w, rt, live) {
  if (!w) return null;
  let s = live ? w.current : null;
  if (!s) s = w.hourly.get(`${rt.date}T${String(Math.floor(rt.hour) % 24).padStart(2, '0')}:00`);
  if (!s) return null;
  const d = describe(s.code);
  return {
    ...s, ...d,
    fog: d.kind === 'fog' ? 1 : 0,
    rainRate: d.kind === 'rain' || d.kind === 'snow' ? Math.max(0.3, Math.min(1, (s.rain || 0.5) / 2)) : 0,
  };
}

const dateKey = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: CLOCK.timeZone }).format(date);

// Typical ET₀ for a calendar date, blending the monthly normals mid-month to mid-month.
function normal(key) {
  const m = +key.slice(5, 7) - 1, day = +key.slice(8, 10);
  const f = (day - 15) / 30;
  const other = (m + (f < 0 ? 11 : 1)) % 12;
  return ET0_NORMAL[m] * (1 - Math.abs(f)) + ET0_NORMAL[other] * Math.abs(f);
}

// How fast pots dry on a given day compared with a typical day at that time of
// year. Outdoor ET₀ (sun, warmth, dry air, wind) is the driver; indoors the swing
// is damped, so a day twice as "thirsty" as normal counts as about 1.4 days.
// Days without data count as typical.
export function dryingFactor(w) {
  if (!w) return null;
  return (date) => {
    const key = dateKey(date);
    const day = w.daily.get(key);
    if (!day || day.et0 == null) return 1;
    return Math.min(1.4, Math.max(0.7, Math.sqrt(day.et0 / normal(key))));
  };
}

// A sentence about the weather since `from` (a date), for the plant sidebar.
export function recap(w, from, lead, now = new Date()) {
  if (!w) return null;
  const days = [];
  for (let t = new Date(from); t <= now; t = new Date(t.getTime() + 86400000)) {
    const d = w.daily.get(dateKey(t));
    if (d && d.et0 != null) days.push({ ...d, f: Math.sqrt(d.et0 / normal(d.date)) });
  }
  if (!days.length) return null;
  const hi = Math.round(days.reduce((a, d) => a + d.hi, 0) / days.length);
  const pace = days.reduce((a, d) => a + Math.min(1.4, Math.max(0.7, d.f)), 0) / days.length;
  const kinds = days.map((d) => describe(d.code).kind);
  const most = ['clear', 'partly', 'cloudy', 'fog', 'rain'].map((k) => [k, kinds.filter((x) => x === k).length]).sort((a, b) => b[1] - a[1])[0][0];
  const sky = { clear: 'mostly sunny', partly: 'partly cloudy', cloudy: 'mostly overcast', fog: 'often foggy', rain: 'rainy' }[most];
  const pct = Math.round(Math.abs(pace - 1) * 100);
  const month = now.toLocaleString('en-US', { month: 'long', timeZone: CLOCK.timeZone });
  const effect = pct < 8 ? `about normal drying for ${month}`
    : pace > 1 ? `pots dry ~${pct}% faster than a typical ${month} day, so the next check comes sooner`
      : `pots dry ~${pct}% slower than a typical ${month} day, so the next check comes later`;
  return `${lead} highs around ${hi}°F, ${sky}; ${effect}.`;
}
