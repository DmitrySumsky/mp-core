# -*- coding: utf-8 -*-
"""
ЧП ПО ЗАКАЗАМ ЯНДЕКС МАРКЕТА — ДВИЖОК МОДЕЛИ v0.2.0 — 23.09.2026

v0.2.0 — 23.09.2026
  ТО ЖЕ, ЧТО ЦЕНТРАЛЬНЫЙ КОД v2.2.0 — вопросы менеджера ЯМ по юнитке.
  • надбавка за просрочку отгрузки FBS (qualityIndexAmount) — статья «прочее», ₽ на заказанную штуку;
  • доставка и перевод — доля от выручки ВЫКУПЛЕННЫХ штук, прогноз — от выручки;
  • тариф комиссии — последнего дня с начислениями, а не самый частый за 14 дней.

v0.1.0 — 21.09.2026
  ЕЖЕДНЕВНЫЙ ОТЧЁТ КНИГИ СМЕШИВАЛ ЗАКАЗЫ ВЧЕРА С РАСХОДАМИ ПО ДОСТАВКАМ ПРОШЛЫХ ДНЕЙ —
  разбор задачи менеджеров ЯМ, 21.09.2026: буст умножался как «списано ÷ доставлено» × заказано,
  комиссия бралась от цены юнитки, всплеск 16.09 (расходы 2,52 млн при выручке 0,88 млн) —
  снимок юнитки в момент прогона. Решение владельца: как РНП Ozon — считать прибыль ВЧЕРАШНИХ
  заказов прогнозом по истории своих же заказов.
  • заказ → позиция: цена продавца = Σ всех prices[] (BUYER + MARKETPLACE + CASHBACK),
    ставка буста — items[].bidFee на момент заказа;
  • факт удержаний — отчёт united-marketplace-services (commissions[] в stats/orders — лишь
    остаток сверх взаимозачёта), привязка по (orderId, shopSku), безымянные — долей по штукам;
  • выкуп и доли расходов — по дозревшим когортам (заказы 14–35 дней назад, только с известной
    судьбой), средняя миля — по свежим (8–21 день), тариф комиссии — по последним начислениям;
  • артикул с когортой меньше 30 шт получает коэффициенты кабинета.
"""
from __future__ import annotations

import datetime as dt
import glob
import json
import os
import zipfile
from collections import Counter, defaultdict

DELIVERED = {"DELIVERED", "PARTIALLY_DELIVERED"}
IN_TRANSIT = {"PROCESSING", "DELIVERY", "PICKUP", "RESERVED", "UNPAID", "PENDING"}
COHORT_FROM, COHORT_TO = 35, 14      # дней назад: окно дозревших заказов
MILE_FROM, MILE_TO = 21, 8           # дней назад: окно свежей ставки средней мили
TARIFF_DAYS = 14                     # дней назад: окно действующего тарифа комиссии
MIN_UNITS = 30                       # меньше — коэффициенты кабинета
DEFAULT_TARIFF = 49.0

COST_KEYS = ["комиссия", "буст", "доставка", "миля", "перевод", "эквайринг", "возврат", "прочее", "себес"]


def _day(s: str) -> dt.date:
    return dt.date.fromisoformat(str(s)[:10])


