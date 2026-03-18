const DURATION_PART_PATTERN = /(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)/gi;

const UNIT_MS = {
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
};

function parseDuration(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) {
    return { ok: false, error: 'Provide a duration like `10m`, `2h`, or `7d`.' };
  }

  let totalMs = 0;
  let matchCount = 0;

  for (const match of raw.matchAll(DURATION_PART_PATTERN)) {
    const value = Number(match[1]);
    const unit = match[2];
    const multiplier = UNIT_MS[unit];

    if (!Number.isFinite(value) || value <= 0 || !multiplier) {
      continue;
    }

    totalMs += value * multiplier;
    matchCount += 1;
  }

  if (!matchCount || totalMs <= 0) {
    return { ok: false, error: 'Could not parse that duration. Try values like `15m`, `1h`, or `2d 6h`.' };
  }

  return { ok: true, ms: totalMs };
}

function formatDuration(ms) {
  const remaining = Math.max(0, Number(ms) || 0);
  if (!remaining) return '0s';

  const parts = [];
  const units = [
    ['w', 604_800_000],
    ['d', 86_400_000],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1000],
  ];

  let rest = remaining;
  for (const [label, size] of units) {
    if (rest < size) continue;
    const amount = Math.floor(rest / size);
    rest -= amount * size;
    parts.push(`${amount}${label}`);
  }

  return parts.slice(0, 3).join(' ');
}

module.exports = {
  formatDuration,
  parseDuration,
};
