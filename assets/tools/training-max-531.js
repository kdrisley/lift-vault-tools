/* Lift Vault Tools — 5/3/1 Training Max Calculator
 * ------------------------------------------------------------------------
 * Enter your 1-rep max, pick a training-max percentage, and get your
 * training max plus the full 5/3/1 weekly loading (3 main weeks + deload).
 *
 * Percentages are Jim Wendler's original 5/3/1 (of the TRAINING max):
 *   Week 1 (5s):    65 x5,  75 x5,  85 x5+
 *   Week 2 (3s):    70 x3,  80 x3,  90 x3+
 *   Week 3 (5/3/1): 75 x5,  85 x3,  95 x1+
 *   Deload:         40 x5,  50 x5,  60 x5
 * Weights round to the nearest 2.5 kg / 5 lb, matching how plates load.
 *
 * compute() is pure and dual-exported for the Node golden-vector tests.
 * ------------------------------------------------------------------------ */
(function () {
	'use strict';

		var WEEKS = [
		{ name: 'Week 1 — 5s', sets: [{ pct: 65, reps: '5' }, { pct: 75, reps: '5' }, { pct: 85, reps: '5+' }] },
		{ name: 'Week 2 — 3s', sets: [{ pct: 70, reps: '3' }, { pct: 80, reps: '3' }, { pct: 90, reps: '3+' }] },
		{ name: 'Week 3 — 5/3/1', sets: [{ pct: 75, reps: '5' }, { pct: 85, reps: '3' }, { pct: 95, reps: '1+' }] },
		{ name: 'Deload', sets: [{ pct: 40, reps: '5' }, { pct: 50, reps: '5' }, { pct: 60, reps: '5' }] }
	];

	function inc(unit) { return unit === 'lb' ? 5 : 2.5; }
	function roundInc(w, unit) { var i = inc(unit); return Math.round(w / i) * i; }

	// PURE. No DOM, no globals.
	function computeTM(v) {
		var unit = v.unit === 'lb' ? 'lb' : 'kg';
		var oneRM = parseFloat(v.oneRM) || 0;
		var tmPct = parseFloat(v.tmPct) || 90;
		var tm = roundInc(oneRM * tmPct / 100, unit);

		var flatWeights = [];
		var weeks = WEEKS.map(function (wk) {
			return {
				name: wk.name,
				sets: wk.sets.map(function (s) {
					var w = roundInc(tm * s.pct / 100, unit);
					flatWeights.push(w);
					return { pct: s.pct, reps: s.reps, weight: w, amrap: s.reps.indexOf('+') >= 0 };
				})
			};
		});

		return { unit: unit, oneRM: oneRM, tmPct: tmPct, tm: tm, weeks: weeks, flatWeights: flatWeights };
	}

	/* ---------- rendering (browser only) ---------- */
	function fmt(n) { return (Math.round(n * 100) / 100).toString(); }

	function render(res, host) {
		var unit = res.unit;
		host.innerHTML = '';

		var stat = document.createElement('div');
		stat.className = 'lvt-stat';
		stat.innerHTML =
			'<div class="lvt-stat-label">Training Max</div>' +
			'<div class="lvt-stat-num">' + fmt(res.tm) + '<span class="lvt-stat-u">' + unit + '</span></div>' +
			'<div class="lvt-stat-basis">' + res.tmPct + '% of ' + fmt(res.oneRM) + ' ' + unit + ' max</div>';
		host.appendChild(stat);

		var grid = document.createElement('div');
		grid.className = 'lvt-readout-grid';
		res.weeks.forEach(function (wk) {
			var block = document.createElement('div');
			var rows = wk.sets.map(function (s) {
				var hl = s.amrap ? ' class="hl"' : '';
				return '<tr' + hl + '><td>' + s.pct + '%</td><td>' + s.reps + '</td><td>' + fmt(s.weight) + ' ' + unit + '</td></tr>';
			}).join('');
			block.innerHTML = '<div class="lvt-bars-label">' + wk.name + '</div>';
			block.insertAdjacentHTML('beforeend',
				'<table class="lvt-table"><thead><tr><th>Set</th><th>Reps</th><th>Weight</th></tr></thead><tbody>' +
				rows + '</tbody></table>');
			grid.appendChild(block);
		});
		host.appendChild(grid);

		var note = document.createElement('div');
		note.className = 'lvt-note';
		note.textContent = 'The last set of each main week is an AMRAP (marked with +): do as many reps as you can with good form. Deload is week 4.';
		host.appendChild(note);
	}

	var def = {
		id: 'training-max-531',
		version: '0.1.1',
		title: '5/3/1 Training Max Calculator',
		units: ['kg', 'lb'],
		convertOnUnitChange: true,
		inputs: [
			{ id: 'oneRM', label: '1-rep max', type: 'number', min: 0, max: 1500, step: 2.5, def: { kg: 100, lb: 225 } },
			{ id: 'tmPct', label: 'Training max %', type: 'select', convert: false, def: '90', opts: [
				{ value: '90', label: '90% (Wendler default)' },
				{ value: '85', label: '85% (conservative)' }
			] }
		],
		compute: computeTM,
		render: render
	};

	if (typeof module !== 'undefined' && module.exports) { module.exports = def; }
	if (typeof window !== 'undefined' && window.LVTools) { window.LVTools.register(def); }
})();
