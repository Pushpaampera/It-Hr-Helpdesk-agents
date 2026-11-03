"""Splits an article body into ~300-500 token chunks, overlapping, splitting on headings first.

We approximate tokens as ~1.3x word count (a reasonable rule of thumb for English with a
BPE-style tokenizer), so target chunk size is expressed directly in words for simplicity.
"""
import re
from dataclasses import dataclass

TARGET_WORDS_MIN = 230  # ~300 tokens
TARGET_WORDS_MAX = 380  # ~500 tokens
OVERLAP_WORDS = 40

HEADING_RE = re.compile(r"^(#{1,3}\s+.+|[A-Z][A-Za-z0-9 /&'-]{2,60}:)$", re.MULTILINE)


@dataclass
class Chunk:
    text: str
    section: str
    chunk_index: int


def _split_sections(body: str) -> list[tuple[str, str]]:
    """Split on markdown-style headings ('## Heading') into (heading, section_text) pairs."""
    lines = body.strip().split("\n")
    sections: list[tuple[str, list[str]]] = []
    current_heading = "Overview"
    current_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#"):
            if current_lines:
                sections.append((current_heading, current_lines))
            current_heading = stripped.lstrip("#").strip()
            current_lines = []
        else:
            current_lines.append(line)
    if current_lines:
        sections.append((current_heading, current_lines))
    return [(h, "\n".join(ls).strip()) for h, ls in sections if "\n".join(ls).strip()]


def chunk_article(title: str, body: str) -> list[Chunk]:
    """Chunk by heading first; within an over-long section, slide a word window with overlap."""
    sections = _split_sections(body) or [("Overview", body.strip())]
    chunks: list[Chunk] = []
    idx = 0
    for heading, text in sections:
        words = text.split()
        if len(words) <= TARGET_WORDS_MAX:
            chunk_text = f"{title} — {heading}\n{text}" if heading != "Overview" else f"{title}\n{text}"
            chunks.append(Chunk(text=chunk_text, section=heading, chunk_index=idx))
            idx += 1
            continue

        start = 0
        while start < len(words):
            end = min(start + TARGET_WORDS_MAX, len(words))
            window = words[start:end]
            chunk_text = f"{title} — {heading}\n{' '.join(window)}"
            chunks.append(Chunk(text=chunk_text, section=heading, chunk_index=idx))
            idx += 1
            if end == len(words):
                break
            start = end - OVERLAP_WORDS
    return chunks
