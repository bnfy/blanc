// Offline update tool: pass the GeoNames cities15000, admin1CodesASCII and
// countryInfo TSV files. No city lookup or dataset download runs in Blanc.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2);
if (files.length !== 3) throw new Error('Usage: node scripts/build-wallpaper-cities.mjs cities15000.txt admin1CodesASCII.txt countryInfo.txt');
const inputs = files.map((file) => fs.readFileSync(file, 'utf8'));
const rows = (text) => text.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => line.split('\t'));
const admins = new Map(rows(inputs[1]).map((row) => [row[0], row[1]]));
const countries = new Map(rows(inputs[2]).map((row) => [row[0], row[4]]));
const cities = rows(inputs[0]).map((row) => {
  const admin = admins.get(`${row[8]}.${row[10]}`);
  const label = [row[1], admin, countries.get(row[8]) || row[8]].filter(Boolean).join(', ');
  return [row[0], label, Number(row[4]), Number(row[5]), Number(row[14]), `${row[2]} ${row[10]} ${row[8]}`];
}).sort((a, b) => Number(a[0]) - Number(b[0]));
const out = path.join(root, 'src/main/assets/wallpaper-cities.json');
fs.writeFileSync(out, JSON.stringify(cities) + '\n');
const metadata = {
  source: 'https://download.geonames.org/export/dump/',
  snapshotDate: new Date().toISOString().slice(0, 10),
  license: 'CC-BY-4.0', cityCount: cities.length,
  inputs: files.map((file, i) => ({ file: path.basename(file), sha256: crypto.createHash('sha256').update(inputs[i]).digest('hex') })),
  outputSha256: crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex'),
};
fs.writeFileSync(path.join(root, 'src/main/assets/wallpaper-cities-source.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(`Bundled ${cities.length} cities for offline wallpaper lookup.`);
