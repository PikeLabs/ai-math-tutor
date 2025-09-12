"""
Seed the local database with demo data.

Usage:
    cd backend && python prisma/seed.py --reset

Flags:
    --reset   Truncate all tables before inserting seed data.
"""

import os
import json
import uuid
import random
from datetime import datetime, timedelta, timezone
import argparse

from prisma import Prisma
from prisma.enums import ConversationRole, SessionStatus, AssetKind

# -------- Configuration --------
NUM_STUDENTS = 12
NUM_SESSIONS = 18
DEFAULT_SLIDE_COUNT = 3  # match your example table views
MIN_MSGS = 8
MAX_MSGS = 14

STUDENT_FIRST = [
    "Test - Ada",
    "Test - Alan",
    "Test - Grace",
    "Test - Linus",
    "Test - Katherine",
    "Test - Hedy",
    "Test - Margaret",
    "Test - Edsger",
    "Test - Barbara",
    "Test - Donald",
    "Test - Frances",
    "Test - Ken",
    "Test - Leslie",
    "Test - Niklaus",
    "Test - Guido",
    "Test - Dennis",
    "Test - Brian",
    "Test - Shafi",
    "Test - Tim",
    "Test - John",
    "Test - Edmund",
    "Test - Fred",
    "Test - Geoffrey",
    "Test - Yoshua",
    "Test - Richard",
    "Test - David",
    "Test - Andrej",
    "Test - Volodymyr",
]

STUDENT_LAST = [
    "Lovelace",
    "Turing",
    "Hopper",
    "Torvalds",
    "Johnson",
    "Lamarr",
    "Hamilton",
    "Dijkstra",
    "Liskov",
    "Knuth",
    "Allen",
    "Thompson",
    "Lamport",
    "Wirth",
    "van Rossum",
    "Ritchie",
    "Kernighan",
    "Goldwasser",
    "Berners-Lee",
    "McCarthy",
    "Codd",
    "Brooks",
    "Hinton",
    "Ng",
    "LeCun",
    "Bengio",
    "Sutton",
    "Silver",
    "Mnih",
    "Goodfellow",
]

# Some generic student prompts + assistant questions
STUDENT_PROMPTS = [
    "CONTEXT FOR THIS INTERVENTION (Question 1 of 2):\n- Full pitch deck: Available ({pdf_key})\n- Founder just presented: Slides 2-3\n\nSLIDES CONTENT:\n--- Slide 2 ---\nElephant Range & Ecology\n \nImage: Global Elephant Range Map\nImage: Conservation Graphic\nElephants are found in a variety of habitats including savannas, forests, deserts, and marshes. They\nlive in matriarchal social groups, typically led by the oldest female. Elephants are herbivores and spend\nup to 16 hours a day eating grasses, leaves, fruits, and bark.\n\n\n--- Slide 3 ---\nWhy Elephants Matter + Conservation\nImage: Elephant Infographic\nElephants face numerous threats such as habitat loss, human-wildlife conflict, and poaching for ivory.\nConservation efforts include anti-poaching patrols, protected areas, and international bans on ivory\ntrade. Raising awareness and supporting sustainable coexistence are crucial for their survival.\n\nI just finished presenting slides 2-3 of my pitch deck. Ask me one specific VC-style question about these slides.",
    "Based on my previous answer, ask me one final follow-up question about slides 2-3. This is question 2 of 2.",
]

ASSISTANT_QUESTIONS = [
    "You list multiple threats and interventions—what’s the single most actionable wedge you’re pursuing first, and who’s the primary buyer/user (park services, NGOs, governments, communities)?",
    "On Slide 2 you highlight range and matriarchal groups—how does that ecological insight translate into a concrete design choice on Slide 3, and what metric proves impact?",
    "What specific, hard-to-get data or capability do you have that NGOs or park authorities can't already access today?",
    "Why start with this wedge over human–wildlife conflict hotspots, and who exactly pays (NGOs, governments, tourism operators)?",
]


