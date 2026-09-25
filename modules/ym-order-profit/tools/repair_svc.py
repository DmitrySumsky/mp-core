# -*- coding: utf-8 -*-
"""
ЧП ПО ЗАКАЗАМ ЯНДЕКС МАРКЕТА — ПЕРЕСБОРКА НАЧИСЛЕНИЙ В КЭШЕ НА ДИСКЕ v1.0.0 — 25.09.2026

v1.0.0 — 25.09.2026
  У ДНЕЙ, СОБРАННЫХ КНИГОЙ, НЕ ХВАТАЛО МИЛИ, ПЕРЕВОДА И ЧАСТИ КОМИССИИ — Маркет докладывает начисления за день
  ещё 1–2 дня, а книга до v2.3.0 читала каждый день один раз утром. Центральный код v2.3.0 перечитывает последние
  дни сам, но дни, прочитанные раньше, вычесть ему нечем. Этот инструмент пересобирает начисления кэша целиком.
  • кэш кабинета скачивается с Диска (сервисный аккаунт, папка — реестр cache_folder); заказы не трогаются;
  • отчёт «Стоимость услуг» за 42 дня по последний скачанный день (lastDay) → svc / tariffs / dayCost / svcDays
    заново, по тем же правилам, что yopAddServices_ в «03_сбор.js»; последние 4 дня — с записью svcRecent,
    чтобы следующий прогон книги мог их перечитать;
  • печатает сверку «было → стало» по статьям и заливает кэш обратно (--dry-run — только сверка).
  Ключи — с листа «API-ключи» демо-книги (реестр demo_book), никуда не печатаются.
  Не запускать во время прогона книги (около 07:10 по Москве): книга перезапишет кэш своей копией.

    python repair_svc.py --registry ../registry.local.json [--only <кабинет>] [--dry-run]
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import sys
import time
import zipfile

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

sys.path.insert(0, __import__("os").path.dirname(__file__))
import pull  # noqa: E402

KEEP_DAYS = 42
RECHECK = 4
ORDER_RULES = {
    "placement.json": ("комиссия", "amountWithoutBonuses"),
    "boost.json": ("буст", None),
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
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def add_services(cache, files, track, lo, hi):
    """Порт yopAddServices_ (v2.3.0): track — дни, чей вклад пишется в svcRecent."""
    for name, rows in files.items():
        for r in rows:
            day = str(r.get("serviceDate") or r.get("serviceDateTime") or "")[:10]
            dd = day if lo <= day <= hi else hi
            if name in ORDER_RULES or (r.get("orderId") and name not in DAY_RULES):
                kind, field = ORDER_RULES.get(name, ("прочее", "servicePrice"))
                val = (num(r.get("prepaid")) + num(r.get("postpaid")) + num(r.get("bonusPaid"))) if kind == "буст" \
                    else num(r.get(field)) + (num(r.get("netting")) if field == "servicePrice" else 0)
                if not r.get("orderId") or not val:
                    continue
                key = f"{r['orderId']}|{'' if name in NO_SKU else (r.get('shopSku') or '')}"
                slot = cache["svc"].setdefault(key, {})
                rec = cache["svcRecent"].setdefault(dd, {}) if dd in track else None

                def put(k, v):
                    slot[k] = round(slot.get(k, 0) + v, 2)
                    if rec is not None:
                        x = rec.setdefault(key, {})
                        x[k] = round(x.get(k, 0) + v, 2)

                put(kind, val)
                if name == "placement.json" and num(r.get("qualityIndexAmount")):
                    put("прочее", num(r.get("qualityIndexAmount")))
                if name == "placement.json" and r.get("tariff") is not None and r.get("orderCreationDateTime"):
                    cache["tariffs"][f"{str(r['orderCreationDateTime'])[:10]}|{r.get('shopSku') or ''}"] = float(r["tariff"])
            else:
                if name.startswith("paid_storage"):
                    kind, field = "хранение", "paidStorage"
                else:
                    kind, field = DAY_RULES.get(name, ("прочее", "servicePrice"))
                val = num(r.get(field)) or num(r.get("servicePrice"))
                if not dd or not val:
                    continue
                dc = cache["dayCost"].setdefault(dd, {})
                dc[kind] = round(dc.get(kind, 0) + val, 2)


def services_report(key, business, d1, d2):
    g = pull.api(key, "POST", "/v2/reports/united-marketplace-services/generate?format=JSON",
                 {"businessId": int(business), "dateFrom": d1, "dateTo": d2})
    rid = g["result"]["reportId"]
    for _ in range(120):
        time.sleep(5)
        info = pull.api(key, "GET", f"/v2/reports/info/{rid}")["result"]
        if info["status"] == "DONE":
            if not info.get("file"):
                return {}
            z = zipfile.ZipFile(io.BytesIO(pull.api(key, "GET", info["file"], raw=True)))
            out = {}
            for n in z.namelist():
                p = json.loads(z.read(n).decode("utf-8"))
                out[n] = p if isinstance(p, list) else p.get("rows", [])
            return out
        if info["status"] == "FAILED":
            raise SystemExit(f"отчёт за {d1}–{d2} не собрался у Маркета")
    raise SystemExit(f"отчёт за {d1}–{d2} не дождались")


def totals(cache, lo, hi):
    """Сумма удержаний по статьям у заказов кэша + расходы дня за [lo; hi]."""
    t = {}
    for v in cache["svc"].values():
        for k, x in v.items():
            t[k] = t.get(k, 0) + x
    for d, v in cache["dayCost"].items():
        if lo <= d <= hi:
            for k, x in v.items():
                t["дня: " + k] = t.get("дня: " + k, 0) + x
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    reg = json.load(open(a.registry, encoding="utf-8"))
    cr = service_account.Credentials.from_service_account_file(reg["service_account_key"], scopes=[
        "https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets.readonly"])
    rows = build("sheets", "v4", credentials=cr, cache_discovery=False).spreadsheets().values().get(
        spreadsheetId=reg["demo_book"], range="'API-ключи'!A2:E50").execute().get("values", [])
    keys = {r[0].strip(): r for r in rows if len(r) > 2 and r[0] and r[1]}
    drive = build("drive", "v3", credentials=cr, cache_discovery=False)
    files = drive.files().list(q=f"'{reg['cache_folder']}' in parents and trashed=false and name contains 'yop_cache_'",
                               fields="files(id,name)").execute()["files"]
    by_name = {f["name"]: f["id"] for f in files}
    for cab, r in keys.items():
        if a.only and cab != a.only:
            continue
        fname = "yop_cache_" + "".join(cab.split()) + ".json"
        if fname not in by_name:
            print(f"{cab}: кэша на Диске нет — пропуск")
            continue
        buf = io.BytesIO()
        dl = MediaIoBaseDownload(buf, drive.files().get_media(fileId=by_name[fname]))
        done = False
        while not done:
            _, done = dl.next_chunk()
        cache = json.loads(buf.getvalue().decode("utf-8"))
        upto = cache.get("lastDay")
        if not upto:
            print(f"{cab}: в кэше нет lastDay — пропуск")
            continue
        u = dt.date.fromisoformat(upto)
        floor, lo = str(u - dt.timedelta(KEEP_DAYS - 1)), str(u - dt.timedelta(KEEP_DAYS))
        before = totals(cache, floor, upto)
        svc = services_report(r[1].strip(), r[2].strip(), floor, upto)
        cache.update(svc={}, tariffs={}, dayCost={}, svcRecent={},
                     svcDays=[str(u - dt.timedelta(i)) for i in range(KEEP_DAYS - 1, -1, -1)])
        track = {str(u - dt.timedelta(i)) for i in range(RECHECK)}
        for d in track:
            cache["svcRecent"][d] = {}
        add_services(cache, svc, track, floor, upto)
        cache["svc"] = {k: v for k, v in cache["svc"].items() if k.split("|")[0] in cache["orders"]}
        for d in list(cache["svcRecent"]):
            cache["svcRecent"][d] = {k: v for k, v in cache["svcRecent"][d].items() if k in cache["svc"]}
        cache["tariffs"] = {k: v for k, v in cache["tariffs"].items() if k[:10] >= lo}
        after = totals(cache, floor, upto)
        print(f"{cab}: заказов {len(cache['orders'])}, по {upto}; начисления {floor}–{upto}")
        for k in sorted(set(before) | set(after)):
            b, x = before.get(k, 0), after.get(k, 0)
            if abs(x - b) >= 1:
                print(f"   {k:18s} {b:>13,.0f} → {x:>13,.0f}  ({x - b:+,.0f})".replace(",", " "))
        if not a.dry_run:
            body = MediaIoBaseUpload(io.BytesIO(json.dumps(cache, ensure_ascii=False, separators=(",", ":")).encode("utf-8")),
                                     mimetype="application/json", resumable=False)
            drive.files().update(fileId=by_name[fname], media_body=body).execute()
            print("   залит на Диск")
        time.sleep(3)


if __name__ == "__main__":
    main()
