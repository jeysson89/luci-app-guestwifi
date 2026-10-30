# luci-app-guestwifi — Гостевой Wi-Fi с расписанием

Приложение LuCI для OpenWrt 25.x (mediatek/filogic, проверено на Cudy TR3000 v1):
гостевая Wi-Fi сеть, которая включается/выключается **по расписанию на неделю**
и умеет **менять имя (SSID) по времени суток**.

## Возможности

- Выделенная гостевая сеть: bridge `br-guest`, подсеть по умолчанию `192.168.9.1/24`,
  DHCP на гостях, firewall-зона `guest` (input REJECT + разрешены только DHCP/DNS,
  forwarding только в `wan`), изоляция клиентов (`isolate`) на обоих диапазонах.
- Режимы работы: **always** (всегда), **schedule** (по расписанию), **off**.
  Расписание: галочка на каждый день недели + интервал ЧЧ:ММ — ЧЧ:ММ (может пересекать полночь).
- Изменения вносятся обычным LuCI-потоком: галочка наверху активирует/деактивирует
  сеть, значения попадают в staged uci и применяются штатной кнопкой
  **Save & Apply** (внизу страницы). Отдельных кнопок в приложении нет.
- Смена SSID по расписанию: список правил `<дни>|<HH:MM>|<HH:MM>|<ИмяSSID>`,
  первым сверху применяется первое совпавшее. Пробелы в имени заменяются на `_`.
- Кнопки «Включить/Выключить сейчас», живой статус со обновлением каждые 30 с.
- Мастер-выключатель `enabled` в главном меню.

## Файлы

| Путь | Назначение |
|------|------------|
| `root/usr/bin/guestwifi` | Бэкенд: `check` (cron каждую минуту), `status`, `on`, `off` |
| `root/etc/config/guestwifi` | Конфиг UCI |
| `root/etc/init.d/guestwifi` | Автозапуск при загрузке |
| `root/etc/uci-defaults/40_luci-guestwifi` | Создание сети/dhcp/firewall/guest-AP-ов и cron |
| `root/www/luci-static/resources/view/guestwifi/guestwifi.js` | Интерфейс LuCI |
| `root/usr/share/luci/menu.d/…json`, `root/usr/share/rpcd/acl.d/…json` | Меню и права доступа |

## Формат расписаний

`<дни>|<HH:MM>|<HH:MM>[|<SSID>]`, дни: `*`, `1,2,3`, `1-5` (1=Пн … 7=Вс).

```
list schedule '1,2,3,4,5|08:00|23:30'   # сеть работает Пн–Пт с 8:00 до 23:30
list schedule '6,7|10:00|23:59'
list ssid_list '*|09:00|23:59|Guest_Day'   # днём
list ssid_list '*|00:00|09:00|Guest_Night' # ночью
```

## Быстрая установка (dev, на работающий роутер)

Из рабочей папки проекта:

```
python dev/gw-deploy.py
```

Скрипт копирует файлы на `root@192.168.1.1`, запускает uci-defaults, рестартует
rpcd/uhttpd, проверяет статус. Повторный запуск безопасен (идемпотентен).

Для сборки пакета (apk/ipk) — OpenWrt buildroot, стандартный `make ./luci-app-guestwifi/compile`.

## Проверка

```
/usr/bin/guestwifi status        # JSON: {"state":…,"expected":…,<iface>:{ssid,up}}
logread | grep guestwifi         # журнал переключений
```
