/* Lift Vault Tools — Warmup Set Calculator
 * ------------------------------------------------------------------------
 * Enter the working weight you're building up to and your bar. The tool lays
 * out a warmup ramp (percentage of the top set) and, for each set, the exact
 * plates to load on each side. Reuses the greedy plate math from the plate
 * loader.
 *
 * compute() is pure and dual-exported for the Node golden-vector tests.
 * ------------------------------------------------------------------------ */
(function () {
	'use strict';

	var KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
	var LB_PLATES = [45, 35, 25, 10, 5, 2.5];
	var EPS = 1e-9;

	// The ramp: percentage of the working (top) set, with descending reps.
	var RAMP = [
		{ label: 'Empty bar', pct: 0, reps: '5-8' },
		{ pct: 40, reps: '5' },
		{ pct: 55, reps: '4' },
		{ pct: 70, reps: '3' },
		{ pct: 85, reps: '2' },
		{ pct: 100, reps: 'work sets', top: true }
	];

	var BARS = {
		kg: [{ value: 20, label: "20 kg · Men's bar" }, { value: 15, label: "15 kg · Women's bar" }, { value: 10, label: '10 kg · Training bar' }],
		lb: [{ value: 45, label: "45 lb · Men's bar" }, { value: 35, label: "35 lb · Women's bar" }, { value: 25, label: '25 lb · Training bar' }]
	};

	function roundInc(w, unit) { var i = unit === 'lb' ? 5 : 2.5; return Math.round(w / i) * i; }
	function round2(n) { return Math.round(n * 100) / 100; }

	function perSide(weight, bar, plates) {
		var rem = (weight - bar) / 2, used = [];
		if (rem < -EPS) return { list: [], leftover: round2(rem) };
		plates.forEach(function (p) { while (rem >= p - EPS) { used.push(p); rem -= p; } });
		return { list: used, leftover: round2(rem) };
	}

	// PURE.
	function computeWarmup(v) {
		var unit = v.unit === 'lb' ? 'lb' : 'kg';
		var plates = unit === 'kg' ? KG_PLATES : LB_PLATES;
		var target = parseFloat(v.target) || 0;
		var bar = parseFloat(v.bar) || 0;

		var weights = [], sets = RAMP.map(function (step) {
			var w = step.pct === 0 ? bar : roundInc(target * step.pct / 100, unit);
			if (w < bar) w = bar;
			var ps = perSide(w, bar, plates);
			var str = (w <= bar || !ps.list.length) ? 'bar only' : ps.list.join(' + ');
			weights.push(w);
			return { label: step.label || (step.pct + '%'), pct: step.pct, reps: step.reps, weight: w, plates: str, top: !!step.top };
		});

		return { unit: unit, target: target, bar: bar, sets: sets, weights: weights };
	}

	/* ---------- rendering (browser only) ---------- */
	function fmt(n) { return (Math.round(n * 100) / 100).toString(); }

	function render(res, host) {
		var unit = res.unit;
		host.innerHTML = '';

		if (res.target <= res.bar) {
			var note0 = document.createElement('div');
			note0.className = 'lvt-note warn';
			note0.textContent = 'Enter a working weight heavier than the bar (' + fmt(res.bar) + ' ' + unit + ') to build a warmup ramp.';
			host.appendChild(note0);
			return;
		}

		var rows = res.sets.map(function (s) {
			var hl = s.top ? ' class="hl"' : '';
			return '<tr' + hl + '><td>' + s.label + '</td><td>' + s.reps + '</td><td>' + fmt(s.weight) + ' ' + unit +
				'</td><td class="dim">' + s.plates + '</td></tr>';
		}).join('');
		var wrap = document.createElement('div');
		wrap.insertAdjacentHTML('beforeend',
			'<table class="lvt-table"><thead><tr><th>Set</th><th>Reps</th><th>Weight</th><th>Plates / side</th></tr></thead><tbody>' +
			rows + '</tbody></table>');
		host.appendChild(wrap);

		var note = document.createElement('div');
		note.className = 'lvt-note';
		note.textContent = 'Warm up to ' + fmt(res.target) + ' ' + unit + ' with the sets above, then start your work sets. Rest is short early and a bit longer on the last two ramp sets. Plates shown are per side.';
		host.appendChild(note);
	}

	var def = {
		id: 'warmup-calculator',
		version: '0.1.1',
		title: 'Warmup Set Calculator',
		units: ['kg', 'lb'],
		convertOnUnitChange: true,
		inputs: [
			{ id: 'target', label: 'Working weight', type: 'number', min: 0, max: 1500, step: 2.5, def: { kg: 100, lb: 225 } },
			{ id: 'bar', label: 'Bar', type: 'select', optsByUnit: BARS, def: { kg: 20, lb: 45 } }
		],
		compute: computeWarmup,
		render: render
	};

	if (typeof module !== 'undefined' && module.exports) { module.exports = def; }
	if (typeof window !== 'undefined' && window.LVTools) { window.LVTools.register(def); }
})();
