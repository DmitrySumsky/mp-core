# -*- coding: utf-8 -*-
"""Заведение новой книги «Регламент WB» — v1.0.0 — 25.09.2026.

v1.0.0: НОВАЯ КНИГА РЕГЛАМЕНТА ЗА ОДИН ЗАХОД, БЕЗ РУЧНОЙ ВЁРСТКИ.
    Лист «Регламент» (шапка, строки товаров, формулы, оформление, ручные колонки цветом),
    пустой «1С», «WB Данные» из локального прогона (tools/run_local.js), скрытый
    «Технический» с ключом WB. Формулы пишутся Sheets API (USER_ENTERED, английские имена
    и запятая — API от локали книги не зависит); дальше новые строки получают формулы
    из строки-образца кнопкой «➕ Дописать новые товары» (R1C1, без локали).
    Уточнение (25.09.2026): USER_ENTERED разбирает формулу ПО ЛОКАЛИ книги — в ru_RU запятая
    стала десятичным разделителем, «ROUNDUP(x,0)» превратился в «ROUNDUP(x)», все 648 формул
    дали #ERROR!. Разделитель аргументов теперь берётся по локали (для запятой-десятичной — «;»),
    часовой пояс книги ставится московский (новая книга создаётся в GMT).

    python tools/seed_book.py --registry <реестр> --book <key> --items <json> [--run <run_local.json>] [--force]

Идентификаторы книг и путь к ключу сервисного аккаунта — в реестре ВНЕ репозитория.
Ключ WB читается из файла, указанного в реестре, пишется в «Технический»!B2 и нигде не печатается.
Книгу с уже заполненным «Регламентом» скрипт не трогает без --force.
"""
import io
import json
import os
import re
import sys

import gspread

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HEADERS = [
    "SKU", "ШК", "Доступный остаток", "Остаток 1С КА", "Остаток 1С ERP",
    "Остаток 1С\nWB FBS на 14 дней", "Комментарий с производства",
    "Заказы WB\n(5 дн)", "ССП WB\n(5 дн)", "Заказы FBS\n(5 дн)", "ССП\nFBS", "Остаток\nFBS",
    "Остаток FBS,\nдней", "Заказы FBO\n(5 дн)", "ССП\nFBO",
    "Поставка №1,\nшт", "Дата\nпоставки №1", "Поставка №2,\nшт", "Дата\nпоставки №2",
    "Остаток\nFBO", "Остаток FBO\nпосле отгрузки", "Дней FBO", "Дней FBO\nпосле отгрузки",
    "Потребность FBO\nна 30 дней, шт", "Кратность\nкороба", "Коробов",
]
MANUAL = ["G", "P", "Q", "R", "S", "Y"]          # заполняет человек — окрашены, перечислены в 📖
WBD = "'WB Данные'!$A:$J"


def formulas(r):
    """Формулы строки r. Колонки WB Данные: 4 остаток FBS, 5 FBO, 6 заказы FBS, 8 заказы FBO."""
    return {
        "C": f"=D{r}-F{r}",
        "D": f"=IFERROR(VLOOKUP($A{r},'1С'!$A:$G,7,0),0)",
        "E": f"=IFERROR(VLOOKUP($A{r},'1С'!$A:$H,8,0),0)",
        "F": f"=ROUNDUP(I{r}*14/30,0)*30",
        "H": f"=J{r}+N{r}",
        "I": f"=H{r}/5",
        "J": f"=IFERROR(VLOOKUP($A{r},{WBD},6,0),0)",
        "K": f"=J{r}/5",
        "L": f"=IFERROR(VLOOKUP($A{r},{WBD},4,0),0)",
        "M": f"=IFERROR(L{r}/K{r},0)",
        "N": f"=IFERROR(VLOOKUP($A{r},{WBD},8,0),0)",
        "O": f"=N{r}/5",
        "T": f"=IFERROR(VLOOKUP($A{r},{WBD},5,0),0)",
        "U": f"=T{r}+P{r}+R{r}",
        "V": f"=IFERROR(T{r}/O{r},T{r})",
        "W": f"=IFERROR(U{r}/O{r},U{r})",
        "X": f"=IF(Y{r}>0,MAX(0,ROUNDUP((I{r}*30-T{r})/Y{r},0)*Y{r}),MAX(0,ROUNDUP(I{r}*30-T{r},0)))",
        "Z": f"=IFERROR(X{r}/Y{r},\"\")",
    }


DECIMAL_COMMA = ("ru", "uk", "be", "kk", "de", "fr", "es", "it", "pt", "pl", "tr", "nl", "cs", "sv", "fi")


def localize(formula, locale):
    """Запятые-разделители аргументов → «;», если в локали книги десятичная запятая.
    Запятые внутри кавычек (имена листов, строки) не трогаются."""
    if not str(formula).startswith("=") or not str(locale or "").split("_")[0] in DECIMAL_COMMA:
        return formula
    out, quote = [], None
    for ch in formula:
        if quote:
            if ch == quote:
                quote = None
        elif ch in ("'", '"'):
            quote = ch
        elif ch == ",":
            ch = ";"
        out.append(ch)
    return "".join(out)


