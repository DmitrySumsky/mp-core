# -*- coding: utf-8 -*-
"""ЧП ЯМ по заказам — подготовка книги к первому прогону через Sheets API (сервисный аккаунт).

v2.0.0 — 22.09.2026
  СЕБЕСТОИМОСТЬ КАБИНЕТОВ БЕЗ ЮНИТКИ ПРИШЛА СПИСКАМИ ИЗ КАБИНЕТА МАРКЕТА — менеджер ЯМ в рабочем чате,
  21.09.2026: «юнитки по HP нет … могу дать список артикул магазина — себес».
  • --cogs-xlsx <кабинет>=<файл>: выгрузка «Список товаров» из кабинета Маркета (шапка во второй строке,
    «Ваш SKU *» и колонка «СЕБЕС») → строки листа «💲 ЧП ЯМ себес вручную»; повторный залив того же
    кабинета заменяет его строки, чужие не трогает;
  • --add-cabinet <кабинет>: строка на листе настроек со «Считать = нет» — кабинет ждёт API-ключ;
  • шапка листа настроек и лист себеса приводятся к раскладке v2.0.0 (то же делает «⚙️ Обновить
    настройки таблицы» в меню — здесь, чтобы книга была готова до первого клика);
  • --hide <лист>: спрятать лист (не удалить).

    python tools/seed_book.py --registry <реестр> --cogs-xlsx "HealthPro=hp.xlsx" --add-cabinet "Новый" --hide "Лист"
"""
import argparse
import io
import json
import sys

import openpyxl
from google.oauth2 import service_account
from googleapiclient.discovery import build

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SETTINGS = "⚙️ ЧП ЯМ настройки"
COGS = "💲 ЧП ЯМ себес вручную"
SETTINGS_HEAD = ["Кабинет", "Лист юнитки (себес)", "Считать (да/нет)", "Тариф комиссии вручную, %", "с даты заказа", "Комментарий"]
COGS_HEAD = ["Кабинет", "Артикул магазина", "Себестоимость, ₽", "Комментарий"]
HEAD_ROW = 4


