"""
Normalising and deduplicating research output.

The bracket cases are the interesting ones. Matching on exact names leaves
"Pushkar Lake and the 52 ghats" and "Pushkar Lake (and the 52 ghats)" as two rows.
Stripping bracketed text before matching fixes that pair and breaks the opposite
one, collapsing "Ajmer Sharif Dargah" and "Ajmer Sharif Dargah (Khwaja Moinuddin
Chishti)" onto a four character key that then collides with everything.
"""
import pytest

from tripkit.merge import (merge_places, normalise_place, norm_name, keep_list,
                           stats, Report, _clean_time, _num)

TOWNS = ["pushkar", "ajmer"]
CENTRE = (26.4869, 74.5511)


def merge(batches, towns=TOWNS):
    return merge_places(batches, towns, towns[0], CENTRE)


class TestTimeCleaning:
    @pytest.mark.parametrize("raw,want", [
        ("09:00", "09:00"),
        ("9:00", "09:00"),
        ("5.30", "05:30"),
        ("9am", "09:00"),
        ("9 PM", "21:00"),
        ("24:00", "23:00"),          # clamped rather than rejected outright
    ])
    def test_parses_common_shapes(self, raw, want):
        assert _clean_time(raw) == want

    @pytest.mark.parametrize("raw", [None, "", "null", "none", "n/a", "-", "whenever", "sunset"])
    def test_returns_none_rather_than_guessing(self, raw):
        assert _clean_time(raw) is None


class TestNumberCleaning:
    @pytest.mark.parametrize("raw,want", [
        (200, 200.0), ("200", 200.0), ("₹200", 200.0),
        ("1,200", 1200.0), ("about 50 rupees", 50.0), (None, None),
        ("free", None), (True, None),   # bool is not a price
    ])
    def test_extracts_a_number_or_nothing(self, raw, want):
        assert _num(raw) == want


class TestNormalise:
    def test_drops_an_entry_with_no_name(self):
        rep = Report()
        assert normalise_place({"town": "pushkar"}, TOWNS, "pushkar", CENTRE, rep) is None
        assert rep.dropped == 1

    def test_unknown_town_falls_back_to_the_destination(self):
        rep = Report()
        p = normalise_place({"name": "x", "town": "narnia"}, TOWNS, "pushkar", CENTRE, rep)
        assert p["town"] == "pushkar"

    def test_missing_coordinates_get_the_centre_and_are_marked_approximate(self):
        rep = Report()
        p = normalise_place({"name": "x"}, TOWNS, "pushkar", CENTRE, rep)
        assert (p["lat"], p["lng"]) == CENTRE
        assert p["loose"] is True

    def test_impossible_coordinates_are_treated_as_missing(self):
        rep = Report()
        p = normalise_place({"name": "x", "lat": 999, "lng": 999}, TOWNS, "pushkar", CENTRE, rep)
        assert p["loose"] is True

    def test_swapped_price_range_is_corrected(self):
        rep = Report()
        p = normalise_place({"name": "x", "lo": 500, "hi": 100}, TOWNS, "pushkar", CENTRE, rep)
        assert (p["lo"], p["hi"]) == (100.0, 500.0)

    def test_a_non_http_source_is_discarded(self):
        rep = Report()
        p = normalise_place({"name": "x", "src": "I remember reading it"},
                            TOWNS, "pushkar", CENTRE, rep)
        assert p["src"] is None

    def test_an_absurd_duration_is_replaced_with_a_default(self):
        rep = Report()
        assert normalise_place({"name": "x", "dur": 99999}, TOWNS, "pushkar", CENTRE, rep)["dur"] == 30
        assert normalise_place({"name": "y", "dur": 0}, TOWNS, "pushkar", CENTRE, rep)["dur"] == 30

    def test_a_half_written_shut_window_is_dropped_not_half_used(self):
        rep = Report()
        p = normalise_place({"name": "x", "shut": ["13:30"]}, TOWNS, "pushkar", CENTRE, rep)
        assert p["shut"] is None


