import os
from re import S
import tempfile
import json
import time
import uuid
import shutil
from flask import url_for
from openai import OpenAI

from lib.aws import (
    upload_file,
    build_key,
    public_url,
    S3_AUDIO_SESSIONS_FOLDER,
    S3_SLIDE_IMAGES_FOLDER,
)
from config.paths import AUDIO_SESSIONS_DIR

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

client = OpenAI(api_key=AI_API_KEY, timeout=20.0)


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
            transcript = client.audio.transcriptions.create(
                model=TRANSCRIBE_MODEL, file=f, response_format="text"
            )
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

            # Copy to session directory with permanent name
            session_dir = os.path.join(AUDIO_SESSIONS_DIR, session_id)
            os.makedirs(session_dir, exist_ok=True)
            permanent_path = os.path.join(session_dir, f"slide_{slide_number}.wav")
            shutil.copy2(temp_audio_path, permanent_path)

            s3_url = None
            try:
                s3_key = build_key(
                    session_id,
                    f"slide_{slide_number}.wav",
                    subdir=S3_AUDIO_SESSIONS_FOLDER,
                )

                upload_file(permanent_path, s3_key, content_type="audio/wav")
                s3_url = public_url(s3_key)
            except Exception as e:
                print(f"⚠️ Failed to upload audio segment for slide {slide_number}: {e}")
                # TODO: Reset s3_url to none here?
                # s3_url = None

            # Remove local copy
            try:
                if os.path.exists(permanent_path):
                    os.remove(permanent_path)
            except Exception as e:
                print(f"⚠️ Failed to delete local audio segment {permanent_path}: {e}")

            saved_segments[slide_number] = {
                "local_path": permanent_path,
                "s3_url": s3_url,
            }

            print(
                f"💾 Uploaded audio segment for slide {slide_number} → {bool(s3_url)}"
            )

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


def get_audio_segment_path(session_id, slide_number):
    """Get the file path for a specific slide's audio segment"""
    # Get absolute path to the backend directory
    session_dir = os.path.join(AUDIO_SESSIONS_DIR, session_id)
    audio_file = f"slide_{slide_number}.wav"
    audio_path = os.path.join(session_dir, audio_file)

    if os.path.exists(audio_path):
        return audio_path

    return None


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


