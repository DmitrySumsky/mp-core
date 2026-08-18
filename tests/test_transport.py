"""Транспорт: единый вид ответа, выбор реализации, ошибка HTTP не исключение."""

import io
import urllib.error

from mpcore import http, transport


class FakeResponse(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


def test_urllib_transport_returns_body():
    t = transport.Urllib(lambda req, timeout=None: FakeResponse(b'{"a": 1}'))
    response = t.get("http://x")
    assert response.status == 200
    assert response.json() == {"a": 1}
    assert response.empty is False


def test_urllib_transport_turns_http_error_into_response():
    """Код ответа — это данные, а не авария: решение принимает вызывающий."""
    def opener(req, timeout=None):
        raise urllib.error.HTTPError("http://x", 429, "err", {},
                                     io.BytesIO(
                                         '{"message": "превышен лимит"}'.encode()))

    t = transport.Urllib(opener)
    response = t.get("http://x")
    assert response.status == 429
    assert "лимит" in response.text()


def test_empty_body_is_visible_as_empty():
    t = transport.Urllib(lambda req, timeout=None: FakeResponse(b"  "))
    assert t.get("http://x").empty is True


class FakeSession:
    def __init__(self):
        self.calls = []

    def get(self, url, headers=None, params=None, timeout=None):
        self.calls.append((url, params))

        class R:
            status_code = 200
            content = b'{"ok": true}'
        return R()


def test_requests_transport_reuses_the_session():
    session = FakeSession()
    t = transport.Requests(session=session)
    t.get("http://x", params={"a": 1})
    t.get("http://x", params={"a": 2})
    assert len(session.calls) == 2, "сессия одна на все запросы"


def test_set_transport_is_honoured_by_get_json():
    session = FakeSession()
    transport.set_transport(transport.Requests(session=session))
    try:
        assert http.get_json("http://x") == {"ok": True}
        assert session.calls, "запрос ушёл выбранным транспортом"
    finally:
        transport.set_transport(transport.Urllib())
