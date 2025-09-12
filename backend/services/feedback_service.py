import os, tempfile, json, time, uuid, shutil
from typing import Optional, List, Dict
from openai import OpenAI

from services.database_service import upsert_slide_asset
from utils.workers import with_retry
from lib.aws import (
    upload_file,
    build_key,
    build_s3_filename,
    S3_AUDIO_SESSIONS_FOLDER,
    S3_SLIDE_IMAGES_FOLDER,
)
from services.pdf_image_service import cleanup_local_pdf_images, save_slide_images
from config.paths import AUDIO_SESSIONS_DIR, ASSIGNMENTS_DIR

# Try to import pydub, fallback if not available
try:
    from pydub import AudioSegment

    AUDIO_PROCESSING_AVAILABLE = True
    print("✅ Audio processing available")
except ImportError as e:
    print(f"⚠️ Audio processing not available: {e}")
    AudioSegment = None
    AUDIO_PROCESSING_AVAILABLE = False


AI_API_KEY = os.getenv("OPENAI_API_KEY")
TRANSCRIBE_MODEL = os.getenv("OPENAI_TRANSCRIBE_MODEL", "whisper-1")
CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-5")

if not AI_API_KEY:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

client = OpenAI(api_key=AI_API_KEY, timeout=60.0)


##### Helper functions #####
def _ensure_audio_directories():
    os.makedirs(AUDIO_SESSIONS_DIR, exist_ok=True)


def _normalize_slide_ranges(slide_timestamps):
    """
    Accepts either:
      1) [{slideNumber, timestamp}]  (seconds, start times only)
      2) [{slideNumber, startMs, endMs}]  (milliseconds)

    Returns list of dicts: [{slideNumber, start_ms, end_ms}]
    """
    if not slide_timestamps:
        return []

    # Case 2: already ranges (ms)
    if all("startMs" in t for t in slide_timestamps):
        out = []
        for t in slide_timestamps:
            start = max(0, int(t.get("startMs") or 0))
            end = t.get("endMs")
            end = int(end) if end is not None else None
            out.append(
                {
                    "slideNumber": int(t.get("slideNumber", 1)),
                    "start_ms": start,
                    "end_ms": end,
                }
            )
        return out

    # Case 1: start times (seconds) → derive end from next
    # Sort by timestamp; convert to ms
    items = sorted(slide_timestamps, key=lambda x: float(x.get("timestamp", 0.0)))
    out = []

    for i, t in enumerate(items):
        start_ms = int(float(t.get("timestamp", 0.0)) * 1000)

        # If this is the very last item, check for sentinel behavior
        if i == len(items) - 1 and i > 0:
            prev_slide = int(items[i - 1].get("slideNumber", 0) or 0)
            this_slide = int(t.get("slideNumber", 0) or 0)
            # Sentinel if it bumped slideNumber and has no “next”
            if this_slide > prev_slide:
                # Cap the prior segment’s end_ms at this sentinel boundary
                if out:
                    out[-1]["end_ms"] = max(0, start_ms)
                # No segment for the sentinel itself
                break

        next_ms = (
            int(float(items[i + 1]["timestamp"]) * 1000) if i + 1 < len(items) else None
        )
        out.append(
            {
                "slideNumber": int(t.get("slideNumber", 1)),
                "start_ms": max(0, start_ms),
                "end_ms": next_ms,
            }
        )

    return out


def _full_audio(audio_file_path):
    return [
        {
            "slideNumber": 1,
            "audio_path": audio_file_path,
            "start_time": 0,
            "end_time": None,
        }
    ]


def _concat_presentation_tx(slide_audio_transcripts) -> str:
    """
    # Build a rolled-up presentation transcript from slide transcripts (ordered)
    """
    if not slide_audio_transcripts:
        return ""

    ordered = [
        slide_audio_transcripts[k] for k in sorted(slide_audio_transcripts.keys())
    ]
    parts = [
        (s.get("transcript") or "").strip()
        for s in ordered
        if (s.get("transcript") or "").strip()
    ]

    return "\n\n".join(parts)


def _is_control_line(text: str) -> bool:
    if not text:
        return False
    t = text.strip()
    return (
        t.startswith("Thanks for those answers!")
        or t.startswith("Please click 'Next'")
        or "feedback is being generated" in t
    )


def _collect_assistant_questions(conversation_history):
    # Take assistant lines that are not control/closing lines
    out = []
    for m in conversation_history or []:
        if (m.get("role") == "assistant") and (m.get("content") or "").strip():
            c = m["content"].strip()
            if not _is_control_line(c):
                out.append(c)
    return out


def _label_for_student(student_name: str | None) -> str:
    return student_name.strip().upper() if student_name else "STUDENT"


def _compute_overall(structured: dict) -> dict:
    met = 0
    considered = 0

    def _bump(status: str):
        nonlocal met, considered
        if status in ("met", "not_met"):
            considered += 1
            if status == "met":
                met += 1

    # Slide LO’s
    for s in structured.get("slides") or []:
        fb = s.get("feedback") or {}
        for k in ("content_structuring", "delivery", "impromptu_response", "composure"):
            _bump((fb.get(k) or {}).get("status"))

    # (Optional) Top-level Q&A section, if used later
    qa = structured.get("qa_feedback") or {}
    for k in ("impromptu_response", "composure"):
        _bump((qa.get(k) or {}).get("status"))

    ratio = (met / considered) if considered else 0
    return {
        "met": met,
        "considered": considered,
        "score": int(round(ratio * 100)),
        "text": f"{met}/{considered} met" if considered else "No score",
    }


