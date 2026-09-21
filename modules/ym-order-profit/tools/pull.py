# -*- coding: utf-8 -*-
"""
ЧП ПО ЗАКАЗАМ ЯНДЕКС МАРКЕТА — СБОР ДАННЫХ v0.1.0 — 21.09.2026

v0.1.0 — 21.09.2026
  СЫРЬЁ ДЛЯ МОДЕЛИ: ЗАКАЗЫ ПО ДНЯМ И ФАКТ УДЕРЖАНИЙ — первый прогон на семи кабинетах.
  • заказы: POST /v2/campaigns/{id}/stats/orders по каждой кампании кабинета (FBS и FBY из листа
    ключей книги), один файл на день создания заказа: <data>/raw/<кабинет>/<дата>.json;
    прошлые дни не перекачиваются, последние --refresh дней — всегда (статусы ещё меняются);
  • удержания: отчёт united-marketplace-services за окно дат начисления → <data>/svc/<файл>.zip;
  • 420/429/5xx — повтор с нарастающей паузой; отчёты запускаются строго по одному (лимит Маркета
    общий у всех сервисов на ключе).
Ключи берутся из листа «API-ключи» книги (Кабинет | API-ключ | Business ID | Campaign FBS | Campaign FBY)
и никуда не печатаются.

    python pull.py --registry ../registry.local.json --from 2026-08-16 --to 2026-09-20
    python pull.py --registry ../registry.local.json --from 2026-08-16 --to 2026-09-20 --only "<кабинет>" --no-svc
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import time
import urllib.error
import urllib.request

from google.oauth2 import service_account
from googleapiclient.discovery import build

BASE = "https://api.partner.market.yandex.ru"


def api(key: str, method: str, path_or_url: str, body=None, raw=False):
    url = path_or_url if path_or_url.startswith("http") else BASE + path_or_url
    pause = 3
    for _ in range(8):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                         method=method, headers={"Api-Key": key, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
                return data if raw else json.loads(data or b"{}")
        except urllib.error.HTTPError as e:
            if e.code in (420, 429) or e.code >= 500:
                time.sleep(pause)
                pause = min(pause * 2, 60)
                continue
            raise SystemExit(f"Маркет {method} {url.replace(BASE, '')}: HTTP {e.code} {e.read()[:200]!r}")
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(pause)
            pause = min(pause * 2, 60)
    raise SystemExit(f"Маркет не ответил: {url.replace(BASE, '')}")


def keys_from_book(reg: dict) -> dict:
    cr = service_account.Credentials.from_service_account_file(
        reg["service_account_key"], scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
    rows = build("sheets", "v4", credentials=cr, cache_discovery=False).spreadsheets().values().get(
        spreadsheetId=reg["source_book"], range="'API-ключи'!A2:E50").execute().get("values", [])
    return {r[0]: r for r in rows if len(r) > 2 and r[0] and r[1]}


def pull_orders(key: str, campaigns: list[int], d0: dt.date, d1: dt.date, out_dir: str, refresh: int):
    os.makedirs(out_dir, exist_ok=True)
    fresh_from = d1 - dt.timedelta(refresh - 1)
    d = d0
    while d <= d1:
        fn = os.path.join(out_dir, f"{d}.json")
        if os.path.exists(fn) and d < fresh_from:
            d += dt.timedelta(1)
            continue
        orders = []
        for c in campaigns:
            token = None
            while True:
                q = f"/v2/campaigns/{c}/stats/orders?limit=200" + (f"&page_token={token}" if token else "")
                res = (api(key, "POST", q, {"dateFrom": str(d), "dateTo": str(d)}) or {}).get("result") or {}
                batch = res.get("orders") or []
                for o in batch:
                    o["_campaign"] = c
                orders += batch
                token = (res.get("paging") or {}).get("nextPageToken")
                if not token or not batch:
                    break
        json.dump(orders, open(fn, "w", encoding="utf-8"), ensure_ascii=False)
        print(f"  {d}: заказов {len(orders)}", flush=True)
        d += dt.timedelta(1)


def pull_services(key: str, business_id: int, d0: dt.date, d1: dt.date, out: str):
    body = {"businessId": business_id, "dateFrom": str(d0), "dateTo": str(d1)}
    rid = api(key, "POST", "/v2/reports/united-marketplace-services/generate?format=JSON", body)["result"]["reportId"]
    for _ in range(150):
        time.sleep(6)
        res = api(key, "GET", f"/v2/reports/info/{rid}")["result"]
        if res["status"] == "DONE":
            open(out, "wb").write(api(key, "GET", res["file"], raw=True))
            print(f"  отчёт услуг: {os.path.getsize(out) // 1024} КБ", flush=True)
            return
        if res["status"] == "FAILED":
            raise SystemExit("отчёт услуг: FAILED")
    raise SystemExit("отчёт услуг: не дождались")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", required=True)
    ap.add_argument("--from", dest="d0", required=True)
    ap.add_argument("--to", dest="d1", required=True)
    ap.add_argument("--only", action="append")
    ap.add_argument("--refresh", type=int, default=3, help="сколько последних дней перекачивать всегда")
    ap.add_argument("--no-svc", action="store_true")
    a = ap.parse_args()
    reg = json.load(open(a.registry, encoding="utf-8"))
    keys = keys_from_book(reg)
    d0, d1 = dt.date.fromisoformat(a.d0), dt.date.fromisoformat(a.d1)
    for name, c in reg["cabinets"].items():
        if a.only and name not in a.only:
            continue
        r = keys.get(name)
        if not r:
            print(f"{name}: нет строки в листе ключей — пропуск")
            continue
        key, bid = r[1].strip(), int(r[2])
        camps = [int(x) for x in r[3:5] if str(x).strip()]
        print(f"=== {name}: кампаний {len(camps)}", flush=True)
        pull_orders(key, camps, d0, d1, os.path.join(reg["data_dir"], "raw", name), a.refresh)
        if not a.no_svc:
            os.makedirs(os.path.join(reg["data_dir"], "svc"), exist_ok=True)
            pull_services(key, bid, d0 - dt.timedelta(1), d1, os.path.join(reg["data_dir"], "svc", c["svc"]))


if __name__ == "__main__":
    main()
