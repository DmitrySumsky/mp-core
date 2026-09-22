#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборка расширения «Полки WB» для установки менеджерам — v1.0.0, 22.09.2026.

Пишет `extension/config.js` (адрес хаба из `hub/deployed.json`, ключ хаба из
файла ключей — в git он не попадает) и собирает `dist/wb-shelf-browser-vX.Y.Z/`
(папка для «Загрузить распакованное») плюс zip того же содержимого.

    python tools/build_ext.py --keys ../../../21.orders-cloud/api_keys_extra.txt
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import zipfile

from deploy_hub import STATE, read_key

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.join(HERE, "..", "extension")
DIST = os.path.join(HERE, "..", "dist")
FILES = ["manifest.json", "background.js", "content.js", "config.js", "icon128.png"]


def main() -> None:
    ap = argparse.ArgumentParser(description="Сборка расширения «Полки WB»")
    ap.add_argument("--keys", required=True)
    args = ap.parse_args()

    state = json.load(open(STATE, encoding="utf-8"))
    cfg = {"url": state["url"], "key": read_key(args.keys, "SHELF_HUB_KEY")}
    with open(os.path.join(EXT, "config.js"), "w", encoding="utf-8") as f:
        f.write("/* Сгенерировано tools/build_ext.py — в git не кладётся. */\n"
                f"self.SHELF_HUB = {json.dumps(cfg)};\n")

    version = json.load(open(os.path.join(EXT, "manifest.json"), encoding="utf-8"))["version"]
    name = f"wb-shelf-browser-v{version}"
    out = os.path.join(DIST, name)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    for fn in FILES:
        shutil.copy(os.path.join(EXT, fn), out)
    zpath = os.path.join(DIST, name + ".zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for fn in FILES:
            z.write(os.path.join(out, fn), f"{name}/{fn}")
    print(f"Готово: {os.path.abspath(out)}\n        {os.path.abspath(zpath)}")


if __name__ == "__main__":
    main()