FEEDBACK_SYSTEM_PROMPT = """You are a tough, no-nonsense professor evaluating a student's startup pitch. You have three inputs: (1) the slide deck text and structure (SLIDES), (2) the spoken presentation transcript with any timestamps (AUDIO), and (3) the post-pitch conversation between the "VC" and the student (DIALOGUE). Your job is to deliver a single dense paragraph of blunt, specific feedback that maps directly to four learning objectives. Be candid, concrete, and harsh-but-fair; prioritize weaknesses and what to fix next. Avoid niceties, padding, or generic praise. No lists, no line breaks, no emojis.

Learning objectives:
1) Content structuring — the presentation outline should communicate a clear, logical argument.
2) Delivery — speech should be clear with confident body language cues and steady pacing.
3) Impromptu response — answers to questions should be concise and evidence-based on the spot.
4) Composure — responses to challenging or critical questions should remain professional.

Method:
• Use SLIDES to judge structure (ordering, throughline, slide density, evidence placement) and call out exact slide numbers/titles when possible.
• Use AUDIO to judge clarity, pacing (too fast/slow, filler words), emphasis, and places the student hedged or rambled; cite timestamps if available.
• Use DIALOGUE to judge the quality of answers, specificity of evidence (metrics, user quotes, experiments), and professionalism under pressure.
• Prefer concrete corrections: propose tighter slide ordering, sharper claims, metric thresholds, and exact sentence rewrites the student should say next time.
• Flag factual slippage, hand-waving, TAM math errors, misuse of jargon, or evasive answers. If data is missing, say exactly what data is needed.
• Do not soften language. No "maybe," "consider," "it might help." Be direct: "Do X. Remove Y. Replace Z with ____."

Output format (one paragraph, no line breaks): 
Start with "Content structuring:" then deliver a blunt verdict including a "Met: Yes/No" inline; specify the single biggest structural flaw, name the slide(s) causing it, and give a corrected outline in ≤20 words; include one exact rewrite of the core problem statement or value prop in quotes. Then "Delivery:" with Met: Yes/No; cite speaking issues with concrete evidence from AUDIO (timestamps if present), quantify filler ("~1 every 8 seconds"), and give a one-sentence delivery script the student should practice. Then "Impromptu response:" with Met: Yes/No; identify one question they dodged or over-answered from DIALOGUE, state what evidence was required (metric, source, or test), and provide a 2-sentence model answer in quotes. Then "Composure:" with Met: Yes/No; call out the sharpest moment of pressure (who asked, what was asked), describe the behavioral slip (defensive tone, meandering, contradiction), and give a one-sentence replacement response that acknowledges the critique and pivots to evidence. End the paragraph with a single "Next time, do this first:" clause naming the highest-leverage fix in ≤12 words.
"""


def transcribe_recording(audio_file_path):
    """
    Transcribe the full presentation recording using OpenAI Whisper
    """
    try:
        with open(audio_file_path, "rb") as f:

            def _call():
                return client.audio.transcriptions.create(
                    model=TRANSCRIBE_MODEL, file=f, response_format="text"
                )

            transcript = with_retry(_call)

        return transcript
    except Exception as e:
        raise Exception(f"Recording transcription error: {str(e)}")


def save_audio_segments(session_id, audio_segments):
    """
    Save audio segments to session directory and upload to S3 bucket.

    Args:
        session_id: Unique session identifier
        audio_segments: List of audio segment objects with paths

    Returns:
        Dictionary mapping slide numbers to saved audio file paths
    """
    try:
        _ensure_audio_directories()

        session_dir = os.path.join(AUDIO_SESSIONS_DIR, session_id)
        os.makedirs(session_dir, exist_ok=True)

        saved_segments = {}

        for segment in audio_segments:
            slide_number = segment["slideNumber"]
            temp_audio_path = segment["audio_path"]
            duration_ms = segment.get("duration_ms")

            # Copy to session directory with permanent name
            permanent_path = os.path.join(session_dir, f"slide_{slide_number}.wav")
            shutil.copy2(temp_audio_path, permanent_path)

            s3_key = None
            try:
                audio_filename = build_s3_filename(slide_number, "audio")
                s3_key = build_key(
                    session_id,
                    audio_filename,
                    subdir=S3_AUDIO_SESSIONS_FOLDER,
                )

                upload_file(permanent_path, s3_key, content_type="audio/wav")
                upsert_slide_asset(
                    session_id=session_id,
                    slide_number=slide_number,
                    kind="audio",
                    s3_key=s3_key,
                    mime_type="audio/wav",
                    duration_ms=duration_ms,
                )

            except Exception as e:
                print(f"⚠️ Failed to upload audio segment {permanent_path} to S3: {e}")

            # Remove local copy
            try:
                if os.path.exists(permanent_path):
                    os.remove(permanent_path)
            except Exception as e:
                print(f"⚠️ Failed to delete local audio segment {permanent_path}: {e}")

            saved_segments[slide_number] = {
                "s3_key": s3_key,
                "mime": "audio/wav",
                "duration_ms": duration_ms,
            }

        # Save session metadata
        metadata = {
            "created_at": time.time(),
            "slide_count": len(saved_segments),
            "slides": list(saved_segments.keys()),
        }

        metadata_path = os.path.join(session_dir, "metadata.json")
        with open(metadata_path, "w") as f:
            json.dump(metadata, f)

        print(f"✅ Saved {len(saved_segments)} audio segments for session {session_id}")
        return saved_segments

    except Exception as e:
        print(f"❌ Error saving audio segments: {e}")
        return {}


def cleanup_session_audio(session_id):
    """Remove all audio files for a specific session"""
    try:
        session_dir = os.path.join(AUDIO_SESSIONS_DIR, session_id)
        if os.path.exists(session_dir):
            shutil.rmtree(session_dir)
            print(f"🗑️ Cleaned up audio for session {session_id}")
    except Exception as e:
        print(f"⚠️ Error cleaning up audio for session {session_id}: {e}")


