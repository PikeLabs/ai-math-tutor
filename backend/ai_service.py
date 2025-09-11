import os
import tempfile
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

api_key = os.getenv('OPENAI_API_KEY')
if not api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

client = OpenAI(api_key=api_key)

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
    Transcribe audio file using OpenAI Whisper
    """
    try:
        with open(audio_file, 'rb') as f:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                response_format="text"
            )
        return transcript
    except Exception as e:
        raise Exception(f"Audio transcription error: {str(e)}")

def chat_with_ai(messages, pdf_context=None, audio_transcription=None):
    try:
        print("🤖 AI service called")
        print(f"📄 PDF context provided: {bool(pdf_context)}")
        print(f"🎙️ Audio transcription provided: {bool(audio_transcription)}")
        
        if audio_transcription:
            print(f"📝 Transcription length: {len(audio_transcription)} characters")
            print(f"📝 Transcription preview: {audio_transcription[:100]}...")
        
        # Create system prompt with optional PDF context and audio transcription
        system_content = SYSTEM_PROMPT
        
        if pdf_context:
            system_content += f"\n\nCONTEXT: The entrepreneur/founder is working with the following material:\n\n{pdf_context}\n\nUse this content as reference when providing mentorship. You can refer to specific concepts, frameworks, or case studies from the material while maintaining your conversational mentoring approach."
        
        if audio_transcription:
            print("🎯 Adding audio transcription to AI context!")
            system_content += f"\n\nPRESENTATION WALKTHROUGH: Here's what the founder said while walking through their presentation:\n\n\"{audio_transcription}\"\n\nUse this spoken walkthrough to understand how they presented their ideas, what they emphasized, and tailor your questions accordingly. Focus on areas where their explanation might need strengthening or where you detected uncertainty."
        
        # Add system prompt to the beginning of messages
        full_messages = [{"role": "system", "content": system_content}] + messages
        
        response = client.chat.completions.create(
            model="gpt-5",
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

