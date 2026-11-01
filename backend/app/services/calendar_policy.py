"""Calendar helpers: national holidays, suggested term dates, day swaps.

Holidays are declared individually (the existing TermWindow options store the
dated list). This module only *suggests*: it derives common national holidays
for a country/year and a plausible start/end date for a term, so the
coordinator edits a proposal instead of typing a calendar from scratch.
Nothing here is authoritative; every date is stored as a normal holiday/swap
record and can be overridden.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """weekday: Monday=0. n=1 is the first such weekday."""
    days = [d for d in range(1, calendar.monthrange(year, month)[1] + 1)
            if date(year, month, d).weekday() == weekday]
    return date(year, month, days[n - 1])


def _last_weekday(year: int, month: int, weekday: int) -> date:
    days = [d for d in range(1, calendar.monthrange(year, month)[1] + 1)
            if date(year, month, d).weekday() == weekday]
    return date(year, month, days[-1])


def _observed(day: date) -> date:
    """US-style observed date: Saturday -> Friday, Sunday -> Monday."""
    if day.weekday() == 5:
        return day - timedelta(days=1)
    if day.weekday() == 6:
        return day + timedelta(days=1)
    return day


def national_holidays(year: int, country: str = "US") -> list[dict]:
    """Common national holidays for a year (advisory, not authoritative)."""
    country = (country or "US").upper()
    if country not in ("US", "USA", "UNITED STATES"):
        # A small, honest fallback: New Year, national day, Christmas.
        return [
            {"date": date(year, 1, 1).isoformat(), "label": "New Year's Day"},
            {"date": date(year, 12, 25).isoformat(), "label": "Christmas Day"},
        ]
    return [
        {"date": _observed(date(year, 1, 1)).isoformat(), "label": "New Year's Day"},
        {"date": _nth_weekday(year, 1, 0, 3).isoformat(), "label": "Martin Luther King Jr. Day"},
        {"date": _nth_weekday(year, 2, 0, 3).isoformat(), "label": "Presidents' Day"},
        {"date": _last_weekday(year, 5, 0).isoformat(), "label": "Memorial Day"},
        {"date": _observed(date(year, 6, 19)).isoformat(), "label": "Juneteenth"},
        {"date": _observed(date(year, 7, 4)).isoformat(), "label": "Independence Day"},
        {"date": _nth_weekday(year, 9, 0, 1).isoformat(), "label": "Labor Day"},
        {"date": _nth_weekday(year, 10, 0, 2).isoformat(), "label": "Indigenous Peoples' Day"},
        {"date": _observed(date(year, 11, 11)).isoformat(), "label": "Veterans Day"},
        {"date": _nth_weekday(year, 11, 3, 4).isoformat(), "label": "Thanksgiving"},
        {"date": _observed(date(year, 12, 25)).isoformat(), "label": "Christmas Day"},
    ]


def _next_weekday(day: date, weekday: int) -> date:
    delta = (weekday - day.weekday()) % 7
    return day + timedelta(days=delta)


def suggest_term_dates(
    year: int,
    term: str = "fall",
    *,
    weeks: int = 15,
    country: str = "US",
) -> dict:
    """Suggest a start/end date and the national holidays inside the range.

    Fall starts the Tuesday after Labor Day (a common US pattern) and runs
    ``weeks`` weeks. Spring starts the Tuesday after New Year's Day. Summer
    starts the Tuesday after Memorial Day. The coordinator can override every
    date; this is a proposal with its reasoning attached.
    """
    term = (term or "fall").lower()
    holidays = national_holidays(year, country)
    if term in ("fall", "autumn"):
        labor = _nth_weekday(year, 9, 0, 1)
        start = _next_weekday(labor + timedelta(days=1), 1)  # Tuesday
    elif term in ("spring", "winter"):
        new_year = date(year, 1, 1)
        start = _next_weekday(new_year + timedelta(days=1), 1)
    else:
        memorial = _last_weekday(year, 5, 0)
        start = _next_weekday(memorial + timedelta(days=1), 1)

    end = start + timedelta(days=max(1, weeks) * 7 - 1)
    in_range = [
        h for h in holidays
        if start.isoformat() <= h["date"] <= end.isoformat()
    ]
    # A Friday-after-Thanksgiving "follows Tuesday" swap is the classic
    # make-up pattern; suggest it only when Thanksgiving is in range.
    swaps = []
    for h in in_range:
        if h["label"] == "Thanksgiving":
            thanksgiving = date.fromisoformat(h["date"])
            friday = thanksgiving + timedelta(days=1)
            swaps.append({
                "date": friday.isoformat(),
                "follows": 1,  # Tuesday
                "label": "Friday follows Tuesday (Thanksgiving make-up)",
            })
    return {
        "term": term,
        "year": year,
        "weeks": weeks,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "country": country,
        "national_holidays": in_range,
        "suggested_swaps": swaps,
        "holiday_labels_in_range": [h["label"] for h in in_range],
        "note": (
            "Advisory only. Every holiday/swap is stored as an editable "
            "record; the coordinator can add local or religious holidays."
        ),
    }
