'use strict';
'require view';
'require fs';
'require uci';
'require ui';
'require dom';

var DAYS = [ '1', '2', '3', '4', '5', '6', '7' ];
var DAY_NAMES = { '1': 'Пн', '2': 'Вт', '3': 'Ср', '4': 'Чт', '5': 'Пт', '6': 'Сб', '7': 'Вс' };
/* NOTE: E is a LuCI global (bound dom.create); do NOT rebind it locally. */

function splitToken(tok, hasName) {
	var parts = String(tok || '').split('|');
	return {
		days: parts[0] || '*',
		start: parts[1] || '',
		end:   parts[2] || '',
		name:  hasName ? (parts[3] || '') : ''
	};
}

function validateTime(t) {
	var m = /^(\d\d?):(\d\d)$/.exec(t || '');
	if (!m)
		return _('Неверное время (нужно ЧЧ:ММ)');
	var h = +m[1], min = +m[2];
	if (h > 23 || min > 59)
		return _('Время вне диапазона');
	return null;
}

function refresh() {
	return fs.read('/var/run/guestwifi.json');
}

return view.extend({
	timer: null,

	load: function() {
		return Promise.all([
			uci.load('guestwifi'),
			uci.load('wireless'),
			refresh().catch(function() { return null; })
		]);
	},

	unload: function() {
		if (this.timer) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
	},

	renderStatus: function() {
		refresh().then(function(txt) {
			var data = null;
			try { data = JSON.parse(txt); } catch (e) { }
			var host = document.getElementById('gw-status');
			if (!host)
				return;

			var rows = [ E('div', { 'class': 'cbi-title' },
				E('h3', {}, _('Состояние гостевой сети'))) ];

			if (!data) {
				rows.push(E('div', {}, _('Нет данных. Дождитесь запуска службы…')));
			} else {
				var badge = (data.state === '1')
					? E('span', { 'class': 'label success' }, _('ВКЛ'))
					: E('span', { 'class': 'label important' }, _('ВЫКЛ'));

				var t2 = [];
				Object.keys(data).forEach(function(k) {
					if (k === 'state' || k === 'expected' || k === 'now')
						return;
					var w = data[k];
					t2.push(E('tr', {}, [
						E('td', {}, k),
						E('td', {}, _('SSID: ') + w['ssid']),
						E('td', {}, w['up'] ? _('интерфейс поднят') : _('интерфейс выключен'))
					]));
				});

				rows.push(E('table', { 'class': 'table' }, [
					E('tr', {}, [
						E('td', { 'width': '33%' }, _('Сеть')),
						E('td', {}, badge)
					]),
					E('tr', {}, [
						E('td', {}, _('Ожидается по расписанию')),
						E('td', {}, (data.expected === '1') ? _('ВКЛ') : _('ВЫКЛ'))
					])
				]));

				if (t2.length)
					rows.push(E('table', { 'class': 'table' }, t2));

				rows.push(E('div', { 'class': 'cbi-value-description' },
					_('Обновлено: ') + new Date(data['now'] * 1000).toLocaleTimeString()));
			}

			dom.content(host, rows);
		}).catch(function(e) {
			ui.addNotification(_('Ошибка статуса'), E('p', {}, String(e)), 'error');
		});
	},

	scheduleGrid: function(tokens) {
		var grid = {};
		DAYS.forEach(function(d) { grid[d] = { on: false, start: '20:00', end: '22:00' }; });

		tokens.forEach(function(tok) {
			var t = splitToken(tok, false);
			if (t.days == '*') {
				DAYS.forEach(function(d) { grid[d] = { on: true, start: t.start, end: t.end }; });
			} else {
				t.days.split(',').forEach(function(dd) {
					if (grid[dd] != null)
						grid[dd] = { on: true, start: t.start, end: t.end };
				});
			}
		});
		return grid;
	},

	render: function() {
		var self = this;
		var cfgName = 'guestwifi';

		var enabledVal = uci.get(cfgName, 'config', 'enabled');
		if (uci.get(cfgName, 'config') == null) {
			uci.add(cfgName, 'config', 'config');
			enabledVal = '0';
		}
		if (enabledVal == null)
			enabledVal = '0';
		var modeVal = uci.get(cfgName, 'config', 'mode') || 'schedule';
		var ssidSchVal = uci.get(cfgName, 'config', 'ssid_schedule');
		if (ssidSchVal == null) ssidSchVal = '1';

		var scheduleToks = uci.get(cfgName, 'config', 'schedule') || [];
		var ssidBaseVal = uci.get(cfgName, 'config', 'ssid_base');
		if (ssidBaseVal == null) ssidBaseVal = 'Guest';

		var grid = this.scheduleGrid(scheduleToks);

		var statusHost = E('div', { 'id': 'gw-status', 'class': 'cbi-section' });
		this.renderStatus();
		this.timer = window.setInterval(function() { self.renderStatus(); }, 30000);

		/* --- controls -------------------------------------------------------- */
		var swEnabled = E('input', { 'type': 'checkbox' });
		swEnabled.checked = (enabledVal === '1');

		var swSsid = E('input', { 'type': 'checkbox' });
		swSsid.checked = (ssidSchVal === '1');

		var selMode = E('select', { 'class': 'cbi-input-select' });
		[ ['always', _('Всегда включена')],
		  ['schedule', _('По расписанию')],
		  ['off', _('Всегда выключена')] ].forEach(function(p) {
			var o = E('option', { 'value': p[0] }, [ p[1] ]);
			if (p[0] == modeVal) o.selected = true;
			selMode.appendChild(o);
		});

		/* --- schedule grid --------------------------------------------------- */
		var dayRows = DAYS.map(function(d) {
			var cb = E('input', { 'type': 'checkbox' });
			cb.checked = grid[d].on;
			var t1 = E('input', { 'type': 'time', 'class': 'gw-time' });
			var t2 = E('input', { 'type': 'time', 'class': 'gw-time' });
			t1.value = grid[d].start;
			t2.value = grid[d].end;

			var row = E('tr', {}, [
				E('td', {}, [ E('label', {}, [ cb, ' ', DAY_NAMES[d] ]) ]),
				E('td', {}, [ t1 ]),
				E('td', {}, [ ' — ' ]),
				E('td', {}, [ t2 ])
			]);
			row._gw = { day: d, cb: cb, t1: t1, t2: t2 };
			return row;
		});

		/* --- ssid: имя + дата (автогенерация при смене даты) ------------------ */
		var inSsidBase = E('input', { 'type': 'text', 'class': 'gw-wide', 'placeholder': 'Guest' });
		inSsidBase.value = ssidBaseVal;
		var ssidPreview = E('p', {}, [ E('span', { 'class': 'cbi-value-description' }, '') ]);
		function updatePreview() {
			var base = (inSsidBase.value || '').trim();
			var d = new Date();
			var dd = ('0' + d.getDate()).slice(-2);
			var mm = ('0' + (d.getMonth() + 1)).slice(-2);
			var yy = d.getFullYear();
			dom.content(ssidPreview, [ E('span', { 'class': 'cbi-value-description' },
				_('Сеть назовётся: ') + base + '_' + dd + '.' + mm + '.' + yy +
				' — ' + _('имя изменится автоматически при смене даты.')) ]);
		}
		inSsidBase.addEventListener('input', updatePreview);
		updatePreview();

		/* --- staging on change (standard Save & Apply applies it) -------------- */
		var stageTimer = null;

		function stageConfig() {
			if (stageTimer != null)
				return;
			stageTimer = window.setTimeout(function() {
				stageTimer = null;
				deployStage();
			}, 500);
		}

		function deployStage() {
			var errs = [];
			var sched = [];

			for (var i = 0; i < dayRows.length; ++i) {
				var row = dayRows[i];
				if (!row._gw.cb.checked)
					continue;
				sched.push(row._gw.day + '|' + row._gw.t1.value + '|' + row._gw.t2.value);
				var err = validateTime(row._gw.t1.value) || validateTime(row._gw.t2.value);
				if (err)
					errs.push(DAY_NAMES[row._gw.day] + ': ' + err);
			}

			/* ошибки в рабочем расписании блокируют staging, но SSID-имя не критично */
			var base = (inSsidBase.value || '').trim();
			if (!base && swSsid.checked)
				errs.push(_('Укажите имя сети SSID'));

			if (errs.length) {
				ui.addNotification(_('Ошибка в расписании'), E('p', {}, errs.join(' · ')), 'error');
				return;
			}

			uci.set(cfgName, 'config', 'enabled', swEnabled.checked ? '1' : '0');
			uci.set(cfgName, 'config', 'mode', selMode.value);
			uci.set(cfgName, 'config', 'ssid_schedule', swSsid.checked ? '1' : '0');
			uci.set(cfgName, 'config', 'ssid_base', base);

			uci.unset(cfgName, 'config', 'schedule');
			if (sched.length)
				uci.set(cfgName, 'config', 'schedule', sched);

			uci.unset(cfgName, 'config', 'ssid_list');

			uci.save();
		}

		function hook(el) {
			if (el)
				el.addEventListener('change', stageConfig);
		}
		hook(swEnabled); hook(selMode); hook(swSsid); hook(inSsidBase);
		dayRows.forEach(function(r) {
			hook(r._gw.cb); hook(r._gw.t1); hook(r._gw.t2);
		});

		/* --- layout ------------------------------------------------------------ */
		return E('div', {}, [
			statusHost,
			E('div', { 'class': 'cbi-map-descr' },
				_('Гостевая сеть с отключением по времени и сменой имени (SSID) по расписанию. Изменения применяются штатной кнопкой «Save & Apply».')),

			E('fieldset', { 'class': 'cbi-section' }, [
				E('legend', {}, _('Основное')),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Гостевая сеть включена')),
					E('div', { 'class': 'cbi-value-field' }, [ swEnabled ])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Режим')),
					E('div', { 'class': 'cbi-value-field' }, [ selMode ])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Смена SSID (вкл/выкл)')),
					E('div', { 'class': 'cbi-value-field' }, [ swSsid ])
				])
			]),

			E('fieldset', { 'class': 'cbi-section' }, [
				E('legend', {}, _('Имя сети (SSID)')),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Указываемое имя сети')),
					E('div', { 'class': 'cbi-value-field' }, [ inSsidBase ])
				]),
				ssidPreview
			]),

			E('fieldset', { 'class': 'cbi-section' }, [
				E('legend', {}, _('Расписание работы')),
				E('table', { 'class': 'table' }, [
					E('thead', {}, [
						E('tr', {}, [
							E('th', {}, _('День')),
							E('th', { 'colspan': '3' }, _('Интервал'))
						])
					]),
					E('tbody', {}, dayRows)
				]),
				E('p', {}, [ E('span', { 'class': 'cbi-value-description' },
					_('Интервал может пересекать полночь (напр. 22:00 — 02:00).')) ])
			])
		]);
	}
});
