import os
from openai import OpenAI


AI_API_KEY = os.getenv("OPENAI_API_KEY")
CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-5")  # overridable via env
MAX_CONTEXT_CHARS = int(os.getenv("MAX_CONTEXT_CHARS", "15000"))  # hard guard
MAX_TRANSCRIPT_CHARS = int(
    os.getenv("MAX_TRANSCRIPT_CHARS", "8000")
)  # optional tighter guard
TRANSCRIBE_MODEL = os.getenv("OPENAI_TRANSCRIBE_MODEL", "whisper-1")

if not AI_API_KEY:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

client = OpenAI(api_key=AI_API_KEY)

SYSTEM_PROMPT = """You are a seasoned VC mentor and entrepreneurship professor giving live, voice-based feedback to a founder who's walking you through a pitch deck.

You’ve reviewed the deck in advance and are now having a conversation with the founder. Your goal is not to summarize slides or offer long critiques, but to poke holes, ask tough questions, and help them sharpen their story.

Key Behaviors

- Ask probing questions — Be curious. Challenge assumptions. Use follow-ups like:
  - “Why did you lead with that?”
  - “What makes you confident in that number?”
  - “Who exactly is the user here?”

- Be brief and direct — Your job is to nudge them to think, not lecture.  
  Think: 1–2 sentences max, then a question.

- Stay in character — Speak like a VC in a live pitch: sharp, conversational, a bit skeptical but supportive.

- Reference the deck — You’ve seen the slides. Speak to them like you remember them, not like you’re reading them out loud.

- No tutoring or explaining frameworks — You’re a coach, not a professor.

Sample Reactions

(Slide 3: Problem)  
> “Okay, so you’re saying people are terrified about falling behind… but who exactly? That’s pretty broad.”  
>  
> “Why open with the Jensen quote? It’s catchy, sure — but does it reflect what *your* users are actually saying?”

(Slide 4: Solution)  
> “You’re calling it a ‘copilot’ — what does that mean in practice? Is it reactive, proactive, embedded in workflows?”  
>  
> “What’s the wedge? Why would someone start using this instead of all the other AI tools?”

(Slide 5: Market)  
> “$2.7B across B2B and consumer… How’d you get those numbers? Feels optimistic unless you’ve got a wedge.”

(Slide 6: Ask)  
> “You’re raising $250k — cool. What’s the biggest milestone you need to hit before your next round?”  
>  
> “$20k MRR sounds specific — why that number?”

Final Note

Your job is to help them think sharper by acting like a real VC:  
curious, concise, a little skeptical, and totally focused on what will make this business succeed or fail.
"""


def transcribe_audio(audio_file):
    """
    Transcribe audio file using OpenAI Whisper-compatible endpoint.
    Returns a plain string.
    """
    try:
        with open(audio_file, "rb") as f:
            transcript = client.audio.transcriptions.create(
                model=TRANSCRIBE_MODEL, file=f, response_format="text"
            )

        # Some SDK versions return a string; others a wrapper. Normalize.
        return transcript if isinstance(transcript, str) else str(transcript)
    except Exception as e:
        raise Exception(f"Audio transcription error: {str(e)}")


# TODO: Should we split audio vs PDF?
def chat_with_ai(messages, pdf_context=None, audio_transcription=None):
    try:
        print("🤖 AI service called")
        print(f"📄 PDF context provided: {bool(pdf_context)}")
        print(f"🎙️ Audio transcription provided: {bool(audio_transcription)}")

        # ---- Normalize inbound messages to {role, content} strings ----
        safe_messages = []
        for m in messages or []:
            role = str(m.get("role", "")).strip() or "user"
            content = str(m.get("content", "")).strip()
            if content:
                safe_messages.append({"role": role, "content": content})
        if not safe_messages:
            # Fallback to a stub so we don't send empty user content
            safe_messages = [{"role": "user", "content": "Let's begin."}]

            # ---- Trim very large contexts to avoid token explosions ----

        def trim(txt: str, limit: int) -> str:
            if not txt:
                return ""
            s = str(txt)
            return (
                s if len(s) <= limit else (s[: limit - 1000] + "\n\n[...truncated...]")
            )

        pdf_context_trimmed = trim(pdf_context, MAX_CONTEXT_CHARS)
        transcription_trimmed = trim(audio_transcription, MAX_TRANSCRIPT_CHARS)

        if transcription_trimmed:
            audio_transcription_length = len(audio_transcription)
            trimmed_transcription_length = len(transcription_trimmed)
            print(
                f"📝 Transcription length trimmed from {audio_transcription_length} to {trimmed_transcription_length} characters"
            )
            print(f"📝 Transcription preview: {transcription_trimmed[:100]}...")

        # ---- Build system message ----
        # Create system prompt with optional PDF context and audio transcription
        system_content = SYSTEM_PROMPT

        if pdf_context_trimmed:
            system_content += (
                "\n\nCONTEXT: The entrepreneur/founder is working with the following material:\n\n"
                f"{pdf_context_trimmed}\n\n"
                "Use this content as reference when providing mentorship.\n\n"
                "You can refer to specific concepts, frameworks, or case studies from the material while maintaining your conversational mentoring approach."
            )

        if transcription_trimmed:
            system_content += (
                "\n\nPRESENTATION WALKTHROUGH: Here's what the founder said while walking through their presentation:\n\n"
                f'"{transcription_trimmed}"\n\n'
                "Use this spoken walkthrough to understand how they presented their ideas, what they emphasized, and tailor your questions accordingly\n\n."
                "Focus on areas where their explanation might need strengthening or where you detected uncertainty."
            )

        # full_messages = [{"role": "system", "content": system_content}] + messages
        full_messages = [{"role": "system", "content": system_content}] + safe_messages

        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=full_messages,
            max_completion_tokens=800,
            reasoning_effort="minimal",
            # temperature=0.7
        )

        ai_response = response.choices[0].message.content

        # Return simple text response for entrepreneurship mentoring
        return ai_response

    except Exception as e:
        raise Exception(f"AI service error: {str(e)}")
