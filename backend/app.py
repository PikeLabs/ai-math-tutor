from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import tempfile
from dotenv import load_dotenv
from ai_service import chat_with_ai, transcribe_audio
from pdf_utils import get_assignment_text, get_assignment_slides_range
from feedback_service import generate_feedback
from pdf_image_service import get_slide_image_path, save_slide_images, cleanup_old_sessions
from feedback_service import get_audio_segment_path, cleanup_old_audio_sessions

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        print("🌐 API /chat endpoint called")
        print(f"📋 Content-Type: {request.content_type}")
        
        # Check if this is a multipart request (with audio file)
        if request.content_type and 'multipart/form-data' in request.content_type:
            print("🎵 Multipart request detected - checking for audio...")
            
            # Handle multipart request with audio
            messages_json = request.form.get('messages')
            if not messages_json:
                return jsonify({'error': 'Messages are required'}), 400
            
            import json
            messages = json.loads(messages_json)
            selected_assignment = request.form.get('selectedAssignment')
            
            # Handle audio file if present
            audio_transcription = None
            if 'audio' in request.files:
                audio_file = request.files['audio']
                print(f"🎙️ Audio file received: {audio_file.filename}")
                print(f"📏 Audio file size: {audio_file.content_length} bytes")
                
                if audio_file and audio_file.filename:
                    # Save audio file temporarily
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_audio:
                        audio_file.save(temp_audio.name)
                        print(f"💾 Audio saved to temporary file: {temp_audio.name}")
                        
                        try:
                            # Transcribe audio
                            print("🔊 Starting audio transcription with Whisper...")
                            audio_transcription = transcribe_audio(temp_audio.name)
                            print(f"✅ Audio transcription successful!")
                            print(f"📝 Transcription: {audio_transcription}")
                        except Exception as transcribe_error:
                            print(f"❌ Transcription failed: {transcribe_error}")
                        finally:
                            # Clean up temporary file
                            os.unlink(temp_audio.name)
                            print("🗑️ Temporary audio file cleaned up")
            else:
                print("⚠️ No audio file found in multipart request")
            
        else:
            # Handle regular JSON request
            data = request.get_json()
            messages = data.get('messages', [])
            selected_assignment = data.get('selectedAssignment')
            audio_transcription = None
            
            if not messages:
                return jsonify({'error': 'Messages are required'}), 400
        
        # Extract PDF context if assignment is selected
        pdf_context = None
        if selected_assignment:
            pdf_context = get_assignment_text(selected_assignment)
        
        ai_response = chat_with_ai(messages, pdf_context, audio_transcription)
        
        # Return simple response for entrepreneurship mentoring
        return jsonify({'response': ai_response})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/assignments', methods=['GET'])
def get_assignments():
    try:
        assignments_dir = os.path.join(os.path.dirname(__file__), 'assignments')
        
        if not os.path.exists(assignments_dir):
            return jsonify({'assignments': []}), 200
            
        pdf_files = []
        for filename in os.listdir(assignments_dir):
            if filename.endswith('.pdf'):
                pdf_files.append({
                    'filename': filename,
                    'displayName': filename.replace('.pdf', '').replace('_', ' ').title()
                })
        
        return jsonify({'assignments': pdf_files})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/assignments/<filename>', methods=['GET'])