def read_catalog(path):
    """СЕБЕС бывает и во второй строке шапки, и в третьей (подсказки) — берём ту, где нашлась."""
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True)["Список товаров"]
    rows = list(ws.iter_rows(values_only=True))
    sku = [str(x or "").strip() for x in rows[1]].index("Ваш SKU *")
    cost = None
    for hr in (1, 2):
        for i, h in enumerate(rows[hr]):
            if str(h or "").strip().upper() == "СЕБЕС":
                cost = i
    if cost is None:
        raise SystemExit("%s: нет колонки «СЕБЕС»" % path)
    out = []
    for r in rows[3:]:
        if r[sku] in (None, "") or r[cost] in (None, ""):
            continue
        v = r[cost] if isinstance(r[cost], (int, float)) else float(str(r[cost]).replace(" ", "").replace(",", "."))
        out.append((str(r[sku]).strip(), round(v, 2)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", required=True)
    ap.add_argument("--cogs-xlsx", action="append", default=[])
    ap.add_argument("--add-cabinet", action="append", default=[])
    ap.add_argument("--hide", action="append", default=[])
    a = ap.parse_args()
    reg = json.load(io.open(a.registry, encoding="utf-8"))
    cr = service_account.Credentials.from_service_account_file(
        reg["service_account_key"], scopes=["https://www.googleapis.com/auth/spreadsheets"])
    api = build("sheets", "v4", credentials=cr, cache_discovery=False).spreadsheets()
    book = reg["demo_book"]
    meta = api.get(spreadsheetId=book, fields="sheets.properties(sheetId,title,hidden)").execute()["sheets"]
    ids = {s["properties"]["title"]: s["properties"]["sheetId"] for s in meta}
    reqs = []

    # лист настроек: шапка v2.0.0
    v = api.values().get(spreadsheetId=book, range="'%s'!A1:F60" % SETTINGS).execute().get("values", [])
    hr = next(i for i, r in enumerate(v) if r and r[0] == "Кабинет")
    api.values().update(spreadsheetId=book, range="'%s'!A%d:F%d" % (SETTINGS, hr + 1, hr + 1),
                        valueInputOption="RAW", body={"values": [SETTINGS_HEAD]}).execute()
    names = [r[0] for r in v[hr + 1:] if r and r[0]]
    for cab in a.add_cabinet:
        if cab in names:
            print("кабинет «%s» уже в настройках" % cab)
            continue
        row = hr + 2 + len(names)
        api.values().update(spreadsheetId=book, range="'%s'!A%d:F%d" % (SETTINGS, row, row), valueInputOption="RAW",
                            body={"values": [[cab, "", "нет", "", "", "ждёт API-ключ: строка на листе «API-ключи», потом «Считать = да»"]]}).execute()
        names.append(cab)
        print("кабинет «%s» добавлен в настройки со «Считать = нет»" % cab)

    # лист себеса вручную
    if COGS not in ids:
        res = api.batchUpdate(spreadsheetId=book, body={"requests": [{"addSheet": {"properties": {"title": COGS}}}]}).execute()
        ids[COGS] = res["replies"][0]["addSheet"]["properties"]["sheetId"]
        api.values().update(spreadsheetId=book, range="'%s'!A1:A2" % COGS, valueInputOption="RAW", body={"values": [
            ["Себестоимость вручную — для кабинетов без юнитки и артикулов, которых нет в юнитке"],
            ["Кабинет — как на листе настроек; артикул магазина — как в заказах Маркета (shopSku). Значение отсюда главнее юнитки."]]}).execute()
        api.values().update(spreadsheetId=book, range="'%s'!A%d:D%d" % (COGS, HEAD_ROW, HEAD_ROW), valueInputOption="RAW",
                            body={"values": [COGS_HEAD]}).execute()
        print("создан лист «%s»" % COGS)
    sid = ids[COGS]
    reqs.append({"repeatCell": {"range": {"sheetId": sid, "startRowIndex": HEAD_ROW, "startColumnIndex": 1, "endColumnIndex": 2},
                                "cell": {"userEnteredFormat": {"numberFormat": {"type": "TEXT"}}}, "fields": "userEnteredFormat.numberFormat"}})
    reqs.append({"updateSheetProperties": {"properties": {"sheetId": sid, "gridProperties": {"frozenRowCount": HEAD_ROW}},
                                           "fields": "gridProperties.frozenRowCount"}})
    reqs.append({"repeatCell": {"range": {"sheetId": sid, "startRowIndex": HEAD_ROW - 1, "endRowIndex": HEAD_ROW},
                                "cell": {"userEnteredFormat": {"textFormat": {"bold": True}, "backgroundColor": {"red": 0.91, "green": 0.94, "blue": 1}}},
                                "fields": "userEnteredFormat(textFormat,backgroundColor)"}})
    for i, w in enumerate((160, 260, 130, 320)):
        reqs.append({"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": i, "endIndex": i + 1},
                                                   "properties": {"pixelSize": w}, "fields": "pixelSize"}})
    for name in a.hide:
        if name in ids:
            reqs.append({"updateSheetProperties": {"properties": {"sheetId": ids[name], "hidden": True}, "fields": "hidden"}})
            print("лист «%s» спрятан" % name)
    api.batchUpdate(spreadsheetId=book, body={"requests": reqs}).execute()

    if a.cogs_xlsx:
        cur = api.values().get(spreadsheetId=book, range="'%s'!A%d:D" % (COGS, HEAD_ROW + 1), valueRenderOption="UNFORMATTED_VALUE").execute().get("values", [])
        for spec in a.cogs_xlsx:
            cab, path = spec.split("=", 1)
            items = read_catalog(path)
            cur = [r for r in cur if r and r[0] != cab] + [[cab, sku, cost, "список из кабинета Маркета"] for sku, cost in items]
            print("себес «%s»: %d артикулов" % (cab, len(items)))
        api.values().clear(spreadsheetId=book, range="'%s'!A%d:D" % (COGS, HEAD_ROW + 1)).execute()
        api.values().update(spreadsheetId=book, range="'%s'!A%d" % (COGS, HEAD_ROW + 1), valueInputOption="RAW",
                            body={"values": cur}).execute()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())