'use strict';
let cities;
let byId;
let index;
function catalog() {
  if (!cities) {
    cities = require('./assets/wallpaper-cities.json');
    byId = new Map(cities.map((city) => [city[0], city]));
  }
  return cities;
}
function projection(city) {
  return city ? { id: city[0], label: city[1], latitude: city[2], longitude: city[3] } : null;
}
function cityForId(id) {
  if (typeof id !== 'string' || !/^\d{1,10}$/.test(id)) return null;
  catalog();
  return projection(byId.get(id));
}
function normalize(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function searchCities(query) {
  if (typeof query !== 'string' || query.length > 80) return [];
  const normalized = normalize(query);
  if (normalized.length < 2) return [];
  const terms = normalized.split(/\s+/);
  if (!index) index = catalog().map((city) => ({ city, label: normalize(city[1]), search: normalize(`${city[1]} ${city[5]}`) }));
  return index.filter(({ search }) => terms.every((term) => search.includes(term)))
    .sort((a, b) => Number(b.label.startsWith(normalized)) - Number(a.label.startsWith(normalized)) || b.city[4] - a.city[4] || a.label.localeCompare(b.label))
    .slice(0, 10).map(({ city }) => projection(city));
}
module.exports = { cityForId, searchCities };
