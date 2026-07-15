/* Lift Vault Tools — Powerlifting Weight-Class Selector
 * ------------------------------------------------------------------------
 * Enter your sex, bodyweight, and federation. Shows your weight class, how
 * much room you have under the limit, and how much you'd cut to drop a class.
 *
 * Class limits (kg) verified against federation rulebooks:
 *   IPF / USAPL (unchanged since 2019), USPA / IPL, WRPF.
 * Classes are officially in kg (IPF and WRPF are kg-only), so results are
 * shown in kg regardless of the input unit.
 *
 * compute() is pure and dual-exported for the Node golden-vector tests.
 * ------------------------------------------------------------------------ */
(function () {
	'use strict';

	var LB_PER_KG = 2.2046226;

	// Finite class limits in kg (ascending). The heaviest class is "limit+".
	var FEDS = {
		ipf: { label: 'IPF / USAPL', m: [59, 66, 74, 83, 93, 105, 120], f: [47, 52, 57, 63, 69, 76, 84] },
		uspa: { label: 'USPA / IPL', m: [52, 56, 60, 67.5, 75, 82.5, 90, 100, 110, 125, 140], f: [44, 48, 52, 56, 60, 67.5, 75, 82.5, 90, 100, 110] },
		wrpf: { label: 'WRPF', m: [52, 56, 60, 67.5, 75, 82.5, 90, 100, 110, 125, 140], f: [44, 48, 52, 56, 60, 67.5, 75, 82.5, 90] }
	};
	var EPS = 1e-9;

	function round2(n) { return Math.round(n * 100) / 100; }

	// PURE.
	function computeClass(v) {
		var unit = v.unit === 'lb' ? 'lb' : 'kg';
		var sex = v.sex === 'f' ? 'f' : 'm';
		var fed = Object.prototype.hasOwnProperty.call(FEDS, v.fed) ? v.fed : 'ipf';
		var bwKg = (parseFloat(v.bodyweight) || 0) * (unit === 'lb' ? 1 / LB_PER_KG : 1);

		var limits = FEDS[fed][sex];
		var top = limits[limits.length - 1];
		var out = { unit: unit, sex: sex, fed: fed, bwKg: round2(bwKg) };

		if (bwKg <= 0) { out.valid = false; return out; }
		out.valid = true;

		var idx = -1;
		for (var i = 0; i < limits.length; i++) { if (bwKg <= limits[i] + EPS) { idx = i; break; } }

		if (idx === -1) {
			// super heavyweight
			out.className = top + '+ kg';
			out.classLimit = null;
			out.headroom = null;
			out.nextDownLabel = '-' + top + ' kg';
			out.cutToNextDown = round2(bwKg - top);
		} else {
			out.classLimit = limits[idx];
			out.className = '-' + limits[idx] + ' kg';
			out.headroom = round2(limits[idx] - bwKg);
			if (idx > 0) {
				out.nextDownLabel = '-' + limits[idx - 1] + ' kg';
				out.cutToNextDown = round2(bwKg - limits[idx - 1]);
			} else {
				out.nextDownLabel = null;
				out.cutToNextDown = null;
			}
		}
		return out;
	}

	/* ---------- rendering (browser only) ---------- */
	function fmt(n) { return (Math.round(n * 100) / 100).toString(); }

	function render(res, host) {
		host.innerHTML = '';
		if (!res.valid) {
			var m = document.createElement('div');
			m.className = 'lvt-note';
			m.textContent = 'Enter your bodyweight to find your weight class.';
			host.appendChild(m);
			return;
		}

		var stat = document.createElement('div');
		stat.className = 'lvt-stat';
		stat.innerHTML =
			'<div class="lvt-stat-label">Your weight class · ' + FEDS[res.fed].label + '</div>' +
			'<div class="lvt-stat-num">' + res.className + '</div>' +
			'<div class="lvt-stat-basis">at ' + fmt(res.bwKg) + ' kg bodyweight</div>';
		host.appendChild(stat);

		var note = document.createElement('div');
		note.className = 'lvt-note';
		var msg;
		if (res.headroom === null) {
			msg = 'You are in the top class. You can weigh anything above ' + FEDS[res.fed][res.sex].slice(-1)[0] + ' kg.';
			if (res.cutToNextDown !== null) {
				msg += ' To drop to ' + res.nextDownLabel + ', you would need to cut ' + fmt(res.cutToNextDown) + ' kg.';
			}
		} else {
			msg = 'You have ' + fmt(res.headroom) + ' kg of room before the ' + res.className + ' limit.';
			if (res.cutToNextDown !== null) {
				msg += ' To drop to ' + res.nextDownLabel + ', you would need to cut ' + fmt(res.cutToNextDown) + ' kg.';
			} else {
				msg += ' This is already the lightest class.';
			}
		}
		note.textContent = msg + ' Class limits are in kilograms.';
		host.appendChild(note);
	}

	var def = {
		id: 'weight-class-selector',
		version: '0.1.1',
		title: 'Powerlifting Weight Class Calculator',
		units: ['kg', 'lb'],
		convertOnUnitChange: true,
		inputs: [
			{ id: 'sex', label: 'Sex', type: 'select', convert: false, def: 'm', opts: [
				{ value: 'm', label: 'Men' }, { value: 'f', label: 'Women' }
			] },
			{ id: 'bodyweight', label: 'Bodyweight', type: 'number', min: 20, max: { kg: 300, lb: 660 }, step: 0.5, def: { kg: 90, lb: 200 } },
			{ id: 'fed', label: 'Federation', type: 'select', convert: false, def: 'ipf', opts: [
				{ value: 'ipf', label: 'IPF / USAPL' }, { value: 'uspa', label: 'USPA / IPL' }, { value: 'wrpf', label: 'WRPF' }
			] }
		],
		compute: computeClass,
		render: render
	};

	if (typeof module !== 'undefined' && module.exports) { module.exports = def; }
	if (typeof window !== 'undefined' && window.LVTools) { window.LVTools.register(def); }
})();
