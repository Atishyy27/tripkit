"""
U12: opening_hours coverage trend, the shaping logic in tools/build_coverage_trend.py.

Never hits live ohsome here: every case loads a saved response fixture from
tests/fixtures/. ohsome-ratio-munich.json and ohsome-ratio-empty-bbox.json were
both captured from real, live calls against api.ohsome.org (2026-09-10), not
hand-typed guesses at the shape, so a real quirk (see the NaN case below) is
exactly what caught a real bug in the first version of this parser.
"""
import json
import os

import pytest

from tools.build_coverage_trend import shape_years

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def load_fixture(name):
    with open(os.path.join(FIXTURES, name)) as f:
        return json.load(f)


class TestShapeYearsRealResponse:
    """Munich centre, amenity=restaurant, the exact numbers this unit must reproduce."""

    def setup_method(self):
        self.raw = load_fixture("ohsome-ratio-munich.json")["ratioResult"]
        self.years = shape_years(self.raw)

    def test_five_snapshots_in(self):
        assert len(self.years) == 5

    def test_years_pulled_from_the_timestamp(self):
        assert [y["year"] for y in self.years] == [2018, 2020, 2022, 2024, 2026]

    def test_total_and_with_hours_come_from_value_and_value2(self):
        first = self.years[0]
        assert first["total"] == 426
        assert first["withHours"] == 250

    def test_pct_is_computed_from_ratio_not_recomputed_from_the_counts(self):
        # ohsome already divides value2/value into `ratio`; this must be a
        # straight *100 and round, not an independent recomputation that could
        # silently diverge from what ohsome itself reported.
        first = self.years[0]
        assert first["pct"] == pytest.approx(58.7, abs=0.05)

    def test_reproduces_the_measured_munich_example(self):
        # This is the exact claim the unit brief says must reproduce: 58.7% in
        # 2018 rising to 86.2% in 2026.
        assert self.years[0]["pct"] == pytest.approx(58.7, abs=0.05)
        assert self.years[-1]["pct"] == pytest.approx(86.2, abs=0.05)
        assert self.years[-1]["pct"] > self.years[0]["pct"]

    def test_counts_are_ints_not_floats(self):
        # ohsome sends 426.0; the shaped output should not carry that decimal
        # through to a UI that will print it as "426.0 restaurants".
        for y in self.years:
            assert isinstance(y["total"], int)
            assert isinstance(y["withHours"], int)


class TestShapeYearsZeroDenominator:
    """A real captured response from an empty ocean bbox: value=value2=0, ratio="NaN".

    ohsome sends the JSON STRING "NaN" here, not a number and not -1. The
    first version of shape_years assumed -1 and would have raised a
    TypeError comparing a string to an int the first time this shipped
    against a genuinely thin town; this fixture is what caught it.
    """

    def setup_method(self):
        self.raw = load_fixture("ohsome-ratio-empty-bbox.json")["ratioResult"]
        self.years = shape_years(self.raw)

    def test_does_not_raise(self):
        assert len(self.years) == 3

    def test_pct_is_none_not_a_fabricated_zero(self):
        # 0% coverage and "we don't know" are different claims. A bbox with no
        # restaurants at all has no coverage rate to report, so this must be
        # None rather than a misleading 0.0.
        for y in self.years:
            assert y["pct"] is None

    def test_total_and_with_hours_still_come_through_as_zero(self):
        for y in self.years:
            assert y["total"] == 0
            assert y["withHours"] == 0


class TestShapeYearsMalformedInput:
    def test_empty_list_in_empty_list_out(self):
        assert shape_years([]) == []

    def test_a_point_missing_a_field_is_skipped_not_fatal(self):
        raw = [
            {"timestamp": "2018-01-01T00:00:00Z", "value": 10, "value2": 5, "ratio": 0.5},
            {"timestamp": "2020-01-01T00:00:00Z", "value": 12},   # missing value2 and ratio
            {"timestamp": "2022-01-01T00:00:00Z", "value": 15, "value2": 9, "ratio": 0.6},
        ]
        years = shape_years(raw)
        assert [y["year"] for y in years] == [2018, 2022]

    def test_a_missing_timestamp_is_skipped(self):
        raw = [{"value": 10, "value2": 5, "ratio": 0.5}]
        assert shape_years(raw) == []
