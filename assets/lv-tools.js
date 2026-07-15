/* Lift Vault Tools — shell / framework
 * ------------------------------------------------------------------------
 * Loaded before any tool module (WP dependency). Tool modules call
 * window.LVTools.register(def). The shell renders the controls, validates
 * input (numbers clamped per-unit, selects whitelisted against their opts),
 * manages per-tool namespaced #hash state, debounces analytics per instance,
 * and hydrates the server-rendered fallback into the live tool. If anything
 * throws before the first successful render, the static fallback stays on
 * the page — a tool must never white-screen a ranked post.
 *
 * Contract notes for tool authors:
 *   - input.def / input.min / input.max / input.step may each be a scalar or
 *     a per-unit object like { kg: 700, lb: 1550 }.
 *   - kg<->lb conversion on unit toggle is owned by the shell (snapped to the
 *     input's step). A tool may override with def.convert(value, from, to).
 *   - Deep-link state is namespaced per tool: #<tool-id>.<input>=<value>.
 *   - LVTools.util = { el, num, clamp, esc, convertWeight } for renders.
 *
 * No jQuery. No dependencies. ES2017. Namespaced under .lvt in the DOM.
 * ------------------------------------------------------------------------ */
(function () {
	'use strict';

	var registry = {};
	var DEBOUNCE = 800; // analytics settle window (ms)
	var LB_PER_KG = 2.2046226;
	var instanceCount = 0;

	/* ---------- small utils ---------- */
	function el(tag, attrs, kids) {
		var n = document.createElement(tag);
		if (attrs) Object.keys(attrs).forEach(function (k) {
			if (k === 'class') n.className = attrs[k];
			else if (k === 'text') n.textContent = attrs[k];
			else n.setAttribute(k, attrs[k]);
		});
		(kids || []).forEach(function (c) { if (c) n.appendChild(c); });
		return n;
	}
	function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
	function clamp(v, lo, hi) {
		if (typeof lo === 'number' && v < lo) v = lo;
		if (typeof hi === 'number' && v > hi) v = hi;
		return v;
	}
	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	function debounce(fn, ms) {
		var t; return function () {
			var a = arguments, self = this;
			clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms);
		};
	}
	// Resolve a possibly per-unit field: {kg: x, lb: y} or a plain scalar.
	function perUnit(v, unit) {
		if (v && typeof v === 'object') return v[unit];
		return v;
	}
	// Shell-owned kg<->lb conversion, snapped to the input's step in the target unit.
	function convertWeight(value, from, to, step) {
		if (from === to) return value;
		var out = to === 'lb' ? value * LB_PER_KG : value / LB_PER_KG;
		var s = (typeof step === 'number' && step > 0) ? step : (to === 'lb' ? 5 : 2.5);
		return Math.round(out / s) * s;
	}

	/* ---------- hash state (never touches the server / cache) ----------
	 * Namespaced per tool (#<id>.<input>=<value>) so multiple tools on one
	 * page can't clobber or cross-seed each other. Plain anchors (#faq) and
	 * other tools' params are preserved on write. Malformed tokens are
	 * skipped, never thrown on. Writes only happen after a user interaction
	 * (the dirty flag), so landing on #some-anchor never rewrites the URL. */
	function parseHash() {
		var out = { pairs: {}, order: [], other: [] };
		var h = (location.hash || '').replace(/^#/, '');
		if (!h) return out;
		h.split('&').forEach(function (tok) {
			if (!tok) return;
			var i = tok.indexOf('=');
			if (i === -1) { out.other.push(tok); return; }
			var k, v;
			try { k = decodeURIComponent(tok.slice(0, i)); v = decodeURIComponent(tok.slice(i + 1)); }
			catch (e) { return; } // malformed escape: skip the token, keep the page alive
			if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
			if (!(k in out.pairs)) out.order.push(k);
			out.pairs[k] = v;
		});
		return out;
	}
	function readToolHash(toolId) {
		var parsed = parseHash(), out = {}, prefix = toolId + '.';
		Object.keys(parsed.pairs).forEach(function (k) {
			if (k.indexOf(prefix) === 0) out[k.slice(prefix.length)] = parsed.pairs[k];
		});
		return out;
	}
	function writeToolHash(toolId, state) {
		var parsed = parseHash(), prefix = toolId + '.';
		var toks = parsed.other.slice();
		parsed.order.forEach(function (k) {
			if (k.indexOf(prefix) !== 0) toks.push(encodeURIComponent(k) + '=' + encodeURIComponent(parsed.pairs[k]));
		});
		Object.keys(state).forEach(function (k) {
			toks.push(encodeURIComponent(prefix + k) + '=' + encodeURIComponent(state[k]));
		});
		// best-effort: replaceState can throw when throttled; hash state is not worth
		// a history entry or a scroll jump, so on failure we simply skip this write.
		try { history.replaceState(null, '', '#' + toks.join('&')); } catch (e) {}
	}

	/* ---------- analytics ---------- */
	function capture(toolId, payload) {
		var data = Object.assign({ tool: toolId }, payload);
		try { if (window.posthog && window.posthog.capture) window.posthog.capture('lv_tool_used', data); } catch (e) {}
		try { if (typeof window.gtag === 'function') window.gtag('event', 'lv_tool_used', data); } catch (e) {}
	}
	function logError(toolId, err) {
		try { if (window.posthog && window.posthog.capture) window.posthog.capture('lv_tool_error', { tool: toolId, message: String(err && err.message || err) }); } catch (e) {}
		if (window.console && console.warn) console.warn('[lv-tools] ' + toolId + ':', err);
	}

	/* ---------- control rendering ---------- */
	function optsForUnit(input, unit) {
		if (input.optsByUnit) return input.optsByUnit[unit] || [];
		return input.opts || [];
	}
	function defaultFor(input, unit) { return perUnit(input.def, unit); }

	function buildControls(def, state, unit, onChange, iid) {
		var wrap = el('div', { class: 'lvt-controls' });

		// unit segmented control
		if (def.units && def.units.length > 1) {
			var seg = el('div', { class: 'lvt-seg', role: 'group', 'aria-label': 'Units' });
			def.units.forEach(function (u) {
				var b = el('button', { type: 'button', text: u, 'aria-pressed': String(u === unit) });
				b.addEventListener('click', function () { onChange({ __unit: u }); });
				seg.appendChild(b);
			});
			// span, not <label>: it wraps no control (the group is labelled via aria-label)
			wrap.appendChild(el('div', { class: 'lvt-field lvt-field-units' }, [
				el('span', { class: 'lvt-lab', text: 'Units' }), seg
			]));
		}

		def.inputs.forEach(function (input) {
			var field = el('div', { class: 'lvt-field' });
			var id = 'lvt' + iid + '-' + input.id; // per-instance: same tool twice = unique ids
			field.appendChild(el('label', { text: input.label, 'for': id }));

			var ctrl;
			if (input.type === 'select') {
				ctrl = el('select', { id: id, name: input.id });
				optsForUnit(input, unit).forEach(function (o) {
					var opt = el('option', { value: String(o.value), text: o.label });
					if (String(o.value) === String(state[input.id])) opt.setAttribute('selected', 'selected');
					ctrl.appendChild(opt);
				});
			} else {
				ctrl = el('input', {
					id: id, name: input.id, type: input.type || 'number',
					inputmode: input.type === 'number' ? 'decimal' : 'text',
					value: state[input.id]
				});
				var mn = perUnit(input.min, unit), mx = perUnit(input.max, unit), st = perUnit(input.step, unit);
				if (typeof mn === 'number') ctrl.setAttribute('min', mn);
				if (typeof mx === 'number') ctrl.setAttribute('max', mx);
				if (typeof st === 'number') ctrl.setAttribute('step', st);
			}
			ctrl.addEventListener('input', function () {
				var patch = {}; patch[input.id] = ctrl.value; onChange(patch);
			});
			ctrl.addEventListener('change', function () {
				var patch = {}; patch[input.id] = ctrl.value; onChange(patch);
			});
			field.appendChild(ctrl);
			wrap.appendChild(field);
		});

		return wrap;
	}

	/* ---------- validation ----------
	 * Numbers: empty/non-numeric -> 0 (no min-clamp, so tools' own "enter a
	 * value" guards actually fire); otherwise clamped to per-unit min/max.
	 * Selects: whitelisted against the unit's options; unknown values (typo'd
	 * or hostile hash) fall back to the default AND are written back to state
	 * so the visible control and the computed value always agree. */
	function validate(def, state, unit) {
		var clean = { unit: unit };
		def.inputs.forEach(function (input) {
			var v = state[input.id];
			if (input.type === 'select') {
				var opts = optsForUnit(input, unit);
				var known = opts.some(function (o) { return String(o.value) === String(v); });
				if (!known) {
					v = defaultFor(input, unit);
					v = (v === undefined || v === null) ? '' : v;
					state[input.id] = v;
				}
				clean[input.id] = String(v);
				return;
			}
			if (v === '' || v === null || v === undefined || isNaN(parseFloat(v))) {
				clean[input.id] = 0;
				return;
			}
			var n = parseFloat(v);
			n = clamp(n, perUnit(input.min, unit), perUnit(input.max, unit));
			clean[input.id] = n;
		});
		return clean;
	}

	/* ---------- per-instance lifecycle ---------- */
	function init(root, def) {
		if (root.__lvt) return;
		root.__lvt = true;
		var iid = ++instanceCount;

		var unit = (def.units && def.units[0]) || 'kg';
		var state = {};
		var dirty = false;      // becomes true on first user interaction
		var hadSuccess = false; // first successful render hides the fallback

		// hash FIRST, so per-unit defaults seed for the deep-linked unit
		var hash = readToolHash(def.id);
		if (hash.unit && def.units && def.units.indexOf(hash.unit) !== -1) unit = hash.unit;
		def.inputs.forEach(function (input) {
			var d = defaultFor(input, unit);
			state[input.id] = (d === undefined || d === null) ? '' : d;
		});
		def.inputs.forEach(function (input) {
			if (hash[input.id] !== undefined && hash[input.id] !== '') state[input.id] = hash[input.id];
		});
		// (select values from the hash are reconciled by validate() on first run)

		var fallback = root.querySelector('[data-lv-fallback]');
		var panel, controlsHost, readout, live;
		var track = debounce(function (payload) { capture(def.id, payload); }, DEBOUNCE); // per instance

		function rerenderControls(focusUnitBtn) {
			controlsHost.innerHTML = '';
			controlsHost.appendChild(buildControls(def, state, unit, onChange, iid));
			if (focusUnitBtn) {
				var btn = controlsHost.querySelector('.lvt-seg button[aria-pressed="true"]');
				if (btn) btn.focus(); // the toggle rebuilds the controls; give focus back
			}
		}

		function onChange(patch) {
			dirty = true;
			if (patch.__unit && patch.__unit !== unit) {
				var prevUnit = unit;
				unit = patch.__unit;
				if (def.convertOnUnitChange) {
					def.inputs.forEach(function (input) {
						if (input.convert === false || input.type === 'select') return;
						var raw = state[input.id];
						if (raw === '' || raw === null || raw === undefined || isNaN(parseFloat(raw))) return; // empty stays empty
						var n = parseFloat(raw);
						state[input.id] = def.convert
							? def.convert(n, prevUnit, unit)
							: convertWeight(n, prevUnit, unit, perUnit(input.step, unit));
					});
				}
				// refresh unit-dependent selects + defaults
				def.inputs.forEach(function (input) {
					if (input.type === 'select' && input.optsByUnit) {
						var opts = optsForUnit(input, unit);
						var still = opts.some(function (o) { return String(o.value) === String(state[input.id]); });
						if (!still) state[input.id] = defaultFor(input, unit);
					}
				});
				rerenderControls(true);
			} else {
				Object.keys(patch).forEach(function (k) { if (k !== '__unit') state[k] = patch[k]; });
			}
			run();
		}

		function run() {
			var clean;
			try {
				clean = validate(def, state, unit);
				var result = def.compute(clean);
				readout.innerHTML = '';
				def.render(result, readout, { unit: unit });
				if (!hadSuccess) {
					hadSuccess = true;
					if (fallback) fallback.setAttribute('hidden', 'hidden');
				}
				if (live) live.textContent = (def.title || def.id) + ' results updated';
				if (dirty) {
					var hstate = { unit: unit };
					def.inputs.forEach(function (i) { hstate[i.id] = state[i.id]; });
					writeToolHash(def.id, hstate);
					track(Object.assign({ unit: unit }, clean)); // only real usage, never pageviews
				}
			} catch (err) {
				logError(def.id, err);
				if (!hadSuccess) {
					// never rendered: put the SSR fallback back, hide the broken shell
					if (fallback) fallback.removeAttribute('hidden');
					if (panel) panel.setAttribute('hidden', 'hidden');
				} else {
					// worked before: keep the controls usable so the next input can recover
					var msg = el('div', { class: 'lvt-note warn', text: 'Something went wrong with that input. Adjust a value to retry.' });
					readout.appendChild(msg);
				}
			}
		}

		// build the live shell; any failure here re-reveals the fallback
		try {
			panel = el('div', { class: 'lvt-panel' });
			panel.appendChild(el('div', { class: 'lvt-head' }, [
				el('span', { class: 'lvt-title', text: def.title || def.id })
			]));
			controlsHost = el('div', { class: 'lvt-controls-host' });
			readout = el('div', { class: 'lvt-readout' });
			live = el('div', { class: 'lvt-sr-live', 'aria-live': 'polite' });
			panel.appendChild(controlsHost);
			panel.appendChild(readout);
			panel.appendChild(live);
			root.insertBefore(panel, fallback);
			rerenderControls(false);
			run(); // hides the fallback only if this succeeds
		} catch (err) {
			logError(def.id, err);
			if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
			if (fallback) fallback.removeAttribute('hidden');
		}
	}

	function hydrateAll() {
		var nodes = document.querySelectorAll('.lvt[data-lv-tool]');
		for (var i = 0; i < nodes.length; i++) {
			var root = nodes[i];
			var def = registry[root.getAttribute('data-lv-tool')];
			if (def) {
				try { init(root, def); }
				catch (e) { logError(root.getAttribute('data-lv-tool'), e); }
			}
		}
	}

	window.LVTools = {
		register: function (def) {
			if (!def || !def.id) return;
			registry[def.id] = def;
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', hydrateAll);
			} else {
				hydrateAll();
			}
		},
		util: { el: el, num: num, clamp: clamp, esc: esc, convertWeight: convertWeight }
	};
})();
