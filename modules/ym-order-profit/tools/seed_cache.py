# -*- coding: utf-8 -*-
"""
ЧП ПО ЗАКАЗАМ ЯНДЕКС МАРКЕТА — ЗАСЕВ КЭША ДЛЯ КНИГИ v1.0.0 — 22.09.2026

v1.0.0 — 22.09.2026
  СКРИПТ КНИГИ НЕ УСПЕЕТ СКАЧАТЬ 35 ДНЕЙ ИСТОРИИ ЗА ШЕСТЬ МИНУТ — перенос модели в Apps Script.
  • из локального сырья (заказы по дням + отчёты «Стоимость услуг») собирается кэш кабинета в
    формате, который читает «3_модель.js»: orders / svc / tariffs / dayCost / svcDays;
  • раскладка услуг по статьям — та же, что в «2_сбор.js» (SVC_RULES ниже и YOP_SVC_RULES там
    должны совпадать); дальше книга докачивает по одному дню сама.

    python seed_cache.py --registry ../registry.local.json --out <папка>
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import zipfile

DELIVERED = {"DELIVERED", "PARTIALLY_DELIVERED"}

# файл отчёта → (статья, поле суммы); заказные — с orderId, остальные — расходы дня
ORDER_RULES = {
    "placement.json": ("комиссия", "amountWithoutBonuses"),
    "boost.json": ("буст", None),                       # prepaid + postpaid + bonusPaid
    "delivery.json": ("доставка", "servicePrice"),
    "crossregional_delivery.json": ("миля", "servicePrice"),
    "payment_transfer.json": ("перевод", "servicePrice"),
    "payment_accepting.json": ("эквайринг", "servicePrice"),
    "order_processing.json": ("возврат", "servicePrice"),
    "order_processing_on_warehouse.json": ("возврат", "servicePrice"),
    "storage_of_returns.json": ("возврат", "servicePrice"),
}
DAY_RULES = {
    "cpm-boost.json": ("показы", "payment"),
    "shelf.json": ("показы", "payment"),
    "product-banners.json": ("показы", "payment"),
    "business_subscription.json": ("подписка", "servicePrice"),
}
NO_SKU = {"order_processing.json", "order_processing_on_warehouse.json", "storage_of_returns.json"}


def num(v):
    return float(v) if isinstance(v, (int, float)) else 0.0


def order_item(o, it):
    st = o.get("status") or ""
    n = int(it.get("count") or 0)
    deliv = n if st in DELIVERED else 0
    for det in it.get("details") or []:
        if st in DELIVERED and det.get("itemStatus") in ("REJECTED", "RETURNED"):
            deliv -= int(det.get("itemCount") or 0)
    price = sum(num(p.get("costPerItem")) for p in it.get("prices") or [])
    return [it.get("shopSku") or "", n, round(price, 2), num(it.get("bidFee")) / 10000, max(deliv, 0)]


def add_services(cache, zpath):
    z = zipfile.ZipFile(zpath)
    for name in z.namelist():
        p = json.loads(z.read(name).decode("utf-8"))
        rows = p.get("rows", []) if isinstance(p, dict) else p
        for r in rows:
            day = str(r.get("serviceDate") or r.get("serviceDateTime") or "")[:10]
            if name in ORDER_RULES or (r.get("orderId") and name not in DAY_RULES):
                kind, field = ORDER_RULES.get(name, ("прочее", "servicePrice"))
                val = (num(r.get("prepaid")) + num(r.get("postpaid")) + num(r.get("bonusPaid"))) if kind == "буст" \
                    else num(r.get(field))
                if not r.get("orderId") or not val:
                    continue
                sku = "" if name in NO_SKU else (r.get("shopSku") or "")
                key = f"{r['orderId']}|{sku}"
                slot = cache["svc"].setdefault(key, {})
                slot[kind] = round(slot.get(kind, 0) + val, 2)
                if name == "placement.json" and r.get("tariff") is not None and r.get("orderCreationDateTime"):
                    cache["tariffs"][f"{str(r['orderCreationDateTime'])[:10]}|{r.get('shopSku') or ''}"] = float(r["tariff"])
            else:
                if name.startswith("paid_storage"):
                    kind, val = "хранение", num(r.get("paidStorage"))
                elif name in DAY_RULES:
                    kind, field = DAY_RULES[name]
                    val = num(r.get(field)) or num(r.get("servicePrice"))
                else:
                    kind, val = "прочее", num(r.get("servicePrice"))
                if not day or not val:
                    continue
                slot = cache["dayCost"].setdefault(day, {})
                slot[kind] = round(slot.get(kind, 0) + val, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--svc-from", default="2026-08-15")
    ap.add_argument("--svc-to", default="2026-09-20")
    a = ap.parse_args()
    reg = json.load(open(a.registry, encoding="utf-8"))
    os.makedirs(a.out, exist_ok=True)
    d0, d1 = dt.date.fromisoformat(a.svc_from), dt.date.fromisoformat(a.svc_to)
    for name, c in reg["cabinets"].items():
        cache = {"orders": {}, "svc": {}, "tariffs": {}, "dayCost": {},
                 "svcDays": [str(d0 + dt.timedelta(i)) for i in range((d1 - d0).days + 1)]}
        for fn in sorted(glob.glob(os.path.join(reg["data_dir"], "raw", name, "*.json"))):
            for o in json.load(open(fn, encoding="utf-8")):
                if o.get("fake"):
                    continue
                cache["orders"][str(o["id"])] = {"d": o["creationDate"], "st": o.get("status") or "",
                                                 "it": [order_item(o, it) for it in o.get("items") or []]}
        add_services(cache, os.path.join(reg["data_dir"], "svc", c["svc"]))
        cache["svc"] = {k: v for k, v in cache["svc"].items() if k.split("|")[0] in cache["orders"]}
        cache["lastDay"] = str(d1)
        path = os.path.join(a.out, f"{c['svc'].replace('svc_', 'yop_cache_').replace('.zip', '.json')}")
        json.dump(cache, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print(f"{name}: заказов {len(cache['orders'])}, удержаний {len(cache['svc'])}, "
              f"{os.path.getsize(path) // 1024} КБ → {os.path.basename(path)}")


if __name__ == "__main__":
    main()
