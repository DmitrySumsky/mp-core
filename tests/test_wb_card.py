"""Витрина: цена, три состояния и запрет писать дырку замера как факт."""

from mpcore import states, wb_card
from mpcore.http import EMPTY


def product(pid, kopeks=None):
    price = {"product": kopeks} if kopeks else {}
    return {"id": int(pid), "brand": "B", "name": "N",
            "supplierId": 1, "subjectId": 2, "sizes": [{"price": price}]}


def fetch_of(*answers):
    calls = {"n": 0, "params": []}

    def fetch(url, headers=None, params=None, **kw):
        calls["params"].append(params)
        answer = answers[min(calls["n"], len(answers) - 1)]
        calls["n"] += 1
        return answer

    fetch.calls = calls
    return fetch


def test_wallet_price_is_floor_not_round():
    # 559 × 0.98 = 547.8 — на округлении вверх расходится с эталоном
    assert wb_card.wallet_price(55900) == 547
    assert wb_card.wallet_price(100000) == 980


def test_price_present_gives_number():
    fetch = fetch_of({"products": [product(1, 54800)]})
    out = wb_card.prices(["1"], fetch=fetch, sleep=lambda s: None)
    assert out == {"1": 537}


def test_card_without_offer_is_marked_out_of_stock():
    fetch = fetch_of({"products": [product(1)]})
    out = wb_card.prices(["1"], fetch=fetch, sleep=lambda s: None)
    assert out == {"1": states.STATE_NONE}


def test_missing_card_is_marked_gone():
    fetch = fetch_of({"products": []})
    out = wb_card.prices(["1", "2"], fetch=fetch, sleep=lambda s: None)
    assert out == {"1": states.STATE_GONE, "2": states.STATE_GONE}


def test_failed_batch_writes_nothing_at_all():
    """Сбой замера — не факт о товаре: строка должна остаться нетронутой."""
    fetch = fetch_of(None)
    out = wb_card.prices(["1", "2"], fetch=fetch, sleep=lambda s: None)
    assert out == {}


def test_empty_body_means_no_cards():
    fetch = fetch_of(EMPTY)
    out = wb_card.prices(["1"], fetch=fetch, sleep=lambda s: None)
    assert out == {"1": states.STATE_GONE}


def test_requests_are_split_into_batches_of_hundred():
    fetch = fetch_of({"products": []})
    wb_card.prices([str(i) for i in range(250)], fetch=fetch, sleep=lambda s: None)
    assert fetch.calls["n"] == 3
    assert len(fetch.calls["params"][0]["nm"].split(";")) == 100
    assert len(fetch.calls["params"][2]["nm"].split(";")) == 50


def test_cards_returns_passport():
    fetch = fetch_of({"products": [product(7, 1000)]})
    out = wb_card.cards(["7"], fetch=fetch, sleep=lambda s: None)
    assert out["7"]["brand"] == "B"
    assert out["7"]["supplier_id"] == 1


def test_custom_convert_keeps_the_rounding_a_consumer_already_uses():
    """Своё правило округления важнее «правильного»: история не должна съехать."""
    fetch = fetch_of({"products": [product(1, 57050)]})
    out = wb_card.prices(["1"], convert=lambda kopeks: round(kopeks / 100),
                         fetch=fetch, sleep=lambda s: None)
    assert out == {"1": 570}


def test_without_wallet_price_is_roubles():
    fetch = fetch_of({"products": [product(1, 57099)]})
    out = wb_card.prices(["1"], wallet=False, fetch=fetch, sleep=lambda s: None)
    assert out == {"1": 570}
