"""
Seed the local database with demo data.

Usage (from repo root or from backend/):
- Local:
    cd backend && python prisma/seed.py --reset

Flags:
--reset    Truncate all tables before inserting seed data.

Notes:
- Uses sync Prisma client per schema generator.
- Respects DATABASE_URL from environment (provided via backend/.env).
"""


import os
import random
from datetime import datetime, timedelta, timezone
import argparse

from prisma import Prisma
from prisma.enums import ConversationRole, SessionStatus


# -------- Configuration --------
NUM_STUDENTS = 40
NUM_SESSIONS = 40  # “handful”
MIN_SLIDES = 6
MAX_SLIDES = 12
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
    "Knuth",
    "Hinton",
    "Ng",
    "LeCun",
    "Bengio",
    "Sutton",
    "Silver",
    "Mnih",
    "Goodfellow",   
]

STUDENT_PROMPTS = [
    "We’re building an AI copilot for {segment} teams to reduce rework.",
    "Our wedge is {wedge}; it lets us acquire users faster than incumbents.",
    "Initial traction shows {metric} growth MoM since launch.",
    "We integrate where users already work: {integrations}.",
    "Key risk is {risk}, but our mitigation is {mitigation}.",
]
ASSISTANT_QUESTIONS = [
    "What’s the concrete wedge here, and why now?",
    "Who is the precise ICP, and how are you reaching them?",
    "Talk me through your go-to-market motion for the next 90 days.",
    "Where do these market size numbers come from?",
    "What’s the path to defensibility against copycats?",
    "What assumption would force a pivot if wrong?",
]

SEGMENTS = ["design", "ML", "sales", "support", "data", "ops"]
INTEGRATIONS = ["Slack", "Notion", "Figma", "Jira", "Chrome", "VS Code"]
RISKS = ["distribution", "data quality", "latency", "privacy", "unit economics"]
MITIGATIONS = [
    "partner channel",
    "feedback loop",
    "hybrid retrieval",
    "on-device inference",
    "tiered pricing",
]
WEDGES = [
    "bottom-up freemium",
    "workflow automation",
    "data migration",
    "AI summaries",
    "templates marketplace",
]
METRICS = ["22%", "35%", "48%", "60%+", "2x", "3.5x"]


# --------------------------------


def rand_name():
    return f"{random.choice(STUDENT_FIRST)} {random.choice(STUDENT_LAST)}"


def utc_now():
    return datetime.now(timezone.utc)


def seed_students(db: Prisma):
    print(f"→ Creating {NUM_STUDENTS} students…")
    created = []
    for _ in range(NUM_STUDENTS):
        name = rand_name()
        s = db.student.create(data={"name": name})
        created.append(s)
    print(f"✓ Students: {len(created)}")
    return created


def seed_sessions(db: Prisma, students):
    print(f"→ Creating {NUM_SESSIONS} sessions across students…")
    sessions = []
    for i in range(NUM_SESSIONS):
        st = random.choice(students)
        slide_count = random.randint(MIN_SLIDES, MAX_SLIDES)
        status = random.choice(
            [SessionStatus.created, SessionStatus.processing, SessionStatus.completed]
        )
        created_at = utc_now() - timedelta(
            days=random.randint(0, 10), hours=random.randint(0, 23)
        )

        completed_at = None
        if status == SessionStatus.completed:
            completed_at = created_at + timedelta(hours=random.randint(1, 5))

        sess = db.session.create(
            data={
                "studentId": st.id,
                "slideCount": slide_count,
                "pdfUrl": None,
                "status": status,
                "createdAt": created_at,
                "completedAt": completed_at,
            }
        )
        sessions.append(sess)
    print(f"✓ Sessions: {len(sessions)}")
    return sessions


def seed_conversations(db: Prisma, sessions):
    print("→ Creating conversations for each session…")
    total = 0

    for sess in sessions:
        # Anchor timestamps around session.createdAt
        base_ts = sess.createdAt or (utc_now() - timedelta(days=1))
        msgs = random.randint(MIN_MSGS, MAX_MSGS)
        slide_count = sess.slideCount or random.randint(MIN_SLIDES, MAX_SLIDES)

        current_ts = base_ts
        slide = 1

        for idx in range(msgs):
            is_student = idx % 2 == 0  # alternate: student first
            role = (
                ConversationRole.student if is_student else ConversationRole.assistant
            )

            # Advance timestamp by 1–4 minutes per message
            current_ts = current_ts + timedelta(minutes=random.randint(1, 4))

            # Cycle slides every 1–2 messages
            if idx % 2 == 0:
                slide = min(slide_count, slide + random.choice([0, 1]))

            if is_student:
                content = random.choice(STUDENT_PROMPTS).format(
                    segment=random.choice(SEGMENTS),
                    wedge=random.choice(WEDGES),
                    metric=random.choice(METRICS),
                    integrations=", ".join(random.sample(INTEGRATIONS, k=2)),
                    risk=random.choice(RISKS),
                    mitigation=random.choice(MITIGATIONS),
                )
            else:
                content = random.choice(ASSISTANT_QUESTIONS)

            db.conversation.create(
                data={
                    "sessionId": sess.id,
                    "role": role,  # Enum
                    "content": content,
                    "slideNumber": slide,
                    "timestamp": current_ts,  # required
                }
            )
            total += 1

    print(f"✓ Conversations: {total}")


def seed_feedback(db: Prisma, sessions):
    print("→ Creating feedback for ~50% of sessions…")
    count = 0
    for sess in sessions:
        if random.random() < 0.5:
            score = random.choice([70, 75, 80, 85, 90, None])
            fb = db.feedback.create(
                data={
                    "sessionId": sess.id,
                    "overallFeedback": (
                        "Crisp problem framing; clarify ICP and wedge. "
                        "Add concrete traction metrics and path to defensibility."
                    ),
                    "presentationScore": score,
                    "slideFeedback": "Slides 3–4: tighten problem; Slide 6: support TAM with sources.",
                    "strengths": "Clear vision; good design sense; fast iteration.",
                    "improvements": "Sharper go-to-market; pricing experiment; quantify traction.",
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
