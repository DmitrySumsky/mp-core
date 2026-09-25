# -*- coding: utf-8 -*-
"""Деплой лоадера в привязанный скрипт книги (clasp).

Идентификаторы книг в открытом репозитории не хранятся: реестр лежит ВНЕ репозитория,
путь — аргумент --registry или переменная POS_BOOKS_REGISTRY. Формат файла:

    {"books": [{"key": "positions-pilot", "title": "...", "sheet_id": "...", "script_id": "..."}]}

Деплой смотрит на КОД ВОЗВРАТА сборки и тестов, а не на последние строки вывода.

    python tools/deploy.py --registry <файл>                 # собрать, тесты, залить лоадер во все книги
    python tools/deploy.py --registry <файл> --book <key>    # только одна книга
    python tools/deploy.py --registry <файл> --list

Перед пушем проверяется, нет ли в скрипте книги ВТОРОГО onOpen: два определения одного
имени в проекте молча затирают друг друга, и меню исчезает без ошибки.

Уточнение (25.09.2026): shell=True только на Windows (там он нужен, чтобы нашёлся clasp.cmd).
На macOS/Linux shell=True со списком аргументов запускал голый `clasp`/`node` без аргументов;
сборка вызывается через sys.executable — на Mac нет команды `python`.
"""
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOADER = os.path.join(HERE, "loader", "loader.gs")
MANIFEST = os.path.join(HERE, "loader", "appsscript.json")


def sh(args, cwd=None):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, shell=(os.name == "nt"),
                          encoding="utf-8", errors="replace")


def registry_path():
    if "--registry" in sys.argv:
        return sys.argv[sys.argv.index("--registry") + 1]
    return os.environ.get("POS_BOOKS_REGISTRY", "")


def books():
    path = registry_path()
    if not path or not os.path.exists(path):
        print("нет реестра книг: --registry <файл> или переменная POS_BOOKS_REGISTRY")
        raise SystemExit(1)
    return json.load(io.open(path, encoding="utf-8"))["books"]


def deploy(book):
    work = tempfile.mkdtemp(prefix="pos_deploy_")
    try:
        io.open(os.path.join(work, ".clasp.json"), "w", encoding="utf-8").write(
            json.dumps({"scriptId": book["script_id"], "rootDir": "."}))
        r = sh(["clasp", "pull"], cwd=work)
        if r.returncode != 0:
            print("  clasp pull не прошёл:", (r.stderr or r.stdout).strip()[:300])
            return 1
        for name in os.listdir(work):
            if not name.endswith((".js", ".gs")) or name in ("loader.gs", "loader.js"):
                continue
            text = io.open(os.path.join(work, name), encoding="utf-8").read()
            if "function onOpen" in text:
                print("  ОТКАЗ: в скрипте книги уже есть onOpen (%s). Меню затрут друг друга —"
                      " вызов меню модуля надо дописать в существующий onOpen руками." % name)
                return 1
        # clasp тянет файлы проекта как .js: свой .gs рядом даёт «Conflicting files found»
        for name in ("loader.gs", "loader.js", "Code.js", "Код.js"):
            old_path = os.path.join(work, name)
            if os.path.exists(old_path) and name.startswith("loader"):
                os.remove(old_path)
        shutil.copy(LOADER, os.path.join(work, "loader.js"))
        shutil.copy(MANIFEST, os.path.join(work, "appsscript.json"))
        r = sh(["clasp", "push", "-f"], cwd=work)
        out = (r.stdout or "") + (r.stderr or "")
        if r.returncode != 0:
            print("  clasp push не прошёл:", out.strip()[:400])
            return 1
        print("  залито в «%s»: %s" % (book.get("title", book["key"]), out.strip().splitlines()[-1][:120]))
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    if "--list" in sys.argv:
        for b in books():
            print("%-20s %s" % (b["key"], b.get("title", "")))
        return 0
    if sh([sys.executable, os.path.join(HERE, "tools", "build.py")]).returncode != 0:
        print("сборка не прошла проверки — деплой отменён")
        return 1
    t = sh(["node", os.path.join(HERE, "tests", "run.js")])
    if t.returncode != 0:
        print("тесты красные — деплой отменён\n" + (t.stdout or "")[-800:])
        return 1
    print("сборка и тесты зелёные")
    only = sys.argv[sys.argv.index("--book") + 1] if "--book" in sys.argv else None
    bad = 0
    for b in books():
        if only and b["key"] != only:
            continue
        print("книга %s:" % b["key"])
        bad += deploy(b)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
