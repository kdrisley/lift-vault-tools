/* Lift Vault Tools — Barbell Plate Loader
 * ------------------------------------------------------------------------
 * Greedy plate load: given a target and a bar, which plates go on each side.
 * `unit` selects the plate set you own (kg vs lb) — it does NOT convert the
 * number, because you don't convert a barbell load in a real gym; you know
 * your gym's unit. This sidesteps the double-toggle rounding drift the demo had.
 *
 * compute() is pure and dual-exported for the Node golden-vector tests.
 * ------------------------------------------------------------------------ */
(function () {
	'use strict';

	// Standard competition/gym denominations. Colors are IPF/Olympic reference for the big kg plates
	// and are decorative only (lb plates are commonly all-black iron — colors here aid scanning).
	var KG_PLATES = [
		{ w: 25, c: 'red' }, { w: 20, c: 'blue' }, { w: 15, c: 'yellow' },
		{ w: 10, c: 'green' }, { w: 5, c: 'white' }, { w: 2.5, c: 'dark' }, { w: 1.25, c: 'silver' }
	];
	var LB_PLATES = [
		{ w: 45, c: 'blue' }, { w: 35, c: 'yellow' }, { w: 25, c: 'green' },
		{ w: 10, c: 'white' }, { w: 5, c: 'dark' }, { w: 2.5, c: 'silver' }
	];
	var BARS = {
		kg: [
			{ value: 20, label: "20 kg · Men's bar" }, { value: 15, label: "15 kg · Women's bar" },
			{ value: 10, label: '10 kg · Training bar' }, { value: 0, label: 'No bar (0)' }
		],
		lb: [
			{ value: 45, label: "45 lb · Men's bar" }, { value: 35, label: "35 lb · Women's bar" },
			{ value: 25, label: '25 lb · Training bar' }, { value: 0, label: 'No bar (0)' }
		]
	};
	var EPS = 1e-9;

	function round2(n) { return Math.round(n * 100) / 100; }

	// PURE. Returns the load solution or an error flag. No DOM, no globals.
	function computePlates(v) {
		var unit = v.unit === 'lb' ? 'lb' : 'kg';
		var plates = unit === 'kg' ? KG_PLATES : LB_PLATES;
		var target = parseFloat(v.target) || 0;
		var bar = parseFloat(v.bar) || 0;
		var perSide = (target - bar) / 2;

		if (perSide < -EPS) {
			return { unit: unit, target: target, bar: bar, error: 'below-bar' };
		}
		var remaining = perSide, used = [];
		plates.forEach(function (p) {
			while (remaining >= p.w - EPS) { used.push(p); remaining -= p.w; }
		});
		var loaded = bar + used.reduce(function (a, p) { return a + p.w * 2; }, 0);
		return {
			unit: unit, target: target, bar: bar,
			perSide: round2(perSide),
			plates: used.map(function (p) { return p.w; }),
			used: used,
			leftover: round2(remaining),
			loaded: round2(loaded),
			exact: remaining < EPS
		};
	}

	/* ---------- rendering (browser only) ---------- */
	var CVAR = { red: '--lvt-pl-red', blue: '--lvt-pl-blue', yellow: '--lvt-pl-yellow', green: '--lvt-pl-green', white: '--lvt-pl-white', dark: '--lvt-pl-dark', silver: '--lvt-pl-silver' };

	function fmt(n) { return (Math.round(n * 100) / 100).toString(); }

	function plateEl(p, unit) {
		var d = document.createElement('div');
		d.className = 'lvt-plate c-' + p.c;
		var max = unit === 'kg' ? 25 : 45;
		d.style.height = Math.round(52 + (p.w / max) * 66) + 'px';
		d.style.width = Math.max(11, Math.round(9 + p.w / (unit === 'kg' ? 2.2 : 4))) + 'px';
		var s = document.createElement('span'); s.textContent = fmt(p.w);
		d.appendChild(s);
		return d;
	}

	function render(res, host, ctx) {
		var unit = res.unit;
		host.innerHTML = '';

		var stage = document.createElement('div'); stage.className = 'lvt-bar-stage';
		var lane = document.createElement('div'); lane.className = 'lvt-bar-lane';

		if (res.error === 'below-bar') {
			var warn = document.createElement('div');
			warn.className = 'lvt-note warn';
			warn.textContent = '△ Target (' + fmt(res.target) + ' ' + unit + ') is below the bar (' + fmt(res.bar) + ' ' + unit + '). Raise the target.';
			host.appendChild(warn);
			return;
		}

		function nub() { var n = document.createElement('div'); n.className = 'lvt-barnub'; return n; }
		function sleeve(plates) {
			var s = document.createElement('div'); s.className = 'lvt-sleeve';
			plates.forEach(function (p) { s.appendChild(plateEl(p, unit)); });
			return s;
		}
		var center = document.createElement('div'); center.className = 'lvt-barnub'; center.style.width = '46px';
		lane.appendChild(nub());
		lane.appendChild(sleeve(res.used));
		lane.appendChild(center);
		lane.appendChild(sleeve(res.used.slice().reverse()));
		lane.appendChild(nub());
		stage.appendChild(lane);
		host.appendChild(stage);

		// per-plate chips
		var chips = document.createElement('div'); chips.className = 'lvt-chips';
		var counts = {};
		res.used.forEach(function (p) { (counts[p.w] = counts[p.w] || { n: 0, c: p.c }).n++; });
		Object.keys(counts).sort(function (a, b) { return b - a; }).forEach(function (w) {
			var c = counts[w];
			var chip = document.createElement('div'); chip.className = 'lvt-chip';
			chip.innerHTML = '<span class="lvt-swatch" style="background:var(' + CVAR[c.c] + ')"></span>' +
				c.n + ' × ' + fmt(w) + ' ' + unit + ' <em>/side</em>';
			chips.appendChild(chip);
		});
		if (!res.used.length) {
			var empty = document.createElement('div'); empty.className = 'lvt-chip';
			empty.innerHTML = '<em>empty bar · no plates needed</em>';
			chips.appendChild(empty);
		}
		host.appendChild(chips);

		var note = document.createElement('div');
		if (res.exact) {
			note.className = 'lvt-note ok';
			note.textContent = '✓ Exact · ' + fmt(res.bar) + ' bar + ' + fmt(res.perSide) + '/side = ' + fmt(res.loaded) + ' ' + unit;
		} else {
			note.className = 'lvt-note warn';
			note.textContent = '△ Closest loadable: ' + fmt(res.loaded) + ' ' + unit + ' · ' + fmt(res.leftover) + ' ' + unit + '/side short (no smaller plate).';
		}
		host.appendChild(note);
	}

	var def = {
		id: 'plate-loader',
		version: '0.1.0',
		title: 'Barbell Plate Loader',
		units: ['kg', 'lb'],
		convertOnUnitChange: false,
		inputs: [
			{ id: 'target', label: 'Target weight', type: 'number', min: 0, max: 1500, step: 2.5, def: { kg: 100, lb: 225 } },
			{ id: 'bar', label: 'Bar', type: 'select', optsByUnit: BARS, def: { kg: 20, lb: 45 } }
		],
		compute: computePlates,
		render: render
	};

	// dual export: Node tests get the pure def; the browser registers it with the shell.
	if (typeof module !== 'undefined' && module.exports) { module.exports = def; }
	if (typeof window !== 'undefined' && window.LVTools) { window.LVTools.register(def); }
})();
