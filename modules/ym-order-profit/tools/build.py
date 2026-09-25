# -*- coding: utf-8 -*-
"""Сборка центрального кода модуля «ЧП ЯМ по заказам» со встроенными проверками.

Правятся ТОЛЬКО `central/src/*.js` и шапка `central/preamble.js`. Скрипт склеивает их в
`central/build/central.js` — файл, который тянут книги. Собранный файл руками не правят.

Проверки идут ДО записи файла, и не прошедшая сборка файл на диске не оставляет
(ПУЛЬТ.md §11): иначе полусобранный код уезжает в книги первым же пушем.

    python tools/build.py           # собрать
    python tools/build.py --check   # только проверить свежесть (для CI)

Уточнение (25.09.2026): shell=True только на Windows (там он нужен, чтобы нашёлся node.cmd).
На macOS/Linux shell=True со списком аргументов запускал голый `node`: REPL ждал ввод, а
синтаксис не проверялся. Правка в коде уехала вместе с v2.4.0, здесь — запись о ней.
"""
import io
import os
import re
import subprocess
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, "central", "src")
PREAMBLE = os.path.join(HERE, "central", "preamble.js")
OUT = os.path.join(HERE, "central", "build", "central.js")
LOADER = os.path.join(HERE, "loader", "loader.gs")

# Функции, которые лоадер дёргает по имени: не сойдётся резолв — книга получит
# «в центральном коде нет функции X» вместо работы.
PUBLIC = ["yopRunYesterday", "yopRefreshUnit", "yopDailyTrigger", "continueQueue", "yopRecalcSheets",
          "yopRebuildHistory", "yopResetRun", "yopTriggerOn", "yopTriggerOff", "upgradeSheets",
          "yopHelp", "yopStatus", "yopCheckConnection"]

# Внутренние функции, без которых прогон молча теряет этап
REQUIRED = ["yopCollectCabinet_", "yopCollectWindow_", "yopCollectUnitData_", "yopForecast_", "yopFactDay_",
            "yopUnitRows_", "yopWriteDay_", "yopWriteUnit_", "yopUpdateFacts_", "yopCogs_", "yopSettings_"]

# Скан утечек. Репозиторий открытый: ключей, идентификаторов книг, названий брендов и
# боевых артикулов в собранном файле и в лоадере быть не должно.
LEAKS = [
    (r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}", "токен (JWT)"),
    (r"\bghp_[A-Za-z0-9]{20,}", "GitHub-токен"),
    (r"\bgithub_pat_[A-Za-z0-9_]{20,}", "GitHub-токен"),
    (r"\b\d{8,10}:[A-Za-z0-9_-]{30,}", "токен бота"),
    (r"\b1[A-Za-z0-9_-]{43}\b", "идентификатор книги Google"),
    (r"(?<![\d.])\d{8,11}(?![\d.])", "похоже на боевой артикул или номер продавца"),
]


def brand_words():
    """Слова, которых не должно быть в открытом коде. Список лежит ВНЕ репозитория."""
    path = os.environ.get("YOP_LEAK_WORDS", "")
    if not path or not os.path.exists(path):
        return []
    return [w.strip() for w in io.open(path, encoding="utf-8").read().splitlines() if w.strip()]


def build():
    parts = [io.open(PREAMBLE, encoding="utf-8").read().rstrip("\n")]
    for name in sorted(os.listdir(SRC)):
        if not name.endswith(".js"):
            continue
        text = io.open(os.path.join(SRC, name), encoding="utf-8").read().strip("\n")
        parts.append("\n\n/* ==================== %s ==================== */\n\n%s" % (name, text))
    return "\n".join(parts) + "\n"


def check(text):
    """Синтаксис, резолв публичных функций, соответствие лоадеру, утечки."""
    bad = []
    tmp = os.path.join(tempfile.gettempdir(), "yop_central_check.js")
    io.open(tmp, "w", encoding="utf-8", newline="\n").write(text)
    # 25.09.2026: shell=True только на Windows — на Mac со списком аргументов он запускал голый `node` (REPL ждал ввод,
    # сборка висла, а синтаксис не проверялся)
    r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True, shell=(os.name == "nt"),
                       encoding="utf-8", errors="replace", stdin=subprocess.DEVNULL)
    if r.returncode != 0:
        bad.append("node --check: " + ((r.stderr or r.stdout).strip().splitlines() or ["?"])[0])
    os.remove(tmp)

    for fn in PUBLIC:
        if not re.search(r"function\s+%s\s*\(" % re.escape(fn), text):
            bad.append("нет публичной функции %s — лоадер её не найдёт" % fn)
    for fn in REQUIRED:
        if not re.search(r"function\s+%s\s*\(" % re.escape(fn), text):
            bad.append("нет функции %s — прогон потеряет этап" % fn)

    loader = io.open(LOADER, encoding="utf-8").read()
    for fn in re.findall(r"run_\('([A-Za-z_]+)'", loader):
        if not re.search(r"function\s+%s\s*\(" % re.escape(fn), text):
            bad.append("лоадер зовёт %s, а в центральном коде её нет" % fn)

    for label, body in (("central", text), ("loader", loader)):
        for pattern, what in LEAKS:
            m = re.search(pattern, body)
            if m:
                bad.append("утечка в %s (%s): %s…" % (label, what, m.group(0)[:12]))
        for w in brand_words():
            if re.search(r"(?<![\w])%s(?![\w])" % re.escape(w), body, re.I):
                bad.append("утечка в %s: слово из закрытого списка (%s…)" % (label, w[:3]))
    return bad


def main():
    text = build()
    problems = check(text)
    if problems:
        print("СБОРКА НЕ ПРОШЛА ПРОВЕРКИ, файл не записан:")
        for p in problems:
            print("  •", p)
        return 1
    if "--check" in sys.argv:
        old = io.open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if old != text:
            print("central/build/central.js УСТАРЕЛ — python tools/build.py")
            return 1
        print("central/build/central.js свежий:", text.split("\n", 1)[0])
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(text)
    print("собран %s — %d строк" % (os.path.relpath(OUT, HERE), text.count("\n")))
    print(text.split("\n", 1)[0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
