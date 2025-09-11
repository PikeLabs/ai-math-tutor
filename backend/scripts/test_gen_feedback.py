#!/usr/bin/env python3
"""
Smoke-test for services.feedback_service.generate_feedback

- No real OpenAI calls (transcription & chat are stubbed)
- No real audio/S3 work (audio slicing is stubbed)
- Verifies per-slide Q&A mapping (1 QA per slide, question pulled from messages)
"""

import os, json, re
from types import SimpleNamespace

# --- Ensure the module imports cleanly (OPENAI_API_KEY checked on import) ---
os.environ.setdefault("OPENAI_API_KEY", "test-key")

# Import the service AFTER the env var
from services import feedback_service as fs  # noqa: E402


# ----------------------------
# Monkeypatches / stubs
# ----------------------------
class FakeAudioSegment:
    """Minimal stub to satisfy .from_file(), len(), slicing [start:end], and .export()"""

    def __init__(self, dur_ms=60000):
        self._dur = int(dur_ms)

    @classmethod
    def from_file(cls, path, format=None):
        # pretend it's a 60s clip
        return cls(60000)

    def __len__(self):
        return self._dur

    def __getitem__(self, s):
        # s is a slice with ms-based indices
        start = 0 if s.start is None else int(s.start)
        stop = self._dur if s.stop is None else int(s.stop)
        return FakeAudioSegment(max(0, stop - start))

    def export(self, dst, format="wav"):
        # write a tiny fake wav header-ish blob
        with open(dst, "wb") as f:
            f.write(
                b"RIFF\x00\x00\x00\x00WAVEfmt "
            )  # not a valid wav, but good enough for our test stub
        return SimpleNamespace(name=dst)


def _fake_transcribe(path):
    """
    Return different text for slide vs QA files so we can see mapping clearly.
    We detect QA windows by filenames like ...'.qa{idx}.wav'
    """
    base = os.path.basename(path)
    m = re.search(r"\.qa(\d+)\.wav$", base)
    if m:
        idx = int(m.group(1))
        return f"Answer for QA window #{idx}"
    # otherwise treat as a slide/presentation transcription
    return (
        "This is a dummy presentation transcript with enough words to be split "
        "across three slides and let the feedback generator run."
    )


def _fake_generate_slide_feedback(
    slide_num, slide_audio_data, slide_content, conversation_history
):
    # Text structured exactly how parse_slide_feedback expects
    return f"""**Slide {slide_num}:**
- Content structuring: ✓ - Clear point made on slide {slide_num}
- Delivery: ✗ - Rushed at times on slide {slide_num}
- Impromptu response: N/A - Evaluated in the Q&A section
- Composure: N/A - Evaluated in the Q&A section"""


def _fake_split_audio_by_timestamps(audio_path, slide_timestamps):
    # Force code path that splits the *full* transcript evenly across slides
    # (so we don't rely on real audio slicing in this test)
    return []


# Apply monkeypatches to the imported module
fs.AudioSegment = FakeAudioSegment
fs.AUDIO_PROCESSING_AVAILABLE = True  # allow the QA-slicing block to run
fs.transcribe_recording = _fake_transcribe
fs.generate_slide_feedback = _fake_generate_slide_feedback
fs.split_audio_by_timestamps = _fake_split_audio_by_timestamps


# ----------------------------
# Test inputs
# ----------------------------
messages = [
    {"role": "assistant", "content": "What's your core KPI on this slide?"},
    {"role": "user", "content": "We track weekly actives."},
    {"role": "assistant", "content": "How do you acquire users here?"},
    {"role": "user", "content": "Word of mouth."},
    {"role": "assistant", "content": "Unit economics for this slide?"},
    {"role": "user", "content": "Positive after month 2."},
]

slide_timestamps = [
    {"slideNumber": 1, "timestamp": 0.0},
    {"slideNumber": 2, "timestamp": 12.3},
    {"slideNumber": 3, "timestamp": 25.7},
]

qa_timestamps = [
    {"slideNumber": 1, "start": 31.0, "end": 36.0},
    {"slideNumber": 2, "start": 40.0, "end": 45.0},
    {"slideNumber": 3, "start": 50.0, "end": 54.5},
]


class FakeUpload:
    filename = "demo.webm"
    mimetype = "video/webm"

    def read(self):
        return b"FAKEAUDIO"


recording = FakeUpload()


# ----------------------------
# Run
# ----------------------------
out = fs.generate_feedback(
    conversation_history=messages,
    slide_content="Slide 1: Problem\nSlide 2: Solution\nSlide 3: Traction",
    presentation_recording=recording,
    slide_timestamps=slide_timestamps,
    pdf_session_id="pdfsess-123",
    pdf_slide_count=3,
    qa_timestamps=qa_timestamps,
    asset_session_id="sess-123",
    selected_assignment=None,
    student_name="Ava",
)

# Summarize the essentials (per-slide Q&A presence + composed QA transcript)
summary = {
    "slide_count": len(out.get("slides", [])),
    "slides": [
        {
            "slide_number": s.get("slide_number"),
            "has_qa": bool(s.get("qa")),
            "qa_transcript": s.get("qa_transcript"),
            "content_structuring": s.get("feedback", {}).get("content_structuring", {}),
            "delivery": s.get("feedback", {}).get("delivery", {}),
        }
        for s in out.get("slides", [])
    ],
    "overall": out.get("overall"),
}

print(json.dumps(summary, indent=2))