def rand_name():
    return f"{random.choice(STUDENT_FIRST)} {random.choice(STUDENT_LAST)}"


def utc_now():
    return datetime.now(timezone.utc)


def make_pdf_artifacts():
    """Return (pdf_session_id, s3_url, s3_key) similar to your example."""
    pdf_session_id = str(uuid.uuid4())
    filename = f"uploaded_{pdf_session_id}_A_elephants_presentation_with_images.pdf"
    bucket = "devaiteacher"
    s3_url = f"https://{bucket}.s3.amazonaws.com/{pdf_session_id}/{filename}"
    s3_key = f"{pdf_session_id}/{filename}"
    return pdf_session_id, s3_url, s3_key


def make_slide_feedback_blob(
    session_id: str, pdf_session_id: str, slide_count: int
) -> str:
    """Build the JSON string your UI expects under Feedback.slideFeedback."""
    slides = []
    for i in range(1, slide_count + 1):
        slides.append(
            {
                "slide_number": i,
                "image_url": f"/api/v1/slide-image/{pdf_session_id}/{i}?type=thumbnail",
                "image_url_full": f"/api/v1/slide-image/{pdf_session_id}/{i}?type=full",
                "audio_url": f"/api/v1/audio-segment/{session_id}/{i}",
                "feedback": {
                    "content_structuring": {
                        "status": random.choice(["met", "not_met"]),
                        "comment": "Add a crisp headline and 2–3 data-backed bullets to ground the claim.",
                    },
                    "delivery": {
                        "status": random.choice(["met", "not_met"]),
                        "comment": "Reduce filler words; keep one sentence per idea with steady pacing.",
                    },
                    "impromptu_response": {
                        "status": "not_applicable",
                        "comment": "Evaluated during Q&A.",
                    },
                    "composure": {
                        "status": "not_applicable",
                        "comment": "Evaluated during Q&A.",
                    },
                },
                "raw_feedback_text": f"**Slide {i}:** tighten narrative; clarify problem → solution → value.",
            }
        )

    qa_feedback = {
        "impromptu_response": {
            "status": "not_met",
            "comment": "Answers drifted; did not address wedge/ICP concretely; lacked decisions and examples.",
        },
        "composure": {
            "status": "not_met",
            "comment": "Hedging and meta-commentary; redirect to structured answers with clear assertions.",
        },
    }

    qa_audio = [
        {
            "start_time": 24.0,
            "end_time": 44.0,
            "transcript": "As soon as the VC stops talking, the recording starts again...",
        },
        {
            "start_time": 44.0,
            "end_time": 53.0,
            "transcript": "Keep recording—I can adjust it... go Mike",
        },
    ]

    blob = {
        "session_id": session_id,
        "pdf_session_id": pdf_session_id,
        "feedback_type": "per_slide",
        "slides": slides,
        "qa_feedback": qa_feedback,
        "metadata": {
            "generated_at": utc_now().timestamp(),
            "slide_count": slide_count,
            "has_audio": True,
            "has_conversation": True,
            "audio_splitting_success": True,
            "has_qa_audio": True,
            "qa_segments_count": len(qa_audio),
        },
        "qa_audio": qa_audio,
    }
    return json.dumps(blob)


# --------------------------------
# DEMO HELPERS (assets + structured feedback)
# --------------------------------


