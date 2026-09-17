# -*- coding: utf-8 -*-
"""Первичное наполнение книги результатом локального прогона — v1.0.0 — 17.09.2026

v1.0.0: НОВАЯ КНИГА ПУСТАЯ, А ПЕРВЫЙ ЗАМЕР УЖЕ СНЯТ ЛОКАЛЬНО (tools/run_local.js).
  Листы создаются Sheets API сразу с шапками и форматами, значения пишутся RAW: дата в шапке
  истории остаётся текстом, а не превращается в дату. Лист «Ключи» заливается БЕЗ значений
  ключей — их вписывает человек. Существующие непустые листы не перезаписываются без --force.

    python tools/seed_book.py --book <id книги> --key <ключ сервисного аккаунта.json> --dump <результат.json> [--force] [--dry]

Идентификатор книги и путь к ключу — только аргументами: в открытом репозитории их нет.
"""
import argparse
import io
import json
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ORDER = ["Артикулы", "Позиции", "История · органика", "История · WB", "Запросы WB", "Очередь", "Журнал", "Ключи"]
SHIFT_FMT = '[Green]"▲"0.#;[Red]"▼"0.#;"="'
HUMAN_BG = {"red": 1.0, "green": 0.949, "blue": 0.8}


def service(key_path):
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
    creds = Credentials.from_service_account_file(key_path, scopes=["https://www.googleapis.com/auth/spreadsheets"])
    return build("sheets", "v4", credentials=creds, cache_discovery=False).spreadsheets()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--book", required=True)
    ap.add_argument("--key", required=True)
    ap.add_argument("--dump", required=True)
    ap.add_argument("--force", action="store_true", help="перезаписать непустые листы")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()

    dump = json.load(io.open(a.dump, encoding="utf-8"))["sheets"]
    api = service(a.key)
    meta = api.get(spreadsheetId=a.book, fields="sheets.properties(title,sheetId,gridProperties)").execute()
    have = {s["properties"]["title"]: s["properties"] for s in meta["sheets"]}

    add = []
    for name in ORDER:
        rows = dump.get(name) or []
        if name not in have:
            width = max([len(r) for r in rows] + [4])
            add.append({"addSheet": {"properties": {"title": name,
                        "gridProperties": {"rowCount": max(len(rows) + 200, 300), "columnCount": max(width + 4, 12),
                                           "frozenRowCount": 0 if name == "Ключи" else 1}}}})
    print("листов создать:", len(add))
    if a.dry:
        for name in ORDER:
            print("  %-22s %d строк" % (name, len(dump.get(name) or [])))
        return 0
    if add:
        api.batchUpdate(spreadsheetId=a.book, body={"requests": add}).execute()
        meta = api.get(spreadsheetId=a.book, fields="sheets.properties(title,sheetId,gridProperties)").execute()
        have = {s["properties"]["title"]: s["properties"] for s in meta["sheets"]}

    data, fmt = [], []
    for name in ORDER:
        rows = dump.get(name) or []
        if not rows:
            continue
        sid = have[name]["sheetId"]
        if not a.force:
            cur = api.values().get(spreadsheetId=a.book, range="'%s'!A2:C4" % name).execute().get("values", [])
            if cur and name != "Ключи":
                print("  пропуск «%s»: лист уже с данными (нужен --force)" % name)
                continue
        width = max(len(r) for r in rows)
        grid = have[name]["gridProperties"]
        if len(rows) + 50 > grid["rowCount"] or width > grid["columnCount"]:
            fmt.append({"updateSheetProperties": {"properties": {"sheetId": sid, "gridProperties": {
                "rowCount": max(len(rows) + 200, grid["rowCount"]), "columnCount": max(width + 4, grid["columnCount"])}},
                "fields": "gridProperties(rowCount,columnCount)"}})
        rows = [r + [""] * (width - len(r)) for r in rows]
        if name == "Ключи":
            rows = [[r[0], ("" if i in (1, 3, 4, 5) else (r[1] if len(r) > 1 else ""))] for i, r in enumerate(rows)]   # ключи — только руками
            fmt.append({"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 1},
                        "properties": {"pixelSize": 430}, "fields": "pixelSize"}})
            fmt.append({"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": 1, "endIndex": 2},
                        "properties": {"pixelSize": 360}, "fields": "pixelSize"}})
        else:
            fmt.append({"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1},
                        "cell": {"userEnteredFormat": {"textFormat": {"bold": True}}}, "fields": "userEnteredFormat.textFormat.bold"}})
        if name.startswith("История"):
            fmt.append({"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 2},
                        "cell": {"userEnteredFormat": {"numberFormat": {"type": "TEXT"}}}, "fields": "userEnteredFormat.numberFormat"}})
        if name == "Позиции":
            for col in (7, 9):
                fmt.append({"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 1, "startColumnIndex": col, "endColumnIndex": col + 1},
                            "cell": {"userEnteredFormat": {"numberFormat": {"type": "NUMBER", "pattern": SHIFT_FMT}}},
                            "fields": "userEnteredFormat.numberFormat"}})
            fmt.append({"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": 2, "endIndex": 4},
                        "properties": {"pixelSize": 300}, "fields": "pixelSize"}})
        if name == "Артикулы":
            fmt.append({"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 3},
                        "cell": {"userEnteredFormat": {"backgroundColor": HUMAN_BG, "textFormat": {"bold": True}}},
                        "fields": "userEnteredFormat(backgroundColor,textFormat.bold)"}})
            fmt.append({"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": 2, "endIndex": 4},
                        "properties": {"pixelSize": 330}, "fields": "pixelSize"}})
        data.append({"range": "'%s'!A1" % name, "values": rows})
        print("  «%s»: %d строк × %d колонок" % (name, len(rows), width))

    if fmt:
        api.batchUpdate(spreadsheetId=a.book, body={"requests": fmt}).execute()      # формат ДО значений
    if data:
        api.values().batchUpdate(spreadsheetId=a.book, body={"valueInputOption": "RAW", "data": data}).execute()

    # пустой лист по умолчанию («Лист1»/«Sheet1») убираем, если в нём ничего нет
    drop = []
    for title, props in have.items():
        if title in ORDER:
            continue
        cur = api.values().get(spreadsheetId=a.book, range="'%s'!A1:E5" % title).execute().get("values", [])
        if not cur:
            drop.append({"deleteSheet": {"sheetId": props["sheetId"]}})
    if drop:
        api.batchUpdate(spreadsheetId=a.book, body={"requests": drop}).execute()
        print("убрано пустых листов по умолчанию:", len(drop))
    print("готово")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
