# -*- coding: utf-8 -*-
"""ЧП ЯМ по заказам — деплой лоадера в привязанный проект книги.

v2.0.0 — 22.09.2026
  ПЕРЕЕЗД НА ПУЛЬТ: в книгу уезжает только лоадер (loader/loader.gs + loader/appsscript.json), логика —
  central/build/central.js в репозитории, книга тянет его при каждом клике.
  • сначала сборка со встроенными проверками и тесты на стабах — деплой смотрит на КОД ВОЗВРАТА;
  • состав проекта заменяется целиком (Apps Script API PUT /v1/projects/{id}/content) — это отдельный
    привязанный проект модуля, скрипт самой книги с её функциями не трогается;
  • после заливки состав читается обратно и сверяется; в проекте должен остаться ровно один onOpen;
  • id проекта — в реестре вне репозитория (--registry, поле script_id), токен — clasp (~/.clasprc.json).

    python tools/deploy.py --registry <файл>
"""
import argparse
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOADER = os.path.join(HERE, "loader", "loader.gs")
MANIFEST = os.path.join(HERE, "loader", "appsscript.json")


def token():
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
        raise SystemExit("Apps Script API: HTTP %s %s" % (e.code, e.read()[:400].decode("utf-8", "replace")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", required=True)
    a = ap.parse_args()
    for cmd, what in (([sys.executable, os.path.join(HERE, "tools", "build.py")], "сборка"),
                      (["node", os.path.join(HERE, "tests", "run.js")], "тесты")):
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            print("%s не прошла — деплой отменён\n%s" % (what, (r.stdout + r.stderr)[-1500:]))
            return 1
        print("%s: ок — %s" % (what, (r.stdout.strip().splitlines() or [""])[-1]))
    sid = json.load(io.open(a.registry, encoding="utf-8"))["script_id"]
    loader = io.open(LOADER, encoding="utf-8").read()
    if loader.count("function onOpen") != 1:
        print("в лоадере должен быть ровно один onOpen")
        return 1
    files = [{"name": "appsscript", "type": "JSON", "source": io.open(MANIFEST, encoding="utf-8").read()},
             {"name": "loader", "type": "SERVER_JS", "source": loader}]
    tok = token()
    url = "https://script.googleapis.com/v1/projects/%s/content" % sid
    call(tok, "PUT", url, {"files": files})
    back = {f["name"]: len(f["source"]) for f in call(tok, "GET", url)["files"]}
    want = {f["name"]: len(f["source"]) for f in files}
    if back != want:
        print("состав не совпал: в проекте %s, ждали %s" % (back, want))
        return 1
    print("лоадер залит, состав проекта: %s" % ", ".join(sorted(back)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())