def create_demo_slide_assets(db: Prisma, session_id: str, slide_count: int = 3):
    """
    Insert SlideAsset rows so /feedback/<id> can inject fresh presigned URLs.
    Keys follow the same convention used in services/lib.aws.
    """
    print(f"→ Seeding SlideAsset rows for session {session_id}…")
    for n in range(1, slide_count + 1):
        # Full-size image
        db.slideasset.create(
            data={
                "sessionId": session_id,
                "slideNumber": n,
                "kind": AssetKind.image_full,
                "s3Key": f"slide_images/{session_id}/slide_{n}_full.png",
                "mimeType": "image/png",
            }
        )
        # Thumbnail
        db.slideasset.create(
            data={
                "sessionId": session_id,
                "slideNumber": n,
                "kind": AssetKind.image_thumb,
                "s3Key": f"slide_images/{session_id}/slide_{n}_thumb.png",
                "mimeType": "image/png",
            }
        )
        # Audio
        db.slideasset.create(
            data={
                "sessionId": session_id,
                "slideNumber": n,
                "kind": AssetKind.audio,
                "s3Key": f"audio_sessions/{session_id}/slide_{n}.wav",
                "mimeType": "audio/wav",
                # small variety for demo UI; not required
                "durationMs": random.choice([6000, 8000, 10000]),
            }
        )
    print(f"✓ SlideAssets seeded for session {session_id}")


def _compute_overall_from_slides(slides: list[dict]) -> dict:
    """Mirror backend/services/feedback_service._compute_overall logic (simplified)."""
    met = 0
    considered = 0

    def bump(status: str | None):
        nonlocal met, considered
        if status in ("met", "not_met"):
            considered += 1
            if status == "met":
                met += 1

    for s in slides or []:
        fb = s.get("feedback") or {}
        for k in ("content_structuring", "delivery", "impromptu_response", "composure"):
            bump((fb.get(k) or {}).get("status"))

    score = int(round((met / considered) * 100)) if considered else 0
    return {
        "met": met,
        "considered": considered,
        "score": score,
        "text": f"{met}/{considered} met" if considered else "No score",
    }


