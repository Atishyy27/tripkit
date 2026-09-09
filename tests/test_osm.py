"""
OpenStreetMap parsing and the cross-check against researched hours.

No network here. Live calls live in tests/test_live.py, which is opt in.
"""
import pytest

from tripkit.osm import build_query, _hours, to_places, coverage, crosscheck


class TestQuery:
    def test_is_valid_overpass_ql(self):
        q = build_query(26.4869, 74.5511, 3000)
        assert q.startswith("[out:json]")
        assert q.rstrip().endswith("out center tags;")
        assert q.count("(") == q.count(")")

    def test_asks_for_way_centres_so_buildings_get_a_usable_point(self):
        assert "out center tags" in build_query(0, 0, 100)

    def test_the_radius_and_position_land_in_the_query(self):
        q = build_query(26.4869, 74.5511, 1234)
        assert "around:1234,26.4869,74.5511" in q

    def test_covers_all_four_tag_families_plus_shops(self):
        q = build_query(0, 0, 100)
        for k in ("tourism", "amenity", "historic", "leisure", "shop"):
            assert f'["{k}"' in q


class TestHours:
    @pytest.mark.parametrize("raw,expected", [
        ("24/7",                          ("00:00", "23:59", None, None, None)),
        ("Mo-Su 09:00-22:00",             ("09:00", "22:00", None, None, None)),
        ("Mo-Fr 05:30-13:30,15:00-21:00", ("05:30", "21:00", ["13:30", "15:00"],
                                           [0, 1, 2, 3, 4], None)),
        ("9:00-17:00",                    ("09:00", "17:00", None, None, None)),
    ])
    def test_flattens_the_shapes_it_understands(self, raw, expected):
        assert _hours(raw) == expected

    def test_keeps_a_holiday_clause_as_a_note_instead_of_failing(self):
        o, c, shut, days, note = _hours("Mo-Sa 10:00-18:00; PH off")
        assert (o, c) == ("10:00", "18:00")
        assert days == [0, 1, 2, 3, 4, 5], "Mo-Sa excludes Sunday and that must survive"
        assert note == "PH off"

    def test_keeps_several_holiday_clauses(self):
        o, c, _, days, note = _hours("Tu-Su 10:00-17:00; PH off; SH Mo-Su 09:00-18:00")
        assert (o, c) == ("10:00", "17:00")
        assert "SH" in note

    def test_keeps_the_weekday_restriction_rather_than_discarding_it(self):
        """
        The day selector used to be matched and thrown away, so "Mo-Fr 09:00-17:00"
        was reported as open at ten o'clock on a Sunday. Measured against 1,026 live
        OpenStreetMap values, 300 of the 513 this parser flattened were shut on at
        least one day it called them open.
        """
        assert _hours("Mo-Fr 09:00-17:00")[3] == [0, 1, 2, 3, 4]
        assert _hours("Sa-Su 10:00-18:00")[3] == [5, 6]
        assert _hours("Mo,We,Fr 10:00-16:00")[3] == [0, 2, 4]
        assert _hours("Mo-Su 10:00-24:00")[3] is None, "every day is carried as no restriction"
        assert _hours("Mo-Su,PH 10:00-17:30")[3] is None, "a holiday token must not narrow the week"
        assert _hours("09:00-17:00")[3] is None, "no selector at all means every day"

    def test_a_holiday_clause_that_also_opens_the_weekend_is_not_a_footnote(self):
        """
        "PH,Sa,Su 11:30-23:30" starts with PH but also opens the place on Saturday and
        Sunday. Treating it as an aside and keeping "Mo-Fr" as the truth would report a
        Saturday as shut when it is open, so the whole value refuses to flatten instead.
        """
        o, c, shut, days, note = _hours("Mo-Fr 13:30-22:30; PH,Sa,Su 11:30-23:30")
        assert o is None and c is None
        assert note == "Mo-Fr 13:30-22:30; PH,Sa,Su 11:30-23:30"

    @pytest.mark.parametrize("raw", [
        "Apr-Sep: Mo-Su sunrise-sunset",
        "Mo-Fr 08:00-12:00; Sa 09:00-13:00; Su 10:00-14:00",
        "sunrise-sunset",
        # A seasonal rule that DOES carry clock times. The old suite only tested the
        # sunrise-relative shape, which was refused for having no digits in it, so
        # this case sailed through and summer-only hours were reported all year.
        "Apr-Oct 09:00-18:00",
    ])
    def test_refuses_to_flatten_what_it_cannot_represent(self, raw):
        o, c, shut, days, note = _hours(raw)
        assert o is None and c is None
        assert note == raw, "the original string must survive so a human can read it"

    @pytest.mark.parametrize("raw", [None, "", 42, []])
    def test_junk_input_gives_nothing(self, raw):
        assert _hours(raw) == (None, None, None, None, None)


