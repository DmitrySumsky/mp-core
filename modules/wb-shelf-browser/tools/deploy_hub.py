#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Заливка хаба сбора (Apps Script, веб-приложение) — v1.0.0, 22.09.2026.

Первый запуск заводит НОВУЮ книгу «Полки WB — хаб сбора из браузера» со своим
скриптом (clasp create-script --type sheets), заливает код и публикует
веб-приложение. Дальше — перезаливка кода в тот же скрипт и обновление той же
публикации: адрес веб-приложения не меняется, расширение и облако его не теряют.

Секреты в репозиторий не попадают: в `hub/Code.gs` стоят `__HUB_KEY__`,
`__GH_TOKEN__`, `__BOOK_ID__`, значения подставляются во временную папку из
файла ключей (`SHELF_HUB_KEY`, `GH_PAT_SHELF_BUTTON`). Идентификаторы книги,
скрипта и публикации — в `hub/deployed.json` (в .gitignore).

После ПЕРВОЙ заливки владелец один раз открывает адрес веб-приложения и
разрешает доступ (скрипт выполняется от его имени) — иначе хаб отвечает
страницей «требуется авторизация».

    python tools/deploy_hub.py --keys ../../../21.orders-cloud/api_keys_extra.txt
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
HUB = os.path.join(HERE, "..", "hub")
STATE = os.path.join(HUB, "deployed.json")
TITLE = "Полки WB — хаб сбора из браузера"


def read_key(path: str, name: str) -> str:
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = re.match(rf"\s*{re.escape(name)}\s*=\s*(\S+)", line)
            if m:
                return m.group(1)
    raise SystemExit(f"В {path} нет строки {name}=")


def clasp(args: list[str], cwd: str) -> str:
    res = subprocess.run(["clasp"] + args, cwd=cwd, capture_output=True, text=True,
                         encoding="utf-8", shell=(os.name == "nt"))
    out = (res.stdout or "") + (res.stderr or "")
    if res.returncode != 0:
        raise SystemExit(f"clasp {' '.join(args)} → код {res.returncode}\n{out}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Заливка хаба сбора полок")
    ap.add_argument("--keys", required=True, help="файл ключей (api_keys_extra.txt)")
    args = ap.parse_args()

    hub_key = read_key(args.keys, "SHELF_HUB_KEY")
    gh = read_key(args.keys, "GH_PAT_SHELF_BUTTON")
    state = json.load(open(STATE, encoding="utf-8")) if os.path.exists(STATE) else {}

    tmp = tempfile.mkdtemp(prefix="shelf-hub-")
    try:
        if not state.get("scriptId"):
            out = clasp(["create-script", "--type", "sheets", "--title", TITLE,
                         "--rootDir", tmp], cwd=tmp)
            cfg = json.load(open(os.path.join(tmp, ".clasp.json"), encoding="utf-8"))
            state["scriptId"] = cfg["scriptId"]
            book = cfg.get("parentId")
            if isinstance(book, list):
                book = book[0]
            if not book:
                m = re.search(r"docs\.google\.com/spreadsheets/d/([\w-]+)", out)
                book = m.group(1) if m else ""
            if not book:
                raise SystemExit(f"Не понял id новой книги из ответа clasp:\n{out}")
            state["bookId"] = book
            json.dump(state, open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            print(f"Заведена книга хаба {book}, скрипт {state['scriptId']}")
        else:
            json.dump({"scriptId": state["scriptId"], "rootDir": tmp},
                      open(os.path.join(tmp, ".clasp.json"), "w", encoding="utf-8"))

        for name in os.listdir(tmp):
            if name != ".clasp.json":
                os.remove(os.path.join(tmp, name))
        code = open(os.path.join(HUB, "Code.gs"), encoding="utf-8").read()
        code = (code.replace("__HUB_KEY__", hub_key).replace("__GH_TOKEN__", gh)
                .replace("__BOOK_ID__", state["bookId"]))
        open(os.path.join(tmp, "Code.gs"), "w", encoding="utf-8").write(code)
        shutil.copy(os.path.join(HUB, "appsscript.json"), tmp)
        clasp(["push", "--force"], cwd=tmp)

        version = re.search(r"v(\d+\.\d+\.\d+)", code).group(1)
        if state.get("deploymentId"):
            clasp(["update-deployment", state["deploymentId"], "-d", f"хаб v{version}"], cwd=tmp)
        else:
            out = clasp(["create-deployment", "-d", f"хаб v{version}"], cwd=tmp)
            m = re.search(r"(AKfy[\w-]+)", out)
            if not m:
                raise SystemExit(f"Не понял id публикации из ответа clasp:\n{out}")
            state["deploymentId"] = m.group(1)
        state["url"] = f"https://script.google.com/macros/s/{state['deploymentId']}/exec"
        state["version"] = version
        json.dump(state, open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"Хаб v{version} опубликован: {state['url']}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