def build_structured_demo_feedback(
    session_id: str, student_label: str = "STUDENT"
) -> dict:
    """
    Build a realistic structured 'slideFeedback' blob your UI expects, with very long
    slide transcripts and Q&A transcripts. image/audio URLs are injected later by the
    read-path using SlideAsset rows we seed separately.
    """
    # --- Long slide transcripts (150–250+ words each) ---
    tx1 = (
        "We open by naming the user, the moment of pain, and the sharp claim we will defend. Over the last "
        "two quarters we ran discovery sessions with forty-two participants across three distinct subsegments "
        "(new instructors, substitute teachers, and department leads) and coded the interviews to isolate where "
        "time is lost and decisions go stale. The consistent pattern is that people do not struggle with ideation; "
        "they struggle with velocity to first visible value. This slide establishes that we are not making a vague "
        "appeal to inspiration—we are focusing on the precise sequence from sign-up to first completed action. We "
        "show a single sentence value proposition and one chart that anchors expectations: a baseline distribution of "
        "onboarding times with a heavy tail that routinely exceeds two minutes. We are explicit that our wedge is to "
        "compress that tail by eliminating indecision traps, reducing cognitive branching, and surfacing a default path "
        "that feels safe to try. You should expect us to prove that our claim holds across roles, devices, and contexts, "
        "and that any improvement persists past novelty. Finally, we preview how this sets up the rest of the narrative: "
        "problem clarity, one testable promise, evidence that the promise holds, and the operational implication for the "
        "team executing the next two sprints."
    )

    tx2 = (
        "The approach is a two-step flow that converts the abstract goal into a concrete next action without ceremony. "
        "In step one, we ask for exactly one high-signal input that determines the recommended path; in step two, we "
        "render a pre-filled state the user can accept as-is or tweak in under five seconds. We rejected three tempting "
        "alternatives—a wizard with many micro-decisions, a feed of inspirational templates, and an AI chat gatekeeper—"
        "because each introduced latency, ambiguity, or both. The pilot compared our flow against the status quo for a "
        "matched cohort of forty-two; we instrumented taps, dwell time, backtracks, and abandonment. Median taps dropped "
        "by forty-three percent; the ninety-fifth percentile time-to-first-value fell below forty seconds; abandonment in "
        "the first minute declined materially. The chart here is not decorative: it is the explicit ladder we will use to "
        "link micro-changes to the macro outcome we care about—activation and retained weekly use. We call out threats to "
        "validity (small n, motivated testers, novelty) and show the next design guardrails we will use to derisk those."
    )

    tx3 = (
        "Now we walk the exact path the user takes. From the dashboard, a single prominent entry point carries the primary "
        "job. The first screen asks for the one input that collapses the state space; we name it out loud and display it as a "
        "verb, not a label. The second screen renders a ready-to-ship draft with the defaults we observed expert users choose "
        "most often. We annotate the screen with hypotheses tied to specific micro-metrics: whether the user scrolls before "
        "they act, whether they touch secondary affordances, whether they request help. Each callout here is a test we will "
        "run next week, not a design flourish. The point of the demo is not to celebrate motion—it is to make the evaluation "
        "of our decision quality legible: if the step transition is fast but comprehension is low, that shows up in error rate; "
        "if comprehension is high but intent stalls, that shows up in dwell time and backtracks. The walkthrough ends with the "
        "first durable value artifact saved, and the follow-on invitation is contextual, not a modal. This is intentionally dull: "
        "no magic, no surprise, just fewer chances to get lost and more chances to feel progress."
    )

    # --- Ultra-long Q&A answers (≥ 8× longer than a single-sentence answer) ---
    def long_answer_1() -> str:
        return (
            f"{student_label}: Our first concrete user is the solo teacher piloting the tool in a mixed-ability classroom, "
            "because they experience the full cost of setup friction without administrative support. The metric we own is "
            "signup-to-first-action under thirty seconds, measured from account creation to the first saved artifact with no "
            "assistance. In the pilot we also logged unguided task completion as a secondary signal to confirm that speed didn’t "
            "come at the expense of comprehension. Concretely, we removed optional branches that looked empowering but actually "
            "created decision paralysis, and we pre-filled defaults based on the most common successful configurations we observed "
            "in interviews. When teachers hesitated, it was almost always because the first screen asked them to name a goal they "
            "hadn’t fully formed; our change reframed that prompt as a concrete example they could accept or lightly edit. We then "
            "tracked the micro-events that precede a confident click—cursor movement, dwell before the call-to-action, and backtracks—"
            "so we could tell the difference between a fast but confused click and a fast and intentional one. Where the metric gets "
            "stronger is in heterogeneous conditions: different devices, noisy classrooms, low bandwidth. We ran spot checks with a "
            "tablet and a three-year-old Chromebook and saw the same sub-thirty-second pattern, which makes us confident the win is "
            "in reducing mental branching, not just rendering faster. Finally, we’re explicit about the failure mode: if the first "
            "action is quick but the second stalls, we will see it in day-two usage, so we’ve queued an experiment to connect that "
            "first artifact to a natural next step without any modal or tutorial—just an inline prompt tied to the user’s intent."
        )

    def long_answer_2() -> str:
        return (
            f"{student_label}: The adoption signal that moved was activation—users completing the first real task in a session—and "
            "the retention signal that followed was day-seven return. In the matched cohort, activation increased from forty-one to "
            "fifty-seven percent; day-seven retention rose six points with a confidence interval that is honest about the small n. "
            "We explain why that’s plausible: the flow converts a fuzzy objective into a tangible draft in two taps, so the user has "
            "something to react to instead of an empty canvas. We also instrumented a humility check: how often users invoked help, "
            "restarted the flow, or abandoned after the draft appeared. Those numbers fell in the same direction as activation, which "
            "suggests comprehension improved rather than people merely clicking faster. There are two caveats. First, novelty: early users "
            "are motivated and skew positive; our next test expands to two classes with no direct researcher presence to remove that bias. "
            "Second, survivorship: we filtered out accounts created by staff for demos; in production we will keep them and measure variance "
            "by acquisition channel. If these effects hold at larger scale, we’ll treat activation as necessary but insufficient and shift the "
            "North Star to weekly retained creators, which connects the micro-metric to an outcome the business actually cares about."
        )

    def long_answer_3() -> str:
        return (
            f"{student_label}: We seriously considered an AI onboarding wizard because it demoed well, but it introduced latency and hid "
            "the simple two-tap path behind a conversation that not everyone wanted. The tradeoff looked elegant until we measured it: users "
            "spent longer negotiating with the assistant than it would have taken to accept a sensible default. More importantly, it raised the "
            "cognitive bar—now you had to explain your goal in words before seeing anything. We rejected that because it shifted effort from the "
            "system to the human. With the current design, the system does the guessing: we surface a ready-to-ship draft that encodes best-known "
            "choices and invites a tiny edit if needed. If we had gone the other way, we would likely have seen higher novelty engagement but lower "
            "sustained use, since the wizard becomes a gate rather than a ramp. What would break is the very promise we’re making about time-to-value. "
            "We kept a thin seam where AI still helps—auto-labeling and copy tightening after the draft exists—so the assist comes after momentum, not "
            "before it. That sequencing preserves clarity and keeps latency off the critical path."
        )

    # VC questions
    q1 = "Who is the first concrete user and what metric proves time-to-first-value improved?"
    q2 = "Your evidence shows fewer taps—what adoption or retention metric moved and by how much?"
    q3 = "What tradeoff did you reject and why—what would break if you chose the other path?"

    # Build per-slide objects with long Q&A
    slide_feedback = [
        {
            "slide_number": 1,
            "feedback": {
                "content_structuring": {
                    "status": "met",
                    "comment": "Clear setup and one-line value prop; tighten the header to use a verb-first claim.",
                },
                "delivery": {
                    "status": "not_met",
                    "comment": "Warm but meandering opener; remove hedges and land the claim in <8s with one pause.",
                },
                "impromptu_response": {
                    "status": "not_applicable",
                    "comment": "Evaluated in Q&A; not scored at slide time.",
                },
                "composure": {
                    "status": "not_applicable",
                    "comment": "Evaluated in Q&A; not scored at slide time.",
                },
            },
            "raw_feedback_text": (
                "**Slide 1:**\n"
                "- Content structuring: ✓ - The argument opens cleanly with problem and value; headline can be verb-first.\n"
                "- Delivery: ✗ - Reduce filler and land the core claim crisply in under 8 seconds.\n"
                "- Impromptu response: N/A - Scored during Q&A\n"
                "- Composure: N/A - Scored during Q&A"
            ),
            "transcript": tx1,
        },
        {
            "slide_number": 2,
            "feedback": {
                "content_structuring": {
                    "status": "met",
                    "comment": "Evidence is present and labeled; add a single metric ladder to make causality explicit.",
                },
                "delivery": {
                    "status": "met",
                    "comment": "Pacing steady with clear emphasis on numbers; keep the brief pause before the result.",
                },
                "impromptu_response": {
                    "status": "not_applicable",
                    "comment": "Evaluated in Q&A; not scored at slide time.",
                },
                "composure": {
                    "status": "not_applicable",
                    "comment": "Evaluated in Q&A; not scored at slide time.",
                },
            },
            "raw_feedback_text": (
                "**Slide 2:**\n"
                "- Content structuring: ✓ - Data supports the claim; add metric ladder for clarity.\n"
                "- Delivery: ✓ - Confident read; keep numeric emphasis.\n"
                "- Impromptu response: N/A - Scored during Q&A\n"
                "- Composure: N/A - Scored during Q&A"
            ),
            "transcript": tx2,
        },
        {
            "slide_number": 3,
            "feedback": {
                "content_structuring": {
                    "status": "met",
                    "comment": "Walkthrough maps to the stated objective; label each callout with a testable hypothesis.",
                },
                "delivery": {
                    "status": "not_met",
                    "comment": "Vague verbs (“navigate”)—replace with concrete actions; slow down the step transitions.",
                },
                "impromptu_response": {
                    "status": "not_applicable",
                    "comment": "Evaluated in Q&A; not scored at slide time.",
                },
                "composure": {
                    "status": "not_applicable",
                    "comment": "Evaluated in Q&A; not scored at slide time.",
                },
            },
            "raw_feedback_text": (
                "**Slide 3:**\n"
                "- Content structuring: ✓ - Flow aligns to objective with testable steps.\n"
                "- Delivery: ✗ - Use concrete verbs and slower transitions.\n"
                "- Impromptu response: N/A - Scored during Q&A\n"
                "- Composure: N/A - Scored during Q&A"
            ),
            "transcript": tx3,
        },
    ]

    # Attach long Q&A per slide
    qa_map = {
        1: {
            "question": q1,
            "answer": long_answer_1(),
            "start_time": 12.0,
            "end_time": 32.0,
        },
        2: {
            "question": q2,
            "answer": long_answer_2(),
            "start_time": 34.0,
            "end_time": 58.0,
        },
        3: {
            "question": q3,
            "answer": long_answer_3(),
            "start_time": 60.0,
            "end_time": 84.0,
        },
    }

    for s in slide_feedback:
        sn = s["slide_number"]
        qa = qa_map.get(sn)
        if qa:
            s["qa"] = qa
            s["qa_transcript"] = f"VC: {qa['question']}\n{qa['answer']}"

    # Long dialogue_text: multiple back-and-forth lines (beyond simple Q→A)
    dialogue_lines = [
        f"VC: {q1}",
        long_answer_1(),
        "VC: That’s specific—how do you separate speed from guess-and-check behavior?",
        f"{student_label}: We watch for backtracks and premature edits; a fast path with low correction is intentional. When we see flailing, the pattern is different—rapid cursor movement and repeated toggles without a save.",
        f"VC: {q2}",
        long_answer_2(),
        "VC: The cohort is small; what happens when motivation drops outside a pilot?",
        f"{student_label}: We’re planning a no-researcher condition across two classes. If motivation falls, we expect a smaller lift but still a lift; the mechanism is architectural, not theatrical.",
        f"VC: {q3}",
        long_answer_3(),
        "VC: If latency constraints improve, would you revisit the wizard?",
        f"{student_label}: Possibly, but only post-draft, as a refining assistant. The first mile must remain friction-free and non-negotiable.",
    ]
    dialogue_text = "\n".join(dialogue_lines)

    structured = {
        "session_id": session_id,
        "pdf_session_id": session_id,  # we seed assets under this id; presign will look them up
        "feedback_type": "per_slide",
        "slides": slide_feedback,
        "qa_feedback": {
            "impromptu_response": {
                "status": "met",
                "comment": "Answers named a user, a metric, and a decision; keep that crispness.",
            },
            "composure": {
                "status": "met",
                "comment": "Handled pointed follow-ups calmly; acknowledged limits and proposed next test.",
            },
        },
        "metadata": {
            "generated_at": utc_now().timestamp(),
            "slide_count": 3,
            "has_audio": True,
            "has_conversation": True,
            "audio_splitting_success": True,
            "has_qa_audio": True,
            "qa_segments_count": 3,
        },
        "transcripts": {
            "overall_presentation": f"[Slide 1] {tx1}\n[Slide 2] {tx2}\n[Slide 3] {tx3}",
            "presentation": f"{tx1}\n\n{tx2}\n\n{tx3}",
            "per_slide": {"1": tx1, "2": tx2, "3": tx3},
            "qa_responses": [
                {
                    "start_time": qa_map[1]["start_time"],
                    "end_time": qa_map[1]["end_time"],
                    "transcript": qa_map[1]["answer"],
                },
                {
                    "start_time": qa_map[2]["start_time"],
                    "end_time": qa_map[2]["end_time"],
                    "transcript": qa_map[2]["answer"],
                },
                {
                    "start_time": qa_map[3]["start_time"],
                    "end_time": qa_map[3]["end_time"],
                    "transcript": qa_map[3]["answer"],
                },
            ],
            "dialogue_text": dialogue_text,
        },
    }

    # Overall score mirroring backend’s logic
    structured["overall"] = _compute_overall_from_slides(structured["slides"])
    return structured