class TestDedupe:
    def test_bracketed_variant_merges_with_the_plain_name(self):
        places, rep = merge({"a": [{"name": "Pushkar Lake and the 52 ghats", "lat": 26.4, "lng": 74.5}],
                             "b": [{"name": "Pushkar Lake (and the 52 ghats)", "open": "00:00"}]})
        assert len(places) == 1
        assert rep.merged == 1
        assert places[0]["open"] == "00:00", "the merge must carry the field the other row had"

    def test_a_long_parenthetical_suffix_merges_too(self):
        places, _ = merge({"a": [{"name": "Ajmer Sharif Dargah", "town": "ajmer", "open": "04:00"}],
                           "b": [{"name": "Ajmer Sharif Dargah (Khwaja Moinuddin Chishti)",
                                  "town": "ajmer", "close": "21:00"}]})
        assert len(places) == 1
        assert places[0]["open"] == "04:00" and places[0]["close"] == "21:00"

    def test_different_activities_at_one_venue_stay_separate(self):
        places, _ = merge({"a": [
            {"name": "Xcapade Adventures - Zipline"},
            {"name": "Xcapade Adventures - Quad Biking"},
        ]})
        assert len(places) == 2, "these are two things you can do, not one duplicated row"

    def test_short_names_are_not_fuzzy_matched(self):
        places, _ = merge({"a": [{"name": "Om"}, {"name": "Omar"}]})
        assert len(places) == 2, "a three letter overlap is coincidence, not a duplicate"

    def test_tags_are_unioned_rather_than_first_writer_wins(self):
        places, _ = merge({"a": [{"name": "Pushkar Lake ghats", "tags": ["free"]}],
                           "b": [{"name": "Pushkar Lake ghats", "tags": ["sunrise"]}]})
        assert set(places[0]["tags"]) == {"free", "sunrise"}

    def test_a_populated_field_is_never_overwritten_by_a_later_empty_one(self):
        places, _ = merge({"a": [{"name": "Brahma Temple", "why": "the real description"}],
                           "b": [{"name": "Brahma Temple", "why": ""}]})
        assert places[0]["why"] == "the real description"

    def test_ids_are_unique_even_when_names_collide_after_slugging(self):
        places, _ = merge({"a": [{"name": "Cafe One!"}, {"name": "Cafe: One"}, {"name": "Totally Other"}]})
        ids = [p["id"] for p in places]
        assert len(ids) == len(set(ids))


class TestNormName:
    def test_drops_the_place_name_and_generic_words(self):
        assert norm_name("Shri Brahma Temple, Pushkar", {"pushkar"}) == "brahma"

    def test_keeps_bracketed_words_so_keys_stay_specific(self):
        assert "khwaja" in norm_name("Dargah (Khwaja Moinuddin)", {"ajmer"})

    def test_never_returns_empty_for_a_name_made_only_of_filler(self):
        assert norm_name("The Temple", {"pushkar"}) != ""


class TestKeepList:
    def test_drops_rows_missing_every_required_field(self):
        rows = [{"situation": "a", "say": "b"}, {"nothing": "useful"}, "not a dict"]
        assert len(keep_list(rows, ("situation", "say"))) == 1

    def test_a_non_list_gives_an_empty_list_rather_than_raising(self):
        assert keep_list({"a": 1}, ("name",)) == []


class TestStats:
    def test_counts_what_the_ui_promises(self):
        places, _ = merge({"a": [
            {"name": "With hours", "open": "09:00", "src": "https://x", "lat": 1, "lng": 1, "cat": "view"},
            {"name": "Bare one", "cat": "food"},
        ]})
        s = stats(places)
        assert s["total"] == 2
        assert s["with_hours"] == 1
        assert s["with_src"] == 1
        assert s["exact_coords"] == 1
        assert s["by_cat"] == {"food": 1, "view": 1}
