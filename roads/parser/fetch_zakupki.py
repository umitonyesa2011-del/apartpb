#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_zakupki.py — сбор дорожных ремонтов Санкт-Петербурга из ЕИС
(Единая информационная система в сфере закупок, zakupki.gov.ru)
и подготовка файла data/objects.json для карты.

Что делает скрипт:
  1. запрашивает RSS-выдачу поиска по 44-ФЗ с фильтром «место поставки —
     Санкт-Петербург» и ключевыми словами про ремонт дорог;
  2. вытаскивает из выдачи номер закупки, наименование, заказчика и цену;
  3. по номеру закупки ищет заключённый контракт, чтобы получить подрядчика
     и сроки исполнения;
  4. определяет улицу по наименованию закупки и берёт её геометрию
     из OpenStreetMap через Overpass API (с кэшем на диске);
  5. складывает всё в data/objects.json.

Зависимостей нет — только стандартная библиотека Python 3.8+.

Примеры:
    python3 parser/fetch_zakupki.py                      # 2 страницы выдачи
    python3 parser/fetch_zakupki.py --pages 5 --limit 60
    python3 parser/fetch_zakupki.py --no-geo             # без обращения к OSM
    python3 parser/fetch_zakupki.py --out data/objects.json

Важно: ЕИС периодически меняет вёрстку и параметры поиска, а также
ограничивает частоту обращений. Скрипт написан «мягко»: если поле не
удалось разобрать, оно останется пустым, а объект всё равно попадёт в
выдачу. Все проблемы печатаются в консоль.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE_DIR = os.path.join(HERE, 'cache')
GEO_CACHE = os.path.join(CACHE_DIR, 'geo.json')

EIS = 'https://zakupki.gov.ru'
SPB_KLADR = '7800000000000'          # код Санкт-Петербурга в КЛАДР
OVERPASS = 'https://overpass-api.de/api/interpreter'

UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36')

DEFAULT_QUERIES = [
    'ремонт автомобильных дорог',
    'ремонт асфальтобетонного покрытия',
    'капитальный ремонт дорог',
]

STREET_TYPES = [
    'проспект', 'улица', 'шоссе', 'набережная', 'переулок', 'бульвар',
    'аллея', 'дорога', 'магистраль', 'проезд', 'линия', 'тупик',
]

MSK = timezone(timedelta(hours=3))


# ───────────────────────── сеть ─────────────────────────

def http_get(url, timeout=40, retries=3):
    """GET с повторами и человеческим User-Agent."""
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': UA,
                'Accept': '*/*',
                'Accept-Language': 'ru-RU,ru;q=0.9',
            })
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode('utf-8', errors='replace')
        except Exception as exc:                      # noqa: BLE001
            last = exc
            wait = 2 ** attempt
            print(f'  ! попытка {attempt + 1}/{retries} не удалась ({exc}), ждём {wait} с',
                  file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f'не удалось получить {url}: {last}')


# ───────────────────── разбор выдачи ЕИС ─────────────────────

def search_url(query, page, kind='order'):
    """Ссылка на RSS-выдачу поиска извещений (order) или контрактов (contract)."""
    params = {
        'morphology': 'on',
        'search-filter': 'Дате размещения',
        'pageNumber': page,
        'sortDirection': 'false',
        'recordsPerPage': '_50',
        'showLotsInfoHidden': 'false',
        'sortBy': 'UPDATE_DATE',
        'fz44': 'on',
        'currencyIdGeneral': '-1',
        'regionDeleted': 'false',
        'searchString': query,
    }
    if kind == 'order':
        params.update({'af': 'on', 'ca': 'on', 'pc': 'on', 'pa': 'on',
                       'deliveryKladrIds': SPB_KLADR})
        path = '/epz/order/extendedsearch/results.rss'
    else:
        params.update({'contractStageList_0': 'on', 'contractStageList_1': 'on',
                       'contractStageList_2': 'on', 'contractStageList_3': 'on'})
        path = '/epz/contract/search/results.rss'
    return EIS + path + '?' + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)


