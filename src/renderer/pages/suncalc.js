(function(global, factory) {
	typeof exports === "object" && typeof module !== "undefined" ? factory(exports) : typeof define === "function" && define.amd ? define(["exports"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, factory(global.SunCalc = {}));
})(this, function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region index.js
	const { PI, sin, cos, tan, asin, atan2: atan, acos, sqrt, abs, round, floor } = Math;
	const rad = PI / 180;
	const dayMs = 864e5;
	const J1970 = 2440588;
	const J2000 = 2451545;
	const earthRadius = 6378.14;
	function fromJulian(j) {
		return /* @__PURE__ */ new Date((j + .5 - J1970) * dayMs);
	}
	function toDays(date) {
		return date.valueOf() / dayMs - .5 + J1970 - J2000;
	}
	function deltaT(d) {
		const y = 2e3 + d / 365.2425;
		let t;
		if (y < 1920) {
			t = y - 1900;
			return -2.79 + t * (1.494119 + t * (-.0598939 + t * (.0061966 - t * 197e-6)));
		}
		if (y < 1941) {
			t = y - 1920;
			return 21.2 + t * (.84493 + t * (-.0761 + t * .0020936));
		}
		if (y < 1961) {
			t = y - 1950;
			return 29.07 + t * (.407 + t * (-1 / 233 + t / 2547));
		}
		if (y < 1986) {
			t = y - 1975;
			return 45.45 + t * (1.067 + t * (-1 / 260 - t / 718));
		}
		if (y < 2005) {
			t = y - 2e3;
			return 63.86 + t * (.3345 + t * (-.060374 + t * (.0017275 + t * (651814e-9 + t * 2373599e-11))));
		}
		if (y < 2050) {
			t = y - 2e3;
			return 62.92 + t * (.32217 + t * .005589);
		}
		t = (y - 1820) / 100;
		return -20 + 32 * t * t - .5628 * (2150 - y);
	}
	function toDaysTT(d) {
		return d + deltaT(d) / 86400;
	}
	function azimuth(H, phi, dec) {
		return (atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi)) / rad + 540) % 360;
	}
	function altitude(H, phi, dec) {
		return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
	}
	function siderealTime(d, lw) {
		return rad * (280.46061837 + 360.98564736629 * d) - lw;
	}
	function astroRefraction(h) {
		if (h < 0) h = 0;
		return 2967e-7 / tan(h + .00312536 / (h + .08901179));
	}
	function sunCoords(d) {
		const t = d / 36525;
		const L0 = rad * (280.46646 + t * (36000.76983 + t * 3032e-7));
		const M = rad * (357.52911 + t * (35999.05029 - t * 1537e-7));
		const sinM = sin(M);
		const cosM = cos(M);
		const C = rad * ((1.914602 - t * (.004817 + t * 14e-6)) * sinM + (.019993 - 101e-6 * t) * 2 * sinM * cosM + 289e-6 * sinM * (3 - 4 * sinM * sinM));
		const Om = rad * (125.04 - 1934.136 * t);
		const L = L0 + C - rad * (.00569 + .00478 * sin(Om));
		const e = rad * (23.439291 - t * (.0130042 + t * (16e-8 - t * 504e-9))) + rad * .00256 * cos(Om);
		return {
			ra: atan(cos(e) * sin(L), cos(L)),
			dec: asin(sin(e) * sin(L))
		};
	}
	function getPosition(date, lat, lng) {
		const lw = rad * -lng;
		const phi = rad * lat;
		const d = toDays(date);
		const c = sunCoords(toDaysTT(d));
		const H = siderealTime(d, lw) - c.ra;
		const h = altitude(H, phi, c.dec);
		return {
			azimuth: azimuth(H, phi, c.dec),
			altitude: (h + astroRefraction(h)) / rad
		};
	}
	const times = [
		[
			-.833,
			"sunrise",
			"sunset"
		],
		[
			-.3,
			"sunriseEnd",
			"sunsetStart"
		],
		[
			-6,
			"dawn",
			"dusk"
		],
		[
			-12,
			"nauticalDawn",
			"nauticalDusk"
		],
		[
			-18,
			"nightEnd",
			"night"
		],
		[
			6,
			"goldenHourEnd",
			"goldenHour"
		]
	];
	function addTime(angle, riseName, setName) {
		times.push([
			angle,
			riseName,
			setName
		]);
	}
	const J0 = 9e-4;
	function observerAngle(height) {
		return -2.076 * sqrt(height) / 60;
	}
	function wrapPi(a) {
		return a - 2 * PI * round(a / (2 * PI));
	}
	function solarTransit(dt, lw) {
		for (let i = 0; i < 3; i++) {
			const H = wrapPi(siderealTime(dt, lw) - sunCoords(toDaysTT(dt)).ra);
			dt -= H / (2 * PI);
		}
		return dt;
	}
	function getSetJ(h0, dt, sign, lw, phi, decT) {
		const cosH0 = (sin(h0) - sin(phi) * sin(decT)) / (cos(phi) * cos(decT));
		if (cosH0 < -1 || cosH0 > 1) return NaN;
		let d = dt + sign * acos(cosH0) / (2 * PI);
		for (let i = 0; i < 2; i++) {
			const c = sunCoords(toDaysTT(d));
			const H = wrapPi(siderealTime(d, lw) - c.ra);
			const h = altitude(H, phi, c.dec);
			const sinH = cos(phi) * cos(c.dec) * sin(H);
			if (abs(sinH) < 1e-6) break;
			d += (h - h0) / (2 * PI * sinH);
		}
		return d;
	}
	function civilMidnight(date, utcOffset) {
		const offMs = utcOffset * 6e4;
		return floor((date.valueOf() + offMs) / dayMs) * dayMs - offMs;
	}
	function solarDayTransit(date, lw, utcOffset) {
		const anchor = utcOffset === void 0 ? date.valueOf() : civilMidnight(date, utcOffset) + dayMs / 2;
		const lon = J0 + lw / (2 * PI);
		return solarTransit(round(toDays(anchor) - lon) + lon, lw);
	}
	function getTimes(date, lat, lng, height = 0, utcOffset) {
		const lw = rad * -lng;
		const phi = rad * lat;
		const dh = observerAngle(height);
		const dt = solarDayTransit(date, lw, utcOffset);
		const dec = sunCoords(toDaysTT(dt)).dec;
		const result = {
			solarNoon: fromJulian(dt + J2000),
			nadir: fromJulian(dt + J2000 - .5)
		};
		for (const [angle, riseName, setName] of times) {
			const h0 = (angle + dh) * rad;
			const jrise = getSetJ(h0, dt, -1, lw, phi, dec);
			const jset = getSetJ(h0, dt, 1, lw, phi, dec);
			result[riseName] = Number.isNaN(jrise) ? null : fromJulian(jrise + J2000);
			result[setName] = Number.isNaN(jset) ? null : fromJulian(jset + J2000);
		}
		if (result.sunrise === null) {
			const noonAlt = altitude(0, phi, dec);
			const riseSetAlt = (times[0][0] + dh) * rad;
			result.alwaysUp = noonAlt > riseSetAlt;
			result.alwaysDown = noonAlt <= riseSetAlt;
		}
		return result;
	}
	function nutationObliquity(t) {
		const om = rad * (125.04452 - 1934.136261 * t);
		const ls = rad * (280.4665 + 36000.7698 * t);
		const lm = rad * (218.3165 + 481267.8813 * t);
		const dpsi = (-17.2 * sin(om) - 1.32 * sin(2 * ls) - .23 * sin(2 * lm) + .21 * sin(2 * om)) / 3600;
		const deps = (9.2 * cos(om) + .57 * cos(2 * ls) + .1 * cos(2 * lm) - .09 * cos(2 * om)) / 3600;
		const eps0 = 23.439291 - t * (.0130042 + t * (16e-8 - t * 504e-9));
		return {
			dpsi,
			eps: rad * (eps0 + deps)
		};
	}
	const moonLon = new Int32Array([
		0,
		0,
		1,
		0,
		6288774,
		-20905355,
		2,
		0,
		-1,
		0,
		1274027,
		-3699111,
		2,
		0,
		0,
		0,
		658314,
		-2955968,
		0,
		0,
		2,
		0,
		213618,
		-569925,
		0,
		1,
		0,
		0,
		-185116,
		48888,
		0,
		0,
		0,
		2,
		-114332,
		-3149,
		2,
		0,
		-2,
		0,
		58793,
		246158,
		2,
		-1,
		-1,
		0,
		57066,
		-152138,
		2,
		0,
		1,
		0,
		53322,
		-170733,
		2,
		-1,
		0,
		0,
		45758,
		-204586,
		0,
		1,
		-1,
		0,
		-40923,
		-129620,
		1,
		0,
		0,
		0,
		-34720,
		108743,
		0,
		1,
		1,
		0,
		-30383,
		104755,
		2,
		0,
		0,
		-2,
		15327,
		10321,
		0,
		0,
		1,
		2,
		-12528,
		0,
		0,
		0,
		1,
		-2,
		10980,
		79661,
		4,
		0,
		-1,
		0,
		10675,
		-34782,
		0,
		0,
		3,
		0,
		10034,
		-23210,
		4,
		0,
		-2,
		0,
		8548,
		-21636,
		2,
		1,
		-1,
		0,
		-7888,
		24208,
		2,
		1,
		0,
		0,
		-6766,
		30824,
		1,
		0,
		-1,
		0,
		-5163,
		-8379,
		1,
		1,
		0,
		0,
		4987,
		-16675,
		2,
		-1,
		1,
		0,
		4036,
		-12831,
		2,
		0,
		2,
		0,
		3994,
		-10445,
		4,
		0,
		0,
		0,
		3861,
		-11650,
		2,
		0,
		-3,
		0,
		3665,
		14403,
		0,
		1,
		-2,
		0,
		-2689,
		-7003,
		2,
		0,
		-1,
		2,
		-2602,
		0,
		2,
		-1,
		-2,
		0,
		2390,
		10056,
		1,
		0,
		1,
		0,
		-2348,
		6322,
		2,
		-2,
		0,
		0,
		2236,
		-9884,
		0,
		1,
		2,
		0,
		-2120,
		5751,
		0,
		2,
		0,
		0,
		-2069,
		0,
		2,
		-2,
		-1,
		0,
		2048,
		-4950,
		2,
		0,
		1,
		-2,
		-1773,
		4130,
		2,
		0,
		0,
		2,
		-1595,
		0,
		4,
		-1,
		-1,
		0,
		1215,
		-3958,
		0,
		0,
		2,
		2,
		-1110,
		0,
		3,
		0,
		-1,
		0,
		-892,
		3258,
		2,
		1,
		1,
		0,
		-810,
		2616,
		4,
		-1,
		-2,
		0,
		759,
		-1897,
		0,
		2,
		-1,
		0,
		-713,
		-2117,
		2,
		2,
		-1,
		0,
		-700,
		2354,
		2,
		1,
		-2,
		0,
		691,
		0,
		2,
		-1,
		0,
		-2,
		596,
		0,
		4,
		0,
		1,
		0,
		549,
		-1423,
		0,
		0,
		4,
		0,
		537,
		-1117,
		4,
		-1,
		0,
		0,
		520,
		-1571,
		1,
		0,
		-2,
		0,
		-487,
		-1739,
		2,
		1,
		0,
		-2,
		-399,
		0,
		0,
		0,
		2,
		-2,
		-381,
		-4421,
		1,
		1,
		1,
		0,
		351,
		0,
		3,
		0,
		-2,
		0,
		-340,
		0,
		4,
		0,
		-3,
		0,
		330,
		0,
		2,
		-1,
		2,
		0,
		327,
		0,
		0,
		2,
		1,
		0,
		-323,
		1165,
		1,
		1,
		-1,
		0,
		299,
		0,
		2,
		0,
		3,
		0,
		294,
		0,
		2,
		0,
		-1,
		-2,
		0,
		8752
	]);
	const moonLat = new Int32Array([
		0,
		0,
		0,
		1,
		5128122,
		0,
		0,
		1,
		1,
		280602,
		0,
		0,
		1,
		-1,
		277693,
		2,
		0,
		0,
		-1,
		173237,
		2,
		0,
		-1,
		1,
		55413,
		2,
		0,
		-1,
		-1,
		46271,
		2,
		0,
		0,
		1,
		32573,
		0,
		0,
		2,
		1,
		17198,
		2,
		0,
		1,
		-1,
		9266,
		0,
		0,
		2,
		-1,
		8822,
		2,
		-1,
		0,
		-1,
		8216,
		2,
		0,
		-2,
		-1,
		4324,
		2,
		0,
		1,
		1,
		4200,
		2,
		1,
		0,
		-1,
		-3359,
		2,
		-1,
		-1,
		1,
		2463,
		2,
		-1,
		0,
		1,
		2211,
		2,
		-1,
		-1,
		-1,
		2065,
		0,
		1,
		-1,
		-1,
		-1870,
		4,
		0,
		-1,
		-1,
		1828,
		0,
		1,
		0,
		1,
		-1794,
		0,
		0,
		0,
		3,
		-1749,
		0,
		1,
		-1,
		1,
		-1565,
		1,
		0,
		0,
		1,
		-1491,
		0,
		1,
		1,
		1,
		-1475,
		0,
		1,
		1,
		-1,
		-1410,
		0,
		1,
		0,
		-1,
		-1344,
		1,
		0,
		0,
		-1,
		-1335,
		0,
		0,
		3,
		1,
		1107,
		4,
		0,
		0,
		-1,
		1021,
		4,
		0,
		-1,
		1,
		833,
		0,
		0,
		1,
		-3,
		777,
		4,
		0,
		-2,
		1,
		671,
		2,
		0,
		0,
		-3,
		607,
		2,
		0,
		2,
		-1,
		596,
		2,
		-1,
		1,
		-1,
		491,
		2,
		0,
		-2,
		1,
		-451,
		0,
		0,
		3,
		-1,
		439,
		2,
		0,
		2,
		1,
		422,
		2,
		0,
		-3,
		-1,
		421,
		2,
		1,
		-1,
		1,
		-366,
		2,
		1,
		0,
		1,
		-351,
		4,
		0,
		0,
		1,
		331,
		2,
		-1,
		1,
		1,
		315,
		2,
		-2,
		0,
		-1,
		302,
		0,
		0,
		1,
		3,
		-283,
		2,
		1,
		1,
		-1,
		-229,
		1,
		1,
		0,
		-1,
		223,
		1,
		1,
		0,
		1,
		223,
		0,
		1,
		-2,
		-1,
		-220,
		2,
		1,
		-1,
		-1,
		-220,
		1,
		0,
		1,
		1,
		-185,
		2,
		-1,
		-2,
		-1,
		181,
		0,
		1,
		2,
		1,
		-177,
		4,
		0,
		-2,
		-1,
		176,
		4,
		-1,
		-1,
		-1,
		166,
		1,
		0,
		1,
		-1,
		-164,
		4,
		0,
		1,
		-1,
		132,
		1,
		0,
		-1,
		-1,
		-119,
		4,
		-1,
		0,
		-1,
		115,
		2,
		-2,
		0,
		1,
		107
	]);
	function moonCoords(d) {
		const t = d / 36525;
		const Lp = 218.3164477 + t * (481267.88123421 + t * (-.0015786 + t * (1 / 538841 - t / 65194e3)));
		const D = 297.8501921 + t * (445267.1114034 + t * (-.0018819 + t * (1 / 545868 - t / 113065e3)));
		const M = 357.5291092 + t * (35999.0502909 + t * (-1536e-7 + t / 2449e4));
		const Mp = 134.9633964 + t * (477198.8675055 + t * (.0087414 + t * (1 / 69699 - t / 14712e3)));
		const F = 93.272095 + t * (483202.0175233 + t * (-.0036539 + t * (-1 / 3526e3 + t / 86331e4)));
		const A1 = 119.75 + 131.849 * t;
		const A2 = 53.09 + 479264.29 * t;
		const A3 = 313.45 + 481266.484 * t;
		const E = 1 - t * (.002516 + t * 74e-7);
		const Dr = rad * D, Mr = rad * M, Mpr = rad * Mp, Fr = rad * F;
		let sl = 0, sr = 0, sb = 0;
		for (let i = 0; i < moonLon.length; i += 6) {
			const m = moonLon[i + 1];
			const arg = moonLon[i] * Dr + m * Mr + moonLon[i + 2] * Mpr + moonLon[i + 3] * Fr;
			const f = m === 1 || m === -1 ? E : m === 2 || m === -2 ? E * E : 1;
			sl += moonLon[i + 4] * f * sin(arg);
			sr += moonLon[i + 5] * f * cos(arg);
		}
		for (let i = 0; i < moonLat.length; i += 5) {
			const m = moonLat[i + 1];
			const arg = moonLat[i] * Dr + m * Mr + moonLat[i + 2] * Mpr + moonLat[i + 3] * Fr;
			const f = m === 1 || m === -1 ? E : m === 2 || m === -2 ? E * E : 1;
			sb += moonLat[i + 4] * f * sin(arg);
		}
		const A1r = rad * A1, Lpr = rad * Lp;
		sl += 3958 * sin(A1r) + 1962 * sin(Lpr - Fr) + 318 * sin(rad * A2);
		sb += -2235 * sin(Lpr) + 382 * sin(rad * A3) + 175 * sin(A1r - Fr) + 175 * sin(A1r + Fr) + 127 * sin(Lpr - Mpr) - 115 * sin(Lpr + Mpr);
		const { dpsi, eps } = nutationObliquity(t);
		const l = rad * (Lp + sl / 1e6 + dpsi);
		const b = rad * (sb / 1e6);
		return {
			ra: atan(sin(l) * cos(eps) - tan(b) * sin(eps), cos(l)),
			dec: asin(sin(b) * cos(eps) + cos(b) * sin(eps) * sin(l)),
			dist: 385000.56 + sr / 1e3
		};
	}
	function getMoonPosition(date, lat, lng) {
		const lw = rad * -lng;
		const phi = rad * lat;
		const d = toDays(date);
		const c = moonCoords(toDaysTT(d));
		const H = siderealTime(d, lw) - c.ra;
		const hGeo = altitude(H, phi, c.dec);
		const h = hGeo - asin(earthRadius / c.dist * cos(hGeo));
		const pa = atan(sin(H), tan(phi) * cos(c.dec) - sin(c.dec) * cos(H));
		return {
			azimuth: azimuth(H, phi, c.dec),
			altitude: (h + astroRefraction(h)) / rad,
			distance: c.dist,
			parallacticAngle: pa / rad
		};
	}
	function getMoonIllumination(date = /* @__PURE__ */ new Date()) {
		const d = toDaysTT(toDays(date));
		const s = sunCoords(d);
		const m = moonCoords(d);
		const sdist = 149598e3;
		const phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra));
		const inc = atan(sdist * sin(phi), m.dist - sdist * cos(phi));
		const angle = atan(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra));
		const waxing = angle < 0;
		return {
			fraction: (1 + cos(inc)) / 2,
			phase: .5 + .5 * inc * (waxing ? -1 : 1) / PI,
			angle: angle / rad,
			waxing
		};
	}
	function hoursLater(date, h) {
		return new Date(date.valueOf() + h * dayMs / 24);
	}
	function moonHeight(date, lat, lng) {
		const p = getMoonPosition(date, lat, lng);
		return p.altitude + .2725 * asin(earthRadius / p.distance) / rad + .09;
	}
	function refineMoonCross(tMs, lat, lng) {
		for (let i = 0; i < 2; i++) {
			const h = moonHeight(new Date(tMs), lat, lng);
			const dh = (moonHeight(new Date(tMs + 3e4), lat, lng) - moonHeight(/* @__PURE__ */ new Date(tMs - 3e4), lat, lng)) / 6e4;
			tMs -= h / dh;
		}
		return tMs;
	}
	function moonHourAngle(t, lw) {
		const d = toDays(t);
		return siderealTime(d, lw) - moonCoords(toDaysTT(d)).ra;
	}
	function moonTransit(t0, lw, H0) {
		const rate = 2 * PI * .96614 / dayMs;
		const a = H0 - moonHourAngle(t0, lw);
		let t = t0 + (a - 2 * PI * floor(a / (2 * PI))) / rate;
		for (let i = 0; i < 2; i++) t -= wrapPi(moonHourAngle(t, lw) - H0) / rate;
		return t < t0 + dayMs ? t : void 0;
	}
	function getMoonTimes(date, lat, lng, utcOffset) {
		const t = utcOffset === void 0 ? fromJulian(solarDayTransit(date, rad * -lng) + J2000 - .5) : new Date(civilMidnight(date, utcOffset));
		let h0 = moonHeight(t, lat, lng);
		let rise, set, hMax = h0;
		for (let i = 1; i <= 24; i += 2) {
			const h1 = moonHeight(hoursLater(t, i), lat, lng);
			const h2 = moonHeight(hoursLater(t, i + 1), lat, lng);
			hMax = Math.max(hMax, h1, h2);
			const a = (h0 + h2) / 2 - h1;
			const b = (h2 - h0) / 2;
			const xe = -b / (2 * a);
			const d = b * b - 4 * a * h1;
			let roots = 0, x1 = 0, x2 = 0;
			const ye = (a * xe + b) * xe + h1;
			if (d >= 0) {
				const dx = sqrt(d) / (abs(a) * 2);
				x1 = xe - dx;
				x2 = xe + dx;
				if (abs(x1) <= 1) roots++;
				if (abs(x2) <= 1) roots++;
				if (x1 < -1) x1 = x2;
			}
			if (roots === 1) {
				if (h0 < 0) rise = i + x1;
				else set = i + x1;
			} else if (roots === 2) {
				rise = i + (ye < 0 ? x2 : x1);
				set = i + (ye < 0 ? x1 : x2);
			}
			if (rise !== void 0 && set !== void 0) break;
			h0 = h2;
		}
		const result = {};
		if (rise !== void 0) result.rise = new Date(refineMoonCross(hoursLater(t, rise).valueOf(), lat, lng));
		if (set !== void 0) result.set = new Date(refineMoonCross(hoursLater(t, set).valueOf(), lat, lng));
		const lw = rad * -lng;
		const transit = moonTransit(t.valueOf(), lw, 0);
		const lowerTransit = moonTransit(t.valueOf(), lw, PI);
		if (transit !== void 0) result.transit = new Date(transit);
		if (lowerTransit !== void 0) result.lowerTransit = new Date(lowerTransit);
		if (rise === void 0 && set === void 0) {
			result.alwaysUp = hMax > 0;
			result.alwaysDown = hMax <= 0;
		}
		return result;
	}
	//#endregion
	exports.addTime = addTime;
	exports.getMoonIllumination = getMoonIllumination;
	exports.getMoonPosition = getMoonPosition;
	exports.getMoonTimes = getMoonTimes;
	exports.getPosition = getPosition;
	exports.getTimes = getTimes;
	exports.times = times;
});
