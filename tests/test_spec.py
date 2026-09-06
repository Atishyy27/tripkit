"""Reading the trip spec. Bad input must fail with a message a human can act on."""
import datetime as dt
import textwrap

import pytest

from tripkit.spec import load, Spec, Place, SpecError, DEFAULT_SLICES


def write(tmp_path, body):
    p = tmp_path / "trip.yaml"
    p.write_text(textwrap.dedent(body), encoding="utf-8")
    return str(p)


MINIMAL = """
    trip:
      title: A trip
      places: [Pushkar]
      arrive: 2026-09-06T06:00
      depart: 2026-09-06T19:00
"""


class TestLoading:
    def test_minimal_spec(self, tmp_path):
        s = load(write(tmp_path, MINIMAL))
        assert s.title == "A trip"
        assert s.dest.name == "Pushkar"
        assert s.arrive.hour == 6 and s.depart.hour == 19

    def test_defaults_are_applied(self, tmp_path):
        s = load(write(tmp_path, MINIMAL))
        assert s.slices == DEFAULT_SLICES
        assert s.currency == "INR"
        assert s.parallel >= 1

    def test_a_place_can_be_a_string_or_a_mapping(self, tmp_path):
        s = load(write(tmp_path, """
            trip:
              title: t
              places:
                - Pushkar
                - {name: Ajmer, role: hub, lat: 26.45, lng: 74.63}
        """))
        assert [p.name for p in s.places] == ["Pushkar", "Ajmer"]
        assert s.places[1].lat == 26.45

    def test_a_hub_not_listed_in_places_is_added(self, tmp_path):
        s = load(write(tmp_path, """
            trip:
              title: t
              places: [Pushkar]
              hub: Ajmer
        """))
        assert s.hub_place is not None and s.hub_place.name == "Ajmer"

    @pytest.mark.parametrize("value", [
        "2026-09-06T06:00", "2026-09-06 06:00", "2026-09-06T06:00:00",
    ])
    def test_accepts_the_usual_datetime_shapes(self, tmp_path, value):
        s = load(write(tmp_path, f"""
            trip:
              title: t
              places: [X]
              arrive: {value}
              depart: 2026-09-06T19:00
        """))
        assert s.arrive.hour == 6


class TestValidation:
    def test_no_places_is_a_clear_error(self, tmp_path):
        with pytest.raises(SpecError, match="places"):
            load(write(tmp_path, "trip:\n  title: t\n  places: []\n"))

    def test_departure_before_arrival_is_rejected_with_a_hint(self, tmp_path):
        with pytest.raises(SpecError) as e:
            load(write(tmp_path, """
                trip:
                  title: t
                  places: [X]
                  arrive: 2026-09-06T19:00
                  depart: 2026-09-06T06:00
            """))
        assert "full dates" in str(e.value), "the message should say how to fix it"

    def test_an_unreadable_date_names_the_field(self, tmp_path):
        with pytest.raises(SpecError, match="arrive"):
            load(write(tmp_path, "trip:\n  title: t\n  places: [X]\n  arrive: sometime tuesday\n"))

    def test_a_bad_slice_name_is_rejected(self, tmp_path):
        with pytest.raises(SpecError, match="slice"):
            load(write(tmp_path, """
                trip: {title: t, places: [X]}
                research: {slices: ["Not A Slug!"]}
            """))

    def test_a_place_entry_with_no_name(self, tmp_path):
        with pytest.raises(SpecError, match="name"):
            load(write(tmp_path, "trip:\n  title: t\n  places:\n    - {role: hub}\n"))

    def test_a_yaml_list_at_the_top_level_is_rejected(self, tmp_path):
        with pytest.raises(SpecError, match="mapping"):
            load(write(tmp_path, "- one\n- two\n"))


class TestDerived:
    def test_single_day_detection(self):
        s = Spec(title="t", places=[Place("X")],
                 arrive=dt.datetime(2026, 9, 6, 6), depart=dt.datetime(2026, 9, 6, 19))
        assert s.is_single_day is True
        assert s.window_hours == 13.0

    def test_multi_day_detection(self):
        s = Spec(title="t", places=[Place("X")],
                 arrive=dt.datetime(2026, 10, 2, 9), depart=dt.datetime(2026, 10, 5, 17))
        assert s.is_single_day is False

    def test_a_spec_with_no_times_is_not_a_single_day(self):
        assert Spec(title="t", places=[Place("X")]).is_single_day is False

    def test_destination_is_the_first_place_when_no_role_is_set(self):
        s = Spec(title="t", places=[Place("A"), Place("B")])
        assert s.dest.name == "A"

    def test_destination_prefers_an_explicit_role(self):
        s = Spec(title="t", places=[Place("Hub", role="hub"), Place("Real", role="destination")])
        assert s.dest.name == "Real"

    def test_slug(self):
        assert Place("Ajmer Sharif Dargah!").slug == "ajmer-sharif-dargah"


class TestDescribe:
    def test_reads_as_a_sentence_a_model_can_use(self):
        s = Spec(title="t", country="India",
                 places=[Place("Pushkar"), Place("Ajmer", role="hub")], hub="Ajmer",
                 arrive=dt.datetime(2026, 9, 6, 6), depart=dt.datetime(2026, 9, 6, 19),
                 profile=["solo", "backpacker"])
        d = s.describe()
        assert d.startswith("A trip to Pushkar, Ajmer, India")
        assert "the same day at 19:00" in d
        assert "solo, backpacker" in d
        assert d.endswith(".")
        assert ".." not in d and " ," not in d

    def test_a_multi_day_trip_names_both_dates(self):
        s = Spec(title="t", places=[Place("Lisbon")],
                 arrive=dt.datetime(2026, 10, 2, 9), depart=dt.datetime(2026, 10, 5, 17))
        assert "the same day" not in s.describe()

    def test_a_bare_spec_still_produces_a_sentence(self):
        assert Spec(title="t", places=[Place("X")]).describe() == "A trip to X."
