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
from prisma.enums import ConversationRole, SessionStatus

# -------- Configuration --------
NUM_STUDENTS = 12
NUM_SESSIONS = 18
DEFAULT_SLIDE_COUNT = 3  # match your example table views
MIN_MSGS = 8
MAX_MSGS = 14

STUDENT_FIRST = [
    "Ada",
    "Alan",
    "Grace",
    "Linus",
    "Katherine",
    "Hedy",
    "Margaret",
    "Edsger",
    "Barbara",
    "Donald",
    "Frances",
    "Ken",
    "Leslie",
    "Niklaus",
    "Guido",
    "Dennis",
    "Brian",
    "Shafi",
    "Tim",
    "John",
    "Edmund",
    "Fred",
    "Geoffrey",
    "Yoshua",
    "Richard",
    "David",
    "Andrej",
    "Volodymyr",
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
        slide = 2  # start around slide 2 to mirror your sample

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
    print("→ Creating feedback for ALL sessions…")
    count = 0
    for sess in sessions:
        pdf_session_id = getattr(sess, "_pdf_session_id", str(uuid.uuid4()))
        slide_count = sess.slideCount or 3

        # Build slideFeedback JSON blob your UI expects
        slide_feedback = make_slide_feedback_blob(
            session_id=sess.id,
            pdf_session_id=pdf_session_id,
            slide_count=slide_count,
        )

        score = random.choice([None, 70, 75, 80, 85, 90])
        db.feedback.create(
            data={
                "sessionId": sess.id,
                "overallFeedback": (
                    "Slide 1–3: clarify problem → solution → value; tighten delivery; "
                    "translate ecology insights into concrete choices and metrics."
                ),
                "presentationScore": score,
                "slideFeedback": slide_feedback,  # <- JSON string
                "strengths": "Clear mission; compelling framing; good visuals.",
                "improvements": "Sharper wedge/ICP; quantify impact; specify data sources/ownership.",
                "viewedByProfessor": random.random() < 0.3,
                "viewedAt": utc_now() if random.random() < 0.3 else None,
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
