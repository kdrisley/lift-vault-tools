/* Lift Vault Tools — 5/3/1 Calculator (full: schemes, supplemental, warmups, jokers)
 * ------------------------------------------------------------------------
 * Enter a recent heavy set (a true 1RM, or weight x reps and it estimates
 * your max), pick a training-max percentage, main scheme, and supplemental
 * template, and toggle warm-ups and Joker sets. Every working set of the
 * full 4-week cycle is laid out.
 *
 * All percentages are of the TRAINING max, per Wendler's books:
 *   Main weeks: 5s 65/75/85, 3s 70/80/90, 5/3/1 75/85/95, deload 40/50/60.
 *   Warm-ups (Wendler standard): 40% x5, 50% x5, 60% x3.
 *   Schemes: classic 5/3/1 (AMRAP last set), 3/5/1 (3s week first), 5s PRO
 *   (same percentages, every set 5 reps, no AMRAP).
 *   Supplemental: BBB 5x10 @ 50/60% TM; FSL (5x5, 3x5, or 1 AMRAP set) at
 *   the week's first-set %; SSL 5x5 at the second-set %; Widowmaker 1x15-20
 *   at FSL weight; Pyramid = back down the two lighter work sets, last set
 *   AMRAP.
 *   Joker sets (Beyond 5/3/1): optional +5% and +10% sets above the top set
 *   at the day's rep target, for good days only.
 * Verified against Wendler canon and the Lift Vault 5/3/1 glossary. 1RM
 * estimation uses the same Epley/Brzycki average as the 1RM calculator.
 *
 * compute() is pure and dual-exported for the Node golden-vector tests.
 * ------------------------------------------------------------------------ */
