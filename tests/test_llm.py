"""
JSON recovery from model output.

Every case here is derived from something that actually happened. The truncation
tests exist because a cut-off thirty-entry array silently became a single entry,
parsed cleanly, and was logged as a success, which is the worst failure shape
there is: wrong output that looks right.
"""
import pytest

from tripkit.llm import extract_json, LLMError, MODELS


class TestCleanInput:
    def test_plain_array(self):
        assert extract_json('[{"a": 1}, {"a": 2}]') == [{"a": 1}, {"a": 2}]

    def test_plain_object(self):
        assert extract_json('{"a": 1}') == {"a": 1}

    def test_leading_and_trailing_whitespace(self):
        assert extract_json('\n\n  [1, 2, 3]  \n') == [1, 2, 3]


class TestWrappedInProse:
    def test_fenced_with_language(self):
        assert extract_json('Sure!\n```json\n{"a": 1}\n```\nHope that helps') == {"a": 1}

    def test_fenced_without_language(self):
        assert extract_json('```\n[1, 2]\n```') == [1, 2]

    def test_prose_either_side(self):
        assert extract_json('Here you go: [{"n": "x"}] and that is all') == [{"n": "x"}]

    def test_braces_inside_strings_do_not_confuse_the_matcher(self):
        out = extract_json('note: [{"why": "use {braces} and [brackets] freely"}] done')
        assert out[0]["why"] == "use {braces} and [brackets] freely"

    def test_escaped_quote_inside_a_string(self):
        out = extract_json(r'[{"why": "she said \"go early\""}]')
        assert out[0]["why"] == 'she said "go early"'


class TestTruncation:
    """The failure that shipped. A partial parse is worse than no parse."""

    def test_truncated_array_raises_rather_than_returning_one_element(self):
        text = '[{"name": "a"}, {"name": "b"}, {"name": "c'
        with pytest.raises(LLMError) as e:
            extract_json(text)
        assert "array" in str(e.value).lower()

    def test_truncated_array_does_not_fall_back_to_the_first_object(self):
        text = '[{"name": "first"}, {"name": "second"'
        with pytest.raises(LLMError):
            extract_json(text)

    def test_truncated_array_inside_a_fence_also_raises(self):
        with pytest.raises(LLMError):
            extract_json('```json\n[{"a": 1}, {"a": 2}\n')

    def test_a_genuine_object_response_is_still_accepted(self):
        # conditions slices legitimately return one object, so the guard must not
        # reject every object it sees
        assert extract_json('Here: {"sunrise": "06:12"}') == {"sunrise": "06:12"}


class TestBadInput:
    def test_empty(self):
        with pytest.raises(LLMError, match="empty"):
            extract_json("")

    def test_whitespace_only(self):
        with pytest.raises(LLMError):
            extract_json("   \n  ")

    def test_no_json_at_all(self):
        with pytest.raises(LLMError):
            extract_json("I could not find anything about that place.")

    def test_error_message_shows_the_start_of_the_response(self):
        with pytest.raises(LLMError) as e:
            extract_json("total nonsense here")
        assert "nonsense" in str(e.value)


class TestModelAliases:
    def test_friendly_names_map_to_real_ids(self):
        assert MODELS["sonnet"].startswith("claude-")
        assert MODELS["opus"].startswith("claude-")
        assert MODELS["haiku"].startswith("claude-")

    def test_every_alias_is_distinct(self):
        assert len(set(MODELS.values())) == len(MODELS)
