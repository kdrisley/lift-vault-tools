/* Lift Vault Tools — Meet Attempt Planner
 * ------------------------------------------------------------------------
 * Enter your best (or goal) squat, bench, and deadlift. For each attempt
 * (opener / second / third) it offers three options — conservative, normal,
 * aggressive — each with the probability of making it, based on real meet data.
 *
 * The make-probability model is P(make a single | weight as a % of your best),
 * built from ~2.5M real competition attempts (OpenPowerlifting, raw, full-power)
 * via data/build-attempt-curves.py. The safe region is the measured opener
 * make-rate-by-depth curve; the near-max and PR region is anchored to the real
 * third-attempt make rates (thirds are made ~67% on squat, ~63% on deadlift,
 * but only ~48% on bench). Values are per lift and monotonic in load.
 *
 * compute() is pure and dual-exported for the Node golden-vector tests.
 * ------------------------------------------------------------------------ */
(function () {
	'use strict';

	
	// P(make) anchors: [weight/best, make%]. From build-attempt-curves.py:
	// opener depth curve (r <= 0.97, clean) + real 3rd-attempt make rates (r ~ 1.0-1.03).
	var PCURVE = {
		squat:    [[0.86, 95], [0.90, 94.5], [0.93, 91.5], [0.95, 86.5], [0.97, 80], [1.00, 70], [1.03, 58], [1.06, 46], [1.09, 36]],
		bench:    [[0.86, 96], [0.90, 95.5], [0.93, 93], [0.95, 90], [0.97, 82], [1.00, 58], [1.03, 46], [1.06, 37], [1.09, 29]],
		deadlift: [[0.86, 98], [0.90, 97.5], [0.93, 95.5], [0.95, 92.5], [0.97, 87.5], [1.00, 68], [1.03, 57], [1.06, 47], [1.09, 38]]
	};
	var LIFTS = ['squat', 'bench', 'deadlift'];
	var LIFT_LABEL = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
	// weight as a fraction of best for each attempt's conservative / normal / aggressive option
	var LEVELS = {
		opener: [0.88, 0.91, 0.94],
		second: [0.93, 0.96, 0.99],
		third:  [1.00, 1.025, 1.05]
	};
	var ATTEMPTS = ['opener', 'second', 'third'];
	var ATTEMPT_LABEL = { opener: 'Opener', second: 'Second', third: 'Third' };
	var OPTION_LABEL = ['Conservative', 'Normal', 'Aggressive'];

	function roundInc(w, unit) { var i = unit === 'lb' ? 5 : 2.5; return Math.round(w / i) * i; }
	function round2(n) { return Math.round(n * 100) / 100; }

	function pMake(lift, r) {
		var a = PCURVE[lift];
		if (r <= a[0][0]) return a[0][1];
		if (r >= a[a.length - 1][0]) return a[a.length - 1][1];
		for (var i = 1; i < a.length; i++) {
			if (r <= a[i][0]) {
				var t = (r - a[i - 1][0]) / (a[i][0] - a[i - 1][0]);
				return Math.round(a[i - 1][1] + t * (a[i][1] - a[i - 1][1]));
			}
		}
		return a[a.length - 1][1];
	}

	// PURE.
	function computePlan(v) {
		var unit = v.unit === 'lb' ? 'lb' : 'kg';
		var lifts = {}, weights = [], probs = [], normalTotal = 0;
		LIFTS.forEach(function (L) {
			var best = parseFloat(v[L]) || 0;
			var attempts = {};
			ATTEMPTS.forEach(function (att) {
				attempts[att] = LEVELS[att].map(function (r, i) {
					var w = roundInc(best * r, unit);
					var p = pMake(L, r);
					weights.push(w); probs.push(p);
					return { label: OPTION_LABEL[i], weight: w, prob: p };
				});
			});
			normalTotal += attempts.third[1].weight; // normal 3rd
			lifts[L] = { best: best, attempts: attempts };
		});
		return { unit: unit, lifts: lifts, weights: weights, probs: probs, normalTotal: round2(normalTotal) };
	}

	/* ---------- rendering (browser only) ---------- */
	function fmt(n) { return (Math.round(n * 100) / 100).toString(); }

	function render(res, host) {
		var unit = res.unit;
		host.innerHTML = '';

		var stat = document.createElement('div');
		stat.className = 'lvt-stat';
		stat.innerHTML =
			'<div class="lvt-stat-label">Projected total (normal 3rd attempts)</div>' +
			'<div class="lvt-stat-num">' + fmt(res.normalTotal) + '<span class="lvt-stat-u">' + unit + '</span></div>' +
			'<div class="lvt-stat-basis">each attempt below shows its make probability</div>';
		host.appendChild(stat);

		LIFTS.forEach(function (L) {
			var lift = res.lifts[L];
			var label = document.createElement('div');
			label.className = 'lvt-bars-label';
			label.textContent = LIFT_LABEL[L] + ' · ' + unit; // unit once per table, not in every cell
			host.appendChild(label);

			var rows = ATTEMPTS.map(function (att) {
				var hl = att === 'third' ? ' class="hl"' : '';
				var cells = lift.attempts[att].map(function (o) {
					return '<td>' + fmt(o.weight) + ' <span class="dim">(' + o.prob + '%)</span></td>';
				}).join('');
				return '<tr' + hl + '><td>' + ATTEMPT_LABEL[att] + '</td>' + cells + '</tr>';
			}).join('');
			var wrap = document.createElement('div');
			wrap.style.marginBottom = '14px';
			wrap.insertAdjacentHTML('beforeend',
				'<table class="lvt-table"><thead><tr><th>Attempt</th><th>Conservative</th><th>Normal</th><th>Aggressive</th></tr></thead><tbody>' +
				rows + '</tbody></table>');
			host.appendChild(wrap);
		});

		var note = document.createElement('div');
		note.className = 'lvt-note';
		note.innerHTML = 'Percentages are the chance of making each attempt, estimated from real competition make rates by how close the weight is to your best. Go up each attempt: your second should beat your opener and your third your second. Bench thirds are the riskiest (made under half the time at a real PR). ' +
			'Model built from ~2.5M attempts in the OpenPowerlifting data behind <a href="https://powerliftingrecords.com/" target="_blank" rel="noopener">Powerlifting Records</a>.';
		host.appendChild(note);
	}

	var def = {
		id: 'meet-attempt-planner',
		version: '0.2.2',
		title: 'Powerlifting Meet Attempt Planner',
		units: ['kg', 'lb'],
		convertOnUnitChange: true,
		inputs: [
			{ id: 'squat', label: 'Best squat', type: 'number', min: 0, max: { kg: 700, lb: 1550 }, step: 2.5, def: { kg: 200, lb: 440 } },
			{ id: 'bench', label: 'Best bench', type: 'number', min: 0, max: { kg: 500, lb: 1100 }, step: 2.5, def: { kg: 140, lb: 310 } },
			{ id: 'deadlift', label: 'Best deadlift', type: 'number', min: 0, max: { kg: 700, lb: 1550 }, step: 2.5, def: { kg: 240, lb: 530 } }
		],
		compute: computePlan,
		render: render
	};

	if (typeof module !== 'undefined' && module.exports) { module.exports = def; }
	if (typeof window !== 'undefined' && window.LVTools) { window.LVTools.register(def); }
})();