(function () {
	'use strict';

	var FIVES = { name: '5s week', sets: [[65, '5'], [75, '5'], [85, '5+']] };
	var THREES = { name: '3s week', sets: [[70, '3'], [80, '3'], [90, '3+']] };
	var ONES = { name: '5/3/1 week', sets: [[75, '5'], [85, '3'], [95, '1+']] };
	var DELOAD = { name: 'Deload', sets: [[40, '5'], [50, '5'], [60, '5']] };
	var WARMUPS = [[40, '5'], [50, '5'], [60, '3']];

	var SCHEMES = {
		'531': { label: '5/3/1 (classic)', weeks: [FIVES, THREES, ONES], amrap: true },
		'351': { label: '3/5/1', weeks: [THREES, FIVES, ONES], amrap: true },
		'5spro': { label: '5s PRO', weeks: [FIVES, THREES, ONES], amrap: false }
	};
	// supplemental: pct 'fsl' = week's first-set %, 'ssl' = week's second-set %,
	// 'pyramid' = down sets mirroring the two lighter work sets
	var SUPP = {
		none: null,
		bbb50: { label: 'BBB 5x10 @ 50%', sets: '5x10', pct: 50 },
		bbb60: { label: 'BBB 5x10 @ 60%', sets: '5x10', pct: 60 },
		fsl: { label: 'FSL 5x5', sets: '5x5', pct: 'fsl' },
		fsl35: { label: 'FSL 3x5', sets: '3x5', pct: 'fsl' },
		fslamrap: { label: 'FSL 1 set AMRAP', sets: '1x AMRAP', pct: 'fsl' },
		ssl: { label: 'SSL 5x5', sets: '5x5', pct: 'ssl' },
		wm: { label: 'Widowmaker 1x15-20', sets: '1x15-20', pct: 'fsl' },
		pyramid: { label: 'Pyramid down sets', pct: 'pyramid' }
	};

	function roundInc(w, unit) { var i = unit === 'lb' ? 5 : 2.5; return Math.round(w / i) * i; }
	function round2(n) { return Math.round(n * 100) / 100; }

	// PURE. No DOM, no globals.
	function compute531(v) {
		var unit = v.unit === 'lb' ? 'lb' : 'kg';
		var weight = parseFloat(v.weight) || 0;
		var reps = parseInt(v.reps, 10) || 1;
		if (reps < 1) reps = 1;
		var tmPct = parseFloat(v.tmPct) || 90;
		var scheme = SCHEMES[v.scheme] ? v.scheme : '531';
		var suppKey = (v.supplemental in SUPP) ? v.supplemental : 'none';
		var withWarmups = v.warmups === 'yes';
		var withJokers = v.jokers === 'yes';

		// e1RM: same Epley/Brzycki average the 1RM calculator uses; a true single is taken as-is.
		var oneRM = weight;
		if (reps > 1) {
			var epley = weight * (1 + reps / 30);
			var brzycki = reps < 37 ? weight * 36 / (37 - reps) : epley;
			oneRM = (epley + brzycki) / 2;
		}
		oneRM = round2(oneRM);
		var tm = roundInc(oneRM * tmPct / 100, unit);

		var sch = SCHEMES[scheme];
		var flatWeights = [], suppWeights = [], warmWeights = [], jokerWeights = [];
		var weeks = sch.weeks.concat([DELOAD]).map(function (wk, wi) {
			var isDeload = wk === DELOAD;
			var rows = [];

			if (withWarmups && !isDeload) {
				WARMUPS.forEach(function (s) {
					var w = roundInc(tm * s[0] / 100, unit);
					warmWeights.push(w);
					rows.push({ kind: 'warmup', pct: s[0], reps: s[1], weight: w });
				});
			}

			var topPct = 0;
			wk.sets.forEach(function (s) {
				var reps2 = s[1];
				if (!sch.amrap && !isDeload) reps2 = '5'; // 5s PRO: every main set x5, no AMRAP
				var w = roundInc(tm * s[0] / 100, unit);
				flatWeights.push(w);
				topPct = s[0];
				rows.push({ kind: 'main', pct: s[0], reps: reps2, weight: w, amrap: reps2.indexOf('+') >= 0 });
			});

			if (withJokers && !isDeload) {
				var topReps = sch.amrap ? wk.sets[2][1].replace('+', '') : '5';
				[5, 10].forEach(function (bump) {
					var p = topPct + bump;
					var w = roundInc(tm * p / 100, unit);
					jokerWeights.push(w);
					rows.push({ kind: 'joker', pct: p, reps: topReps, weight: w });
				});
			}

			var supp = null;
			var sd = SUPP[suppKey];
			if (sd && !isDeload) {
				if (sd.pct === 'pyramid') {
					// back down the two lighter work sets; the final down set is an AMRAP
					// (a clean set of 5 on 5s PRO, which has no AMRAPs anywhere)
					var down = [wk.sets[1], wk.sets[0]];
					down.forEach(function (s, di) {
						var reps3 = sch.amrap ? s[1].replace('+', '') : '5';
						if (sch.amrap && di === down.length - 1) reps3 += '+';
						var w2 = roundInc(tm * s[0] / 100, unit);
						suppWeights.push(w2);
						rows.push({ kind: 'supp', pct: s[0], reps: reps3, weight: w2, amrap: reps3.indexOf('+') >= 0 });
					});
					supp = { label: SUPP.pyramid.label };
				} else {
					var pct = sd.pct === 'fsl' ? wk.sets[0][0] : (sd.pct === 'ssl' ? wk.sets[1][0] : sd.pct);
					var sw = roundInc(tm * pct / 100, unit);
					suppWeights.push(sw);
					rows.push({ kind: 'supp', pct: pct, reps: sd.sets, weight: sw });
					supp = { label: sd.label };
				}
			}

			return { name: isDeload ? 'Deload' : 'Week ' + (wi + 1) + ' · ' + wk.name, rows: rows, supp: supp };
		});

		return {
			unit: unit, weight: weight, reps: reps, oneRM: oneRM, tmPct: tmPct, tm: tm,
			scheme: scheme, schemeLabel: sch.label, suppKey: suppKey,
			warmups: withWarmups, jokers: withJokers,
			weeks: weeks, flatWeights: flatWeights, suppWeights: suppWeights,
			warmWeights: warmWeights, jokerWeights: jokerWeights
		};
	}

	/* ---------- rendering (browser only) ---------- */
	function fmt(n) { return (Math.round(n * 100) / 100).toString(); }
	var KIND_LABEL = { warmup: 'warm-up', joker: 'joker', supp: '' };

	function render(res, host) {
		var unit = res.unit;
		host.innerHTML = '';

		var basis = res.tmPct + '% of ' + fmt(res.oneRM) + ' ' + unit;
		basis += res.reps > 1 ? ' (estimated from ' + fmt(res.weight) + ' x ' + res.reps + ')' : ' max';
		var stat = document.createElement('div');
		stat.className = 'lvt-stat';
		stat.innerHTML =
			'<div class="lvt-stat-label">Training Max · ' + res.schemeLabel + '</div>' +
			'<div class="lvt-stat-num">' + fmt(res.tm) + '<span class="lvt-stat-u">' + unit + '</span></div>' +
			'<div class="lvt-stat-basis">' + basis + '</div>';
		host.appendChild(stat);

		var grid = document.createElement('div');
		grid.className = 'lvt-readout-grid';
		res.weeks.forEach(function (wk) {
			var block = document.createElement('div');
			var rows = wk.rows.map(function (r) {
				var hl = r.amrap ? ' class="hl"' : '';
				var dim = r.kind !== 'main' ? ' class="dim"' : '';
				var tag = KIND_LABEL[r.kind] ? ' <span class="dim">(' + KIND_LABEL[r.kind] + ')</span>' : '';
				return '<tr' + hl + '><td' + dim + '>' + r.pct + '%' + tag + '</td><td' + dim + '>' + r.reps +
					'</td><td' + dim + '>' + fmt(r.weight) + ' ' + unit + '</td></tr>';
			}).join('');
			block.innerHTML = '<div class="lvt-bars-label">' + wk.name + (wk.supp ? ' + ' + wk.supp.label : '') + '</div>';
			block.insertAdjacentHTML('beforeend',
				'<table class="lvt-table"><thead><tr><th>Set</th><th>Reps</th><th>Weight</th></tr></thead><tbody>' +
				rows + '</tbody></table>');
			grid.appendChild(block);
		});
		host.appendChild(grid);

		var note = document.createElement('div');
		note.className = 'lvt-note';
		var msg;
		if (res.scheme === '5spro') {
			msg = '5s PRO drops the AMRAP: every main set is a clean 5 at the listed weight.';
		} else {
			msg = 'Sets marked with + are AMRAPs: do as many quality reps as you can.';
		}
		if (res.jokers) {
			msg += ' Joker sets are for good days only. Feeling strong after the top set, take them; feeling normal, skip them guilt-free.';
		}
		if (res.suppKey === 'bbb50' || res.suppKey === 'bbb60') {
			msg += ' Start BBB at 50% and earn 60%; it is far harder than it reads.';
		}
		msg += ' Deload is week 4, no supplemental.';
		note.textContent = msg;
		host.appendChild(note);
	}

	var def = {
		id: '531-calculator',
		version: '0.2.0',
		title: '5/3/1 Calculator',
		units: ['kg', 'lb'],
		convertOnUnitChange: true,
		inputs: [
			{ id: 'weight', label: 'Weight lifted', type: 'number', min: 0, max: 1500, step: 2.5, def: { kg: 100, lb: 225 } },
			{ id: 'reps', label: 'Reps (1 = true max)', type: 'number', min: 1, max: 10, step: 1, def: 1, convert: false },
			{ id: 'tmPct', label: 'Training max %', type: 'select', convert: false, def: '90', opts: [
				{ value: '90', label: '90% (Wendler default)' },
				{ value: '85', label: '85% (conservative)' }
			] },
			{ id: 'scheme', label: 'Main scheme', type: 'select', convert: false, def: '531', opts: [
				{ value: '531', label: '5/3/1 (classic)' },
				{ value: '351', label: '3/5/1' },
				{ value: '5spro', label: '5s PRO (no AMRAP)' }
			] },
			{ id: 'supplemental', label: 'Supplemental / down sets', type: 'select', convert: false, def: 'none', opts: [
				{ value: 'none', label: 'None' },
				{ value: 'bbb50', label: 'BBB 5x10 @ 50%' },
				{ value: 'bbb60', label: 'BBB 5x10 @ 60%' },
				{ value: 'fsl', label: 'First Set Last 5x5' },
				{ value: 'fsl35', label: 'First Set Last 3x5' },
				{ value: 'fslamrap', label: 'First Set Last 1x AMRAP' },
				{ value: 'ssl', label: 'Second Set Last 5x5' },
				{ value: 'wm', label: 'Widowmaker 1x15-20' },
				{ value: 'pyramid', label: 'Pyramid down sets' }
			] },
			{ id: 'warmups', label: 'Warm-up sets', type: 'select', convert: false, def: 'no', opts: [
				{ value: 'no', label: 'Hide' }, { value: 'yes', label: 'Show (40/50/60%)' }
			] },
			{ id: 'jokers', label: 'Joker sets', type: 'select', convert: false, def: 'no', opts: [
				{ value: 'no', label: 'None' }, { value: 'yes', label: 'Show (+5% and +10%)' }
			] }
		],
		compute: compute531,
		render: render
	};

	if (typeof module !== 'undefined' && module.exports) { module.exports = def; }
	if (typeof window !== 'undefined' && window.LVTools) { window.LVTools.register(def); }
})();
