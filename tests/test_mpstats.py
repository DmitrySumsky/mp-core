"""Платная аналитика: окно истории, флаг квоты, раздельность контуров."""

from datetime import date

from mpcore import mpstats
from mpcore.http import QuotaExceeded

ROWS = [{"data": "2026-08-16", "wallet_price": 411.4, "ozon_card_price": 311},
        {"data": "2026-08-17", "wallet_price": 420.0, "ozon_card_price": 320},
        {"data": "2026-08-15", "wallet_price": 405.0, "ozon_card_price": 305}]


def fetch_of(*answers):
    calls = {"n": 0}

    def fetch(url, headers=None, params=None, **kw):
        answer = answers[min(calls["n"], len(answers) - 1)]
        calls["n"] += 1
        if isinstance(answer, Exception):
            raise answer
        return answer

    fetch.calls = calls
    return fetch


def test_history_is_rounded_and_keyed_by_date():
    client = mpstats.Client("t", mpstats.KIND_WB, fetch=fetch_of(ROWS))
    assert client.history("1") == {"2026-08-15": 405, "2026-08-16": 411,
                                   "2026-08-17": 420}


def test_latest_date_probes_until_data_found():
    fetch = fetch_of([], [], ROWS)
    client = mpstats.Client("t", fetch=fetch)
    newest, hist = client.latest_date(["a", "b", "c", "d"])
    assert newest == date(2026, 8, 17)
    assert len(hist) == 3
    assert fetch.calls["n"] == 3


def test_latest_date_gives_none_when_source_is_silent():
    client = mpstats.Client("t", fetch=fetch_of([]))
    newest, hist = client.latest_date(["a", "b"])
    assert newest is None and hist == {}


def test_quota_stops_further_requests_for_this_contour():
    """Один отказ по квоте — остальные запросы контура не уходят вообще."""
    fetch = fetch_of(QuotaExceeded("Превышен лимит запросов за 18.08.2026"))
    client = mpstats.Client("t", fetch=fetch)
    assert client.history("1") == {}
    assert client.quota_hit is True
    assert client.history("2") == {}
    assert fetch.calls["n"] == 1
    assert "лимит" in client.why_silent()


def test_contours_do_not_share_the_quota_flag():
    """Выбранная квота одной площадки не должна гасить соседнюю."""
    wb = mpstats.Client("t", mpstats.KIND_WB,
                        fetch=fetch_of(QuotaExceeded("превышен лимит")))
    ozon = mpstats.Client("t", mpstats.KIND_OZON, fetch=fetch_of(ROWS))
    wb.history("1")
    assert wb.quota_hit is True
    assert ozon.history("1") != {}
    assert ozon.quota_hit is False


def test_price_field_differs_per_contour():
    rows = [{"data": "2026-08-17", "ozon_card_price": 300, "wallet_price": 999}]
    ozon = mpstats.Client("t", mpstats.KIND_OZON, fetch=fetch_of(rows))
    assert ozon.history("1") == {"2026-08-17": 300}


def test_available_dates_parses_probe_window():
    client = mpstats.Client("t")
    days = client.available_dates({"2026-08-17": 1, "плохая дата": 2})
    assert days == {date(2026, 8, 17)}
