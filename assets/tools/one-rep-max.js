/* Lift Vault Tools — One Rep Max Calculator
 * ------------------------------------------------------------------------
 * weight x reps (+ optional RPE) -> estimated 1RM, a %1RM working-weight
 * table, and a rep-max curve.
 *
 * Math (source-verified, not from memory):
 *   Epley    1RM = w * (1 + r/30)
 *   Brzycki  1RM = w * 36/(37 - r)      (== w / (1.0278 - 0.0278 r))
 *   Lombardi 1RM = w * r^0.10
 * Accuracy is good ~2-10 reps and degrades past 10, so results are labeled
 * estimates and a warning shows above 10 reps.
 *
 * The RPE -> %1RM grid is the canonical Tuchscherer / RTS decimal table
 * (anchors: 1@10=100, 2@10=95.5, 3@10=92.2, 5@10=86.3). The "2.5%-linear"
 * table circulating elsewhere is WRONG (it gives 5@10=90%) and is not used.
 *
 * compute() is pure and dual-exported for the Node golden-vector tests.
 * ------------------------------------------------------------------------ */
(function () {
	'use strict';

		// RTS grid: key = RPE string, value = %1RM by reps (index = reps - 1, reps 1..10).
	// Columns in the published table are RPE 10..6; here each row is indexed by reps.
	var RPE_GRID = {
		'10':  [100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9],
		'9.5': [97.8, 93.9, 90.7, 87.8, 85.0, 82.4, 79.9, 77.4, 75.1, 72.8],
		'9':   [95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 71.7],
		'8.5': [93.9, 90.7, 87.8, 85.0, 82.4, 79.9, 77.4, 75.1, 72.8, 70.7],
		'8':   [92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 71.7, 69.6],
		'7.5': [90.7, 87.8, 85.0, 82.4, 79.9, 77.4, 75.1, 72.8, 70.7, 68.6],
		'7':   [89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 71.7, 69.6, 67.6],
		'6.5': [87.8, 85.0, 82.4, 79.9, 77.4, 75.1, 72.8, 70.7, 68.6, 66.6],
		'6':   [86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 71.7, 69.6, 67.6, 65.6]
	};

	var PCTS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];
	// Typical reps at each %1RM — explicitly an estimate (labeled in the UI).
	var TYP_REPS = { 100: 1, 95: 2, 90: 4, 85: 6, 80: 8, 75: 10, 70: 12, 65: 14, 60: 16, 55: 18, 50: 20 };

	function round2(n) { return Math.round(n * 100) / 100; }
	function round1(n) { return Math.round(n * 10) / 10; }

	// PURE. No DOM, no globals.
	function compute1rm(v) {
		var unit = v.unit === 'lb' ? 'lb' : 'kg';
		var w = parseFloat(v.weight) || 0;
		var r = parseInt(v.reps, 10) || 1;
		if (r < 1) r = 1;
		var rpe = (v.rpe === undefined || v.rpe === null) ? '' : String(v.rpe);

		var epley = w * (1 + r / 30);
		var brzycki = r < 37 ? w * 36 / (37 - r) : epley;
		var lombardi = w * Math.pow(r, 0.10);

		var est, basis;
		if (r === 1 && !rpe) {
			est = w;
			basis = '1 rep = your tested max';
		} else if (rpe && r <= 10 && RPE_GRID[rpe]) {
			var pct = RPE_GRID[rpe][r - 1];
			est = w / (pct / 100);
			basis = 'From RPE ' + rpe + ' @ ' + r + ' reps = ' + pct + '% of 1RM';
		} else {
			est = (epley + brzycki) / 2;
			basis = 'Epley & Brzycki, averaged';
		}
		est = round2(est);

		var table = PCTS.map(function (p) {
			return { pct: p, weight: round2(est * p / 100), reps: TYP_REPS[p] };
		});
		// Rep-max curve anchored so 1 rep == the 1RM (est). Using (rr-1)/30 keeps the top row equal
		// to the headline estimate instead of Epley's slightly-under value at r=1.
		var curve = [];
		for (var rr = 1; rr <= 8; rr++) {
			var wr = est / (1 + (rr - 1) / 30);
			curve.push({ reps: rr, weight: round2(wr), pctOfMax: round2(wr / est * 100) });
		}

		return {
			unit: unit,
			est: est,
			basis: basis,
			formulas: { epley: round2(epley), brzycki: round2(brzycki), lombardi: round2(lombardi) },
			table: table,
			curve: curve,
			highRep: r > 10
		};
	}

	/* ---------- rendering (browser only) ---------- */
	function fmt1(n) { return round1(n).toString(); }

	function render(res, host) {
		var unit = res.unit;
		host.innerHTML = '';

		var grid = document.createElement('div');
		grid.className = 'lvt-readout-grid';

		// LEFT: big number + basis + (warn) + rep-max curve
		var left = document.createElement('div');

		var stat = document.createElement('div');
		stat.className = 'lvt-stat';
		stat.innerHTML =
			'<div class="lvt-stat-label">Estimated 1RM</div>' +
			'<div class="lvt-stat-num">' + fmt1(res.est) + '<span class="lvt-stat-u">' + unit + '</span></div>' +
			'<div class="lvt-stat-basis">' + res.basis + '</div>';
		left.appendChild(stat);

		if (res.highRep) {
			var warn = document.createElement('div');
			warn.className = 'lvt-note warn';
			warn.textContent = '△ Estimates are most accurate at 2 to 10 reps. Past 10 reps the error grows, so treat this as a rough figure.';
			left.appendChild(warn);
		}

		var curveWrap = document.createElement('div');
		curveWrap.className = 'lvt-bars';
		curveWrap.innerHTML = '<div class="lvt-bars-label">Rep-max curve (est.)</div>';
		res.curve.forEach(function (c) {
			var row = document.createElement('div');
			row.className = 'lvt-bar-row';
			row.innerHTML =
				'<span class="lvt-bar-label">' + c.reps + 'RM</span>' +
				'<span class="lvt-bar-track"><span class="lvt-bar-fill" style="width:' + c.pctOfMax + '%"></span></span>' +
				'<span class="lvt-bar-val">' + fmt1(c.weight) + '</span>';
			curveWrap.appendChild(row);
		});
		left.appendChild(curveWrap);

		// RIGHT: %1RM working-weight table
		var right = document.createElement('div');
		var tlabel = document.createElement('div');
		tlabel.className = 'lvt-bars-label';
		tlabel.textContent = 'Working weights (% of 1RM)';
		right.appendChild(tlabel);

		// Build the COMPLETE <table>...</table> string and parse it in a div context.
		// Setting innerHTML directly on a <table> element drops <thead>/<tbody>/<tr>/<td>
		// (the HTML fragment parser's "in-table" insertion mode), which left the table as
		// raw text on some pages. insertAdjacentHTML on the parent div parses reliably.
		var rows = res.table.map(function (t) {
			var hl = t.pct === 100 ? ' class="hl"' : '';
			return '<tr' + hl + '><td>' + t.pct + '%</td><td>' + fmt1(t.weight) + ' ' + unit +
				'</td><td class="dim">' + t.reps + '</td></tr>';
		}).join('');
		right.insertAdjacentHTML('beforeend',
			'<table class="lvt-table"><thead><tr><th>% 1RM</th><th>Weight</th><th>&#8776; reps</th></tr></thead><tbody>' +
			rows + '</tbody></table>');

		grid.appendChild(left);
		grid.appendChild(right);
		host.appendChild(grid);
	}

	var def = {
		id: 'one-rep-max',
		version: '0.1.2',
		title: 'One Rep Max Calculator',
		units: ['kg', 'lb'],
		convertOnUnitChange: true,
		inputs: [
			{ id: 'weight', label: 'Weight lifted', type: 'number', min: 0, max: 1500, step: 2.5, def: { kg: 100, lb: 225 } },
			{ id: 'reps', label: 'Reps', type: 'number', min: 1, max: 12, step: 1, def: 5, convert: false },
			{ id: 'rpe', label: 'RPE (optional)', type: 'select', convert: false, def: '', opts: [
				{ value: '', label: 'none' },
				{ value: '10', label: 'RPE 10' }, { value: '9.5', label: 'RPE 9.5' },
				{ value: '9', label: 'RPE 9' }, { value: '8.5', label: 'RPE 8.5' },
				{ value: '8', label: 'RPE 8' }, { value: '7.5', label: 'RPE 7.5' },
				{ value: '7', label: 'RPE 7' }, { value: '6.5', label: 'RPE 6.5' },
				{ value: '6', label: 'RPE 6' }
			] }
		],
		compute: compute1rm,
		render: render
	};

	// dual export: Node tests get the pure def; the browser registers it with the shell.
	if (typeof module !== 'undefined' && module.exports) { module.exports = def; }
	if (typeof window !== 'undefined' && window.LVTools) { window.LVTools.register(def); }
})();
