const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { cityForId, searchCities } = require('../../src/main/wallpaper-cities');
test('offline city search disambiguates state/country and supports accents and keyboard queries', () => {
  assert.equal(searchCities('Rochester NY')[0].id, '5134086');
  assert.equal(searchCities('New York')[0].id, '5128581');
  assert.ok(searchCities('Sao Paulo').some((city) => city.label.includes('São Paulo')));
  assert.ok(searchCities('Paris France').every((city) => city.label.includes('France')));
  assert.ok(searchCities('San').length <= 10);
  for (const value of [null, {}, 1, '', 'a', 'a'.repeat(81)]) assert.deepEqual(searchCities(value), []);
});
test('city id resolves only canonical bundled coordinates and never accepts supplied objects', () => {
  assert.equal(cityForId('5128581').latitude, 40.71427);
  for (const value of [null, {}, 5128581, '__proto__', '000', { id: '5128581', latitude: 0 }]) assert.equal(cityForId(value), null);
});
test('bundled city catalog and upstream solar bundle match their source provenance', () => {
  const root = path.resolve(__dirname, '../..');
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  const cities = require('../../src/main/assets/wallpaper-cities.json');
  const source = require('../../src/main/assets/wallpaper-cities-source.json');
  assert.equal(hash('src/main/assets/wallpaper-cities.json'), source.outputSha256);
  assert.equal(cities.length, source.cityCount);
  assert.equal(new Set(cities.map((row) => row[0])).size, cities.length);
  assert.ok(cities.every((row) => /^\d+$/.test(row[0]) && Number.isFinite(row[2]) && Math.abs(row[2]) <= 90 && Number.isFinite(row[3]) && Math.abs(row[3]) <= 180));
  const solar = require('../../src/renderer/pages/suncalc-source.json');
  assert.equal(hash('src/renderer/pages/suncalc.js'), solar.fileSha256);
});