def get_assignment_file(filename):
    try:
        assignments_dir = os.path.join(os.path.dirname(__file__), 'assignments')
        file_path = os.path.join(assignments_dir, filename)
        
        if not os.path.exists(file_path) or not filename.endswith('.pdf'):
            return jsonify({'error': 'File not found'}), 404
            
        return send_file(file_path, mimetype='application/pdf')
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/assignments/<filename>/slides', methods=['POST'])
def get_assignment_slides(filename):
    try:
        data = request.get_json()
        start_slide = data.get('start_slide')
        end_slide = data.get('end_slide')
        
        if not start_slide or not end_slide:
            return jsonify({'error': 'start_slide and end_slide are required'}), 400
            
        slide_content = get_assignment_slides_range(filename, start_slide, end_slide)
        full_content = get_assignment_text(filename)
        
        if slide_content is None:
            return jsonify({'error': 'Could not extract slide content'}), 404
            
        return jsonify({
            'slide_range': f"{start_slide}-{end_slide}",
            'focused_content': slide_content,
            'full_content': full_content
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/feedback/test', methods=['GET'])
def test_feedback():
    # Simple test endpoint to check if feedback storage works
    test_feedback = "Content structuring: Met: No - Your presentation lacks a clear logical flow, with slides 3-4 containing weak problem statements that fail to establish urgency; reorder to: hook, specific problem, solution, evidence, ask; replace vague \"people struggle with productivity\" with \"73% of remote workers report missing critical project deadlines due to notification overload.\" Delivery: Met: No - You used filler words approximately 1 every 6 seconds (\"um\", \"like\", \"you know\"), spoke too quickly at 180+ WPM during solution explanation, and your voice trailed off when discussing market size; practice this script: \"Our AI assistant reduces notification interruptions by 60% through smart priority filtering.\" Impromptu response: Met: No - When asked about customer acquisition cost, you deflected with \"we're still figuring that out\" instead of providing pilot data; required evidence: specific CAC from beta users, conversion rates, or comparable SaaS benchmarks; model answer: \"Our pilot shows $45 CAC through LinkedIn outreach, with 12% free-to-paid conversion matching industry averages for productivity tools.\" Composure: Met: No - When challenged on market differentiation, you became defensive (\"that's not really fair to say\") and meandered for 45 seconds without addressing the core concern; replacement response: \"You're right to question differentiation - here's our unique moat: real-time learning from user behavior patterns.\" Next time, do this first: lead with one concrete customer pain point and specific metric."
    return jsonify({'feedback': test_feedback})

@app.route('/api/feedback', methods=['POST'])
def generate_pitch_feedback():
    try:
        print("📝 API /feedback endpoint called")
        print(f"📋 Content-Type: {request.content_type}")
        
        # Check if this is a multipart request (with recording)
        if request.content_type and 'multipart/form-data' in request.content_type:
            print("🎵 Multipart request with recording detected...")
            
            # Get conversation history and other data
            messages_json = request.form.get('messages')
            if not messages_json:
                return jsonify({'error': 'Messages are required for feedback'}), 400
            
            import json
            conversation_history = json.loads(messages_json)
            print(f"📝 Received {len(conversation_history)} messages in conversation")
            print(f"📝 Messages types: {[msg.get('role') for msg in conversation_history[:5]]}")
            selected_assignment = request.form.get('selectedAssignment')
            pdf_session_id = request.form.get('pdfSessionId')
            
            # Get slide timestamps if provided
            slide_timestamps = []
            timestamps_json = request.form.get('slideTimestamps')
            if timestamps_json:
                try:
                    slide_timestamps = json.loads(timestamps_json)
                    print(f"📊 Slide timestamps received: {slide_timestamps}")
                except json.JSONDecodeError:
                    print("⚠️ Failed to parse slide timestamps")
            
            # Get actual slide count if provided
            pdf_slide_count = request.form.get('pdfSlideCount')
            if pdf_slide_count:
                try:
                    pdf_slide_count = int(pdf_slide_count)
                    print(f"📄 PDF slide count received: {pdf_slide_count}")
                except:
                    pdf_slide_count = None
            
            print(f"📄 PDF session ID received: {pdf_session_id}")
            
            # Get slide content if assignment is selected
            slide_content = None
            if selected_assignment:
                slide_content = get_assignment_text(selected_assignment)
            
            # Handle recording file if present
            presentation_recording = None
            if 'recording' in request.files:
                recording_file = request.files['recording']
                print(f"🎙️ Recording file received: {recording_file.filename}")
                
                if recording_file and recording_file.filename:
                    presentation_recording = recording_file
            
            # Generate feedback
            feedback_data = generate_feedback(
                conversation_history=conversation_history,
                slide_content=slide_content,
                presentation_recording=presentation_recording,
                slide_timestamps=slide_timestamps,
                assignment_filename=selected_assignment,
                pdf_session_id=pdf_session_id,
                pdf_slide_count=pdf_slide_count
            )
            
        else:
            # Handle regular JSON request without recording
            data = request.get_json()
            conversation_history = data.get('messages', [])
            selected_assignment = data.get('selectedAssignment')
            pdf_session_id = data.get('pdfSessionId')
            pdf_slide_count = data.get('pdfSlideCount')
            
            print(f"📄 PDF session ID received (JSON): {pdf_session_id}")
            print(f"📄 PDF slide count received (JSON): {pdf_slide_count}")
            
            if not conversation_history:
                return jsonify({'error': 'Messages are required for feedback'}), 400
            
            # Get slide content if assignment is selected
            slide_content = None
            if selected_assignment:
                slide_content = get_assignment_text(selected_assignment)
            
            # Parse slide count if it's a string
            if pdf_slide_count:
                try:
                    pdf_slide_count = int(pdf_slide_count)
                except:
                    pdf_slide_count = None
            
            # Generate feedback without recording
            feedback_data = generate_feedback(
                conversation_history=conversation_history,
                slide_content=slide_content,
                presentation_recording=None,
                slide_timestamps=[],
                assignment_filename=selected_assignment,
                pdf_session_id=pdf_session_id,
                pdf_slide_count=pdf_slide_count
            )
        
        return jsonify(feedback_data)
    
    except Exception as e:
        print(f"❌ Feedback generation failed: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/slide-image/<session_id>/<int:slide_number>', methods=['GET'])
def get_slide_image(session_id, slide_number):
    """Get slide image (thumbnail or full size)"""
    try:
        image_type = request.args.get('type', 'thumbnail')  # 'thumbnail' or 'full'
        
        print(f"🖼️ Requesting slide image: session={session_id}, slide={slide_number}, type={image_type}")
        
        image_path = get_slide_image_path(session_id, slide_number, image_type)
        
        print(f"🖼️ Image path resolved to: {image_path}")
        
        if not image_path or not os.path.exists(image_path):
            print(f"❌ Image not found at path: {image_path}")
            # List what files exist in the session directory for debugging
            backend_dir = os.path.dirname(os.path.abspath(__file__))
            session_dir = os.path.join(backend_dir, 'slide_images', session_id)
            if os.path.exists(session_dir):
                files = os.listdir(session_dir)
                print(f"📁 Files in session directory: {files}")
            else:
                print(f"❌ Session directory does not exist: {session_dir}")
            return jsonify({'error': 'Slide image not found'}), 404
        
        print(f"✅ Serving image from: {image_path}")
        return send_file(image_path, mimetype='image/png')
    
    except Exception as e:
        print(f"❌ Error serving slide image: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/audio-segment/<session_id>/<int:slide_number>', methods=['GET'])
def get_audio_segment(session_id, slide_number):
    """Get audio segment for a specific slide"""
    try:
        print(f"🎵 Requesting audio segment: session={session_id}, slide={slide_number}")
        
        audio_path = get_audio_segment_path(session_id, slide_number)
        
        print(f"🎵 Audio path resolved to: {audio_path}")
        
        if not audio_path or not os.path.exists(audio_path):
            print(f"❌ Audio not found at path: {audio_path}")
            # List what files exist in the session directory for debugging
            backend_dir = os.path.dirname(os.path.abspath(__file__))
            session_dir = os.path.join(backend_dir, 'audio_sessions', session_id)
            if os.path.exists(session_dir):
                files = os.listdir(session_dir)
                print(f"📁 Files in audio session directory: {files}")
            else:
                print(f"❌ Audio session directory does not exist: {session_dir}")
            return jsonify({'error': 'Audio segment not found'}), 404
        
        print(f"✅ Serving audio from: {audio_path}")
        return send_file(audio_path, mimetype='audio/wav')
    
    except Exception as e:
        print(f"❌ Error serving audio segment: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/process-upload', methods=['POST'])
def process_upload():
    """Process uploaded PDF to extract slide images"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if not file.filename.endswith('.pdf'):
            return jsonify({'error': 'File must be a PDF'}), 400
        
        # Generate session ID
        import uuid
        session_id = str(uuid.uuid4())
        
        # Save uploaded file to assignments directory so VC system can access it
        assignments_dir = os.path.join(os.path.dirname(__file__), 'assignments')
        os.makedirs(assignments_dir, exist_ok=True)
        
        # Create unique filename to avoid conflicts
        safe_filename = f"uploaded_{session_id}_{file.filename}"
        permanent_pdf_path = os.path.join(assignments_dir, safe_filename)
        
        # Save the uploaded file permanently
        file.save(permanent_pdf_path)
        print(f"📁 Saved uploaded PDF to: {permanent_pdf_path}")
        
        # Extract slide images
        slide_paths = save_slide_images(permanent_pdf_path, session_id)
        
        # Get actual page count from PDF even if image processing fails
        try:
            import PyPDF2
            with open(permanent_pdf_path, 'rb') as pdf_file:
                pdf_reader = PyPDF2.PdfReader(pdf_file)
                actual_page_count = len(pdf_reader.pages)
                print(f"📄 Detected {actual_page_count} pages in PDF")
        except:
            # Fallback: try with react-pdf style detection or default
            actual_page_count = len(slide_paths) if slide_paths else 4
            print(f"⚠️ Could not detect page count, using: {actual_page_count}")
        
        slide_count = len(slide_paths) if slide_paths else actual_page_count
        
        return jsonify({
            'session_id': session_id,
            'slide_count': slide_count,
            'slides': list(slide_paths.keys()) if slide_paths else list(range(1, slide_count + 1)),
            'filename': safe_filename,  # Return the filename for VC system
            'images_processed': bool(slide_paths),
            'message': 'PDF uploaded successfully' + (' with slide images' if slide_paths else ' (images unavailable - install poppler for slide images)')
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cleanup', methods=['POST'])
def cleanup_old_files():
    """Manual cleanup of old files"""
    try:
        cleanup_old_sessions()
        cleanup_old_audio_sessions()
        return jsonify({'message': 'Cleanup completed'})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Run cleanup on startup
    try:
        cleanup_old_sessions()
        cleanup_old_audio_sessions()
    except:
        pass
    
    app.run(debug=True, host='0.0.0.0', port=5001)