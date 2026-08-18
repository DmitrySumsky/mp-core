"""Google Sheets через REST — только стандартная библиотека плюс PyJWT.

Почему не готовый клиент: он тянет за собой зависимости, а нужно ровно
четыре вещи — токен сервисного аккаунта, чтение диапазона, запись пачкой
и структурные правки (вставить колонку, создать лист). Зато свои ретраи.

Грабли, вшитые сюда намеренно:

* **429 и 5xx у Sheets транзиентны** и ловятся регулярно на боевых
  прогонах — без backoff прогон падает на ровном месте;
* **лимит записи — 60 запросов в минуту на пользователя**. Когда подряд
  идут несколько книг, упирается всегда та, до которой очередь дошла
  позже, а выглядит это как «сломалась именно эта таблица». Поэтому
  запись идёт пачками, а размер пачки — параметр;
* **дату в шапку пишем RAW**. На «умном» вводе строка вида «17.08»
  превращается в дату и показывается с годом — следующий прогон не узнаёт
  свою же колонку и заводит её заново.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://sheets.googleapis.com/v4/spreadsheets/"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/spreadsheets"

RETRY_CODES = (429, 500, 502, 503, 504)
WRITE_BATCH = 60          # держим себя внутри лимита записи


def access_token(service_account_path: str, ttl: int = 3600) -> str:
    """Токен доступа по ключу сервисного аккаунта."""
    import jwt                                   # PyJWT — единственная зависимость

    with open(service_account_path, encoding="utf-8") as f:
        account = json.load(f)
    now = int(time.time())
    assertion = jwt.encode({
        "iss": account["client_email"], "scope": SCOPE,
        "aud": TOKEN_URL, "iat": now, "exp": now + ttl,
    }, account["private_key"], algorithm="RS256")
    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": assertion}).encode()
    with urllib.request.urlopen(urllib.request.Request(TOKEN_URL, data=body),
                                timeout=30) as r:
        return json.loads(r.read())["access_token"]


class Sheets:
    """Тонкий клиент одной книги."""

    def __init__(self, spreadsheet_id: str, token: str,
                 opener=urllib.request.urlopen, sleep=time.sleep):
        self.id = spreadsheet_id
        self.token = token
        self.opener = opener
        self.sleep = sleep

    def call(self, path: str, method: str = "GET", body=None, tries: int = 5):
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range(tries):
            req = urllib.request.Request(
                BASE + path, data=data, method=method,
                headers={"Authorization": "Bearer " + self.token,
                         "Content-Type": "application/json"})
            try:
                with self.opener(req, timeout=60) as r:
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                if e.code in RETRY_CODES and attempt < tries - 1:
                    self.sleep(min(30, 3 * (2 ** attempt)))
                    continue
                raise
            except Exception:
                if attempt < tries - 1:
                    self.sleep(min(30, 3 * (2 ** attempt)))
                    continue
                raise
        return None

    # --- чтение -----------------------------------------------------------

    def tabs(self):
        """Свойства листов книги по порядку их вкладок."""
        meta = self.call(self.id + "?fields=sheets.properties(sheetId,title,index)")
        return sorted((s["properties"] for s in meta["sheets"]),
                      key=lambda p: p.get("index", 0))

    def values(self, tab: str, a1: str, formatted: bool = True):
        rendering = "FORMATTED_VALUE" if formatted else "UNFORMATTED_VALUE"
        rng = urllib.parse.quote(f"'{tab}'!{a1}".replace("'", "''", 0))
        return self.call(f"{self.id}/values/{rng}?valueRenderOption={rendering}"
                         ).get("values", [])

    def header(self, tab: str, width: str = "BZ"):
        rows = self.values(tab, f"A1:{width}1")
        return rows[0] if rows else []

    # --- запись -----------------------------------------------------------

    def update(self, ranges, raw: bool = False, batch: int = WRITE_BATCH):
        """`ranges` — [{"range": "'Лист'!A1:B1", "values": [[...]]}]."""
        mode = "RAW" if raw else "USER_ENTERED"
        ranges = list(ranges)
        for i in range(0, len(ranges), batch):
            self.call(self.id + "/values:batchUpdate", "POST",
                      {"valueInputOption": mode, "data": ranges[i:i + batch]})

    def insert_columns(self, tab_id: int, at: int, count: int = 1):
        self.call(self.id + ":batchUpdate", "POST", {"requests": [
            {"insertDimension": {"range": {
                "sheetId": tab_id, "dimension": "COLUMNS",
                "startIndex": at, "endIndex": at + count},
                "inheritFromBefore": False}}]})

    def add_tab(self, title: str, rows: int = 200, cols: int = 40) -> int:
        reply = self.call(self.id + ":batchUpdate", "POST", {"requests": [
            {"addSheet": {"properties": {"title": title, "gridProperties": {
                "rowCount": rows, "columnCount": cols}}}}]})
        return reply["replies"][0]["addSheet"]["properties"]["sheetId"]

    def delete_tab(self, tab_id: int):
        self.call(self.id + ":batchUpdate", "POST",
                  {"requests": [{"deleteSheet": {"sheetId": tab_id}}]})


def a1(tab: str, first_col: str, last_col: str, row: int) -> str:
    """Диапазон одной строки: имя листа экранируется по правилам A1."""
    quoted = "'" + tab.replace("'", "''") + "'"
    return f"{quoted}!{first_col}{row}:{last_col}{row}"
