"""Раскладка «строка = сущность, столбец = дата» — общий скелет всех таблиц.

Почему именно так, а не журналом «дата, сущность, значение»: при 200
сущностях и 12 замерах в день плоский журнал даёт около 7,9 млн ячеек в
год при потолке листа 10 млн, а раскладка по датам — примерно 0,9 млн.

Устройство листа:

* слева — колонки, которые ведёт ЧЕЛОВЕК (название, идентификатор, свои
  пометки и формулы). Их число не фиксировано: люди добавляют свои;
* дальше — блок дат, свежая СЛЕВА;
* внутри блока может оказаться чужая колонка без даты (человек вставил
  формулу) — её содержимое трогать нельзя.

Отсюда три правила, которые здесь и живут:

1. колонки ищутся ПО ШАПКЕ, а не по буквам: вставленная человеком колонка
   иначе уводит запись на соседнее поле;
2. новая дата встаёт перед первой ДАТИРОВАННОЙ колонкой, а не в жёсткое
   место, — тогда ручной блок слева остаётся на месте;
3. писать только в свои колонки, диапазонами-пробегами вокруг чужих.

Модуль намеренно не знает ни про какой API таблиц: здесь чистые функции
над шапкой и датами, их можно проверить без сети.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

FIRST_DATE_COL = 4      # запасная граница, если дат в шапке ещё нет (колонка D)

DATE_FORMATS = ("%d.%m.%Y", "%d.%m.%y", "%d.%m")


def col_letter(index0: int) -> str:
    """0 → A, 25 → Z, 26 → AA."""
    out, i = "", index0 + 1
    while i:
        i, rest = divmod(i - 1, 26)
        out = chr(65 + rest) + out
    return out


def parse_date(text: str, today: date | None = None):
    """«17.08» → date. Год берётся так, чтобы дата не оказалась в будущем."""
    today = today or date.today()
    text = (text or "").strip()
    for fmt in ("%d.%m.%Y", "%d.%m.%y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    # «ДД.ММ» без года разбираем руками: у strptime такой разбор объявлен
    # устаревшим (Python 3.15), да и год он подставляет свой, а не наш.
    parts = text.split(".")
    if len(parts) == 2 and all(p.isdigit() for p in parts):
        day, month = int(parts[0]), int(parts[1])
        for year in (today.year, today.year - 1):
            try:
                parsed = date(year, month, day)
            except ValueError:
                return None
            if parsed <= today:
                return parsed
    return None


def date_columns(header, today: date | None = None, first: int | None = None):
    """{индекс колонки: date} — только там, где дата действительно разобралась."""
    lower = FIRST_DATE_COL - 1 if first is None else first
    out = {}
    for i, value in enumerate(header):
        if i < lower or not str(value).strip():
            continue
        parsed = parse_date(str(value), today)
        if parsed:
            out[i] = parsed
    return out


def find_column(header, words, default: int = 1) -> int:
    """Индекс колонки по слову в шапке. Регистр и хвосты не важны."""
    for i, value in enumerate(header):
        low = str(value).strip().lower()
        if any(word in low for word in words):
            return i
    return default


def insert_position(header, date_cols, article_col: int) -> int:
    """Куда встаёт новая дата: перед первой датированной колонкой.

    Дат ещё нет — сразу за последней заполненной колонкой шапки, а не в
    жёсткое место: иначе первая же дата врезалась бы в середину ручного
    блока.
    """
    if date_cols:
        return min(date_cols)
    tail = max((i for i, v in enumerate(header) if str(v).strip()),
               default=FIRST_DATE_COL - 2) + 1
    return max(FIRST_DATE_COL - 1, article_col + 1, tail)


def runs_of(indexes):
    """Подряд идущие индексы → [(начало, конец)].

    Нужно, чтобы писать диапазонами и перепрыгивать чужие колонки внутри
    блока дат, не задевая их содержимое.
    """
    runs = []
    for i in sorted(indexes):
        if runs and i == runs[-1][1] + 1:
            runs[-1][1] = i
        else:
            runs.append([i, i])
    return [(a, b) for a, b in runs]


def missing_dates(newest: date | None, latest: date):
    """Даты новее самой свежей колонки — от старой к новой."""
    if newest is None:
        return [latest]
    out = []
    day = latest
    while day > newest:
        out.append(day)
        day -= timedelta(days=1)
    return list(reversed(out))


def gap_dates(existing, available):
    """Пропуски ВНУТРИ блока дат — то, что обычная вставка слева не догоняет.

    Вставка идёт только с левого края, поэтому дни, оставшиеся позади самой
    свежей колонки, не заполняются уже никогда. А остаться без данных на
    несколько суток — штатный случай (исчерпанная квота, упавший прогон),
    значит долив обязан жить в логике, а не в разовом скрипте.

    Старее самой старой колонки таблица не растёт: берём строго то, что
    выше её нижней границы.
    """
    existing = set(existing)
    if not existing:
        return []
    oldest = min(existing)
    return sorted(day for day in set(available)
                  if day not in existing and day > oldest)


def hole_position(date_cols, hole: date) -> int:
    """Индекс, на который встаёт пропущенная дата, чтобы порядок не сломался.

    Даты идут свежими слева, поэтому пропуск встаёт перед первой колонкой,
    которая старее его самого.
    """
    older = [col for col, day in date_cols.items() if day < hole]
    if older:
        return min(older)
    return (max(date_cols) + 1) if date_cols else FIRST_DATE_COL - 1


def row_values(row, col_dates, history, columns=None):
    """Значения строки по колонкам: свежий замер, иначе прежнее содержимое.

    `col_dates` — {индекс колонки: date}, `history` — {дата (ISO): значение}.
    Молчание источника НИКОГДА не затирает уже собранное: иначе один
    неудачный прогон стирает историю, которую больше неоткуда взять.
    """
    out = []
    for col in (columns if columns is not None else sorted(col_dates)):
        day = col_dates.get(col)
        value = history.get(day.isoformat()) if day else None
        if value is None:
            value = row[col] if len(row) > col else ""
        out.append("" if value is None else value)
    return out
