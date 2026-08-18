"""HTTP с ретраями и честной классификацией отказов.

Только стандартная библиотека: часть потребителей запускается там, где
`requests` ставить не хочется (лёгкие облачные задания), а поведение должно
совпадать с точностью до ответа.

Главное, ради чего модуль существует, — три разных отказа, которые почти
везде свалены в один `except`:

* **транзиентный** (5xx, обрыв сети, таймаут) — ретраить с backoff;
* **квота исчерпана** (429 с сообщением про лимит за сутки) — ретраить
  БЕССМЫСЛЕННО: до сброса счётчика ответ не изменится, а ретраи съедают
  прогон и маскируют причину в логе;
* **пустой ответ** (HTTP 200 без тела) — у некоторых витрин это штатный
  ответ на несуществующий идентификатор, то есть ФАКТ, а не сбой.

Разница между вторым и первым стоила пяти суток простоя: сообщение
«источник не ответил» одинаково выглядело и при недоступности сервиса,
и при выбранной квоте, и причину искали в коде.
"""

from __future__ import annotations

import json
import random
import time
import urllib.error
import urllib.parse
import urllib.request

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
             opener=urllib.request.urlopen, sleep=time.sleep):
    """GET → разобранный JSON, `EMPTY` или `None`.

    `None` — сбой замера (сеть или сервер не отдал за все попытки).
    `EMPTY` — ответ 200 с пустым телом.
    Исключение `QuotaExceeded` — квота; пробрасывается сразу, без ретраев.

    `opener` и `sleep` вынесены в параметры ради тестов: сеть в тестах не
    нужна, а ждать по-настоящему тем более.
    """
    full = url + ("?" + urllib.parse.urlencode(params) if params else "")
    delay = 1.0
    for attempt in range(1, tries + 1):
        try:
            req = urllib.request.Request(full, headers=headers or {})
            with opener(req, timeout=timeout) as r:
                body = r.read()
            if not body.strip():
                return EMPTY
            return json.loads(body)
        except urllib.error.HTTPError as e:
            body = b""
            try:
                body = e.read()
            except Exception:
                pass
            if e.code == 429:
                message = _message_of(body)
                if is_quota_message(message):
                    raise QuotaExceeded(message, full) from None
                # обычный троттлинг — ждём дольше обычного
                if attempt == tries:
                    return None
                sleep(delay * 2 + random.uniform(0, 0.4))
            elif e.code in TRANSIENT:
                if attempt == tries:
                    return None
                sleep(delay + random.uniform(0, 0.4))
            else:
                return None                     # 4xx — ретраить нечего
        except Exception:
            if attempt == tries:
                return None
            sleep(delay + random.uniform(0, 0.4))
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
