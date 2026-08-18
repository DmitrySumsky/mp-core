"""Живая цена и данные карточки маркетплейса из публичной витрины.

Витрина отвечает без авторизации и без квоты, до 100 идентификаторов за
запрос. Это делает её опорным источником: она не зависит от тарифа
платной аналитики и годится для замеров чаще раза в сутки.

Чего у неё нет — истории: витрина знает только «сейчас». Поэтому она
закрывает сегодняшнюю колонку, а прошлые дни берутся из источника с
историей (см. `mpcore.mpstats`).

Цена с бонусом кошелька считается как ``floor(цена карточки × 0.98)`` —
именно floor, не round: 559 × 0.98 = 547.8 → 547. Сверено с платной
аналитикой на боевых данных, расхождений на спокойных днях 0–1 %.
"""

from __future__ import annotations

import math
import time

from . import states
from .http import EMPTY, chunked, get_json

CARD_URL = "https://card.wb.ru/cards/v4/detail"

USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "*/*",
    "Origin": "https://www.wildberries.ru",
    "Referer": "https://www.wildberries.ru/",
}

DEST_DEFAULT = "-1257786"        # регион замера; на цену влияет слабо
BATCH = 100                      # больше витрина за один запрос не отдаёт
WALLET_K = 0.98
PAUSE = 0.2


def wallet_price(kopeks: int, k: float = WALLET_K) -> int:
    """Цена с бонусом кошелька из копеек карточки. Именно floor."""
    return math.floor(kopeks / 100 * k)


def _product_kopeks(product: dict):
    """Цена предложения в копейках или None, если предложения нет."""
    for size in product.get("sizes") or []:
        value = (size.get("price") or {}).get("product")
        if value:
            return value
    return None


def prices(ids, dest: str = DEST_DEFAULT, wallet: bool = True,
           convert=None, fetch=get_json, sleep=time.sleep):
    """{идентификатор: цена | состояние} по всем позициям, пачками.

    Идентификатор, которого нет в ответе, — «нет карточки»; пришедший без
    цены — «нет в наличии»; целиком не отдавшаяся пачка не попадает в
    результат вообще (дырка замера не должна выглядеть как факт о товаре).

    `convert` — как из копеек получить число таблицы. По умолчанию цена с
    бонусом кошелька (`wallet=True`) или рубли отбрасыванием копеек. Свой
    пересчёт нужен там, где потребитель годами писал иначе: смена правила
    округления сдвинула бы всю историю на рубль и выглядела бы как сбой.
    """
    if convert is None:
        convert = wallet_price if wallet else (lambda kopeks: kopeks // 100)
    ids = [str(x) for x in ids]
    out: dict[str, object] = {}
    for chunk in chunked(ids, BATCH):
        data = fetch(CARD_URL, HEADERS, {
            "appType": "1", "curr": "rub", "spp": "30",
            "dest": dest, "nm": ";".join(chunk)})
        if data is None:
            continue                       # сбой пачки — молчим, а не врём
        if data is EMPTY:
            data = {}
        seen = set()
        for product in (data or {}).get("products") or []:
            key = str(product.get("id"))
            seen.add(key)
            kopeks = _product_kopeks(product)
            if kopeks:
                out[key] = convert(kopeks)
            else:
                out[key] = states.STATE_NONE
        for key in chunk:
            if key not in seen:
                out[key] = states.STATE_GONE
        sleep(PAUSE)
    return out


def cards(ids, dest: str = DEST_DEFAULT, fetch=get_json, sleep=time.sleep):
    """{идентификатор: {brand, name, supplier_id, subject_id}} — паспорт карточки."""
    ids = [str(x) for x in ids]
    out: dict[str, dict] = {}
    for chunk in chunked(ids, BATCH):
        data = fetch(CARD_URL, HEADERS, {
            "appType": "1", "curr": "rub", "spp": "30",
            "dest": dest, "nm": ";".join(chunk)})
        if data is None or data is EMPTY:
            continue
        for product in (data or {}).get("products") or []:
            out[str(product.get("id"))] = {
                "brand": product.get("brand") or "",
                "name": product.get("name") or "",
                "supplier_id": product.get("supplierId"),
                "subject_id": product.get("subjectId"),
            }
        sleep(PAUSE)
    return out
