/* Lift Vault Tools — Strength Ratio / Weak-Point Calculator
 * ------------------------------------------------------------------------
 * Enter your squat, bench, and deadlift (optionally overhead press). Shows
 * your lift ratios against typical ranges for a raw lifter and flags the
 * lift that looks like it's lagging.
 *
 * Typical raw ratios (well-established for the first two, rules-of-thumb for
 * the third): bench ~0.75x squat (0.60-0.85), deadlift ~1.20x squat
 * (1.10-1.30), overhead press ~0.63x bench (0.55-0.75). Sources: Thibaudeau
 * "Know Your Ratios" + aggregated StrengthLevel/ExRx data. These are balance
 * checks, not pass/fail standards; women and novices skew toward the low end
 * on bench:squat.
 *
 * compute() is pure and dual-exported for the Node golden-vector tests.
 * ------------------------------------------------------------------------ */
(function () {
	'use strict';

		var RANGES = {
		bs: { label: 'Bench : Squat', lo: 0.60, hi: 0.85, typ: '0.60 - 0.85' },
		ds: { label: 'Deadlift : Squat', lo: 1.10, hi: 1.30, typ: '1.10 - 1.30' },
		ob: { label: 'Overhead press : Bench', lo: 0.55, hi: 0.75, typ: '0.55 - 0.75' }
	};

	function round2(n) { return Math.round(n * 100) / 100; }
	function status(v, r) { return v < r.lo ? 'low' : (v > r.hi ? 'high' : 'typical'); }

	// PURE.
	function computeRatio(v) {
		var unit = v.unit === 'lb' ? 'lb' : 'kg';
		var squat = parseFloat(v.squat) || 0;
		var bench = parseFloat(v.bench) || 0;
		var deadlift = parseFloat(v.deadlift) || 0;
		var ohp = parseFloat(v.ohp) || 0;

		var out = { unit: unit, valid: squat > 0 && bench > 0 && deadlift > 0 };
		if (!out.valid) return out;

		var bs = round2(bench / squat);
		var ds = round2(deadlift / squat);
		out.benchSquat = bs;
		out.deadSquat = ds;
		out.rows = [
			{ label: RANGES.bs.label, value: bs, typ: RANGES.bs.typ, status: status(bs, RANGES.bs) },
			{ label: RANGES.ds.label, value: ds, typ: RANGES.ds.typ, status: status(ds, RANGES.ds) }
		];
		if (ohp > 0) {
			var ob = round2(ohp / bench);
			out.ohpBench = ob;
			out.rows.push({ label: RANGES.ob.label, value: ob, typ: RANGES.ob.typ, status: status(ob, RANGES.ob) });
		}

		var brLow = bs < RANGES.bs.lo, brHigh = bs > RANGES.bs.hi;
		var drLow = ds < RANGES.ds.lo, drHigh = ds > RANGES.ds.hi;
		if (brLow) out.verdictKey = 'bench-low';
		else if (drLow) out.verdictKey = 'deadlift-low';
		else if (brHigh && drHigh) out.verdictKey = 'squat-low';
		else out.verdictKey = 'balanced';

		out.verdict = {
			'bench-low': 'Your bench is lagging behind your squat. Extra pressing volume or frequency is the usual fix.',
			'deadlift-low': 'Your deadlift is lagging behind your squat. Pulling volume and posterior-chain work help here.',
			'squat-low': 'Your squat is lagging behind your bench and deadlift. More squat frequency or quad work is worth a look.',
			'balanced': 'Your squat, bench, and deadlift look reasonably balanced.'
		}[out.verdictKey];
		return out;
	}

	/* ---------- rendering (browser only) ---------- */
	function fmt(n) { return (Math.round(n * 100) / 100).toString(); }
	var STATUS_WORD = { low: 'low', typical: 'in range', high: 'high' };

	function render(res, host) {
		host.innerHTML = '';
		if (!res.valid) {
			var m = document.createElement('div');
			m.className = 'lvt-note';
			m.textContent = 'Enter your squat, bench, and deadlift to check your lift balance.';
			host.appendChild(m);
			return;
		}

		var rows = res.rows.map(function (r) {
			var hl = r.status !== 'typical' ? ' class="hl"' : '';
			return '<tr' + hl + '><td>' + r.label + '</td><td>' + fmt(r.value) + '</td><td class="dim">' + r.typ +
				'</td><td>' + STATUS_WORD[r.status] + '</td></tr>';
		}).join('');
		var wrap = document.createElement('div');
		wrap.insertAdjacentHTML('beforeend',
			'<table class="lvt-table"><thead><tr><th>Ratio</th><th>Yours</th><th>Typical</th><th>Status</th></tr></thead><tbody>' +
			rows + '</tbody></table>');
		host.appendChild(wrap);

		var note = document.createElement('div');
		note.className = 'lvt-note';
		note.textContent = res.verdict + ' These ratios are balance checks for raw lifters, not hard standards, and they vary with sex and experience.';
		host.appendChild(note);
	}

	var def = {
		id: 'strength-ratio',
		version: '0.1.1',
		title: 'Strength Ratio Calculator',
		units: ['kg', 'lb'],
		convertOnUnitChange: true,
		inputs: [
			{ id: 'squat', label: 'Squat', type: 'number', min: 0, max: { kg: 700, lb: 1550 }, step: 2.5, def: { kg: 200, lb: 440 } },
			{ id: 'bench', label: 'Bench', type: 'number', min: 0, max: { kg: 500, lb: 1100 }, step: 2.5, def: { kg: 140, lb: 310 } },
			{ id: 'deadlift', label: 'Deadlift', type: 'number', min: 0, max: { kg: 700, lb: 1550 }, step: 2.5, def: { kg: 240, lb: 530 } },
			{ id: 'ohp', label: 'Overhead press (optional)', type: 'number', min: 0, max: { kg: 400, lb: 880 }, step: 2.5, def: { kg: 0, lb: 0 } }
		],
		compute: computeRatio,
		render: render
	};

	if (typeof module !== 'undefined' && module.exports) { module.exports = def; }
	if (typeof window !== 'undefined' && window.LVTools) { window.LVTools.register(def); }
})();
