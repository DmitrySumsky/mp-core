# -*- coding: utf-8 -*-
"""Тесты движка на синтетике: цена = Σ prices[], ставка буста, факт услуг, выкуп по когорте."""
import datetime as dt
import json
import os
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
from yop_engine import Cabinet  # noqa: E402


def order(oid, day, status, sku, count, buyer, market, cashback=0, bid=2000):
    prices = [{"type": "BUYER", "costPerItem": buyer}, {"type": "MARKETPLACE", "costPerItem": market}]
    if cashback:
        prices.append({"type": "CASHBACK", "costPerItem": cashback})
    return {"id": oid, "creationDate": day, "status": status, "fake": False,
            "items": [{"shopSku": sku, "count": count, "prices": prices, "bidFee": bid}]}


def build(tmp):
    raw = os.path.join(tmp, "raw")
    os.makedirs(raw)
    old = [order(i, "2026-08-25", "DELIVERED" if i % 10 else "CANCELLED_IN_DELIVERY", "A", 1, 400, 500, 100)
           for i in range(1, 41)]
    new = [order(100, "2026-09-20", "PROCESSING", "A", 2, 400, 500, 100)]
    json.dump(old, open(os.path.join(raw, "2026-08-25.json"), "w"))
    json.dump(new, open(os.path.join(raw, "2026-09-20.json"), "w"))
    svc = os.path.join(tmp, "svc.zip")
    delivered = [o["id"] for o in old if o["status"] == "DELIVERED"]
    with zipfile.ZipFile(svc, "w") as z:
        z.writestr("placement.json", json.dumps({"rows": [
            {"orderId": i, "shopSku": "A", "amountWithoutBonuses": 490.0, "netting": 485.0, "totalAmount": 5.0,
             "tariff": 49, "orderCreationDateTime": "2026-09-15"} for i in delivered]}))
        z.writestr("boost.json", json.dumps({"rows": [
            {"orderId": i, "shopSku": "A", "prepaid": None, "postpaid": 200.0, "bonusPaid": None} for i in delivered]}))
    return raw, svc


def test_all():
    with tempfile.TemporaryDirectory() as tmp:
        raw, svc = build(tmp)
        cab = Cabinet(raw, svc, {"A": 100.0})
        it = next(i for i in cab.items if i["oid"] == 100)
        assert it["price"] == 1000.0, "цена продавца = BUYER + MARKETPLACE + CASHBACK"
        assert abs(it["bid"] - 0.20) < 1e-9, "bidFee 2000 = 20 %"
        assert cab.fact(next(i for i in cab.items if i["oid"] == 1))["комиссия"] == 490.0, \
            "комиссия — amountWithoutBonuses, а не остаток сверх взаимозачёта"
        rows, coef = cab.forecast(dt.date(2026, 9, 20))
        c = coef["A"]
        assert abs(c["выкуп"] - 36 / 40) < 1e-9
        assert abs(c["тариф"] - 0.49) < 1e-9
        # буст: списано 36×200 при ставке 20 % от 40×1000 → доля ставки 7200/8000
        assert abs(c["буст_k"] - 0.9) < 1e-9
        r = rows[0]
        assert abs(r["выручка"] - 2000 * 0.9) < 1e-6
        assert abs(r["комиссия"] - 1800 * 0.49) < 1e-6
        assert abs(r["буст"] - 2000 * 0.2 * 0.9) < 1e-6
        assert abs(r["себес"] - 2 * 0.9 * 100) < 1e-6
    print("Тесты: 10/10")


if __name__ == "__main__":
    test_all()
