/* Lift Vault Tools — DOTS & Wilks Calculator (powerlifting score)
 * ------------------------------------------------------------------------
 * Enter sex, bodyweight, and your squat/bench/deadlift. Outputs your total
 * plus DOTS and Wilks scores, which normalize the total for bodyweight and
 * sex so lifters of different sizes can be compared.
 *
 * Coefficients verified against the OpenPowerlifting reference implementation
 * and confirmed live on strengthlevel.com (matched to the penny):
 *   DOTS  = total_kg * 500 / (A*bw^4 + B*bw^3 + C*bw^2 + D*bw + E)
 *   Wilks = total_kg * 500 / (A + B*bw + C*bw^2 + D*bw^3 + E*bw^4 + F*bw^5)   [Wilks 1994]
 * Bodyweight is clamped to each formula's valid per-sex range before the
 * polynomial is evaluated. DOTS is the current community standard; Wilks
 * (1994) is shown as the familiar older score. No skill-level bands are shown
 * because none are official.
 *
 * compute() is pure and dual-exported for the Node golden-vector tests.
 * ------------------------------------------------------------------------ */
(function () {
	'use strict';

	var LB_PER_KG = 2.2046226;

	var DOTS = {
		m: { c: [-0.000001093, 0.0007391293, -0.1918759221, 24.0900756, -307.75076], lo: 40.0, hi: 210.0 },
		f: { c: [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288], lo: 40.0, hi: 150.0 }
	};
	var WILKS = {
		m: { c: [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 0.00000701863, -0.000000012910], lo: 40.0, hi: 201.9 },
		f: { c: [594.31747775582, -27.23842536447, 0.82112226871, -0.00930733913, 0.00004731582, -0.00000009054], lo: 26.51, hi: 154.53 }
	};
	// IPF GL Points (Goodlift 2020), classic/raw full-power. GL = 100/(A - B*exp(-C*bw)) * total.
	// bw floored at 35 kg. Coefficients from the official IPF PDF, verified on strengthlevel.com.
	var IPFGL = {
		m: { a: 1199.72839, b: 1025.18162, c: 0.00921 },
		f: { a: 610.32796, b: 1045.59282, c: 0.03048 }
	};

	function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
	function round2(n) { return Math.round(n * 100) / 100; }

	function polyDots(c, bw) {
		return c[0] * Math.pow(bw, 4) + c[1] * Math.pow(bw, 3) + c[2] * bw * bw + c[3] * bw + c[4];
	}
	function polyWilks(c, bw) {
		return c[0] + c[1] * bw + c[2] * bw * bw + c[3] * Math.pow(bw, 3) + c[4] * Math.pow(bw, 4) + c[5] * Math.pow(bw, 5);
	}

	// PURE. No DOM, no globals.
	function computeScore(v) {
		var unit = v.unit === 'lb' ? 'lb' : 'kg';
		var sex = v.sex === 'f' ? 'f' : 'm';
		var toKg = unit === 'lb' ? (1 / LB_PER_KG) : 1;

		var bwKg = (parseFloat(v.bodyweight) || 0) * toKg;
		var totalDisplay = (parseFloat(v.squat) || 0) + (parseFloat(v.bench) || 0) + (parseFloat(v.deadlift) || 0);
		var totalKg = totalDisplay * toKg;

		var dots = 0, wilks = 0, ipfgl = 0;
		if (bwKg > 0 && totalKg > 0) {
			var d = DOTS[sex], w = WILKS[sex], g = IPFGL[sex];
			dots = totalKg * 500 / polyDots(d.c, clamp(bwKg, d.lo, d.hi));
			wilks = totalKg * 500 / polyWilks(w.c, clamp(bwKg, w.lo, w.hi));
			var glDenom = g.a - g.b * Math.exp(-g.c * Math.max(bwKg, 35.0));
			ipfgl = glDenom > 0 ? Math.max(0, 100 / glDenom * totalKg) : 0;
		}

		return {
			unit: unit, sex: sex,
			total: round2(totalDisplay),
			dots: round2(dots),
			ipfgl: round2(ipfgl),
			wilks: round2(wilks),
			valid: bwKg > 0 && totalKg > 0
		};
	}

	/* ---------- rendering (browser only) ---------- */
	function fmt1(n) { return (Math.round(n * 10) / 10).toString(); }

	function render(res, host) {
		host.innerHTML = '';

		if (!res.valid) {
			var msg = document.createElement('div');
			msg.className = 'lvt-note';
			msg.textContent = 'Enter your bodyweight and at least one lift to see your DOTS and Wilks scores.';
			host.appendChild(msg);
			return;
		}

		var grid = document.createElement('div');
		grid.className = 'lvt-readout-grid';
		grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(110px, 1fr))';

		function statBlock(label, value, basis, dim) {
			var d = document.createElement('div');
			d.innerHTML =
				'<div class="lvt-stat"><div class="lvt-stat-label">' + label + '</div>' +
				'<div class="lvt-stat-num"' + (dim ? ' style="color:var(--lvt-ink-mid)"' : '') + '>' + value + '</div>' +
				'<div class="lvt-stat-basis">' + basis + '</div></div>';
			return d;
		}
		grid.appendChild(statBlock('DOTS', fmt1(res.dots), 'current standard', false));
		grid.appendChild(statBlock('IPF GL', fmt1(res.ipfgl), 'IPF official (2020)', true));
		grid.appendChild(statBlock('Wilks (1994)', fmt1(res.wilks), 'older score', true));
		host.appendChild(grid);

		var note = document.createElement('div');
		note.className = 'lvt-note';
		note.textContent = 'Total: ' + fmt1(res.total) + ' ' + res.unit +
			'. All three scores adjust your total for bodyweight and sex, so a lighter and a heavier lifter can be compared. DOTS is the community standard, IPF GL is what the IPF has used since 2020, and Wilks (1994) is the older score most people still recognize.';
		host.appendChild(note);
	}

	var def = {
		id: 'powerlifting-score',
		version: '0.2.1',
		title: 'DOTS, IPF GL & Wilks Calculator',
		units: ['kg', 'lb'],
		convertOnUnitChange: true,
		inputs: [
			{ id: 'sex', label: 'Sex', type: 'select', convert: false, def: 'm', opts: [
				{ value: 'm', label: 'Men' }, { value: 'f', label: 'Women' }
			] },
			{ id: 'bodyweight', label: 'Bodyweight', type: 'number', min: 20, max: { kg: 300, lb: 660 }, step: 0.5, def: { kg: 90, lb: 200 } },
			{ id: 'squat', label: 'Squat', type: 'number', min: 0, max: { kg: 700, lb: 1550 }, step: 2.5, def: { kg: 220, lb: 485 } },
			{ id: 'bench', label: 'Bench', type: 'number', min: 0, max: { kg: 500, lb: 1100 }, step: 2.5, def: { kg: 140, lb: 310 } },
			{ id: 'deadlift', label: 'Deadlift', type: 'number', min: 0, max: { kg: 700, lb: 1550 }, step: 2.5, def: { kg: 240, lb: 530 } }
		],
		compute: computeScore,
		render: render
	};

	if (typeof module !== 'undefined' && module.exports) { module.exports = def; }
	if (typeof window !== 'undefined' && window.LVTools) { window.LVTools.register(def); }
})();