def parse_rss(xml_text):
    """RSS → список словарей {title, link, description, pubDate}."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        print(f'  ! ЕИС вернул не RSS ({exc}). Возможно, сработала защита от роботов.',
              file=sys.stderr)
        return []
    out = []
    for item in root.iter('item'):
        out.append({
            'title': (item.findtext('title') or '').strip(),
            'link': (item.findtext('link') or '').strip(),
            'description': re.sub(r'<[^>]+>', ' ', item.findtext('description') or ''),
            'pubDate': (item.findtext('pubDate') or '').strip(),
        })
    return out


def field(text, *labels):
    """Достаёт значение поля вида «Заказчик: ООО ...» из описания RSS."""
    for label in labels:
        m = re.search(label + r'\s*[:—-]\s*(.{3,200}?)(?:\s{2,}|\s*(?:Заказчик|Поставщик|Начальная|Цена|Размещено|Дата|Срок|Объект|Способ)\b|$)',
                      text, re.IGNORECASE | re.DOTALL)
        if m:
            return re.sub(r'\s+', ' ', m.group(1)).strip(' .;,')
    return ''


def money(text):
    m = re.search(r'(\d[\d\s ]{2,})[,.](\d{2})\s*(?:руб|₽|росс)', text, re.IGNORECASE)
    if not m:
        m = re.search(r'(\d[\d\s ]{5,})\s*(?:руб|₽)', text, re.IGNORECASE)
    if not m:
        return None
    try:
        return int(re.sub(r'[\s ]', '', m.group(1)))
    except ValueError:
        return None


def date_iso(text):
    m = re.search(r'(\d{2})\.(\d{2})\.(\d{4})', text or '')
    if not m:
        return None
    d, mo, y = m.groups()
    return f'{y}-{mo}-{d}'


def reg_number(link):
    m = re.search(r'regNumber=(\d+)', link or '')
    return m.group(1) if m else None


# ───────────────────── улица и геометрия ─────────────────────

def extract_street(title):
    """Пытается вытащить название улицы из наименования закупки."""
    text = re.sub(r'\s+', ' ', title)
    types = '|'.join(STREET_TYPES)

    # «проспект Науки», «шоссе Революции»
    m = re.search(rf'\b({types})\s+([А-ЯЁ][\w\-]+(?:\s+[А-ЯЁ][\w\-]+)?)', text)
    if m:
        return f'{m.group(1).lower()} {m.group(2)}'

    # «Невский проспект», «Народная улица»
    m = re.search(rf'\b([А-ЯЁ][\w\-]+(?:\s+[а-яё\w\-]+)?)\s+({types})\b', text)
    if m:
        return f'{m.group(1)} {m.group(2).lower()}'
    return ''


def street_core(street):
    """Ключевое слово улицы для поиска в OSM: «Невский проспект» → «Невский»."""
    words = [w for w in re.split(r'\s+', street) if w.lower() not in STREET_TYPES]
    return words[0] if words else street


def load_geo_cache():
    try:
        with open(GEO_CACHE, encoding='utf-8') as fh:
            return json.load(fh)
    except Exception:                                 # noqa: BLE001
        return {}


def save_geo_cache(cache):
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(GEO_CACHE, 'w', encoding='utf-8') as fh:
        json.dump(cache, fh, ensure_ascii=False)


def fetch_geometry(street, cache):
    """Геометрия улицы из OpenStreetMap: список линий [[[lat,lon], ...], ...]."""
    if not street:
        return []
    if street in cache:
        return cache[street]

    core = street_core(street)
    query = f'''
[out:json][timeout:90];
area["boundary"="administrative"]["admin_level"="4"]["name"="Санкт-Петербург"]->.spb;
way(area.spb)["highway"]["name"~"{core}",i];
out geom;
'''
    url = OVERPASS + '?' + urllib.parse.urlencode({'data': query})
    try:
        raw = http_get(url, timeout=95, retries=2)
        data = json.loads(raw)
    except Exception as exc:                          # noqa: BLE001
        print(f'  ! OSM не отдал геометрию для «{street}»: {exc}', file=sys.stderr)
        cache[street] = []
        return []

    lines = []
    for el in data.get('elements', [])[:80]:
        geom = el.get('geometry') or []
        if len(geom) >= 2:
            lines.append([[round(p['lat'], 6), round(p['lon'], 6)] for p in geom])

    cache[street] = lines
    time.sleep(1.2)                                   # бережём Overpass
    return lines


# ───────────────────── контракт по номеру закупки ─────────────────────

def fetch_contract(reg_num):
    """Подрядчик и сроки по номеру закупки. Пустой словарь, если не нашли."""
    try:
        items = parse_rss(http_get(search_url(reg_num, 1, kind='contract')))
    except Exception as exc:                          # noqa: BLE001
        print(f'  ! контракт {reg_num} не получен: {exc}', file=sys.stderr)
        return {}
    if not items:
        return {}

    desc = items[0]['description']
    return {
        'contractor': field(desc, 'Поставщик', 'Поставщики', 'Исполнитель'),
        'dateStart': date_iso(field(desc, 'Дата заключения контракта', 'Дата заключения')),
        'dateEnd': date_iso(field(desc, 'Срок исполнения', 'Дата окончания исполнения')),
        'price': money(desc),
        'contractLink': items[0]['link'],
    }


# ───────────────────── статус объекта ─────────────────────

def status_of(start, end):
    today = datetime.now(MSK).date().isoformat()
    if end and end < today:
        return 'done'
    if start and start > today:
        return 'planned'
    if start and end:
        return 'in_progress'
    return 'planned'


# ───────────────────── основной сценарий ─────────────────────

def collect(queries, pages, limit, with_geo, with_contracts):
    seen, items = set(), []
    geo_cache = load_geo_cache()

    for query in queries:
        for page in range(1, pages + 1):
            print(f'ЕИС: «{query}», страница {page}…')
            try:
                rss = http_get(search_url(query, page))
            except Exception as exc:                  # noqa: BLE001
                print(f'  ! страница пропущена: {exc}', file=sys.stderr)
                continue

            rows = parse_rss(rss)
            if not rows:
                break
            print(f'  найдено записей: {len(rows)}')

            for row in rows:
                num = reg_number(row['link'])
                if not num or num in seen:
                    continue
                seen.add(num)

                desc = row['description']
                title = re.sub(r'\s+', ' ', row['title']).strip()
                street = extract_street(title)

                obj = {
                    'id': num,
                    'title': title,
                    'street': street or title[:60],
                    'section': '',
                    'district': '',
                    'customer': field(desc, 'Заказчик', 'Наименование заказчика'),
                    'contractor': '',
                    'contractorInn': '',
                    'price': money(desc),
                    'dateStart': None,
                    'dateEnd': None,
                    'status': 'planned',
                    'work': 'Ремонт дорожного покрытия',
                    'description': re.sub(r'\s+', ' ', desc).strip()[:600],
                    'source': row['link'],
                    'geometry': [],
                }

                if with_contracts:
                    contract = fetch_contract(num)
                    obj['contractor'] = contract.get('contractor') or ''
                    obj['dateStart'] = contract.get('dateStart')
                    obj['dateEnd'] = contract.get('dateEnd')
                    obj['price'] = contract.get('price') or obj['price']
                    time.sleep(0.6)

                obj['status'] = status_of(obj['dateStart'], obj['dateEnd'])

                if with_geo:
                    obj['geometry'] = fetch_geometry(street, geo_cache)

                items.append(obj)
                if limit and len(items) >= limit:
                    save_geo_cache(geo_cache)
                    return items
            time.sleep(1.0)

    save_geo_cache(geo_cache)
    return items


def main():
    ap = argparse.ArgumentParser(description='Сбор дорожных ремонтов СПб из ЕИС')
    ap.add_argument('--pages', type=int, default=2, help='страниц выдачи на каждый запрос')
    ap.add_argument('--limit', type=int, default=40, help='максимум объектов')
    ap.add_argument('--query', action='append', help='свой поисковый запрос (можно несколько раз)')
    ap.add_argument('--out', default=os.path.join(ROOT, 'data', 'objects.json'))
    ap.add_argument('--no-geo', action='store_true', help='не обращаться к OpenStreetMap')
    ap.add_argument('--no-contracts', action='store_true', help='не искать контракты (быстрее)')
    ap.add_argument('--keep-empty', action='store_true',
                    help='сохранять объекты без геометрии (по умолчанию отбрасываются)')
    args = ap.parse_args()

    queries = args.query or DEFAULT_QUERIES
    items = collect(queries, args.pages, args.limit, not args.no_geo, not args.no_contracts)

    if not args.keep_empty and not args.no_geo:
        before = len(items)
        items = [o for o in items if o['geometry']]
        if before != len(items):
            print(f'Отброшено объектов без геометрии: {before - len(items)} '
                  f'(оставить их можно ключом --keep-empty)')

    if not items:
        print('Ничего не собрано — файл не перезаписан. '
              'Проверьте доступность zakupki.gov.ru и параметры поиска.', file=sys.stderr)
        return 1

    payload = {
        'source': 'eis',
        'generatedAt': datetime.now(MSK).isoformat(timespec='seconds'),
        'note': 'Данные получены из ЕИС (zakupki.gov.ru), геометрия улиц — OpenStreetMap.',
        'items': items,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)

    print(f'Готово: {len(items)} объектов → {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
