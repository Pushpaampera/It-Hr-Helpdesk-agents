"""Vague-question detection (app/agents/clarify.py): pure word checks, no DB or LLM needed."""
import pytest

from app.agents import clarify


@pytest.mark.parametrize("query, subject", [
    ("i have an issue with the laptop", "laptop"),
    ("Laptop problem", "laptop"),
    ("hi, my computer is not working", "laptop"),
    ("help with wifi", "wifi"),
    ("question about leave", "leave"),
    ("issue with my salary", "pay"),
    ("outlook not working", "email"),
])
def test_vague_questions_are_detected(query, subject):
    found = clarify.find_vague_subject(query)
    assert found is not None and found.key == subject


@pytest.mark.parametrize("query", [
    "My laptop won't connect to the VPN, error 619",   # two subjects + error code
    "laptop keyboard not working",                     # names a symptom
    "my laptop is very slow",
    "how many sick days do I have left?",
    "reset my password",
    "I want to apply for leave next Monday",
    "i want a leave",                                  # a request, not a question
    "i need a laptop",
    "hi",
    "what's the weather like?",
])
def test_specific_or_unrelated_questions_are_not_vague(query):
    assert clarify.find_vague_subject(query) is None


def test_followup_is_combined_with_the_original_question():
    combined = clarify.combine_with_followup("i have an issue with the laptop", "it won't turn on")
    assert combined == "i have an issue with the laptop: it won't turn on"


def test_followup_about_a_different_subject_is_a_new_question():
    assert clarify.combine_with_followup("i have an issue with the laptop", "how do I reset my password?") is None


def test_every_subject_offers_options():
    for subject in clarify.SUBJECTS:
        assert 2 <= len(subject.options) <= 6


def test_hr_topics_are_not_asked_for_error_messages():
    leave = clarify.find_vague_subject("question about leave")
    assert "error" not in clarify.clarifying_reply(leave)
    laptop = clarify.find_vague_subject("laptop issue")
    assert "what's happening" in clarify.clarifying_reply(laptop)
