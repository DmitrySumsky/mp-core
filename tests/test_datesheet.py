"""Раскладка листа: ручные колонки, вставка, чужие колонки, пропуски."""

from datetime import date

from mpcore import datesheet as ds

TODAY = date(2026, 8, 18)

# Шапка боевого вида: шесть колонок ведёт человек, дальше блок дат.
HEADER = ["Название", "Идентификатор", "Пометка", "Пометка 2", "Группа",
          "Средняя, 30 дн", "18.08", "11.08", "10.08"]


def test_col_letter():
    assert ds.col_letter(0) == "A"
    assert ds.col_letter(25) == "Z"
    assert ds.col_letter(26) == "AA"


def test_parse_date_never_lands_in_the_future():
    assert ds.parse_date("18.08", TODAY) == date(2026, 8, 18)
    # декабрьская дата в августе — это прошлый год, а не будущее
    assert ds.parse_date("31.12", TODAY) == date(2025, 12, 31)
    assert ds.parse_date("не дата", TODAY) is None


def test_date_columns_ignore_manual_columns():
    cols = ds.date_columns(HEADER, TODAY, first=2)
    assert cols == {6: date(2026, 8, 18), 7: date(2026, 8, 11), 8: date(2026, 8, 10)}
    assert 5 not in cols, "«Средняя, 30 дн» — не дата"


def test_find_column_by_header_not_by_letter():
    assert ds.find_column(HEADER, ("идентификатор", "артикул")) == 1
    assert ds.find_column(["Пометка", "Артикул ВБ"], ("артикул",)) == 1


def test_insert_position_is_before_first_dated_column():
    cols = ds.date_columns(HEADER, TODAY, first=2)
    assert ds.insert_position(HEADER, cols, article_col=1) == 6


def test_insert_position_when_no_dates_yet():
    header = ["Название", "Идентификатор", "Группа"]
    assert ds.insert_position(header, {}, article_col=1) == 3


def test_runs_of_jumps_over_alien_columns():
    # 9 — чужая колонка внутри блока дат: пишем вокруг неё двумя пробегами
    assert ds.runs_of([6, 7, 8, 10, 11]) == [(6, 8), (10, 11)]


def test_missing_dates_are_ordered_old_to_new():
    got = ds.missing_dates(date(2026, 8, 15), date(2026, 8, 18))
    assert got == [date(2026, 8, 16), date(2026, 8, 17), date(2026, 8, 18)]


def test_missing_dates_empty_when_up_to_date():
    assert ds.missing_dates(date(2026, 8, 18), date(2026, 8, 18)) == []


def test_gap_dates_find_holes_behind_the_freshest_column():
    """Дни позади свежей колонки обычной вставкой не догоняются никогда."""
    existing = {date(2026, 8, 18), date(2026, 8, 11), date(2026, 8, 10)}
    available = {date(2026, 8, d) for d in range(10, 19)}
    assert ds.gap_dates(existing, available) == [
        date(2026, 8, 12), date(2026, 8, 13), date(2026, 8, 14),
        date(2026, 8, 15), date(2026, 8, 16), date(2026, 8, 17)]


def test_gap_dates_never_grow_history_backwards():
    existing = {date(2026, 8, 17), date(2026, 8, 18)}
    available = {date(2026, 8, d) for d in range(1, 19)}
    assert ds.gap_dates(existing, available) == []


def test_hole_position_keeps_dates_in_order():
    cols = {6: date(2026, 8, 18), 7: date(2026, 8, 11)}
    assert ds.hole_position(cols, date(2026, 8, 14)) == 7
    assert ds.hole_position(cols, date(2026, 8, 9)) == 8


def test_row_values_keep_existing_when_source_is_silent():
    """Молчание источника не затирает уже собранное."""
    row = ["товар", "1", "", "", "", "", "100", "90"]
    cols = {6: date(2026, 8, 18), 7: date(2026, 8, 11)}
    got = ds.row_values(row, cols, {"2026-08-18": 111})
    assert got == [111, "90"]


def test_row_values_write_service_states_as_is():
    row = ["товар", "1", "", "", "", "", "", ""]
    cols = {6: date(2026, 8, 18)}
    got = ds.row_values(row, cols, {"2026-08-18": "нет в наличии"})
    assert got == ["нет в наличии"]
