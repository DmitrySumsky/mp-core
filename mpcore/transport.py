"""Чем именно ходить в сеть: сессия `requests`, если она есть, иначе `urllib`.

Ядро обязано работать там, где ставить зависимости не хочется (лёгкие
облачные задания), поэтому `urllib` остаётся рабочим вариантом. Но
предпочтение отдаётся `requests`, и не из вкусовщины:

* **`urllib` регулярно ловит таймаут на публичной витрине**, а `requests`
  на тех же адресах — нет. Проверено многократно, в том числе локально в
  день переезда: один и тот же список артикулов через `urllib` падает с
  `WinError 10060`, через сессию проходит;
* **сессия переиспользует соединение**. Обход идёт пачками по сто, пачек
  бывают десятки — новое TLS-рукопожатие на каждую это чистые потери.

Выбор автоматический и переопределяемый: `set_transport()` для явной
подмены, `Urllib()` — чтобы принудительно вернуться на стандартную
библиотеку.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request


class Response:
    """Ответ в одном виде, кем бы он ни был получен."""

    __slots__ = ("status", "body")

    def __init__(self, status: int, body: bytes):
        self.status = status
        self.body = body

    @property
    def empty(self) -> bool:
        return not (self.body or b"").strip()

    def json(self):
        return json.loads(self.body)

    def text(self) -> str:
        return (self.body or b"").decode("utf-8", "replace")


class Urllib:
    """Транспорт на стандартной библиотеке."""

    name = "urllib"

    def __init__(self, opener=urllib.request.urlopen):
        self.opener = opener

    def get(self, url, headers=None, params=None, timeout=30) -> Response:
        full = url + ("?" + urllib.parse.urlencode(params) if params else "")
        request = urllib.request.Request(full, headers=headers or {})
        try:
            with self.opener(request, timeout=timeout) as r:
                return Response(getattr(r, "status", 200), r.read())
        except urllib.error.HTTPError as e:
            body = b""
            try:
                body = e.read()
            except Exception:
                pass
            return Response(e.code, body)

    def post(self, url, data=None, headers=None, timeout=30) -> Response:
        payload = data if isinstance(data, bytes) else urllib.parse.urlencode(
            data or {}).encode()
        request = urllib.request.Request(url, data=payload, headers=headers or {})
        try:
            with self.opener(request, timeout=timeout) as r:
                return Response(getattr(r, "status", 200), r.read())
        except urllib.error.HTTPError as e:
            body = b""
            try:
                body = e.read()
            except Exception:
                pass
            return Response(e.code, body)


class Requests:
    """Транспорт на сессии `requests` — соединение переиспользуется."""

    name = "requests"

    def __init__(self, session=None):
        import requests

        self.session = session or requests.Session()

    def get(self, url, headers=None, params=None, timeout=30) -> Response:
        r = self.session.get(url, headers=headers, params=params, timeout=timeout)
        return Response(r.status_code, r.content)

    def post(self, url, data=None, headers=None, timeout=30) -> Response:
        r = self.session.post(url, data=data, headers=headers, timeout=timeout)
        return Response(r.status_code, r.content)


def _detect():
    try:
        return Requests()
    except Exception:
        return Urllib()


_transport = None


def transport():
    """Текущий транспорт; при первом обращении выбирается сам."""
    global _transport
    if _transport is None:
        _transport = _detect()
    return _transport


def set_transport(value):
    """Явная подмена — в тестах и там, где нужен конкретный способ ходить."""
    global _transport
    _transport = value
    return _transport
