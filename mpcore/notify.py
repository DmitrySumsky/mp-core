"""Оповещения в мессенджер: нарезка длинных сообщений и адресность.

Два правила из боевой практики, без которых рассылка перестаёт читаться.

**Сообщение обязано само говорить, ПРО ЧТО оно.** Автор рассылки знает
контекст, получатель — нет: в один чат пишут несколько систем сразу, и
похожие по виду сообщения относятся к разным площадкам. Метка нужна
ПЕРВЫМ словом заголовка — в списке чатов и в пуше видно только начало
строки, и решение «моё / не моё» принимается, не открывая сообщение.

**При нарезке заголовок попадает только в первое сообщение**, а приходят
они пачкой — продолжения обязаны получать свою короткую шапку. Иначе
безадресной оказывается ровно половина рассылки.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request

API = "https://api.telegram.org/bot{token}/sendMessage"

LIMIT = 4000          # запас к потолку мессенджера в 4096 символов


def split_text(text: str, limit: int = LIMIT):
    """Нарезка по строкам: строку пополам не рвём."""
    parts, current = [], ""
    for line in (text or "").split("\n"):
        candidate = (current + "\n" + line) if current else line
        if len(candidate) > limit and current:
            parts.append(current)
            current = line
        else:
            current = candidate
    if current:
        parts.append(current)
    return parts or [""]


def with_headers(text: str, header: str, limit: int = LIMIT):
    """Куски с шапкой в каждом: первый — полная, дальше «продолжение k/n»."""
    body = split_text(text, limit)
    total = len(body)
    if total == 1:
        return [f"{header}\n{body[0]}" if header else body[0]]
    out = []
    for i, part in enumerate(body, start=1):
        cap = header if i == 1 else f"{header} — продолжение {i}/{total}"
        out.append(f"{cap}\n{part}" if header else part)
    return out


def parse_target(target: str):
    """«chat:thread» → (chat, thread|None). Тема необязательна."""
    target = str(target).strip()
    if ":" in target:
        chat, thread = target.rsplit(":", 1)
        if thread.isdigit():
            return chat, thread
    return target, None


def send(token: str, target: str, text: str, header: str = "",
         opener=urllib.request.urlopen, limit: int = LIMIT):
    """Отправка с нарезкой. Возвращает True, если ушли ВСЕ куски."""
    chat, thread = parse_target(target)
    ok = True
    for chunk in with_headers(text, header, limit):
        payload = {"chat_id": chat, "text": chunk,
                   "disable_web_page_preview": "true"}
        if thread:
            payload["message_thread_id"] = thread
        data = urllib.parse.urlencode(payload).encode()
        try:
            request = urllib.request.Request(API.format(token=token), data=data)
            with opener(request, timeout=30) as r:
                ok = json.loads(r.read()).get("ok", False) and ok
        except Exception:
            ok = False
    return ok