def cleanup_old_audio_sessions(max_age_hours=24):
    """Remove old audio session directories"""
    if not os.path.exists(AUDIO_SESSIONS_DIR):
        return

    try:
        current_time = time.time()
        cutoff_time = current_time - (max_age_hours * 3600)

        for session_dir in os.listdir(AUDIO_SESSIONS_DIR):
            session_path = os.path.join(AUDIO_SESSIONS_DIR, session_dir)
            if os.path.isdir(session_path):
                # Check metadata for creation time
                metadata_path = os.path.join(session_path, "metadata.json")
                if os.path.exists(metadata_path):
                    try:
                        with open(metadata_path, "r") as f:
                            metadata = json.load(f)
                        creation_time = metadata.get("created_at", 0)
                        if creation_time < cutoff_time:
                            cleanup_session_audio(session_dir)
                    except:
                        # If metadata is corrupted, check directory creation time
                        creation_time = os.path.getctime(session_path)
                        if creation_time < cutoff_time:
                            cleanup_session_audio(session_dir)

    except Exception as e:
        print(f"⚠️ Error during audio cleanup: {e}")


def split_audio_by_timestamps(
    audio_file_path,
    slide_timestamps,
):
    """
    Split audio into segments based on slide timestamps

    Args:
        audio_file_path: Path to the full audio recording
        slide_timestamps: List of {"slideNumber": int, "timestamp": float} objects

    Returns:
        List of {"slideNumber": int, "audio_path": str, "start_time": float, "end_time": float}
    """
    try:
        _ensure_audio_directories()

        full_audio_segment = _full_audio(audio_file_path)

        if not AUDIO_PROCESSING_AVAILABLE or AudioSegment is None:
            print(
                "⚠️ Audio processing not available, returning full audio as single segment"
            )
            return full_audio_segment

        if not slide_timestamps or len(slide_timestamps) < 2:
            print(
                "⚠️ Not enough timestamps for splitting, returning full audio as single segment"
            )
            return full_audio_segment

        ranges = _normalize_slide_ranges(slide_timestamps)
        if not ranges:
            print(
                "⚠️ Failed to normalize slide timestamps, returning full audio as single segment"
            )
            return full_audio_segment

        # Load the full audio file - try different formats
        try:
            # First try as-is (pydub auto-detects format)
            audio = AudioSegment.from_file(audio_file_path)
            print(f"🎵 Successfully loaded audio file")
        except Exception as e:
            print(f"⚠️ Failed to load audio file directly: {e}")
            # If that fails, try specific formats
            try:
                audio = AudioSegment.from_file(audio_file_path, format="webm")
                print(f"🎵 Successfully loaded as WebM")
            except:
                try:
                    audio = AudioSegment.from_file(audio_file_path, format="ogg")
                    print(f"🎵 Successfully loaded as Ogg")
                except:
                    try:
                        audio = AudioSegment.from_file(audio_file_path, format="mp4")
                        print(f"🎵 Successfully loaded as MP4")
                    except:
                        print(f"❌ Could not load audio in any supported format")
                        raise

        # Process each slide segment
        segments = []
        for r in ranges:
            start = max(0, int(r["start_ms"]))
            end = int(r["end_ms"]) if r["end_ms"] is not None else len(audio)

            if start >= end:
                continue

            clip = audio[start:end]
            dur_ms = len(clip)

            with tempfile.NamedTemporaryFile(
                delete=False, suffix=f"_slide_{r['slideNumber']}.wav"
            ) as temp_segment:
                clip.export(temp_segment.name, format="wav")
                segments.append(
                    {
                        "slideNumber": r["slideNumber"],
                        "audio_path": temp_segment.name,
                        "start_time": start / 1000.0,
                        "end_time": end / 1000.0,
                        "duration_ms": dur_ms,
                    }
                )

        return segments or full_audio_segment

    except Exception as e:
        print(f"❌ Audio splitting failed: {str(e)}")
        # Fallback to full audio as single segment
        return full_audio_segment


