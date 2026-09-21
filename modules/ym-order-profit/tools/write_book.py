# -*- coding: utf-8 -*-
"""
ЧП ПО ЗАКАЗАМ ЯНДЕКС МАРКЕТА — ЗАПИСЬ В КНИГУ v0.1.0 — 21.09.2026

v0.1.0 — 21.09.2026
  ПОКАЗАТЬ МОДЕЛЬ МЕНЕДЖЕРАМ НА ЖИВЫХ ДАННЫХ, А НЕ ТЕКСТОМ — просьба владельца, 21.09.2026.
  • четыре листа в книге: «🧾 ЧП ЯМ по заказам» (вчерашний день по артикулам, расчёт формулами —
    коэффициент можно поменять и увидеть результат), «📈 ЧП ЯМ по дням» (две недели по кабинетам,
    строка вчера — формулами из листа артикулов), «⚙️ ЧП ЯМ коэффициенты» (когорты и окна),
    «📖 ЧП ЯМ как считается» (логика и обратная проверка);
  • себестоимость — формулой из юнитки кабинета (колонки ищутся по заголовкам «Код 1С» и «себес»);
  • реклама показов и ЧП старого отчёта — из листа ежедневного отчёта книги, для сравнения.

Запуск (идентификаторы книг и кабинеты — в локальном реестре вне репозитория):
    python write_book.py --registry ../registry.local.json --day 2026-09-20 --days 14
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys

from google.oauth2 import service_account
from googleapiclient.discovery import build

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from yop_engine import COST_KEYS, Cabinet, COHORT_FROM, COHORT_TO, MILE_FROM, MILE_TO, MIN_UNITS  # noqa: E402

VERSION = "v0.1.0"
SH_DETAIL = "🧾 ЧП ЯМ по заказам"
SH_DAYS = "📈 ЧП ЯМ по дням"
SH_COEF = "⚙️ ЧП ЯМ коэффициенты"
SH_HELP = "📖 ЧП ЯМ как считается"
OLD_DAILY = "📊 Ежедневный"
TAX = 0.25


def col(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def ru(d: dt.date) -> str:
    return d.strftime("%d.%m.%Y")


class Book:
    def __init__(self, key: str, book_id: str):
        cr = service_account.Credentials.from_service_account_file(
            key, scopes=["https://www.googleapis.com/auth/spreadsheets"])
        self.api = build("sheets", "v4", credentials=cr, cache_discovery=False).spreadsheets()
        self.id = book_id

    def values(self, rng: str, render="UNFORMATTED_VALUE"):
        return self.api.values().get(spreadsheetId=self.id, range=rng,
                                     valueRenderOption=render).execute().get("values", [])

    def sheet_ids(self) -> dict:
        m = self.api.get(spreadsheetId=self.id, fields="sheets(properties(sheetId,title))").execute()
        return {s["properties"]["title"]: s["properties"]["sheetId"] for s in m["sheets"]}

    def recreate(self, titles: list[str]) -> dict:
        ids = self.sheet_ids()
        reqs = [{"deleteSheet": {"sheetId": ids[t]}} for t in titles if t in ids]
        reqs += [{"addSheet": {"properties": {"title": t, "index": i}}} for i, t in enumerate(titles)]
        self.api.batchUpdate(spreadsheetId=self.id, body={"requests": reqs}).execute()
        return self.sheet_ids()

    def put(self, title: str, rows: list[list]):
        # книга в русской локали: разделитель аргументов — «;», дробей в формулах не пишем
        rows = [[c.replace(",", ";") if isinstance(c, str) and c.startswith("=") else c for c in r] for r in rows]
        self.api.values().update(spreadsheetId=self.id, range=f"'{title}'!A1",
                                 valueInputOption="USER_ENTERED", body={"values": rows}).execute()

    def batch(self, reqs: list[dict]):
        for i in range(0, len(reqs), 400):
            self.api.batchUpdate(spreadsheetId=self.id, body={"requests": reqs[i:i + 400]}).execute()


# --- чтение книги ---------------------------------------------------------------

def unit_columns(book: Book, unit: str) -> tuple[int, int, dict]:
    """(колонка ключа, колонка себеса) 1-based по заголовкам + словарь себеса."""
    rows = book.values(f"'{unit}'!A1:BZ1500")
    hdr = [str(h).strip().lower() for h in rows[0]]
    kc = hdr.index("код 1с") + 1
    cc = hdr.index("себес") + 1
    cogs = {}
    for r in rows[1:]:
        if len(r) >= cc and str(r[kc - 1]).strip() and isinstance(r[cc - 1], (int, float)):
            cogs[str(r[kc - 1]).strip()] = float(r[cc - 1])
    return kc, cc, cogs


def old_daily(book: Book) -> dict:
    """{(кабинет, дата): {'ЧП': .., 'показы': ..}} из листа ежедневного отчёта."""
    rows = book.values(f"'{OLD_DAILY}'!A1:BZ2000")
    if len(rows) < 3:
        return {}
    out = {}
    names = rows[0]
    heads = rows[1]
    starts = [(i, str(n).strip()) for i, n in enumerate(names) if str(n).strip()]
    for i, cab in starts:
        try:
            j_profit = next(j for j in range(i, i + 9) if str(heads[j]).startswith("Прибыль"))
            j_shows = next(j for j in range(i, i + 9) if "показ" in str(heads[j]).lower())
        except (StopIteration, IndexError):
            continue
        for r in rows[2:]:
            if len(r) <= j_shows or r[i] in ("", None):
                continue
            v = r[i]
            if isinstance(v, (int, float)):
                d = dt.date(1899, 12, 30) + dt.timedelta(days=int(v))
            else:
                try:
                    d = dt.datetime.strptime(str(v).strip(), "%d.%m.%Y").date()
                except ValueError:
                    continue
            num = lambda x: float(x) if isinstance(x, (int, float)) else 0.0
            out[(cab, d)] = {"ЧП": num(r[j_profit]) if r[j_profit] != "" else None, "показы": num(r[j_shows])}
    return out


# --- листы -------------------------------------------------------------------------

DETAIL_HEAD = ["Кабинет", "Артикул", "Заказано, шт", "Цена ср., ₽", "Сумма заказов, ₽", "Ставка буста ср.",
               "Выкуп", "Тариф комиссии", "Буст: доля ставки к списанию", "Доставка, % цены", "Перевод денег, % цены",
               "Ср. миля, ₽ на доставл.", "Эквайринг, ₽ на шт", "Невыкуп/возврат, ₽ на шт", "Себес, ₽",
               "Выручка (прогноз), ₽", "Комиссия, ₽", "Буст продаж, ₽", "Доставка, ₽", "Ср. миля, ₽", "Перевод, ₽",
               "Эквайринг, ₽", "Невыкупы/возвраты, ₽", "Себес, ₽", "ЧП до рекламы показов, ₽", "ЧП на заказ, ₽",
               "Маржа к сумме заказов", "Коэффициенты по", "Когорта, шт", "Себес найден в юнитке"]


def detail_rows(day: dt.date, fc: dict, units: dict) -> list[list]:
    out = [[f"ЧП по заказам за {ru(day)} — прогноз по истории своих заказов (модель {VERSION})"],
           ["Синие колонки G–O — коэффициенты модели, их можно поменять руками: колонки P–AA пересчитаются. "
            "Себес (O) тянется формулой из юнитки кабинета."],
           [], DETAIL_HEAD]
    r = len(out) + 1
    for cab, rows in fc.items():
        kc, cc = units[cab]["kc"], units[cab]["cc"]
        unit = units[cab]["unit"]
        vl = f"IFERROR(VLOOKUP($B{{r}},'{unit}'!${col(kc)}:${col(cc)},{cc - kc + 1},FALSE),0)"
        for x in sorted(rows, key=lambda x: -x["gmv"]):
            c = x["coef"]
            out.append([
                cab, x["sku"], x["n"], round(x["price"], 2), f"=C{r}*D{r}", round(x["bid"], 4),
                round(c["выкуп"], 4), round(c["тариф"], 4), round(c["буст_k"], 4), round(c["доставка"], 4),
                round(c["перевод"], 4), round(c["миля"], 2), round(c["эквайринг"], 2), round(c["возврат"], 2),
                "=" + vl.format(r=r),
                f"=E{r}*G{r}", f"=P{r}*H{r}", f"=E{r}*F{r}*I{r}", f"=E{r}*J{r}", f"=C{r}*G{r}*L{r}",
                f"=E{r}*K{r}", f"=C{r}*M{r}", f"=C{r}*N{r}", f"=C{r}*G{r}*O{r}",
                f"=P{r}-SUM(Q{r}:X{r})", f"=IFERROR(Y{r}/C{r},0)", f"=IFERROR(Y{r}/E{r},0)",
                x["src"], int(c["когорта_шт"]), "да" if x["cogs"] is not None else "НЕТ — себес 0"])
            r += 1
    return out


DAYS_HEAD = ["Дата", "Кабинет", "Заказано, шт", "Сумма заказов, ₽", "Выручка (прогноз), ₽", "Комиссия, ₽",
             "Буст продаж, ₽", "Доставка, ₽", "Ср. миля, ₽", "Перевод денег, ₽", "Эквайринг, ₽",
             "Невыкупы/возвраты, ₽", "Себес, ₽", "ЧП до рекламы показов, ₽", "Реклама показов (факт дня), ₽",
             "ЧП до налога, ₽", f"Налог {int(TAX * 100)}% (как в юнитке)", "ЧП, ₽", "Маржа к выручке",
             "Старый отчёт: ЧП, ₽", "Разница с новым, ₽"]
# колонки листа артикулов, которые суммируются в строку дня: C, E, P..X
SUM_MAP = {"C": "C", "D": "E", "E": "P", "F": "Q", "G": "R", "H": "S", "I": "T", "J": "U", "K": "V", "L": "W", "M": "X"}


def days_rows(day: dt.date, series: dict, old: dict, cabs: list[str], detail_last: int) -> list[list]:
    out = [[f"ЧП ЯМ по дням — прогноз по заказам дня (модель {VERSION})"],
           ["Строки за последний день считаются формулами из листа «🧾 ЧП ЯМ по заказам», остальные — значениями "
            "прогона. «Реклама показов» и «Старый отчёт» — из листа «📊 Ежедневный» для сравнения."],
           [], DAYS_HEAD]
    r = len(out) + 1
    for d in sorted(series, reverse=True):
        first = r
        for cab in cabs:
            t = series[d].get(cab)
            if t is None:
                continue
            o = old.get((cab, d), {})
            row = [ru(d), cab]
            if d == day:
                for c in "CDEFGHIJKLM":
                    src = SUM_MAP[c]
                    row.append(f"=SUMIFS('{SH_DETAIL}'!${src}$5:${src}${detail_last},'{SH_DETAIL}'!$A$5:$A${detail_last},$B{r})")
            else:
                row += [t["n"], round(t["gmv"]), *[round(t[k]) for k in ["выручка", *COST_KEYS]]]
            row += [f"=E{r}-SUM(F{r}:M{r})", round(o.get("показы", 0)), f"=N{r}-O{r}", f"=MAX(P{r},0)*{int(TAX * 100)}/100",
                    f"=P{r}-Q{r}", f"=IFERROR(R{r}/E{r},0)",
                    "" if o.get("ЧП") is None else round(o["ЧП"]), f'=IF(T{r}="","",R{r}-T{r})']
            out.append(row)
            r += 1
        last = r - 1
        tot = [ru(d), "Все кабинеты"] + [f"=SUM({c}{first}:{c}{last})" for c in "CDEFGHIJKLM"]
        tot += [f"=SUM(N{first}:N{last})", f"=SUM(O{first}:O{last})", f"=SUM(P{first}:P{last})",
                f"=SUM(Q{first}:Q{last})", f"=SUM(R{first}:R{last})", f"=IFERROR(R{r}/E{r},0)",
                f"=SUM(T{first}:T{last})", f"=R{r}-T{r}"]
        out.append(tot)
        out.append([])
        r += 2
    return out


COEF_HEAD = ["Кабинет", "Артикул", "Когорта: заказано, шт", "Когорта: доставлено, шт", "Выкуп", "Тариф комиссии",
             "Буст: доля ставки к списанию", "Доставка, % цены", "Перевод, % цены", "Ср. миля, ₽ на доставл.",
             "Эквайринг, ₽ на шт", "Невыкуп/возврат, ₽ на шт"]


def coef_rows(day: dt.date, coefs: dict) -> list[list]:
    c0, c1 = day - dt.timedelta(COHORT_FROM), day - dt.timedelta(COHORT_TO)
    m0, m1 = day - dt.timedelta(MILE_FROM), day - dt.timedelta(MILE_TO)
    out = [[f"Коэффициенты модели на {ru(day)}"],
           [f"Выкуп и доли расходов — заказы {ru(c0)}–{ru(c1)} (дозревшие, только с известной судьбой); средняя миля — "
            f"заказы {ru(m0)}–{ru(m1)}; тариф — начисления комиссии за последние 14 дней. Артикул с когортой меньше "
            f"{MIN_UNITS} шт считается по коэффициентам кабинета (строка «* весь кабинет»)."], [], COEF_HEAD]
    for cab, coef in coefs.items():
        for sku in ["*"] + sorted(k for k in coef if k != "*"):
            c = coef[sku]
            out.append([cab, "* весь кабинет" if sku == "*" else sku, int(c["когорта_шт"]), int(c["когорта_доставлено"]),
                        round(c["выкуп"], 4), round(c["тариф"], 4), round(c["буст_k"], 4), round(c["доставка"], 4),
                        round(c["перевод"], 4), round(c["миля"], 2), round(c["эквайринг"], 2), round(c["возврат"], 2)])
    return out


def help_rows(day: dt.date, bt: dict) -> list[list]:
    L = [[f"Как считается ЧП по заказам Яндекс Маркета (модель {VERSION}, данные по {ru(day)})"], [],
         ["Главное правило"],
         ["Считаем, сколько в итоге принесут заказы ВЧЕРАШНЕГО дня. Маркет списывает комиссию и буст при доставке, "
          "то есть через дни и недели после заказа. Если брать списания вчерашнего дня, в отчёт попадают расходы по "
          "заказам недельной давности — так считал старый отчёт, и поэтому 16.09 он показал −1,86 млн."], [],
         ["Линия заказа"],
         ["1. Заказ создан: штуки, цена продавца, ставка буста — берутся из заказа (Маркет API, stats/orders). "
          "Цена продавца = заплатил покупатель + доплата Маркета + баллы."],
         ["2. Часть заказов отменится или не выкупится — доля выкупа по артикулу из истории: заказы 14–35 дней назад, "
          "у которых судьба уже известна."],
         ["3. На выкупленное ляжет комиссия по действующему тарифу (последние начисления; с 01.09 — 49%)."],
         ["4. Буст продаж: ставка из заказа × доля ставки, которую Маркет реально списывает (по истории)."],
         ["5. Доставка покупателю и перевод денег — доля от цены; средняя миля — ₽ на доставленную штуку по свежим "
          "заказам (ставка недавно сильно упала); эквайринг и обработка невыкупов/возвратов — ₽ на заказ."],
         ["6. Себестоимость — из юнитки кабинета, только на выкупленные штуки."],
         ["7. Реклама показов (буст показов, полки, баннеры) — фактический расход дня: он тратится на то, чтобы заказы "
          "этого дня появились."],
         ["8. Налог — как в юнитке, 25% (только с положительной прибыли)."], [],
         ["Откуда факт для коэффициентов"],
         ["Отчёт Маркета «Стоимость услуг» (united-marketplace-services): каждое списание привязано к номеру заказа. "
          "В самих заказах API удержания почти нулевые — Маркет показывает там только остаток сверх взаимозачёта "
          "(комиссия 498 ₽ видна как 4,99 ₽)."], [],
         ["Обратная проверка: прогноз против факта Маркета, заказы 01–03.09.2026"],
         ["Коэффициенты взяты только из заказов до 01.09. На эти дни пришлась смена тарифа (28/35% → 49%) и падение "
          "ставки средней мили — модель узнаёт о них с задержкой, поэтому комиссия и миля здесь отклоняются сильнее, "
          "чем будут в спокойные недели."], [],
         ["Кабинет", "Статья", "Прогноз, ₽", "Факт, ₽", "Отклонение"]]
    for cab, (p, a) in bt.items():
        for k in ["выручка", "комиссия", "буст", "доставка", "миля", "перевод", "себес", "ЧП"]:
            dev = (p.get(k, 0) - a.get(k, 0)) / abs(a[k]) if a.get(k) else ""
            L.append([cab, "ЧП до рекламы показов" if k == "ЧП" else k, round(p.get(k, 0)), round(a.get(k, 0)), dev])
        L.append([])
    return L


# --- оформление ----------------------------------------------------------------------

def fmt_requests(sid: int, n_rows: int, n_cols: int, money: list[str], pct: list[str], widths: dict,
                 input_cols: list[str] | None = None, header_row: int = 4) -> list[dict]:
    rq = [
        {"updateSheetProperties": {"properties": {"sheetId": sid, "gridProperties": {
            "frozenRowCount": header_row, "rowCount": max(n_rows + 20, 100), "columnCount": max(n_cols, 12)}},
            "fields": "gridProperties(frozenRowCount,rowCount,columnCount)"}},
        {"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1},
                        "cell": {"userEnteredFormat": {"textFormat": {"bold": True, "fontSize": 13}}},
                        "fields": "userEnteredFormat.textFormat"}},
        {"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 2},
                        "cell": {"userEnteredFormat": {"textFormat": {"italic": True, "foregroundColor": {"red": .35, "green": .35, "blue": .35}}}},
                        "fields": "userEnteredFormat.textFormat"}},
        {"repeatCell": {"range": {"sheetId": sid, "startRowIndex": header_row - 1, "endRowIndex": header_row},
                        "cell": {"userEnteredFormat": {"textFormat": {"bold": True}, "wrapStrategy": "WRAP",
                                                       "verticalAlignment": "MIDDLE",
                                                       "backgroundColor": {"red": .91, "green": .94, "blue": .99}}},
                        "fields": "userEnteredFormat(textFormat,wrapStrategy,verticalAlignment,backgroundColor)"}},
    ]
    def cols(letters, fmt):
        for c in letters:
            i = sum((ord(ch) - 64) * 26 ** k for k, ch in enumerate(reversed(c))) - 1
            rq.append({"repeatCell": {"range": {"sheetId": sid, "startRowIndex": header_row, "endRowIndex": n_rows,
                                                "startColumnIndex": i, "endColumnIndex": i + 1},
                                      "cell": {"userEnteredFormat": {"numberFormat": fmt}},
                                      "fields": "userEnteredFormat.numberFormat"}})
    cols(money, {"type": "NUMBER", "pattern": "#,##0"})
    cols(pct, {"type": "PERCENT", "pattern": "0.0%"})
    for c in input_cols or []:
        i = sum((ord(ch) - 64) * 26 ** k for k, ch in enumerate(reversed(c))) - 1
        rq.append({"repeatCell": {"range": {"sheetId": sid, "startRowIndex": header_row, "endRowIndex": n_rows,
                                            "startColumnIndex": i, "endColumnIndex": i + 1},
                                  "cell": {"userEnteredFormat": {"backgroundColor": {"red": .87, "green": .93, "blue": 1}}},
                                  "fields": "userEnteredFormat.backgroundColor"}})
    for c, w in widths.items():
        i = sum((ord(ch) - 64) * 26 ** k for k, ch in enumerate(reversed(c))) - 1
        rq.append({"updateDimensionProperties": {"range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": i,
                                                           "endIndex": i + 1}, "properties": {"pixelSize": w},
                                                 "fields": "pixelSize"}})
    return rq


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", required=True)
    ap.add_argument("--day", required=True, help="день заказов для детального листа (обычно вчера)")
    ap.add_argument("--days", type=int, default=14, help="сколько дней на листе «по дням»")
    ap.add_argument("--backtest", default="2026-09-01:2026-09-03")
    a = ap.parse_args()
    R = json.load(open(a.registry, encoding="utf-8"))
    day = dt.date.fromisoformat(a.day)
    book = Book(R["service_account_key"], R["demo_book"])

    units, cabs = {}, {}
    for name, c in R["cabinets"].items():
        kc, cc, cogs = unit_columns(book, c["unit"])
        units[name] = dict(unit=c["unit"], kc=kc, cc=cc)
        cabs[name] = Cabinet(os.path.join(R["data_dir"], "raw", name), os.path.join(R["data_dir"], "svc", c["svc"]), cogs)
        print(f"{name}: позиций {len(cabs[name].items)}, себес по {len(cogs)} артикулам", flush=True)
    old = old_daily(book)

    fc, coefs, series = {}, {}, {}
    for k in range(a.days):
        d = day - dt.timedelta(k)
        series[d] = {}
        for name, cab in cabs.items():
            rows, coef = cab.forecast(d)
            if d == day:
                fc[name], coefs[name] = rows, coef
            t = {"n": sum(r["n"] for r in rows), "gmv": sum(r["gmv"] for r in rows)}
            for key in ["выручка", *COST_KEYS]:
                t[key] = sum(r[key] for r in rows)
            series[d][name] = t
    b0, b1 = (dt.date.fromisoformat(x) for x in a.backtest.split(":"))
    bt = {name: cab.backtest(b0, b1) for name, cab in cabs.items()}

    det = detail_rows(day, fc, units)
    dys = days_rows(day, series, old, list(cabs), len(det))
    cfs = coef_rows(day, coefs)
    hlp = help_rows(day, bt)

    ids = book.recreate([SH_DAYS, SH_DETAIL, SH_COEF, SH_HELP])
    book.put(SH_DETAIL, det)
    book.put(SH_DAYS, dys)
    book.put(SH_COEF, cfs)
    book.put(SH_HELP, hlp)

    rq = []
    rq += fmt_requests(ids[SH_DETAIL], len(det), 30, money=list("DE") + [col(i) for i in range(15, 27)] + ["O"],
                       pct=["F", "G", "H", "I", "J", "K", "AA"], input_cols=list("GHIJKLMN"),
                       widths={"A": 130, "B": 300, **{col(i): 105 for i in range(3, 31)}})
    rq += fmt_requests(ids[SH_DAYS], len(dys), 21, money=[col(i) for i in range(4, 19)] + ["T", "U"], pct=["S"],
                       widths={"A": 90, "B": 150, **{col(i): 110 for i in range(3, 22)}})
    rq += fmt_requests(ids[SH_COEF], len(cfs), 12, money=[], pct=["E", "F", "G", "H", "I"],
                       widths={"A": 130, "B": 300, **{col(i): 115 for i in range(3, 13)}})
    rq += fmt_requests(ids[SH_HELP], len(hlp), 5, money=["C", "D"], pct=["E"], header_row=1,
                       widths={"A": 900, "B": 200, "C": 120, "D": 120, "E": 100})
    # «Все кабинеты» — жирным
    for i, r in enumerate(dys):
        if len(r) > 1 and r[1] == "Все кабинеты":
            rq.append({"repeatCell": {"range": {"sheetId": ids[SH_DAYS], "startRowIndex": i, "endRowIndex": i + 1},
                                      "cell": {"userEnteredFormat": {"textFormat": {"bold": True},
                                                                     "backgroundColor": {"red": .96, "green": .96, "blue": .96}}},
                                      "fields": "userEnteredFormat(textFormat,backgroundColor)"}})
    # заголовки разделов справки — жирным
    for i, r in enumerate(hlp):
        if len(r) == 1 and r[0] in ("Главное правило", "Линия заказа", "Откуда факт для коэффициентов") or \
                (r and str(r[0]).startswith("Обратная проверка")) or (r and r[0] == "Кабинет"):
            rq.append({"repeatCell": {"range": {"sheetId": ids[SH_HELP], "startRowIndex": i, "endRowIndex": i + 1},
                                      "cell": {"userEnteredFormat": {"textFormat": {"bold": True}}},
                                      "fields": "userEnteredFormat.textFormat"}})
    rq.append({"repeatCell": {"range": {"sheetId": ids[SH_HELP], "startColumnIndex": 0, "endColumnIndex": 1},
                              "cell": {"userEnteredFormat": {"wrapStrategy": "WRAP"}},
                              "fields": "userEnteredFormat.wrapStrategy"}})
    book.batch(rq)
    print("готово:", {k: v for k, v in ids.items() if k in (SH_DAYS, SH_DETAIL, SH_COEF, SH_HELP)})


if __name__ == "__main__":
    main()
