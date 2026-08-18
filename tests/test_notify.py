"""Оповещения: адресная шапка в КАЖДОМ куске, нарезка по строкам."""

from mpcore import notify


def test_short_message_keeps_single_header():
    parts = notify.with_headers("строка", "МЕТКА · отчёт")
    assert parts == ["МЕТКА · отчёт\nстрока"]


def test_every_chunk_gets_its_own_header():
    """Без шапки в продолжениях половина рассылки приходит безадресной."""
    text = "\n".join(f"строка {i}" * 10 for i in range(40))
    parts = notify.with_headers(text, "МЕТКА · отчёт", limit=300)
    assert len(parts) > 1
    assert parts[0].startswith("МЕТКА · отчёт\n")
    for i, part in enumerate(parts[1:], start=2):
        assert part.startswith(f"МЕТКА · отчёт — продолжение {i}/{len(parts)}")


def test_split_never_breaks_a_line_in_half():
    text = "\n".join(["ровно двадцать знаков"] * 20)
    parts = notify.split_text(text, limit=100)
    restored = "\n".join(parts)
    assert restored == text
    for part in parts:
        assert not part.startswith(" ")


def test_parse_target_reads_optional_thread():
    assert notify.parse_target("-100123:45") == ("-100123", "45")
    assert notify.parse_target("-100123") == ("-100123", None)
    assert notify.parse_target("@channel") == ("@channel", None)


def test_send_reports_failure_of_any_chunk():
    sent = []

    class Response:
        def __init__(self, ok):
            self.ok = ok

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self):
            return b'{"ok": true}' if self.ok else b'{"ok": false}'

    def opener(request, timeout=None):
        sent.append(request.data)
        return Response(len(sent) < 2)

    text = "\n".join(["строка"] * 200)
    assert notify.send("token", "-100:7", text, "МЕТКА",
                       opener=opener, limit=200) is False
    assert len(sent) > 1