# --------------------------------


def seed_students(db: Prisma):
    print(f"→ Creating {NUM_STUDENTS} students…")
    created = []
    for _ in range(NUM_STUDENTS):
        s = db.student.create(data={"name": rand_name()})
        created.append(s)
    print(f"✓ Students: {len(created)}")
    return created


def seed_sessions(db: Prisma, students):
    print(f"→ Creating {NUM_SESSIONS} sessions across students…")
    sessions = []
    for _ in range(NUM_SESSIONS):
        st = random.choice(students)

        # pick status but bias toward completed so timestamps look right
        status = random.choices(
            population=[
                SessionStatus.completed,
                SessionStatus.processing,
                SessionStatus.created,
            ],
            weights=[0.6, 0.25, 0.15],
            k=1,
        )[0]

        created_at = utc_now() - timedelta(
            days=random.randint(0, 5), hours=random.randint(0, 23)
        )
        completed_at = (
            created_at + timedelta(hours=random.randint(1, 3))
            if status == SessionStatus.completed
            else None
        )

        # create S3-style pdfUrl and remember pdf_session_id for slide URLs
        pdf_session_id = str(uuid.uuid4())
        filename = f"uploaded_{pdf_session_id}_A_elephants_presentation_with_images.pdf"
        bucket = "devaiteacher"
        pdf_url = f"https://{bucket}.s3.amazonaws.com/{pdf_session_id}/{filename}"

        slide_count = random.randint(3, 8)  # or stick with your default

        sess = db.session.create(
            data={
                "studentId": st.id,
                "slideCount": slide_count,
                "pdfUrl": pdf_url,  # <- ensure non-null
                "status": status,
                "createdAt": created_at,
                "completedAt": completed_at,
            }
        )
        # stash for feedback builder
        sess._pdf_session_id = pdf_session_id  # type: ignore
        sessions.append(sess)
    print(f"✓ Sessions: {len(sessions)}")
    return sessions