class TestToPlaces:
    ELEMENTS = [
        {"type": "node", "id": 1, "lat": 26.48, "lon": 74.55,
         "tags": {"name": "Brahma Temple", "amenity": "place_of_worship",
                  "opening_hours": "Mo-Su 05:30-13:30,15:00-21:00", "wikidata": "Q123"}},
        {"type": "way", "id": 2, "center": {"lat": 26.49, "lon": 74.56},
         "tags": {"name": "A Park", "leisure": "park", "fee": "no",
                  "description": "Quiet in the mornings.", "website": "https://example.com"}},
        {"type": "node", "id": 3, "lat": 26.47, "lon": 74.54, "tags": {"amenity": "cafe"}},
        {"type": "node", "id": 4, "lat": 26.47, "lon": 74.54,
         "tags": {"name": "Postbox", "amenity": "post_box"}},
        {"type": "node", "id": 5, "tags": {"name": "Nowhere", "tourism": "museum"}},
        {"type": "node", "id": 6, "lat": 26.5, "lon": 74.5,
         "tags": {"name": "Seasonal Castle", "historic": "castle",
                  "opening_hours": "Apr-Oct: Mo-Su 10:00-18:00"}},
    ]

    @pytest.fixture(scope="class")
    def places(cls):
        return to_places(TestToPlaces.ELEMENTS, "pushkar")

    def test_keeps_only_named_positioned_visitor_relevant_things(self, places):
        assert [p["name"] for p in places] == ["Brahma Temple", "A Park", "Seasonal Castle"]

    def test_uses_a_way_centre_as_the_position(self, places):
        assert places[1]["lat"] == pytest.approx(26.49)

    def test_coordinates_from_osm_are_never_marked_approximate(self, places):
        assert all(p["loose"] is False for p in places)

    def test_midday_closure_survives(self, places):
        assert places[0]["shut"] == ["13:30", "15:00"]

    def test_fee_no_becomes_free_and_tagged(self, places):
        assert places[1]["lo"] == 0 and places[1]["hi"] == 0
        assert "free" in places[1]["tags"]

    def test_an_unknown_fee_stays_unknown_rather_than_becoming_free(self, places):
        assert places[0]["lo"] is None, "no fee tag means unknown, not free"

    def test_a_description_is_carried_over(self, places):
        assert "Quiet in the mornings" in places[1]["why"]

    def test_an_unparseable_hours_string_becomes_a_visible_warning(self, places):
        castle = places[2]
        assert castle["open"] is None
        assert "Apr-Oct" in castle["warn"]

    def test_every_place_links_back_to_its_osm_object(self, places):
        for p in places:
            assert p["src"].startswith("https://www.openstreetmap.org/")


class TestCoverage:
    def test_reports_the_real_fraction(self):
        c = coverage([{"_raw_hours": "x", "open": "09:00"},
                      {"_raw_hours": "weird", "open": None},
                      {"_raw_hours": None, "open": None}])
        assert c["total"] == 3
        assert c["with_hours_tag"] == 2
        assert c["parsed_into_fields"] == 1
        assert c["pct"] == pytest.approx(66.7, abs=0.1)

    def test_an_empty_set_does_not_divide_by_zero(self):
        assert coverage([])["pct"] == 0.0


class TestCrosscheck:
    def test_flags_a_disagreement_between_the_two_sources(self):
        hits = crosscheck(
            [{"name": "Brahma Temple", "open": "06:00", "close": "20:00"}],
            [{"name": "Brahma Temple", "open": "05:30", "close": "21:00",
              "_raw_hours": "Mo-Su 05:30-21:00", "src": "https://osm/1"}])
        assert len(hits) == 1
        assert hits[0]["llm"] == "06:00-20:00"
        assert hits[0]["osm"] == "05:30-21:00"

    def test_agreement_produces_nothing(self):
        assert crosscheck(
            [{"name": "Brahma Temple", "open": "05:30", "close": "21:00"}],
            [{"name": "Brahma Temple", "open": "05:30", "close": "21:00"}]) == []

    def test_only_compares_where_both_sides_actually_have_hours(self):
        assert crosscheck(
            [{"name": "X", "open": None}],
            [{"name": "X", "open": "09:00", "close": "17:00"}]) == []
        assert crosscheck(
            [{"name": "X", "open": "09:00", "close": "17:00"}],
            [{"name": "X", "open": None}]) == []

    def test_names_are_matched_loosely_enough_to_be_useful(self):
        hits = crosscheck(
            [{"name": "The Brahma Temple!", "open": "06:00", "close": "20:00"}],
            [{"name": "the brahma temple", "open": "05:30", "close": "21:00"}])
        assert len(hits) == 1
