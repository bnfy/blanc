'use strict';
// Generate expectations from the exact released reducer under distinct local
// timezones. These vectors contain no profile or browsing data.
const fs = require('node:fs');
const path = require('node:path');
const stats = require('./shipping-adblock-stats');
const zones = ['UTC', 'America/New_York', 'Europe/London', 'Australia/Lord_Howe',
  'Asia/Kathmandu', 'Pacific/Apia', 'America/Sao_Paulo'];
const instants = new Set([
  Date.parse('1500-03-01T12:00:00Z'), Date.parse('1582-10-15T12:00:00Z'),
  Date.parse('1600-02-29T12:00:00Z'), Date.parse('1900-03-01T12:00:00Z'),
  Date.UTC(2011,11,29,12), Date.UTC(2011,11,30,12), Date.UTC(2011,11,31,12),
  Date.UTC(2018,10,4,2), Date.UTC(2018,10,4,4),
  Date.UTC(2026,2,8,5), Date.UTC(2026,2,8,7), Date.UTC(2026,10,1,5),
  Date.UTC(2026,10,1,7), Date.UTC(2026,9,26,0), Date.UTC(2027,0,1,0),
]);
for (let i = 0; i < 110; ++i)
  for (const hour of [0, 5, 12, 23]) instants.add(Date.UTC(2025, 0, 1) + i * 7 * 86400000 + hour * 3600000);
const rows = [];
for (const zone of zones) {
  process.env.TZ = zone;
  for (const instant of instants) {
    const date = new Date(instant);
    rows.push(`{${JSON.stringify(zone)}, ${instant}.0, ${stats.currentWeekStart(date)}.0, ${stats.dayIndex(date)}},`);
  }
}
const file = path.join(__dirname, 'calendar-vectors.inc');
const generated = rows.join('\n') + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(file, 'utf8') !== generated) throw Error('Calendar vectors differ');
} else fs.writeFileSync(file, generated);
console.log(`zones=${zones.length} vectors=${rows.length}`);