class Cabinet:
    """Заказы и удержания одного кабинета: позиции, факт услуг, коэффициенты, прогноз."""

    def __init__(self, raw_dir: str, svc_zip: str, cogs: dict[str, float]):
        self.cogs = cogs
        self.items: list[dict] = []
        self.order_units: Counter = Counter()
        for fn in sorted(glob.glob(os.path.join(raw_dir, "*.json"))):
            for o in json.load(open(fn, encoding="utf-8")):
                if o.get("fake"):
                    continue
                st = o.get("status") or ""
                for it in o.get("items") or []:
                    n = int(it.get("count") or 0)
                    price = sum(float(p.get("costPerItem") or 0) for p in it.get("prices") or [])
                    deliv = n if st in DELIVERED else 0
                    for det in it.get("details") or []:
                        if st in DELIVERED and det.get("itemStatus") in ("REJECTED", "RETURNED"):
                            deliv -= int(det.get("itemCount") or 0)
                    self.items.append(dict(
                        oid=int(o["id"]), day=_day(o["creationDate"]), sku=it.get("shopSku") or "",
                        n=n, price=price, bid=float(it.get("bidFee") or 0) / 10000,
                        deliv=max(deliv, 0), transit=st in IN_TRANSIT))
                    self.order_units[int(o["id"])] += n
        self.svc: dict = defaultdict(lambda: defaultdict(float))
        self.tariff_rows: list[tuple] = []      # (дата заказа, sku, тариф)
        self._load_services(svc_zip)

    # --- факт услуг ------------------------------------------------------------
    def _load_services(self, path: str) -> None:
        z = zipfile.ZipFile(path)
        names = set(z.namelist())

        def rows(name):
            if name not in names:
                return []
            p = json.loads(z.read(name).decode("utf-8"))
            return p.get("rows", []) if isinstance(p, dict) else p

        def add(oid, sku, key, val):
            if oid is None or val is None:
                return
            self.svc[(int(oid), sku)][key] += float(val)

        for r in rows("placement.json"):
            add(r.get("orderId"), r.get("shopSku"), "комиссия", r.get("amountWithoutBonuses"))
            add(r.get("orderId"), r.get("shopSku"), "прочее", r.get("qualityIndexAmount") or None)
            if r.get("tariff") is not None and r.get("orderCreationDateTime"):
                self.tariff_rows.append((_day(r["orderCreationDateTime"]), r.get("shopSku"), float(r["tariff"])))
        for r in rows("boost.json"):
            add(r.get("orderId"), r.get("shopSku"), "буст",
                (r.get("prepaid") or 0) + (r.get("postpaid") or 0) + (r.get("bonusPaid") or 0))
        for name, key in (("delivery.json", "доставка"), ("crossregional_delivery.json", "миля"),
                          ("payment_transfer.json", "перевод"), ("payment_accepting.json", "эквайринг")):
            for r in rows(name):
                add(r.get("orderId"), r.get("shopSku"), key, (r.get("servicePrice") or 0) + (r.get("netting") or 0))
        for name in ("order_processing.json", "order_processing_on_warehouse.json", "storage_of_returns.json"):
            for r in rows(name):
                add(r.get("orderId"), None, "возврат", (r.get("servicePrice") or 0) + (r.get("netting") or 0))

    def fact(self, it: dict) -> dict:
        out = dict(self.svc.get((it["oid"], it["sku"]), {}))
        share = it["n"] / max(self.order_units[it["oid"]], 1)
        for k, v in self.svc.get((it["oid"], None), {}).items():
            out[k] = out.get(k, 0) + v * share
        return out

    # --- коэффициенты -----------------------------------------------------------
    def _agg(self, d0: dt.date, d1: dt.date) -> dict:
        agg: dict = defaultdict(lambda: defaultdict(float))
        for it in self.items:
            if not d0 <= it["day"] <= d1:
                continue
            f = self.fact(it)
            for key in (it["sku"], "*"):
                a = agg[key]
                a["n"] += it["n"]
                a["deliv"] += it["deliv"]
                a["transit"] += it["n"] if it["transit"] else 0
                a["gmv"] += it["price"] * it["n"]
                a["gmvdel"] += it["price"] * it["deliv"]
                a["bidgmv"] += it["price"] * it["n"] * it["bid"]
                for k, v in f.items():
                    a[k] += v
        return agg

    def tariffs(self, day: dt.date) -> tuple[dict, float]:
        """Тариф последнего дня с начислениями (в один день разные — самый частый); как yopTariffs_ книги."""
        lo = day - dt.timedelta(TARIFF_DAYS)
        seen: dict = {}
        for d, sku, t in self.tariff_rows:
            if lo <= d <= day:
                seen[(d, sku)] = t                      # как в кэше книги: одна запись на «дата|артикул»
        last_sku: dict = {}
        last_cab: list = [None, Counter()]
        for (d, sku), t in seen.items():
            m = last_sku.setdefault(sku, [None, Counter()])
            for box in (m, last_cab):
                if box[0] is None or d > box[0]:
                    box[0], box[1] = d, Counter()
                if d == box[0]:
                    box[1][t] += 1
        return ({s: m[1].most_common(1)[0][0] for s, m in last_sku.items()},
                last_cab[1].most_common(1)[0][0] if last_cab[1] else DEFAULT_TARIFF)

    def coefficients(self, day: dt.date) -> dict:
        """{sku|'*': коэффициенты} на прогноз заказов дня day."""
        agg = self._agg(day - dt.timedelta(COHORT_FROM), day - dt.timedelta(COHORT_TO))
        mile = self._agg(day - dt.timedelta(MILE_FROM), day - dt.timedelta(MILE_TO))
        t_sku, t_cab = self.tariffs(day)
        out = {}
        for key, a in agg.items():
            m = mile.get(key)
            if not m or m["deliv"] < MIN_UNITS:
                m = mile.get("*", {})
            known = max(a["n"] - a["transit"], 1)
            g = a["gmvdel"] or 0
            out[key] = dict(
                когорта_шт=a["n"], когорта_доставлено=a["deliv"],
                выкуп=a["deliv"] / known,
                тариф=(t_sku.get(key, t_cab) if key != "*" else t_cab) / 100,
                буст_k=a["буст"] / a["bidgmv"] if a["bidgmv"] else 0.0,
                доставка=a["доставка"] / g if g else 0.0, перевод=a["перевод"] / g if g else 0.0,
                миля=(m.get("миля", 0) / m["deliv"]) if m and m.get("deliv") else 0.0,
                эквайринг=a["эквайринг"] / a["n"] if a["n"] else 0.0,
                возврат=a["возврат"] / a["n"] if a["n"] else 0.0,
                прочее=a["прочее"] / a["n"] if a["n"] else 0.0)
        out.setdefault("*", dict(когорта_шт=0, когорта_доставлено=0, выкуп=0.85, тариф=t_cab / 100, буст_k=1.0,
                                 доставка=0.05, перевод=0.016, миля=0.0, эквайринг=0.12, возврат=0.0, прочее=0.0))
        return out

    def pick(self, coef: dict, sku: str) -> tuple[dict, str]:
        c = coef.get(sku)
        if c and c["когорта_шт"] >= MIN_UNITS:
            return c, "артикул"
        base = dict(coef["*"])
        if c:                      # тариф — свой у артикула, даже если когорта мала
            base["тариф"] = c["тариф"]
        return base, "кабинет"

    # --- прогноз ----------------------------------------------------------------
    def day_skus(self, day: dt.date) -> list[dict]:
        """Позиции заказов дня, свёрнутые по артикулу: штуки, сумма, средняя ставка буста."""
        acc: dict = defaultdict(lambda: dict(n=0, gmv=0.0, bidgmv=0.0))
        for it in self.items:
            if it["day"] == day:
                a = acc[it["sku"]]
                a["n"] += it["n"]
                a["gmv"] += it["price"] * it["n"]
                a["bidgmv"] += it["price"] * it["n"] * it["bid"]
        return [dict(sku=s, n=a["n"], gmv=a["gmv"], price=a["gmv"] / a["n"] if a["n"] else 0,
                     bid=a["bidgmv"] / a["gmv"] if a["gmv"] else 0) for s, a in acc.items() if a["n"]]

    @staticmethod
    def predict(row: dict, c: dict, cogs: float) -> dict:
        n, gmv = row["n"], row["gmv"]
        rev = gmv * c["выкуп"]
        cost = dict(комиссия=rev * c["тариф"], буст=gmv * row["bid"] * c["буст_k"],
                    доставка=rev * c["доставка"], миля=n * c["выкуп"] * c["миля"],
                    перевод=rev * c["перевод"], эквайринг=n * c["эквайринг"], возврат=n * c["возврат"],
                    прочее=n * c["прочее"],
                    себес=n * c["выкуп"] * cogs)
        return dict(выручка=rev, **cost, ЧП=rev - sum(cost.values()))

    def forecast(self, day: dt.date) -> tuple[list[dict], dict]:
        coef = self.coefficients(day)
        rows = []
        for r in self.day_skus(day):
            c, src = self.pick(coef, r["sku"])
            cg = self.cogs.get(r["sku"])
            p = self.predict(r, c, cg or 0.0)
            rows.append(dict(r, coef=c, src=src, cogs=cg, **p))
        return rows, coef

    def actual(self, d0: dt.date, d1: dt.date) -> dict:
        """Факт по заказам окна (для обратной проверки): выручка доставленного и все удержания."""
        tot: dict = defaultdict(float)
        for it in self.items:
            if d0 <= it["day"] <= d1:
                f = self.fact(it)
                tot["выручка"] += it["price"] * it["deliv"]
                for k in COST_KEYS[:-1]:
                    tot[k] += f.get(k, 0)
                tot["себес"] += it["deliv"] * self.cogs.get(it["sku"], 0)
                tot["в_пути_шт"] += it["n"] if it["transit"] else 0
                tot["шт"] += it["n"]
        tot["ЧП"] = tot["выручка"] - sum(tot[k] for k in COST_KEYS)
        return dict(tot)

    def backtest(self, d0: dt.date, d1: dt.date) -> tuple[dict, dict]:
        """Прогноз окна по коэффициентам на его первый день против факта Маркета."""
        pred: dict = defaultdict(float)
        day = d0
        while day <= d1:
            rows, _ = self.forecast(day)
            for r in rows:
                for k in ["выручка", *COST_KEYS, "ЧП"]:
                    pred[k] += r[k]
            day += dt.timedelta(1)
        return dict(pred), self.actual(d0, d1)