def seed_conversations(db: Prisma, sessions):
    print("→ Creating conversations for each session…")
    total = 0
    for sess in sessions:
        base_ts = (sess.createdAt or utc_now()) + timedelta(minutes=1)
        current_ts = base_ts

        # We’ll build a few blocks: [student context on slides 2-3] -> assistant VC question -> student follow-up -> assistant follow-up
        blocks = []

        # 1st block
        pdf_key = f"uploaded_{getattr(sess, '_pdf_session_id', str(uuid.uuid4()))}_A_elephants_presentation_with_images.pdf"
        blocks.append(
            {
                "role": "student",
                "slideNumber": 3,
                "content": STUDENT_PROMPTS[0].format(pdf_key=pdf_key),
            }
        )
        blocks.append(
            {
                "role": "assistant",
                "slideNumber": 3,
                "content": random.choice(ASSISTANT_QUESTIONS),
            }
        )
        blocks.append(
            {
                "role": "student",
                "slideNumber": None,
                "content": STUDENT_PROMPTS[1],
            }
        )
        blocks.append(
            {
                "role": "assistant",
                "slideNumber": None,
                "content": random.choice(ASSISTANT_QUESTIONS),
            }
        )

        # Optional: add a 2nd/3rd mini-block to increase variety
        extra_blocks = random.randint(1, 2)
        for _ in range(extra_blocks):
            blocks.extend(
                [
                    {
                        "role": "student",
                        "slideNumber": 3,
                        "content": STUDENT_PROMPTS[0].format(pdf_key=pdf_key),
                    },
                    {
                        "role": "assistant",
                        "slideNumber": 3,
                        "content": random.choice(ASSISTANT_QUESTIONS),
                    },
                    {
                        "role": "student",
                        "slideNumber": None,
                        "content": STUDENT_PROMPTS[1],
                    },
                    {
                        "role": "assistant",
                        "slideNumber": None,
                        "content": random.choice(ASSISTANT_QUESTIONS),
                    },
                ]
            )

        # Now insert them with realistic timestamps
        for idx, m in enumerate(blocks):
            current_ts = current_ts + timedelta(minutes=random.randint(1, 5))
            role_enum = (
                ConversationRole.student
                if m["role"] == "student"
                else ConversationRole.assistant
            )
            db.conversation.create(
                data={
                    "sessionId": sess.id,
                    "role": role_enum,
                    "content": m["content"],
                    "slideNumber": m["slideNumber"],
                    "timestamp": current_ts,
                }
            )
            total += 1
    print(f"✓ Conversations: {total}")