def split_audio_by_timestamps(audio_file_path, slide_timestamps):
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
                    audio = AudioSegment.from_file(audio_file_path, format="mp4")
                    print(f"🎵 Successfully loaded as MP4")
                except:
                    print(f"❌ Could not load audio in any supported format")
                    raise e

        print(f"🎵 Splitting audio based on {len(slide_timestamps)} timestamps")

        # Process each slide segment
        segments = []
        for r in ranges:
            start = max(0, int(r["start_ms"]))
            end = int(r["end_ms"]) if r["end_ms"] is not None else len(audio)
            if start >= end:
                continue

            clip = audio[start:end]
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
    assignment_filename=None,
    pdf_session_id=None,
    pdf_slide_count=None,
    qa_timestamps=None,
    asset_session_id=None,
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

    Returns:
        Dictionary containing structured feedback data with session info
    """

    try:
        print("📝 Generating slide-specific feedback...")
        print(f"💬 Conversation messages: {len(conversation_history)}")
        print(
            f"💬 First few messages: {conversation_history[:3] if conversation_history else 'None'}"
        )
        print(f"📄 Slide content provided: {bool(slide_content)}")
        print(f"🎙️ Presentation recording provided: {bool(presentation_recording)}")
        print(
            f"📊 Slide timestamps provided: {len(slide_timestamps) if slide_timestamps else 0}"
        )
        if slide_timestamps:
            print(f"📊 Detailed timestamps: {slide_timestamps}")
            # Analyze timestamp data for issues
            for i, ts in enumerate(slide_timestamps):
                print(
                    f"  - Timestamp {i}: Slide {ts.get('slideNumber', '?')}, Time: {ts.get('timestamp', '?')}s"
                )
        print(f"📄 PDF session ID: {pdf_session_id}")
        print(f"📄 PDF slide count: {pdf_slide_count}")

        # Handle audio splitting and transcription if recording is provided
        slide_audio_transcripts = {}
        qa_audio_transcripts = []
        temp_files_to_cleanup = []
        original_audio_segments = []
        full_audio_temp_path = None

        if presentation_recording and slide_timestamps:
            print("🔊 Processing slide-specific audio segments...")

            # Save recording to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
                if hasattr(presentation_recording, "read"):
                    temp_audio.write(presentation_recording.read())
                else:
                    temp_audio.write(presentation_recording)
                temp_audio_path = temp_audio.name
                full_audio_temp_path = temp_audio_path  # keep for QA slicing
                temp_files_to_cleanup.append(temp_audio_path)

            try:
                # Debug the received audio file
                print(
                    f"🔧 DEBUG: About to split audio with {len(slide_timestamps)} timestamps"
                )
                print(f"🔧 DEBUG: Audio file path: {temp_audio_path}")
                print(
                    f"🔧 DEBUG: Audio file size: {os.path.getsize(temp_audio_path)} bytes"
                )

                # Try to get audio info
                try:
                    test_audio = AudioSegment.from_file(temp_audio_path)
                    print(f"🔧 DEBUG: Audio duration: {len(test_audio)/1000:.1f}s")
                    print(f"🔧 DEBUG: Audio sample rate: {test_audio.frame_rate}Hz")
                    print(f"🔧 DEBUG: Audio channels: {test_audio.channels}")
                except Exception as audio_info_error:
                    print(f"🔧 DEBUG: Cannot read audio info: {audio_info_error}")

                audio_segments = split_audio_by_timestamps(
                    temp_audio_path, slide_timestamps
                )
                print(
                    f"🔧 DEBUG: split_audio_by_timestamps returned {len(audio_segments)} segments"
                )

                # Check if splitting actually worked (more than one segment)
                if len(audio_segments) >= 1:
                    print(
                        f"✅ Audio successfully split into {len(audio_segments)} segments"
                    )
                    original_audio_segments = audio_segments.copy()
                    print(
                        f"🔧 DEBUG: original_audio_segments set with {len(original_audio_segments)} segments"
                    )

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
                            print(
                                f"✅ Slide {segment['slideNumber']} transcribed: {len(transcript)} chars"
                            )
                        except Exception as e:
                            print(
                                f"❌ Failed to transcribe slide {segment['slideNumber']}: {e}"
                            )
                            slide_audio_transcripts[segment["slideNumber"]] = {
                                "transcript": "Transcription failed",
                                "start_time": segment["start_time"],
                                "end_time": segment["end_time"],
                            }
                else:
                    print(
                        "⚠️ Audio splitting returned only one segment, treating as full audio"
                    )
                    # Create fake segments based on timestamps for feedback structure
                    if slide_timestamps and len(slide_timestamps) > 1:
                        full_transcript = transcribe_recording(temp_audio_path)
                        for i, timestamp_data in enumerate(slide_timestamps):
                            slide_num = timestamp_data["slideNumber"]
                            # Split transcript roughly by slide count
                            words = full_transcript.split()
                            words_per_slide = len(words) // len(slide_timestamps)
                            start_word = i * words_per_slide
                            end_word = (
                                (i + 1) * words_per_slide
                                if i < len(slide_timestamps) - 1
                                else len(words)
                            )
                            slide_transcript = " ".join(words[start_word:end_word])

                            slide_audio_transcripts[slide_num] = {
                                "transcript": slide_transcript,
                                "start_time": timestamp_data["timestamp"],
                                "end_time": (
                                    slide_timestamps[i + 1]["timestamp"]
                                    if i + 1 < len(slide_timestamps)
                                    else None
                                ),
                            }
                            print(
                                f"📝 Created fake segment for slide {slide_num}: {len(slide_transcript)} chars"
                            )

            except Exception as e:
                print(f"❌ Audio processing failed: {e}")
                # Fallback to full audio transcription
                try:
                    full_transcript = transcribe_recording(temp_audio_path)
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

        elif presentation_recording:
            # No timestamps provided, transcribe full audio
            print("🔊 Transcribing full presentation recording (no timestamps)...")
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
                if hasattr(presentation_recording, "read"):
                    temp_audio.write(presentation_recording.read())
                else:
                    temp_audio.write(presentation_recording)
                temp_audio_path = temp_audio.name
                full_audio_temp_path = temp_audio_path
                temp_files_to_cleanup.append(temp_audio_path)

            try:
                full_transcript = transcribe_recording(temp_audio_path)
                slide_audio_transcripts[1] = {
                    "transcript": full_transcript,
                    "start_time": 0,
                    "end_time": None,
                }
                print(f"✅ Full audio transcribed: {len(full_transcript)} chars")
            except Exception as e:
                print(f"❌ Full audio transcription failed: {e}")

        # ---- QA AUDIO: slice student answer windows if provided ----
        if full_audio_temp_path and qa_timestamps:
            try:
                print(f"🎤 Processing {len(qa_timestamps)} QA timestamp windows")
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
                                print(f"⚠️ QA seg {idx} transcription failed: {te}")
                                tx = ""

                        qa_audio_transcripts.append(
                            {
                                "start_time": start_s,
                                "end_time": end_s,
                                "transcript": tx,
                            }
                        )
                else:
                    # No slicing available — fall back to full-audio transcription once
                    try:
                        tx = transcribe_recording(full_audio_temp_path)
                    except Exception as te:
                        print(f"⚠️ QA fallback transcription failed: {te}")
                        tx = ""
                    if tx:
                        qa_audio_transcripts.append(
                            {"start_time": None, "end_time": None, "transcript": tx}
                        )
            except Exception as e:
                print(f"❌ QA audio processing error: {e}")

        # Get actual slide count - prefer passed value, then infer from timestamps
        actual_slide_count = pdf_slide_count

        if not actual_slide_count and slide_timestamps:
            # Infer actual slide count by looking for gaps in timestamps
            # Usually Q&A section doesn't have proper slide numbers
            unique_slides = set(ts["slideNumber"] for ts in slide_timestamps)
            print(f"📊 Unique slide numbers in timestamps: {sorted(unique_slides)}")

            # Check for sequential slides - if we have 1,2,3,4,5 and 5 is out of sequence, it's likely Q&A
            if len(unique_slides) > 1:
                sorted_slides = sorted(unique_slides)
                # Find the last sequential slide
                for i in range(len(sorted_slides) - 1):
                    if sorted_slides[i + 1] - sorted_slides[i] > 1:
                        # Gap detected, likely Q&A after this
                        actual_slide_count = sorted_slides[i]
                        print(
                            f"📊 Gap detected after slide {actual_slide_count}, assuming Q&A follows"
                        )
                        break
                else:
                    # No gaps, use the max slide number
                    actual_slide_count = max(sorted_slides)
                    print(f"📊 Using max slide number as count: {actual_slide_count}")

        print(f"📊 Final actual slide count: {actual_slide_count}")

        # Now generate feedback based on available data
        feedback_parts = []

        # Separate Q&A timestamps from slide timestamps
        slide_timestamps_only = []
        has_qa_section = False

        if slide_timestamps:
            # Check if the last timestamp is significantly different or if we have too many timestamps
            max_slide_num = max(ts["slideNumber"] for ts in slide_timestamps)

            # If we have an actual slide count, use it to filter
            if actual_slide_count and max_slide_num > actual_slide_count:
                print(
                    f"⚠️ Detected extra timestamps beyond slide count ({max_slide_num} > {actual_slide_count})"
                )
                slide_timestamps_only = [
                    ts
                    for ts in slide_timestamps
                    if ts["slideNumber"] <= actual_slide_count
                ]
                has_qa_section = True
            else:
                slide_timestamps_only = slide_timestamps

        # Always try to generate per-slide feedback if we have timestamps
        if slide_timestamps_only and len(slide_timestamps_only) > 1:
            print(
                f"📊 Generating per-slide feedback for {len(slide_timestamps_only)} slides based on timestamps"
            )
            print(f"📊 Slide timestamps (filtered): {slide_timestamps_only}")
            print(
                f"📊 Audio transcripts available for slides: {list(slide_audio_transcripts.keys())}"
            )

            # Generate feedback for each slide based on timestamps
            for i, timestamp_data in enumerate(slide_timestamps_only):
                slide_num = timestamp_data["slideNumber"]
                print(f"📊 Processing slide {slide_num} (index {i})")

                # Use corresponding audio transcript if available, otherwise empty
                if slide_num in slide_audio_transcripts:
                    slide_data = slide_audio_transcripts[slide_num]
                    print(f"📊 Using audio transcript for slide {slide_num}")
                else:
                    slide_data = {
                        "transcript": "Audio not available for this slide",
                        "start_time": 0,
                        "end_time": None,
                    }
                    print(
                        f"📊 No audio transcript for slide {slide_num}, using placeholder"
                    )

                try:
                    feedback_part = generate_slide_feedback(
                        slide_num, slide_data, slide_content, conversation_history
                    )
                    feedback_parts.append(feedback_part)
                    print(f"✅ Successfully generated feedback for slide {slide_num}")
                except Exception as e:
                    print(f"❌ Error generating feedback for slide {slide_num}: {e}")
                    feedback_parts.append(
                        f"**Slide {slide_num} Feedback:** Error: {str(e)}"
                    )

            # Add Q&A section analysis if we detected Q&A or have conversation history
            print(f"🔍 Q&A Generation Check:")
            print(f"  - Has conversation history: {bool(conversation_history)}")
            print(
                f"  - Conversation length: {len(conversation_history) if conversation_history else 0}"
            )
            print(f"  - Has Q&A section detected: {has_qa_section}")

            if conversation_history and (
                has_qa_section or len(conversation_history) > 2
            ):
                print(f"✅ Generating Q&A feedback...")
                qa_feedback = generate_qa_feedback(
                    conversation_history, qa_segments=qa_audio_transcripts
                )
                feedback_parts.append(qa_feedback)
                print(f"✅ Q&A feedback added to parts")
            else:
                print(f"⚠️ Skipping Q&A feedback generation")

        elif slide_audio_transcripts and len(slide_audio_transcripts) > 1:
            print(
                f"📊 Generating per-slide feedback for {len(slide_audio_transcripts)} slides based on audio"
            )

            for slide_num in sorted(slide_audio_transcripts.keys()):
                slide_data = slide_audio_transcripts[slide_num]
                feedback_part = generate_slide_feedback(
                    slide_num, slide_data, slide_content, conversation_history
                )
                feedback_parts.append(feedback_part)

            # Add Q&A section analysis
            print(f"🔍 Q&A Generation Check (branch 2):")
            print(f"  - Has conversation history: {bool(conversation_history)}")
            print(
                f"  - Conversation length: {len(conversation_history) if conversation_history else 0}"
            )

            if conversation_history:
                print(f"✅ Generating Q&A feedback...")
                qa_feedback = generate_qa_feedback(
                    conversation_history, qa_segments=qa_audio_transcripts
                )
                feedback_parts.append(qa_feedback)
                print(f"✅ Q&A feedback added to parts")
            else:
                print(f"⚠️ No conversation history for Q&A feedback")

        else:
            # Fallback to single slide feedback when no timestamps available
            print("📝 Generating single slide feedback (no timestamps provided)")

            # Use the structured format for a single slide
            slide_data = {
                "transcript": "Audio not available",
                "start_time": 0,
                "end_time": None,
            }
            if slide_audio_transcripts and 1 in slide_audio_transcripts:
                slide_data = slide_audio_transcripts[1]

            feedback_part = generate_slide_feedback(
                1, slide_data, slide_content, conversation_history
            )
            feedback_parts.append(feedback_part)

            # Add Q&A section analysis
            print(f"🔍 Q&A Generation Check (branch 2):")
            print(f"  - Has conversation history: {bool(conversation_history)}")
            print(
                f"  - Conversation length: {len(conversation_history) if conversation_history else 0}"
            )

            if conversation_history:
                print(f"✅ Generating Q&A feedback...")
                qa_feedback = generate_qa_feedback(
                    conversation_history, qa_segments=qa_audio_transcripts
                )
                feedback_parts.append(qa_feedback)
                print(f"✅ Q&A feedback added to parts")
            else:
                print(f"⚠️ No conversation history for Q&A feedback")

        # Use PDF session ID for images, generate new session ID for audio
        # feedback_session_id = str(uuid.uuid4())
        feedback_session_id = asset_session_id or str(uuid.uuid4())
        image_session_id = pdf_session_id or feedback_session_id

        print(f"📊 Session IDs:")
        print(f"  - Feedback session (audio): {feedback_session_id}")
        print(f"  - Image session (PDF): {image_session_id}")

        # Save audio segments if we have them
        audio_session_data = {}
        print(
            f"🔧 DEBUG: slide_audio_transcripts length: {len(slide_audio_transcripts) if slide_audio_transcripts else 0}"
        )
        print(
            f"🔧 DEBUG: original_audio_segments length: {len(original_audio_segments) if original_audio_segments else 0}"
        )

        if slide_audio_transcripts and original_audio_segments:
            # Save the split audio segments to permanent storage
            print(
                f"🔧 DEBUG: About to save {len(original_audio_segments)} audio segments"
            )
            audio_session_data = save_audio_segments(
                feedback_session_id, original_audio_segments
            )
            print(f"💾 Saved audio segments for session {feedback_session_id}")
            print(f"💾 Audio saved for slides: {list(audio_session_data.keys())}")
        elif slide_audio_transcripts:
            print("⚠️ Audio transcripts available but no segments to save")
            print(f"🔧 DEBUG: Transcript keys: {list(slide_audio_transcripts.keys())}")
        else:
            print("❌ No audio transcripts or segments available")

        # Process slide images if we have assignment filename
        slide_image_data = {}
        if assignment_filename:
            # For now, we'll handle this in the app.py when uploading
            # The frontend will need to call /api/process-upload first
            pass

        # Structure the response data
        structured_feedback = {
            "session_id": feedback_session_id,
            "pdf_session_id": image_session_id,
            "feedback_type": "per_slide" if len(feedback_parts) > 1 else "single",
            "slides": [],
            "qa_feedback": None,
            "metadata": {
                "generated_at": time.time(),
                "slide_count": actual_slide_count
                or (len(slide_timestamps_only) if slide_timestamps_only else 1),
                "has_audio": bool(slide_audio_transcripts),
                "has_conversation": bool(conversation_history),
                "audio_splitting_success": (
                    len(original_audio_segments) > 1
                    if original_audio_segments
                    else False
                ),
                "has_qa_audio": bool(qa_audio_transcripts),
                "qa_segments_count": len(qa_audio_transcripts),
            },
            "qa_audio": qa_audio_transcripts,
        }

        # --- URL BUILD (this is where to change!) ---
        # Parse feedback parts into structured data
        qa_feedback_text = None
        slide_feedback_texts = []

        for part in feedback_parts:
            # Check for Q&A feedback - must start with **Q&A Session**
            if part.strip().startswith("**Q&A Session"):
                qa_feedback_text = part
                print(f"✅ Found Q&A feedback: {part[:50]}...")
            else:
                slide_feedback_texts.append(part)
                print(f"📊 Added slide feedback: {part[:50]}...")

        # Process individual slide feedback
        for i, feedback_text in enumerate(slide_feedback_texts):
            slide_num = i + 1
            if slide_timestamps_only and i < len(slide_timestamps_only):
                slide_num = slide_timestamps_only[i]["slideNumber"]

            # Skip if this slide number exceeds the actual slide count (but allow up to 4 slides minimum)
            if actual_slide_count and slide_num > (actual_slide_count + 2):
                print(
                    f"⚠️ Skipping slide {slide_num} as it exceeds actual slide count {actual_slide_count}"
                )
                continue

            # Parse the feedback text to extract individual scores
            parsed_feedback = parse_slide_feedback(feedback_text)

            # audio_url = (
            #     url_for(
            #         "media.get_audio_segment",
            #         session_id=feedback_session_id,
            #         slide_number=slide_num,
            #         _external=False,
            #     )
            #     if has_audio
            #     else None
            # )

            image_url = url_for(
                "media.get_slide_image",
                upload_id=image_session_id,
                slide_number=slide_num,
                type="thumbnail",
                _external=False,
            )

            image_url_full = url_for(
                "media.get_slide_image",
                upload_id=image_session_id,
                slide_number=slide_num,
                type="full",
                _external=False,
            )

            # TODO: Remove print statements
            print(f"📊 Building slide {slide_num} data:")
            print(
                f"  - Audio saved at: {audio_session_data.get(slide_num, 'Not saved')}"
            )

            # --- Prefer S3 URLs, fallback to local endpoints ---
            # Audio URL
            # Check if audio exists for this slide
            has_audio = slide_num in audio_session_data
            audio_url = None

            if has_audio:
                seg_info = audio_session_data.get(slide_num)
                audio_url = (
                    seg_info.get("s3_url") if isinstance(seg_info, dict) else None
                )

            # if s3_audio_url:
            #     audio_url = s3_audio_url
            # else:
            #     audio_url = url_for(
            #         "media.get_audio_segment",
            #         session_id=feedback_session_id,
            #         slide_number=slide_num,
            #         _external=False,
            #     )

            # IMAGE URLs (deterministic S3 keys using upload_id/pdf_session_id)
            s3_thumb_key = build_key(
                image_session_id,
                f"slide_{slide_num}_thumb.png",
                subdir=S3_SLIDE_IMAGES_FOLDER,
            )
            s3_full_key = build_key(
                image_session_id,
                f"slide_{slide_num}_full.png",
                subdir=S3_SLIDE_IMAGES_FOLDER,
            )

            s3_thumb_url = public_url(s3_thumb_key)
            s3_full_url = public_url(s3_full_key)

            # Always prefer S3 (files were uploaded in /upload-slides)
            image_url = s3_thumb_url
            image_url_full = s3_full_url

            print(f"  - Has audio: {has_audio}")
            print(f"  - Audio URL: {audio_url}")
            print(
                f"  - Image URL: /api/slide-image/{image_session_id}/{slide_num}?type=thumbnail"
            )
            print(f"  - Image session: {image_session_id}")
            print(f"  - Audio session: {feedback_session_id}")
            print(f"  - Image Url: {image_url}")
            print(f"  - Image Url Full: {image_url_full}")

            slide_data = {
                "slide_number": slide_num,
                "image_url": image_url,
                "image_url_full": image_url_full,
                "audio_url": audio_url,
                "feedback": parsed_feedback,
                "raw_feedback_text": feedback_text,
            }

            structured_feedback["slides"].append(slide_data)

        # Add Q&A feedback if available
        if qa_feedback_text:
            print(f"📝 Parsing Q&A feedback text...")
            structured_feedback["qa_feedback"] = parse_qa_feedback(qa_feedback_text)
            print(f"✅ Q&A feedback parsed: {structured_feedback['qa_feedback']}")
        else:
            print(f"⚠️ No Q&A feedback text found to parse")

        # Clean up temporary files
        for temp_file in temp_files_to_cleanup:
            try:
                os.unlink(temp_file)
            except Exception as e:
                print(f"⚠️ Failed to cleanup {temp_file}: {e}")

        print(
            f"✅ Structured feedback generated for {len(structured_feedback['slides'])} slides"
        )
        return structured_feedback

    except Exception as e:
        print(f"❌ Feedback generation error: {str(e)}")
        raise Exception(f"Feedback generation error: {str(e)}")


def generate_slide_feedback(
    slide_number, slide_audio_data, slide_content, conversation_history
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

        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=feedback_messages,
            max_completion_tokens=400,
            reasoning_effort="minimal",
        )

        return response.choices[0].message.content

    except Exception as e:
        print(f"❌ Failed to generate feedback for slide {slide_number}: {e}")
        print(f"❌ Exception type: {type(e)}")
        print(f"❌ Slide data: {slide_audio_data}")
        print(f"❌ Slide content available: {bool(slide_content)}")
        import traceback

        traceback.print_exc()
        return f"**Slide {slide_number} Feedback:** Error generating feedback for this slide: {str(e)}"


def generate_qa_feedback(conversation_history, qa_segments=None):
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

        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=feedback_messages,
            max_completion_tokens=300,
            reasoning_effort="minimal",
        )

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