def generate_feedback(
    conversation_history,
    slide_content=None,
    presentation_recording=None,
    slide_timestamps=None,
    pdf_session_id=None,
    pdf_slide_count=None,
    qa_timestamps: Optional[List[Dict]] = None,
    asset_session_id=None,
    selected_assignment=None,
    student_name=None,
):
    """
    Generate slide-specific feedback based on the VC conversation and presentation recording

    Args:
        conversation_history: List of messages from the VC conversation
        slide_content: Optional slide content for additional context
        presentation_recording: Audio blob of the full presentation
        slide_timestamps: List of {"slideNumber": int, "timestamp": float} for audio splitting
        assignment_filename: PDF filename for slide image extraction
        pdf_session_id: Session ID from PDF upload for linking images
        pdf_slide_count: Actual number of slides in the PDF
        qa_timestamps: { "slideNumber": int, "start": float, "end": float }

    Returns:
        Dictionary containing structured feedback data with session info
    """

    try:
        if slide_timestamps:
            # Analyze timestamp data for issues
            for i, ts in enumerate(slide_timestamps):
                print(
                    f"  - Timestamp {i}: Slide {ts.get('slideNumber', '?')}, Time: {ts.get('timestamp', '?')}s"
                )

        # --- Init / session globals ---
        # { slideNumber: {transcript, start_time, end_time} }
        slide_audio_transcripts: Dict[int, Dict] = {}
        # [ {start_time, end_time, transcript}, ... ]
        qa_audio_transcripts: List[Dict] = []
        # { slideNumber: {question, answer, start_time, end_time} }
        per_slide_qa: Dict[int, Dict] = {}
        temp_files_to_cleanup: List[str] = []
        original_audio_segments: List[Dict] = []
        full_audio_temp_path: Optional[str] = None

        effective_session_id = asset_session_id or str(uuid.uuid4())
        image_session_id = pdf_session_id or effective_session_id

        if presentation_recording:
            ext = ".webm"
            try:
                mt = (getattr(presentation_recording, "mimetype", "") or "").lower()
                fn = (getattr(presentation_recording, "filename", "") or "").lower()
                if "ogg" in mt or fn.endswith(".ogg"):
                    ext = ".ogg"
                elif "webm" in mt or fn.endswith(".webm"):
                    ext = ".webm"
                # (optional: elif "mp4" in mt or fn.endswith(".mp4"): ext = ".mp4")
            except Exception:
                pass

            # Save recording to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_audio:
                if hasattr(presentation_recording, "read"):
                    temp_audio.write(presentation_recording.read())
                else:
                    temp_audio.write(presentation_recording)

                # temp_audio_path = temp_audio.name
                full_audio_temp_path = temp_audio.name  # keep for QA slicing
                temp_files_to_cleanup.append(full_audio_temp_path)

        # --- Transcribe per-slide audio if we have timestamps ---
        if full_audio_temp_path and slide_timestamps:
            try:

                _split_ts = slide_timestamps
                try:
                    if (
                        qa_timestamps
                        and isinstance(slide_timestamps, list)
                        and len(slide_timestamps) >= 2
                    ):
                        # compute first Q&A start (seconds)
                        starts = [
                            float(q.get("start", 0) or 0.0)
                            for q in (qa_timestamps or [])
                            if q.get("start") is not None
                        ]

                        qa_start = min(starts) if starts else None

                        # sort slide timestamps by time
                        _sorted = sorted(
                            slide_timestamps,
                            key=lambda x: float(x.get("timestamp", 0.0) or 0.0),
                        )
                        last_ts = _sorted[-1]
                        prev_ts = _sorted[-2]
                        last_time = float(last_ts.get("timestamp", 0.0) or 0.0)
                        prev_slide = int(prev_ts.get("slideNumber", 0) or 0)
                        last_slide = int(last_ts.get("slideNumber", 0) or 0)

                        # if the last timestamp is effectively the Q&A start (±1.0s tolerance),
                        # keep sentinel; downstream splitter will ignore emitting it
                        if (
                            qa_start is not None
                            and abs(last_time - qa_start) <= 1.0
                            and last_slide > prev_slide
                        ):
                            _split_ts = _sorted

                except Exception as _e:
                    # non-fatal; fall through with original slide_timestamps
                    _split_ts = slide_timestamps

                # Split using timestamps and transcribe each segment
                audio_segments = split_audio_by_timestamps(
                    full_audio_temp_path, _split_ts
                )

                if len(audio_segments) >= 1:
                    original_audio_segments = audio_segments.copy()

                    # Transcribe each segment
                    for segment in audio_segments:
                        try:
                            transcript = transcribe_recording(segment["audio_path"])
                            slide_audio_transcripts[segment["slideNumber"]] = {
                                "transcript": transcript,
                                "start_time": segment["start_time"],
                                "end_time": segment["end_time"],
                            }

                            temp_files_to_cleanup.append(segment["audio_path"])
                        except Exception as e:
                            print(
                                f"❌ Failed to transcribe slide {segment['slideNumber']}: {e}"
                            )
                            slide_audio_transcripts[segment["slideNumber"]] = {
                                "transcript": "Transcription failed",
                                "start_time": segment["start_time"],
                                "end_time": segment["end_time"],
                            }

                    # Persist per-slide audio to S3 so slide audio URLs can resolve
                    if original_audio_segments:
                        try:
                            segments_to_save = original_audio_segments
                            if pdf_slide_count:
                                segments_to_save = [
                                    s
                                    for s in original_audio_segments
                                    if int(s.get("slideNumber", 0) or 0)
                                    <= int(pdf_slide_count)
                                ]

                            if segments_to_save:
                                save_audio_segments(
                                    effective_session_id, segments_to_save
                                )
                        except Exception as e:
                            print(f"⚠️ Failed to persist audio segments: {e}")

                else:
                    # Fallback: single full transcript split roughly by slide count
                    if slide_timestamps and len(slide_timestamps) > 1:
                        full_transcript = transcribe_recording(full_audio_temp_path)
                        words = full_transcript.split()
                        words_per_slide = max(1, len(words) // len(slide_timestamps))

                        for i, timestamp_data in enumerate(slide_timestamps):
                            slide_num = timestamp_data["slideNumber"]
                            start_word = i * words_per_slide

                            end_word = (
                                (i + 1) * words_per_slide
                                if i < len(slide_timestamps) - 1
                                else len(words)
                            )

                            slide_transcript = " ".join(words[start_word:end_word])

                            slide_audio_transcripts[slide_num] = {
                                "transcript": slide_transcript,
                                "start_time": timestamp_data.get("timestamp") or 0,
                                "end_time": (
                                    slide_timestamps[i + 1]["timestamp"]
                                    if i + 1 < len(slide_timestamps)
                                    else None
                                ),
                            }

            except Exception as e:
                print(f"❌ Audio processing failed: {e}")
                # Fallback to full audio transcription
                try:
                    if full_audio_temp_path:
                        full_transcript = transcribe_recording(full_audio_temp_path)
                        slide_audio_transcripts[1] = {
                            "transcript": full_transcript,
                            "start_time": 0,
                            "end_time": None,
                        }
                    print("🔄 Fell back to full audio transcription")
                except Exception as transcribe_error:
                    print(
                        f"❌ Full audio transcription also failed: {transcribe_error}"
                    )

        elif full_audio_temp_path and not slide_timestamps:
            try:
                full_transcript = transcribe_recording(full_audio_temp_path)
                slide_audio_transcripts[1] = {
                    "transcript": full_transcript,
                    "start_time": 0,
                    "end_time": None,
                }
            except Exception as e:
                print(f"❌ Full audio transcription failed: {e}")

        # --- Determine slide count + normalize slide_timestamps_only + build slide_order ---
        actual_slide_count = pdf_slide_count
        slide_timestamps_only: List[Dict] = []

        if slide_timestamps:
            # If slide count wasn't provided, infer it and detect a gap that signals Q&A starts
            if not actual_slide_count:
                unique_sorted = sorted(
                    {int(ts["slideNumber"]) for ts in slide_timestamps}
                )

                if unique_sorted:
                    cutoff = unique_sorted[-1]

                    for i in range(len(unique_sorted) - 1):
                        if unique_sorted[i + 1] - unique_sorted[i] > 1:
                            cutoff = unique_sorted[i]
                            print(
                                f"📊 Gap detected after slide {cutoff}, assuming Q&A follows"
                            )
                            break

                    actual_slide_count = cutoff

            max_slide_num = max(int(ts["slideNumber"]) for ts in slide_timestamps)
            if actual_slide_count and max_slide_num > actual_slide_count:
                slide_timestamps_only = [
                    ts
                    for ts in slide_timestamps
                    if int(ts["slideNumber"]) <= actual_slide_count
                ]
            else:
                slide_timestamps_only = slide_timestamps
        else:
            slide_timestamps_only = []

        if actual_slide_count and slide_timestamps_only:
            slide_timestamps_only = [
                ts
                for ts in slide_timestamps_only
                if int(ts.get("slideNumber", 0) or 0) <= int(actual_slide_count)
            ]

        # De-duplicate slide_timestamps_only by slideNumber while preserving order
        if slide_timestamps_only:
            _seen = set()
            _dedup = []
            for ts in slide_timestamps_only:
                sn = int(ts.get("slideNumber") or 0)
                if sn > 0 and sn not in _seen:
                    _seen.add(sn)
                    _dedup.append(ts)
            slide_timestamps_only = _dedup

        # Canonical slide order for mapping Q&A
        slide_order: List[int] = []
        if slide_timestamps_only:
            seen = set()

            for ts in slide_timestamps_only:
                s = int(ts.get("slideNumber") or 0)

                if s > 0 and s not in seen:
                    seen.add(s)
                    slide_order.append(s)
        elif actual_slide_count:
            slide_order = list(range(1, actual_slide_count + 1))
        elif slide_audio_transcripts:
            slide_order = sorted(int(k) for k in slide_audio_transcripts.keys())

        # --- Slice & transcribe Q&A windows and attach per-slide ---
        if full_audio_temp_path and qa_timestamps:
            try:
                if AUDIO_PROCESSING_AVAILABLE and AudioSegment is not None:
                    qa_src = AudioSegment.from_file(full_audio_temp_path)

                    for idx, rng in enumerate(qa_timestamps):
                        # Expect {start: seconds, end: seconds}
                        start_s = float(rng.get("start", 0) or 0)
                        end_s = float(rng.get("end", 0) or 0)

                        if end_s <= start_s:
                            continue

                        start_ms = max(0, int(start_s * 1000))
                        end_ms = min(len(qa_src), int(end_s * 1000))
                        clip = qa_src[start_ms:end_ms]

                        with tempfile.NamedTemporaryFile(
                            delete=False, suffix=f".qa{idx}.wav"
                        ) as tmp:
                            clip.export(tmp.name, format="wav")
                            temp_files_to_cleanup.append(tmp.name)

                            try:
                                tx = transcribe_recording(tmp.name)
                            except Exception as te:
                                tx = ""

                        qa_audio_transcripts.append(
                            {
                                "start_time": start_s,
                                "end_time": end_s,
                                "transcript": tx,
                            }
                        )
                else:
                    print(
                        "⚠️ Skipping Q&A: audio slicing unavailable (pydub not installed)"
                    )
            except Exception as e:
                print(f"❌ QA audio processing error: {e}")

            # Collect the VC’s questions (assumes one question per slide, in order)
            assistant_questions = (
                _collect_assistant_questions(conversation_history) or []
            )

            # Map Q&A → slide (prefer explicit slideNumber in qa_timestamps)
            has_slide_number_on_qa = bool(
                qa_timestamps and all("slideNumber" in q for q in qa_timestamps)
            )

            if has_slide_number_on_qa:
                # slideNumber -> first QA idx
                qa_idx_by_slide: Dict[int, int] = {}

                for idx, q in enumerate(qa_timestamps):
                    sn = int(q.get("slideNumber") or 0)
                    if sn > 0 and sn not in qa_idx_by_slide:
                        qa_idx_by_slide[sn] = idx

                for si, sn in enumerate(slide_order):
                    qa_idx = qa_idx_by_slide.get(sn)
                    if qa_idx is None:
                        continue
                    if 0 <= qa_idx < len(qa_audio_transcripts):
                        ans = qa_audio_transcripts[qa_idx]
                        per_slide_qa[sn] = {
                            "question": (
                                assistant_questions[si]
                                if si < len(assistant_questions)
                                else None
                            ),
                            "answer": (ans.get("transcript") or "").strip(),
                            "start_time": ans.get("start_time"),
                            "end_time": ans.get("end_time"),
                        }
            else:
                # Index-ordered pairing: slide i ↔ QA i ↔ question i
                pairs = min(len(slide_order), len(qa_audio_transcripts))

                for i in range(pairs):
                    sn = slide_order[i]
                    ans = qa_audio_transcripts[i]
                    per_slide_qa[sn] = {
                        "question": (
                            assistant_questions[i]
                            if i < len(assistant_questions)
                            else None
                        ),
                        "answer": (ans.get("transcript") or "").strip(),
                        "start_time": ans.get("start_time"),
                        "end_time": ans.get("end_time"),
                    }

        # --- Evaluate Q&A per slide (use existing generator), then merge into slide feedback later ---
        qa_eval_by_slide: Dict[int, Dict] = {}
        try:
            for sn, qa in (per_slide_qa or {}).items():
                # Build a minimal, slide-scoped dialogue (one Q, one A)
                mini_conv = []
                q = (qa.get("question") or "").strip()
                a = (qa.get("answer") or "").strip()
                if q:
                    mini_conv.append({"role": "assistant", "content": q})
                if a:
                    mini_conv.append({"role": "user", "content": a})

                # Pass the single QA window so timestamps appear in the model context
                qa_seg = [
                    {
                        "start_time": qa.get("start_time"),
                        "end_time": qa.get("end_time"),
                        "transcript": a,
                    }
                ]

                qa_text = generate_qa_feedback(
                    conversation_history=mini_conv, qa_segments=qa_seg
                )
                qa_parsed = parse_qa_feedback(qa_text) if qa_text else None

                qa_eval_by_slide[sn] = {
                    "raw": qa_text,
                    "parsed": qa_parsed,
                }
        except Exception as e:
            print(f"⚠️ Per-slide Q&A evaluation failed: {e}")

        # --- Build per-slide feedback texts (no global Q&A section) ---
        feedback_parts: List[str] = []

        # Prefer canonical, de-duplicated slide_order when available
        if slide_order and len(slide_order) > 1:
            for slide_num in slide_order:
                slide_data = slide_audio_transcripts.get(slide_num) or {
                    "transcript": "Audio not available for this slide",
                    "start_time": 0,
                    "end_time": None,
                }
                try:
                    feedback_part = generate_slide_feedback(
                        slide_num, slide_data, slide_content, conversation_history
                    )
                except Exception as e:
                    print(f"❌ Error generating feedback for slide {slide_num}: {e}")
                    feedback_part = f"**Slide {slide_num} Feedback:** Error: {str(e)}"

                feedback_parts.append(feedback_part)

        elif slide_audio_transcripts and len(slide_audio_transcripts) > 1:
            # Fallback to whatever slide numbers we have in transcripts
            for slide_num in sorted(slide_audio_transcripts.keys()):
                slide_data = slide_audio_transcripts[slide_num]
                try:
                    feedback_part = generate_slide_feedback(
                        slide_num, slide_data, slide_content, conversation_history
                    )
                except Exception as e:
                    print(f"❌ Error generating feedback for slide {slide_num}: {e}")
                    feedback_part = f"**Slide {slide_num} Feedback:** Error: {str(e)}"
                feedback_parts.append(feedback_part)
        else:
            # Single-slide path
            slide_num = 1 if not slide_order else slide_order[0]
            slide_data = slide_audio_transcripts.get(slide_num) or {
                "transcript": "Audio not available",
                "start_time": 0,
                "end_time": None,
            }
            try:
                feedback_part = generate_slide_feedback(
                    slide_num, slide_data, slide_content, conversation_history
                )
            except Exception as e:
                print(f"❌ Error generating feedback for slide {slide_num}: {e}")
                feedback_part = f"**Slide {slide_num} Feedback:** Error: {str(e)}"
            feedback_parts.append(feedback_part)

        # Only per-slide feedbacks
        slide_feedback_texts = [
            (part or "").strip() for part in feedback_parts if (part or "").strip()
        ]

        # --- Collate transcripts for final payload ---
        slide_transcript_list = []
        for sn in sorted(slide_audio_transcripts.keys()):
            if actual_slide_count and int(sn) > int(actual_slide_count):
                continue
            t = (slide_audio_transcripts[sn] or {}).get("transcript") or ""
            if t.strip():
                slide_transcript_list.append(f"[Slide {sn}] {t.strip()}")

        overall_presentation_transcript = (
            "\n".join(slide_transcript_list).strip() or None
        )
        _present_only = {
            k: v
            for k, v in (slide_audio_transcripts or {}).items()
            if not actual_slide_count or int(k) <= int(actual_slide_count)
        }
        presentation_transcript = _concat_presentation_tx(_present_only)
        student_label = _label_for_student(student_name)
        dialogue_lines = []

        for m in conversation_history or []:
            role = m.get("role")
            content = (m.get("content") or "").strip()

            if not content or _is_control_line(content):
                continue

            who = "VC" if role == "assistant" else student_label
            dialogue_lines.append(f"{who}: {content}")

        dialogue_text_clean = "\n".join(dialogue_lines) or None

        # --- Structured response scaffold ---
        structured_feedback: Dict = {
            "session_id": effective_session_id,
            "pdf_session_id": image_session_id,
            "feedback_type": "per_slide" if len(slide_feedback_texts) > 1 else "single",
            "slides": [],
            "qa_feedback": None,  # intentionally unused; per-slide only
            "metadata": {
                "generated_at": time.time(),
                "slide_count": actual_slide_count
                or (len(slide_timestamps_only) if slide_timestamps_only else 1),
                "has_audio": bool(slide_audio_transcripts),
                "has_conversation": bool(conversation_history),
                "audio_splitting_success": bool(
                    original_audio_segments and len(original_audio_segments) > 1
                ),
                "has_qa_audio": bool(qa_audio_transcripts),
                "qa_segments_count": len(qa_audio_transcripts),
            },
            "transcripts": {
                "overall_presentation": overall_presentation_transcript,
                "presentation": presentation_transcript,
                "qa_responses": qa_audio_transcripts,  # raw list for clients
                "per_slide": {
                    str(k): (v or {}).get("transcript")
                    for k, v in slide_audio_transcripts.items()
                },
                "dialogue_text": dialogue_text_clean,
            },
        }

        # --- (Optional) Ensure slide images & SlideAsset rows exist (end-of-run) ---
        try:
            if selected_assignment:
                pdf_path = os.path.join(ASSIGNMENTS_DIR, selected_assignment)
                if os.path.exists(pdf_path):
                    generated_slides = save_slide_images(pdf_path, image_session_id)
                    for slide_number, paths in (generated_slides or {}).items():
                        full_path = paths.get("full")
                        thumbnail_path = paths.get("thumbnail")

                        if full_path and os.path.exists(full_path):
                            full_image_filename = build_s3_filename(
                                slide_number, "full"
                            )
                            full_key = build_key(
                                image_session_id,
                                full_image_filename,
                                subdir=S3_SLIDE_IMAGES_FOLDER,
                            )

                            try:
                                upload_file(
                                    full_path, full_key, content_type="image/png"
                                )
                                upsert_slide_asset(
                                    session_id=image_session_id,
                                    slide_number=slide_number,
                                    kind="image_full",
                                    s3_key=full_key,
                                    mime_type="image/png",
                                )
                            except Exception as ue:
                                print(
                                    f"⚠️ Full image upload/upsert failed s{slide_number}: {ue}"
                                )

                        if thumbnail_path and os.path.exists(thumbnail_path):
                            thumb_image_filename = build_s3_filename(
                                slide_number, "thumb"
                            )
                            thumb_key = build_key(
                                image_session_id,
                                thumb_image_filename,
                                subdir=S3_SLIDE_IMAGES_FOLDER,
                            )

                            try:
                                upload_file(
                                    thumbnail_path, thumb_key, content_type="image/png"
                                )
                                upsert_slide_asset(
                                    session_id=image_session_id,
                                    slide_number=slide_number,
                                    kind="image_thumb",
                                    s3_key=thumb_key,
                                    mime_type="image/png",
                                )
                            except Exception as ue:
                                print(
                                    f"⚠️ Thumbnail image upload/upsert failed s{slide_number}: {ue}"
                                )
                else:
                    print(f"⚠️ Selected assignment not found at {pdf_path}")
            else:
                print("⚠️ No selected_assignment provided; skipping image generation")
        except Exception as e:
            print(f"⚠️ Late slide-image generation failed: {e}")

        # --- Parse & attach per-slide feedback + Q&A ---
        already_added_slides = set()

        for i, feedback_text in enumerate(slide_feedback_texts):
            # Determine slide number aligned to canonical order
            if slide_order and i < len(slide_order):
                slide_num = int(slide_order[i])
            elif slide_timestamps_only and i < len(slide_timestamps_only):
                slide_num = int(slide_timestamps_only[i]["slideNumber"])
            else:
                slide_num = i + 1  # last resort

            # Respect declared slide count
            if actual_slide_count and slide_num > actual_slide_count:
                continue

            # Defensive: skip duplicates if any slip through
            if slide_num in already_added_slides:
                print(f"⚠️ Skipping duplicate feedback for slide {slide_num}")
                continue

            already_added_slides.add(slide_num)

            parsed_feedback = parse_slide_feedback(feedback_text)

            qae = (qa_eval_by_slide or {}).get(slide_num)
            if qae and qae.get("parsed"):
                qap = qae["parsed"]
                if qap.get("impromptu_response"):
                    parsed_feedback["impromptu_response"] = qap["impromptu_response"]
                if qap.get("composure"):
                    parsed_feedback["composure"] = qap["composure"]

            slide_tx = (slide_audio_transcripts.get(slide_num, {}) or {}).get(
                "transcript"
            )

            slide_data = {
                "slide_number": slide_num,
                "feedback": parsed_feedback,
                "raw_feedback_text": feedback_text,
                "transcript": slide_tx or None,
                "qa": per_slide_qa.get(slide_num) or None,
            }

            # Pretty QA transcript (VC + STUDENT) if present
            qa = per_slide_qa.get(slide_num)
            if qa:
                q = (qa.get("question") or "").strip()
                a = (qa.get("answer") or "").strip()
                slide_data["qa_transcript"] = (
                    f"VC: {q}\n{_label_for_student(student_name)}: {a}".strip()
                )

            structured_feedback["slides"].append(slide_data)

        if actual_slide_count:
            structured_feedback["slides"] = [
                s
                for s in structured_feedback["slides"]
                if s.get("slide_number", 10**9) <= actual_slide_count
            ]

        # --- Cleanup temp files ---
        for temp_file in temp_files_to_cleanup:
            try:
                os.unlink(temp_file)
            except Exception as e:
                print(f"⚠️ Failed to cleanup {temp_file}: {e}")

        # --- Cleanup local PDF renders ---
        try:
            if pdf_session_id:
                cleanup_local_pdf_images(pdf_session_id)
                print(f"🗑️ Cleaned up local PDF(s) for session {pdf_session_id}")
            else:
                print("⚠️ No PDF session ID provided, skipping PDF cleanup")
        except Exception as e:
            print(f"⚠️ Failed to cleanup local PDF(s) for session {pdf_session_id}: {e}")

        # --- Overall score ---
        structured_feedback["overall"] = _compute_overall(structured_feedback)

        return structured_feedback

    except Exception as e:
        print(f"❌ Feedback generation error: {str(e)}")
        raise Exception(f"Feedback generation error: {str(e)}")


def generate_slide_feedback(
    slide_number,
    slide_audio_data,
    slide_content,
    conversation_history,
):
    """
    Generate feedback for a specific slide

    Args:
        slide_number: The slide number
        slide_audio_data: Dict with "transcript", "start_time", "end_time"
        slide_content: Full slide deck content
        conversation_history: Q&A conversation for impromptu/composure analysis

    Returns:
        Formatted feedback string for this slide
    """
    try:
        # Create slide-specific prompt - for slides, we don't analyze Q&A
        slide_prompt = f"""You are evaluating slide {slide_number} of a startup pitch presentation. Provide feedback in this exact format:

**Slide {slide_number}:**
- Content structuring: [✓/✗] - [Brief analysis of slide content and flow]
- Delivery: [✓/✗] - [Analysis based on audio transcript for pacing, clarity, filler words]  
- Impromptu response: N/A - [This is evaluated in the Q&A section]
- Composure: N/A - [This is evaluated in the Q&A section]

Use ✓ for met criteria, ✗ for not met, and N/A when not applicable. Be specific and actionable.
For slide feedback, focus ONLY on the slide content and delivery. Q&A aspects are evaluated separately."""

        # Build context
        system_content = slide_prompt

        if slide_content:
            system_content += f'\n\nFULL SLIDE DECK: """{slide_content}"""'

        if slide_audio_data and slide_audio_data["transcript"]:
            transcript = slide_audio_data["transcript"]
            start_time = slide_audio_data.get("start_time", 0) or 0
            end_time = slide_audio_data.get("end_time") or 0
            duration = end_time - start_time if end_time else 0
            duration_text = f"({duration:.1f}s)" if duration > 0 else ""
            system_content += (
                f'\n\nSLIDE {slide_number} AUDIO {duration_text}: """{transcript}"""'
            )

        # Don't include Q&A dialogue for slide feedback - that's separate

        feedback_messages = [
            {"role": "system", "content": system_content},
            {
                "role": "user",
                "content": f"Analyze slide {slide_number} and provide feedback in the specified format.",
            },
        ]

        def _call():
            return client.chat.completions.create(
                model=CHAT_MODEL,
                messages=feedback_messages,
                max_completion_tokens=400,
                reasoning_effort="minimal",
            )

        response = with_retry(_call)

        return response.choices[0].message.content

    except Exception as e:
        import traceback

        traceback.print_exc()
        return f"**Slide {slide_number} Feedback:** Error generating feedback for this slide: {str(e)}"


def generate_qa_feedback(
    conversation_history,
    qa_segments=None,
):
    """
    Generate feedback for the Q&A portion focusing on impromptu responses and composure

    Args:
        conversation_history: List of conversation messages

    Returns:
        Formatted Q&A feedback string
    """
    try:
        qa_prompt = """You are evaluating the Q&A portion of a startup pitch presentation. Focus specifically on impromptu responses and composure under pressure. Provide feedback in this exact format:
        **Q&A Session:**
        - Impromptu response: [✓/✗] - [Analysis of how well the founder answered questions on the spot with specific evidence]
        - Composure: [✓/✗] - [Analysis of how the founder handled challenging or critical questions]
        Use ✓ for met criteria, ✗ for not met. Be specific about what questions were asked and how they were handled."""

        # Format conversation history
        dialogue_content = ""
        for msg in conversation_history:
            role = "VC" if msg["role"] == "assistant" else "STUDENT"
            dialogue_content += f"{role}: {msg['content']}\n"

        # system_content = (
        #     qa_prompt + f'\n\nQ&A DIALOGUE: """{dialogue_content.strip()}"""'
        # )
        system_content = (
            qa_prompt + f'\n\nQ&A DIALOGUE: """{dialogue_content.strip()}"""'
        )

        if qa_segments:
            qa_audio_lines = []
            for seg in qa_segments:
                start = seg.get("start_time")
                end = seg.get("end_time")
                tx = (seg.get("transcript") or "").strip()

                if not tx:
                    continue

                if start is not None and end is not None:
                    qa_audio_lines.append(f"[{start:.1f}s–{end:.1f}s] {tx}")
                else:
                    qa_audio_lines.append(tx)

            if qa_audio_lines:
                system_content += (
                    '\n\nQ&A AUDIO (student answers): """\n'
                    + "\n".join(qa_audio_lines)
                    + '\n"""'
                )

        feedback_messages = [
            {"role": "system", "content": system_content},
            {
                "role": "user",
                "content": "Analyze the Q&A session and provide feedback in the specified format.",
            },
        ]

        def _call():
            return client.chat.completions.create(
                model=CHAT_MODEL,
                messages=feedback_messages,
                max_completion_tokens=300,
                reasoning_effort="minimal",
            )

        response = with_retry(_call)

        return response.choices[0].message.content

    except Exception as e:
        print(f"❌ Failed to generate Q&A feedback: {e}")
        return (
            "**Q&A Session:** ✗ - Could not analyze Q&A due to a temporary issue. "
            "Next run will retry; meanwhile focus answers on one clear claim, one "
            "metric, and an evidence source."
        )


def parse_slide_feedback(feedback_text):
    """
    Parse slide feedback text into structured data

    Args:
        feedback_text: Raw feedback text from AI

    Returns:
        Dictionary with parsed feedback scores and comments
    """
    try:
        feedback_data = {
            "content_structuring": {"status": "unknown", "comment": ""},
            "delivery": {"status": "unknown", "comment": ""},
            "impromptu_response": {"status": "unknown", "comment": ""},
            "composure": {"status": "unknown", "comment": ""},
        }

        # Parse each criteria from the feedback text
        lines = feedback_text.split("\n")

        for line in lines:
            line = line.strip()
            if line.startswith("- Content structuring:"):
                feedback_data["content_structuring"] = parse_feedback_line(line)
            elif line.startswith("- Delivery:"):
                feedback_data["delivery"] = parse_feedback_line(line)
            elif line.startswith("- Impromptu response:"):
                feedback_data["impromptu_response"] = parse_feedback_line(line)
            elif line.startswith("- Composure:"):
                feedback_data["composure"] = parse_feedback_line(line)

        return feedback_data

    except Exception as e:
        print(f"❌ Error parsing slide feedback: {e}")
        return {
            "content_structuring": {
                "status": "error",
                "comment": "Error parsing feedback",
            },
            "delivery": {"status": "error", "comment": "Error parsing feedback"},
            "impromptu_response": {
                "status": "error",
                "comment": "Error parsing feedback",
            },
            "composure": {"status": "error", "comment": "Error parsing feedback"},
        }


def parse_feedback_line(line):
    """
    Parse a single feedback line to extract status and comment

    Args:
        line: Feedback line like "- Content structuring: ✓ - Good structure"

    Returns:
        Dictionary with status and comment
    """
    try:
        # Extract status (✓, ✗, N/A)
        if "✓" in line:
            status = "met"
        elif "✗" in line:
            status = "not_met"
        elif "N/A" in line:
            status = "not_applicable"
        else:
            status = "unknown"

        # Extract comment (everything after the status symbol and dash)
        comment_start = line.find(" - ")
        comment = line[comment_start + 3 :].strip() if comment_start != -1 else ""

        return {"status": status, "comment": comment}

    except Exception as e:
        print(f"❌ Error parsing feedback line: {e}")
        return {"status": "error", "comment": "Error parsing line"}


def parse_qa_feedback(qa_feedback_text):
    """
    Parse Q&A feedback text into structured data

    Args:
        qa_feedback_text: Raw Q&A feedback text from AI

    Returns:
        Dictionary with parsed Q&A feedback
    """
    try:
        qa_data = {
            "impromptu_response": {"status": "unknown", "comment": ""},
            "composure": {"status": "unknown", "comment": ""},
        }

        lines = qa_feedback_text.split("\n")

        for line in lines:
            line = line.strip()
            if line.startswith("- Impromptu response:"):
                qa_data["impromptu_response"] = parse_feedback_line(line)
            elif line.startswith("- Composure:"):
                qa_data["composure"] = parse_feedback_line(line)

        return qa_data

    except Exception as e:
        print(f"❌ Error parsing Q&A feedback: {e}")
        return {
            "impromptu_response": {
                "status": "error",
                "comment": "Error parsing feedback",
            },
            "composure": {"status": "error", "comment": "Error parsing feedback"},
        }