def col(letter):
    return ord(letter) - 65


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def read_token(path, name):
    token = ""
    for line in io.open(path, encoding="utf-8"):
        m = re.match(r"^\s*([A-Za-z0-9_]+)\s*=\s*(\S+)", line)
        if m and m.group(1) == name:
            token = m.group(2)                   # последняя строка побеждает
    if not token:
        raise SystemExit("в файле ключей нет " + name)
    return token


def main():
    reg_path = arg("--registry")
    registry = json.load(io.open(reg_path, encoding="utf-8"))
    base = os.path.dirname(os.path.abspath(reg_path))
    book = next(b for b in registry["books"] if b["key"] == arg("--book"))
    items = json.load(io.open(arg("--items"), encoding="utf-8"))
    run = json.load(io.open(arg("--run"), encoding="utf-8")) if arg("--run") else None

    gc = gspread.service_account(filename=os.path.join(base, registry["service_account_key"]))
    sh = gc.open_by_key(book["sheet_id"])
    names = [w.title for w in sh.worksheets()]

    reg = sh.worksheet("Регламент") if "Регламент" in names else sh.sheet1
    if reg.title == "Регламент" and len(reg.col_values(2)) > 2 and "--force" not in sys.argv:
        raise SystemExit("«Регламент» уже заполнен — книгу не трогаю (--force, если точно нужно).")
    if reg.title != "Регламент":
        reg.update_title("Регламент")

    n = len(items)
    last = 2 + n
    reg.resize(rows=max(last + 20, 100), cols=len(HEADERS))

    def ws(title, rows, cols):
        if title in [w.title for w in sh.worksheets()]:
            w = sh.worksheet(title)
            w.clear()
            return w
        return sh.add_worksheet(title, rows, cols)

    wbd = ws("WB Данные", max(n + 10, 100), 10)
    one = ws("1С", 1000, 12)
    tech = ws("Технический", 20, 4)

    # «WB Данные» — раньше «Регламента»: его формулы ссылаются на этот лист
    if run and run["sheets"].get("WB Данные"):
        grid = run["sheets"]["WB Данные"]["grid"]
        wbd.update(values=[row[:10] for row in grid], range_name="A1", value_input_option="USER_ENTERED")   # числа — числами: «0.8» строкой в русской локали стало бы текстом
    else:
        wbd.update(values=[["Артикул (vendorCode)", "Штрихкод", "nmID", "Остаток FBS", "Остаток FBO (Склад WB РФ)",
                            "Заказы FBS за 5 дней", "Заказы FBS, среднее/день", "Заказы FBO за 5 дней",
                            "Заказы FBO, среднее/день", "Обновлено (МСК)"]], range_name="A1")

    tech.update(values=[["WB API", ""], ["↑ ключ WB в B2: все категории, без галки «только на чтение»",
                read_token(os.path.join(base, book["token_file"]), book["token_name"])],
                ["Базовый склад FBS (пусто = «Мой склад»)", ""],
                ["GitHub-токен (пусто, пока репозиторий кода открыт)", ""]], range_name="A1",
                value_input_option="RAW")

    # «Регламент»: формат штрихкода «текст» ДО значений (ПУЛЬТ §6)
    sid = reg.id
    sh.batch_update({"requests": [{"repeatCell": {
        "range": {"sheetId": sid, "startRowIndex": 2, "endRowIndex": last + 20, "startColumnIndex": 1, "endColumnIndex": 2},
        "cell": {"userEnteredFormat": {"numberFormat": {"type": "TEXT"}}}, "fields": "userEnteredFormat.numberFormat"}}]})

    row1 = [""] * len(HEADERS)
    row1[0] = "Не перемещать столбцы"
    row1[col("H")] = "Обновлено WB (МСК):"
    row1[col("J")] = "='WB Данные'!J2"
    row1 = [localize(v, sh.locale) for v in row1]
    rows = [row1, HEADERS]
    for i, (vc, bc) in enumerate(items):
        r = 3 + i
        line = [""] * len(HEADERS)
        line[0], line[1] = vc, str(bc)
        for letter, f in formulas(r).items():
            line[col(letter)] = localize(f, sh.locale)
        rows.append(line)
    reg.update(values=rows, range_name="A1", value_input_option="USER_ENTERED")

    # оформление: шапка, закрепление, ручные колонки, форматы чисел, ширины
    yellow = {"red": 1, "green": 0.95, "blue": 0.8}
    tz = [{"updateSpreadsheetProperties": {"properties": {"timeZone": "Europe/Moscow"}, "fields": "timeZone"}}]
    head_bg = {"red": 0.85, "green": 0.9, "blue": 0.97}
    reqs = tz + [
        {"updateSheetProperties": {"properties": {"sheetId": sid, "gridProperties": {"frozenRowCount": 2, "frozenColumnCount": 2}},
                                   "fields": "gridProperties.frozenRowCount,gridProperties.frozenColumnCount"}},
        {"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 2},
                        "cell": {"userEnteredFormat": {"backgroundColor": head_bg, "textFormat": {"bold": True},
                                                       "wrapStrategy": "WRAP", "verticalAlignment": "MIDDLE",
                                                       "horizontalAlignment": "CENTER"}},
                        "fields": "userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment,horizontalAlignment)"}},
        {"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1},
                        "cell": {"userEnteredFormat": {"textFormat": {"italic": True, "foregroundColor": {"red": 0.4, "green": 0.4, "blue": 0.4}}}},
                        "fields": "userEnteredFormat.textFormat"}},
        {"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": col("J"), "endColumnIndex": col("J") + 1},
                        "cell": {"userEnteredFormat": {"numberFormat": {"type": "DATE_TIME", "pattern": "dd.mm.yyyy hh:mm"}}},
                        "fields": "userEnteredFormat.numberFormat"}},
        {"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "ROWS", "startIndex": 1, "endIndex": 2},
                                       "properties": {"pixelSize": 58}, "fields": "pixelSize"}},
        {"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 1},
                                       "properties": {"pixelSize": 290}, "fields": "pixelSize"}},
        {"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": 1, "endIndex": 2},
                                       "properties": {"pixelSize": 115}, "fields": "pixelSize"}},
        {"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": 2, "endIndex": len(HEADERS)},
                                       "properties": {"pixelSize": 92}, "fields": "pixelSize"}},
        {"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": col("G"), "endIndex": col("G") + 1},
                                       "properties": {"pixelSize": 240}, "fields": "pixelSize"}},
        # дни и среднее — одна цифра после запятой, штуки — целые
        {"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 2, "endRowIndex": last, "startColumnIndex": 2, "endColumnIndex": len(HEADERS)},
                        "cell": {"userEnteredFormat": {"numberFormat": {"type": "NUMBER", "pattern": "#,##0"}}},
                        "fields": "userEnteredFormat.numberFormat"}},
    ]
    for letter in ("I", "K", "M", "O", "V", "W", "Z"):
        reqs.append({"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 2, "endRowIndex": last, "startColumnIndex": col(letter), "endColumnIndex": col(letter) + 1},
                                    "cell": {"userEnteredFormat": {"numberFormat": {"type": "NUMBER", "pattern": "#,##0.0"}}},
                                    "fields": "userEnteredFormat.numberFormat"}})
    for letter in ("Q", "S"):
        reqs.append({"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 2, "endRowIndex": last, "startColumnIndex": col(letter), "endColumnIndex": col(letter) + 1},
                                    "cell": {"userEnteredFormat": {"numberFormat": {"type": "DATE", "pattern": "dd.mm.yyyy"}}},
                                    "fields": "userEnteredFormat.numberFormat"}})
    for letter in ("G",):
        reqs.append({"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 2, "endRowIndex": last, "startColumnIndex": col(letter), "endColumnIndex": col(letter) + 1},
                                    "cell": {"userEnteredFormat": {"numberFormat": {"type": "TEXT"}}},
                                    "fields": "userEnteredFormat.numberFormat"}})
    for letter in MANUAL:
        reqs.append({"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 2, "endRowIndex": last, "startColumnIndex": col(letter), "endColumnIndex": col(letter) + 1},
                                    "cell": {"userEnteredFormat": {"backgroundColor": yellow}}, "fields": "userEnteredFormat.backgroundColor"}})
    # 1С — вставка «как есть»; подсказка в примечании, чтобы не мешать вставке
    reqs.append({"updateCells": {"range": {"sheetId": one.id, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 1},
                                 "rows": [{"values": [{"note": "Сюда вставляется выгрузка остатков из 1С как есть: A — артикул (как в «Регламенте»), "
                                                                "G — остаток КА, H — остаток ERP. «Регламент» берёт их формулами в колонки D и E."}]}],
                                 "fields": "note"}})
    reqs.append({"updateSheetProperties": {"properties": {"sheetId": wbd.id, "gridProperties": {"frozenRowCount": 1}},
                                           "fields": "gridProperties.frozenRowCount"}})
    reqs.append({"updateSheetProperties": {"properties": {"sheetId": tech.id, "hidden": True}, "fields": "hidden"}})
    order = ["Регламент", "1С", "WB Данные", "Технический"]
    for idx, title in enumerate(order):
        reqs.append({"updateSheetProperties": {"properties": {"sheetId": sh.worksheet(title).id, "index": idx}, "fields": "index"}})
    sh.batch_update({"requests": reqs})

    # проверка: формулы посчитались, ошибок нет
    vals = reg.get(f"A3:Z{last}")
    errors = [(3 + i, c) for i, row in enumerate(vals) for c, v in enumerate(row) if str(v).startswith("#")]
    print("книга «%s»: товаров %d, строк WB Данные %d" % (sh.title, n, len(run["sheets"]["WB Данные"]["grid"]) - 1 if run else 0))
    print("ошибок в формулах: %d%s" % (len(errors), (" — первые: %s" % errors[:5]) if errors else ""))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
