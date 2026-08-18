"""Платная аналитика маркетплейсов: история цен и продаж по позиции.

Два свойства источника определяют всю работу с ним:

* **окно ровно 30 дней** — глубже история не берётся ничем, её набирает
  только ежедневный прогон. Значит таблицу истории заводят сразу, а не
  «когда понадобится»;
* **суточная квота, и у каждого контура (площадки) она СВОЯ**. Когда один
  контур наполняется, а второй стоит — дело не в токене и не в коде.

Исчерпанная квота приходит как HTTP 429 с сообщением про лимит за дату;
тем же кодом отвечает и обычный троттлинг. Различает их `mpcore.http`,
здесь квота превращается во флаг на клиенте: одного отказа достаточно,
чтобы не долбить сервис остаток прогона.
"""

from __future__ import annotations

from datetime import date, datetime

from .http import EMPTY, QuotaExceeded, get_json

BASE = "https://mpstats.io/api"

#: Контуры площадок. Ключ — то, что подставляется в путь.
KIND_WB = "wb"
KIND_OZON = "oz"

#: Поле дневной цены по контурам: цена с бонусом кошелька / картой площадки.
PRICE_FIELD = {KIND_WB: "wallet_price", KIND_OZON: "ozon_card_price"}


class Client:
    """Клиент одного контура. Флаг квоты живёт на экземпляре.

    Экземпляр создаётся на прогон: один отказ по квоте гасит остальные
    запросы этого контура, а соседний контур продолжает работать.
    """

    def __init__(self, token: str, kind: str = KIND_WB, fetch=get_json):
        self.token = token
        self.kind = kind
        self.fetch = fetch
        self.quota_hit = False

    @property
    def headers(self) -> dict:
        return {"X-Mpstats-TOKEN": self.token, "Content-Type": "application/json"}

    def history(self, item, field: str | None = None) -> dict:
        """{дата (ISO): цена} за окно источника. Пусто при недоступности.

        Пустой ответ — норма, а не сбой: у позиций без продаж дневной цены
        не бывает вовсе, такие строки остаются пустыми навсегда.
        """
        if self.quota_hit:
            return {}
        field = field or PRICE_FIELD.get(self.kind, "final_price")
        url = f"{BASE}/{self.kind}/get/item/{item}/sales"
        try:
            rows = self.fetch(url, self.headers)
        except QuotaExceeded:
            self.quota_hit = True
            return {}
        if rows is None or rows is EMPTY or not isinstance(rows, list):
            return {}
        out = {}
        for row in rows:
            day = row.get("data")
            value = row.get(field) or row.get("final_price")
            if day and value:
                out[day] = round(value)
        return out

    def latest_date(self, items, probes: int = 5):
        """Самая свежая дата источника — проба по первым позициям.

        Возвращает `(дата | None, история пробы)`. История пригодится, чтобы
        понять, каких дней не хватает в таблице: набор дат у источника один
        на все позиции.
        """
        for item in list(items)[:probes]:
            hist = self.history(item)
            if hist:
                newest = max(hist.keys())
                return datetime.strptime(newest, "%Y-%m-%d").date(), hist
        return None, {}

    def available_dates(self, probe_history: dict) -> set:
        """Даты, которые источник вообще отдаёт, как объекты `date`."""
        out = set()
        for day in probe_history or {}:
            try:
                out.add(datetime.strptime(day, "%Y-%m-%d").date())
            except ValueError:
                continue
        return out

    def why_silent(self) -> str:
        """Причина молчания одной строкой — для лога и сообщения человеку."""
        return ("исчерпан суточный лимит запросов" if self.quota_hit
                else "источник не ответил на пробы")


def today() -> date:
    return date.today()
