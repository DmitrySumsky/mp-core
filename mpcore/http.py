"""HTTP с ретраями и честной классификацией отказов.

Стандартной библиотеки достаточно: часть потребителей запускается там,
где `requests` ставить не хочется. Но если сессия доступна — ходим ею,
см. `mpcore.transport`.

Главное, ради чего модуль существует, — три разных отказа, которые почти
везде свалены в один `except`:

* **транзиентный** (5xx, обрыв сети, таймаут) — ретраить с backoff;
* **квота исчерпана** (429 с сообщением про лимит за сутки) — ретраить
  БЕССМЫСЛЕННО: до сброса счётчика ответ не изменится, а ретраи съедают
  прогон и маскируют причину в логе;
* **пустой ответ** (HTTP 200 без тела) — у некоторых витрин это штатный
  ответ на несуществующий идентификатор, то есть ФАКТ, а не сбой.

Чем ходить в сеть, решает `mpcore.transport`: сессия `requests`, если она
установлена, иначе стандартная библиотека.

Разница между вторым и первым стоила пяти суток простоя: сообщение
«источник не ответил» одинаково выглядело и при недоступности сервиса,
и при выбранной квоте, и причину искали в коде.
"""

from __future__ import annotations

import json
import random
import time
import urllib.parse

from . import transport as _transport

#: HTTP 200 с пустым телом. Отличается и от данных, и от сбоя.
EMPTY = object()

TRANSIENT = (500, 502, 503, 504)

#: Слова, по которым 429 «кончилась суточная квота» отличается от 429
#: «слишком часто стучишь». Второй ретраить нужно, первый — нет.
QUOTA_MARKERS = ("лимит", "limit", "quota")


class QuotaExceeded(RuntimeError):
    """Суточный лимит запросов исчерпан — ретраить нет смысла."""

    def __init__(self, message: str = "", url: str = ""):
        super().__init__(message or "quota exceeded")
        self.message = message
        self.url = url


def is_quota_message(text: str) -> bool:
    low = (text or "").lower()
    return any(w in low for w in QUOTA_MARKERS)


def get_json(url, headers=None, params=None, tries=4, timeout=30,
             opener=None, sleep=time.sleep, transport=None,
             method="GET", body=None):
    """GET → разобранный JSON, `EMPTY` или `None`.

    `None` — сбой замера (сеть или сервер не отдал за все попытки).
    `EMPTY` — ответ 200 с пустым телом.
    Исключение `QuotaExceeded` — квота; пробрасывается сразу, без ретраев.

    Ходит тем транспортом, который выбрало ядро (сессия `requests`, если
    она есть). `opener`, `transport` и `sleep` вынесены в параметры ради
    тестов: сеть в тестах не нужна, а ждать по-настоящему тем более.
    """
    if transport is None:
        transport = _transport.Urllib(opener) if opener else _transport.transport()
    full = url + ("?" + urllib.parse.urlencode(params) if params else "")
    delay = 1.0
    for attempt in range(1, tries + 1):
        try:
            if method == "POST":
                response = transport.post(url, data=json.dumps(body or {}).encode(),
                                          headers=headers, timeout=timeout)
            else:
                response = transport.get(url, headers=headers, params=params,
                                         timeout=timeout)
        except Exception:
            if attempt == tries:
                return None
            sleep(delay + random.uniform(0, 0.4))
            delay = min(30.0, delay * 2)
            continue

        if response.status == 200:
            if response.empty:
                return EMPTY
            try:
                return response.json()
            except ValueError:
                return None
        if response.status == 429:
            message = _message_of(response.body)
            if is_quota_message(message):
                raise QuotaExceeded(message, full)
            # обычный троттлинг — ждём дольше обычного
            if attempt == tries:
                return None
            sleep(delay * 2 + random.uniform(0, 0.4))
        elif response.status in TRANSIENT:
            if attempt == tries:
                return None
            sleep(delay + random.uniform(0, 0.4))
        else:
            return None                         # 4xx — ретраить нечего
        delay = min(30.0, delay * 2)
    return None


def _message_of(body: bytes) -> str:
    try:
        data = json.loads(body or b"{}")
    except Exception:
        return (body or b"").decode("utf-8", "replace")
    if isinstance(data, dict):
        return str(data.get("message") or data.get("error") or "")
    return str(data)


def chunked(items, size):
    """Разбивка на пачки — почти каждая витрина ограничивает размер запроса."""
    items = list(items)
    for i in range(0, len(items), size):
        yield items[i:i + size]
