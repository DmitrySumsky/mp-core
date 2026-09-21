# -*- coding: utf-8 -*-
"""
ЧП ПО ЗАКАЗАМ ЯНДЕКС МАРКЕТА — ЗАЛИВКА СКРИПТА В КНИГУ v1.0.0 — 22.09.2026

v1.0.0 — 22.09.2026
  СКРИПТ КНИГИ ЗАЛИВАЕТСЯ ИЗ РЕПОЗИТОРИЯ ОДНОЙ КОМАНДОЙ — перенос модели в Apps Script.
  • состав проекта целиком из gas/ (*.js + appsscript.json) через Apps Script API
    PUT /v1/projects/{id}/content — это отдельный привязанный проект только с нашим кодом,
    скрипт книги с её собственными функциями не трогается;
  • авторизация — токен clasp (~/.clasprc.json, tokens.default), id проекта — в реестре (script_id);
  • после заливки состав читается обратно и сверяется по именам и длине файлов.

    python deploy_gas.py --registry ../registry.local.json
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GAS = os.path.join(HERE, "..", "gas")


def token() -> str:
    t = json.load(open(os.path.expanduser("~/.clasprc.json")))["tokens"]["default"]
    d = urllib.parse.urlencode({"client_id": t["client_id"], "client_secret": t["client_secret"],
                                "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}).encode()
    return json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", d))["access_token"]


def call(tok, method, url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Apps Script API: HTTP {e.code} {e.read()[:400].decode('utf-8', 'replace')}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", required=True)
    a = ap.parse_args()
    sid = json.load(open(a.registry, encoding="utf-8"))["script_id"]
    files = [{"name": "appsscript", "type": "JSON",
              "source": open(os.path.join(GAS, "appsscript.json"), encoding="utf-8").read()}]
    for p in sorted(glob.glob(os.path.join(GAS, "*.js"))):
        files.append({"name": os.path.splitext(os.path.basename(p))[0], "type": "SERVER_JS",
                      "source": open(p, encoding="utf-8").read()})
    tok = token()
    url = f"https://script.googleapis.com/v1/projects/{sid}/content"
    call(tok, "PUT", url, {"files": files})
    back = {f["name"]: len(f["source"]) for f in call(tok, "GET", url)["files"]}
    want = {f["name"]: len(f["source"]) for f in files}
    print("залито:", back)
    if back != want:
        raise SystemExit(f"состав не совпал: ждали {want}")
    print("сверка состава: ок")


if __name__ == "__main__":
    main()