def seed_feedback(db: Prisma, sessions):
    print("→ Creating demo feedback…")

    if not sessions:
        print("⚠️ No sessions found; skipping feedback seeding.")
        return

    # Pick 2 sessions deterministically for demo data
    demo_sessions = sessions[:2]
    count = 0

    for sess in demo_sessions:
        # Ensure these demo sessions look 'completed'
        try:
            db.session.update(
                where={"id": sess.id},
                data={
                    "status": SessionStatus.completed,
                    "completedAt": (sess.createdAt or utc_now()) + timedelta(hours=2),
                    "slideCount": 3,
                },
            )
        except Exception:
            pass

        # ← NEW: get the real student name for this session
        try:
            st = db.student.find_unique(where={"id": sess.studentId})
            student_label = (st.name or "STUDENT").upper()
        except Exception:
            student_label = "STUDENT"

        # Seed assets so presigned URLs get injected on read
        create_demo_slide_assets(db, sess.id, slide_count=3)

        # Build rich, long-form structured feedback using the real student label
        structured = build_structured_demo_feedback(
            session_id=sess.id,
            student_label=student_label,
        )

        db.feedback.create(
            data={
                "sessionId": sess.id,
                "overallFeedback": (
                    "Candid, slide-by-slide critique with emphasis on structure, delivery, and decision quality; "
                    "Q&A shows concrete users, metrics, and next tests."
                ),
                "presentationScore": structured.get("overall", {}).get("score", 0),
                "slideFeedback": json.dumps(structured),
                "strengths": "Clear throughline; names metrics; acknowledges limits.",
                "improvements": "Verb-first headlines; slower transitions; label hypotheses on walkthrough.",
                "viewedByProfessor": random.random() < 0.5,
                "viewedAt": utc_now() if random.random() < 0.5 else None,
            }
        )
        count += 1

    print(f"✓ Feedback records: {count}")


def reset(db: Prisma):
    print("⚠️  RESET: truncating tables (order matters due to FKs)…")
    db.conversation.delete_many()
    db.feedback.delete_many()
    db.session.delete_many()
    db.student.delete_many()
    print("✓ All tables emptied.")


def main():
    parser = argparse.ArgumentParser(description="Seed database with demo data")
    parser.add_argument(
        "--reset", action="store_true", help="truncate tables before seeding"
    )
    args = parser.parse_args()

    print(f"DATABASE_URL: {os.getenv('DATABASE_URL', '(not set)')}")
    db = Prisma()
    db.connect()
    try:
        if args.reset:
            reset(db)

        students = seed_students(db)
        sessions = seed_sessions(db, students)
        seed_conversations(db, sessions)
        seed_feedback(db, sessions)

        print("🎉 Seed complete.")
    finally:
        db.disconnect()


if __name__ == "__main__":
    main()
