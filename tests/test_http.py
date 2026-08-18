"""Отказы HTTP: транзиентный, квота, пустой ответ — три разных исхода."""

import io
import json
import urllib.error

import pytest

from mpcore.http import EMPTY, QuotaExceeded, chunked, get_json


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


def http_error(code, payload=None):
    body = json.dumps(payload or {}).encode()
    return urllib.error.HTTPError("http://x", code, "err", {}, io.BytesIO(body))


def opener_of(sequence):
    """Открыватель, отдающий заготовленные ответы по очереди."""
    calls = {"n": 0}

    def opener(request, timeout=None):
        item = sequence[min(calls["n"], len(sequence) - 1)]
        calls["n"] += 1
        if isinstance(item, Exception):
            raise item
        return FakeResponse(item)

    opener.calls = calls
    return opener


def test_json_returned():
    opener = opener_of([b'{"a": 1}'])
    assert get_json("http://x", opener=opener, sleep=lambda s: None) == {"a": 1}


def test_empty_body_is_a_fact_not_a_failure():
    opener = opener_of([b"   "])
    assert get_json("http://x", opener=opener, sleep=lambda s: None) is EMPTY


def test_transient_error_is_retried_then_succeeds():
    opener = opener_of([http_error(503), b'{"ok": true}'])
    result = get_json("http://x", opener=opener, sleep=lambda s: None)
    assert result == {"ok": True}
    assert opener.calls["n"] == 2


def test_transient_error_gives_up_as_none():
    opener = opener_of([http_error(503)])
    assert get_json("http://x", tries=3, opener=opener, sleep=lambda s: None) is None
    assert opener.calls["n"] == 3


def test_quota_429_raises_immediately_without_retries():
    payload = {"code": 429, "message": "Превышен лимит запросов за 18.08.2026."}
    opener = opener_of([http_error(429, payload)])
    with pytest.raises(QuotaExceeded) as caught:
        get_json("http://x", tries=4, opener=opener, sleep=lambda s: None)
    assert "лимит" in caught.value.message.lower()
    assert opener.calls["n"] == 1, "квоту ретраить бессмысленно"


def test_throttling_429_is_retried():
    opener = opener_of([http_error(429, {"message": "too many requests"}),
                        b'{"ok": true}'])
    assert get_json("http://x", opener=opener, sleep=lambda s: None) == {"ok": True}
    assert opener.calls["n"] == 2


def test_client_error_is_not_retried():
    opener = opener_of([http_error(404)])
    assert get_json("http://x", tries=4, opener=opener, sleep=lambda s: None) is None
    assert opener.calls["n"] == 1


def test_chunked_splits_by_size():
    assert list(chunked(range(5), 2)) == [[0, 1], [2, 3], [4]]
