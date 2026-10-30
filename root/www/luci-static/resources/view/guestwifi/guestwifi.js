'use strict';
'require view';
'require fs';
'require uci';
'require ui';
'require dom';

var E = dom.create;

var DAYS = [ '1', '2', '3', '4', '5', '6', '7' ];
var DAY_NAMES = { '1': 'Пн', '2': 'Вт', '3': 'Ср', '4': 'Чт', '5': 'Пт', '6': 'Сб', '7': 'Вс' };

function dkey(day) { return 'd' + day; }

/* token: "1,2,5|HH:MM|HH:MM[:name]" */
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

function validateDays(days) {
	if (days == '*' || days === '')
		return null;
	for (var i = 0; i < DAYS.length; ++i) {
		if (days.indexOf(DAYS[i]) !== -1)
			return null;
	}
	return _('Не указан ни один день недели');
}

function buildToken(days, start, end, name) {
	var tv = start + '|' + end;
	if (name != null)
		tv += '|' + name;
	return days + '|' + tv;
}

function refresh() { return fs.read('/var/run/guestwifi.json'); }

return view.extend({
	timer: null,

	load: function() {
		return Promise.all([
			uci.load('guestwifi'),
			refresh().catch(function() { return null; }),
			uci.load('wireless')
		]);
	},

	unload: function() {
		if (this.timer) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
	},

	renderStatus: function(ev, statusBox) {
		var self = this;
		refresh().then(function(txt) {
			var data = null;
			try { data = JSON.parse(txt); } catch (e) { }
			var host = document.getElementById('gw-status');
			if (!host)
				return;

			var rows = [ E('div', { 'class': 'cbi-title' },
				E('h3', {}, _('Состояние гостевой сети'))) ];

			if (!data) {
				rows.push(E('div', {}, _('Нет данных. Дождётся запуска службы…')));
			} else {
				var st = data.state;
				var badge = (st === '1')
					? E('span', { 'class': 'label success' }, _('ВКЛ'))
					: E('span', { 'class': 'label important' }, _('ВЫКЛ'));
				rows.push(E('table', { 'class': 'table' },
					E('tr', {}, E('td', { 'width': '33%' }, _('Сеть')), E('td', {}, badge)),
					E('tr', {}, E('td', {}, _('Обещано по расписанию')),
						E('td', {}, (data.expected === '1') ? _('ВКЛ') : _('ВЫКЛ')))));

				var t2 = [];
				Object.keys(data).forEach(function(k) {
					if (k === 'state' || k === 'expected' || k === 'now')
						return;
					var w = data[k];
					t2.push(E('tr', {},
						E('td', {}, k),
						E('td', {}, _('SSID: ') + w['ssid']),
						E('td', {}, w['up'] ? _('интерфейс поднят') : _('интерфейс выключен'))));
				});
				if (t2.length)
					rows.push(E('table', { 'class': 'table' }, t2));

				var d = new Date(data['now'] * 1000);
				rows.push(E('div', { 'class': 'cbi-value-description' },
					_('Обновлено: ') + d.toLocaleTimeString()));
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
				var list = t.days.split(',');
				list.forEach(function(dd) {
					if (grid[dd] != null) {
						grid[dd] = { on: true, start: t.start, end: t.end };
					}
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
		if (uci.get(cfgName, 'config', 'enabled') == null)
			enabledVal = '0';
		var modeVal = uci.get(cfgName, 'config', 'mode') || 'schedule';
		var ssidSchVal = uci.get(cfgName, 'config', 'ssid_schedule');
		if (ssidSchVal == null) ssidSchVal = '1';

		var scheduleToks = uci.get(cfgName, 'config', 'schedule') || [];
		var ssidToks = uci.get(cfgName, 'config', 'ssid_list') || [];

		var grid = this.scheduleGrid(scheduleToks);

		var statusHost = E('div', { 'id': 'gw-status', 'class': 'cbi-section' });
		this.renderStatus(null, statusHost);
		this.timer = window.setInterval(function() { self.renderStatus(null, statusHost); }, 30000);

		/* --- master enable --------------------------------------------------- */
		var swEnabled = E('input', { 'type': 'checkbox' });
		swEnabled.checked = (enabledVal === '1');
		var swSsid = E('input', { 'type': 'checkbox' });
		swSsid.checked = (ssidSchVal === '1');

		var selMode = E('select', { 'class': 'cbi-input-select' });
		[ ['always', _('Всегда включена')],
		  ['schedule', _('По расписанию')],
		  ['off', _('Всегда выключена')] ].forEach(function(p) {
			var o = E('option', { 'value': p[0] }, p[1]);
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

			var row = E('tr', {},
				E('td', {}, E('label', {}, cb, ' ', DAY_NAMES[d])),
				E('td', {}, t1),
				E('td', {}, ' — '),
				E('td', {}, t2));

			row._gw = { day: d, cb: cb, t1: t1, t2: t2 };
			return row;
		});

		/* --- ssid list -------------------------------------------------------- */
		var ssidTBody = E('tbody', {});
		function ssidAddRow(tok) {
			var t = splitToken(tok, true);
			var days = E('input', { 'type': 'text', 'class': 'gw-mini', 'placeholder': '*, 1-5, 6,7' });
			var s = E('input', { 'type': 'time', 'class': 'gw-time' });
			var e = E('input', { 'type': 'time', 'class': 'gw-time' });
			var n = E('input', { 'type': 'text', 'class': 'gw-wide' });
			days.value = t.days;
			s.value = t.start;
			e.value = t.end;
			n.value = t.name;
			var del = E('button', { 'class': 'btn cbi-button-remove' }, '✕');
			del.addEventListener('click', function() { row.remove(); });
			var row = E('tr', {}, E('td', {}, days), E('td', {}, s), E('td', {}, ' — '),
				E('td', {}, e), E('td', {}, n), E('td', {}, del));
			ssidTBody.appendChild(row);
		}
		ssidToks.forEach(ssidAddRow);
		var btnAddSsid = E('button', { 'class': 'btn cbi-button-add' }, '+ ' + _('Добавить'));
		btnAddSsid.addEventListener('click', function() { ssidAddRow('*|08:00|23:59|'); });

		/* --- helpers to harvest data ----------------------------------------- */
		function collectSchedule() {
			var toks = [];
			for (var i = 0; i < dayRows.length; ++i) {
				var row = dayRows[i];
				if (!row._gw.cb.checked)
					continue;
				toks.push(buildToken(row._gw.day, row._gw.t1.value, row._gw.t2.value));
			}
			return toks;
		}

		function collectSsid(errors) {
			var toks = [];
			ssidTBody.childNodes.forEach(function(tr) {
				var tds = tr.childNodes;
				var days = tds[0].firstChild.value.trim() || '*';
				var s = tds[1].firstChild.value;
				var e = tds[3].firstChild.value;
				var n = tds[4].firstChild.value.trim().replace(/[ \t]+/g, '_');

				var err = validateTime(s) || validateTime(e);
				if (!err && n === '')
					err = _('Пустое имя SSID');
				if (err) {
					errors.push(err + ' («' + n + '»)');
					return;
				}
				toks.push(buildToken(days, s, e, n));
			});
			return toks;
		}

		/* --- save / apply ---------------------------------------------------- */
		function persist(showApplyDialog) {
			var errs = [];
			for (var i = 0; i < dayRows.length; ++i) {
				var r = dayRows[i];
				if (!r._gw.cb.checked)
					continue;
				var err = validateTime(r._gw.t1.value) || validateTime(r._gw.t2.value);
				if (err)
					errs.push(DAY_NAMES[r._gw.day] + ': ' + err);
			}
			var ssidToks = collectSsid(errs);

			if (errs.length) {
				ui.addNotification(_('Ошибка сохранения'),
					E('p', {}, errs.join(' · ')), 'error');
				return;
			}

			uci.set(cfgName, 'config', 'enabled', swEnabled.checked ? '1' : '0');
			uci.set(cfgName, 'config', 'mode', selMode.value);
			uci.set(cfgName, 'config', 'ssid_schedule', swSsid.checked ? '1' : '0');
			if (ssidToks.length)
				uci.set(cfgName, 'config', 'ssid_list', ssidToks);
			else
				uci.unset(cfgName, 'config', 'ssid_list');

			uci.save().then(function() {
				if (!showApplyDialog) {
					ui.addNotification(null, E('p', {}, _('Настройки сохранены. Нажмите «Сохранить и применить».')));
					return;
				}
				return uci.apply().then(function() {
					return fs.exec('/usr/bin/guestwifi', [ 'check' ]);
				}).then(function() {
					ui.addNotification(null, E('p', {}, _('Применено.')));
					setTimeout(function() { self.renderStatus(null, statusHost); }, 1500);
				});
			}).catch(function(e) {
				ui.addNotification(_('Ошибка'), E('p', {}, String(e)), 'error');
			});
		}

		var btnQuick = E('button', { 'class': 'btn cbi-button-edit' }, _('Применить сразу'));
		btnQuick.addEventListener('click', function() { persist(false); });

		var btnApply = E('button', { 'class': 'btn cbi-button-save important' }, _('Сохранить и применить'));
		btnApply.addEventListener('click', function() { persist(true); });

		var btnOn = E('button', { 'class': 'btn cbi-button-apply' }, _('Включить сейчас'));
		btnOn.addEventListener('click', function() {
			fs.exec('/usr/bin/guestwifi', [ 'on' ]).then(function() {
				ui.addNotification(null, E('p', {}, _('Включено регламентно')));
				setTimeout(function() { self.renderStatus(null, statusHost); }, 1500);
			});
		});
		var btnOff = E('button', { 'class': 'btn cbi-button-reset' }, _('Выключить сейчас'));
		btnOff.addEventListener('click', function() {
			fs.exec('/usr/bin/guestwifi', [ 'off' ]).then(function() {
				ui.addNotification(null, E('p', {}, _('Выключено регламентно')));
				setTimeout(function() { self.renderStatus(null, statusHost); }, 1500);
			});
		});

		/* --- layout ------------------------------------------------------------ */
		return E([ E([], [
			statusHost,
			E('div', { 'class': 'cbi-map-descr' },
				_('Гостевая сеть с отключением по времени и сменой имени (SSID) по расписанию.')),

			E('fieldset', { 'class': 'cbi-section' }, [
				E('legend', {}, _('Основное')),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Гостевая сеть включена')),
					E('div', { 'class': 'cbi-value-field' }, swEnabled)
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Режим')),
					E('div', { 'class': 'cbi-value-field' }, selMode)
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Смена SSID по времени')),
					E('div', { 'class': 'cbi-value-field' }, swSsid)
				])
			]),

			E('fieldset', { 'class': 'cbi-section' }, [
				E('legend', {}, _('Расписание работы')),
				E('table', { 'class': 'table' },
					E('thead', {}, E('tr', {},
						E('th', {}, _('День')),
						E('th', { 'colspan': '3' }, _('Интервал')))),
					E('tbody', {}, dayRows)),
				E('p', {}, E('span', { 'class': 'cbi-value-description' },
					_('Интервал может пересекать полночь (напр. 22:00 — 02:00).')))
			]),

			E('fieldset', { 'class': 'cbi-section' }, [
				E('legend', {}, _('Расписание смены SSID')),
				E('table', { 'class': 'table' },
					E('thead', {}, E('tr', {},
						E('th', {}, _('Дни')),
						E('th', {}, _('Начало')),
						E('th', {}, ''),
						E('th', {}, _('Конец')),
						E('th', {}, _('Имя SSID')),
						E('th', {}, ''))),
					ssidTBody),
				btnAddSsid,
				E('p', {}, E('span', { 'class': 'cbi-value-description' },
					_('Первое совпадающее правило сверху применяет имя. Дни: список через запятую (1=Пн..7=Вс), диапазоны 1-5 или «*» для всех.')))
			]),

			E('div', { 'class': 'cbi-page-actions' }, [
				btnQuick, ' ', btnApply, ' ', btnOn, ' ', btnOff
			])
		]) ]);
	}
});
