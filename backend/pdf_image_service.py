import os
import tempfile
import io
import base64
import subprocess

# Check if PDF processing is available
try:
    from pdf2image import convert_from_path
    from PIL import Image
    # Test if poppler is available
    result = subprocess.run(['which', 'pdftoppm'], capture_output=True)
    if result.returncode == 0:
        PDF_PROCESSING_AVAILABLE = True
        print("✅ PDF processing available")
    else:
        PDF_PROCESSING_AVAILABLE = False
        print("⚠️ PDF processing not available: poppler-utils not found")
        print("💡 Install with: brew install poppler")
except ImportError as e:
    PDF_PROCESSING_AVAILABLE = False
    print(f"⚠️ PDF processing not available: {e}")
    convert_from_path = None
    Image = None

SLIDE_IMAGES_DIR = "slide_images"

def ensure_directories():
    """Ensure required directories exist"""
    # Get absolute path to the backend directory
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    slide_images_path = os.path.join(backend_dir, SLIDE_IMAGES_DIR)
    os.makedirs(slide_images_path, exist_ok=True)

def get_pdf_slide_image(pdf_path, slide_number, thumbnail_size=(300, 200)):
    """
    Extract a specific slide from PDF as image
    
    Args:
        pdf_path: Path to the PDF file
        slide_number: Slide number (1-indexed)
        thumbnail_size: Tuple of (width, height) for thumbnail
    
    Returns:
        Tuple of (thumbnail_bytes, full_size_bytes) or (None, None) if error
    """
    try:
        print(f"📄 Extracting slide {slide_number} from {pdf_path}")
        
        # Convert specific page to image
        images = convert_from_path(
            pdf_path, 
            first_page=slide_number, 
            last_page=slide_number,
            dpi=150  # Good quality for display
        )
        
        if not images:
            print(f"❌ No image found for slide {slide_number}")
            return None, None
        
        slide_image = images[0]
        
        # Create thumbnail
        thumbnail = slide_image.copy()
        thumbnail.thumbnail(thumbnail_size, Image.Resampling.LANCZOS)
        
        # Convert to bytes
        full_size_bytes = image_to_bytes(slide_image)
        thumbnail_bytes = image_to_bytes(thumbnail)
        
        print(f"✅ Successfully extracted slide {slide_number}")
        return thumbnail_bytes, full_size_bytes
        
    except Exception as e:
        print(f"❌ Error extracting slide {slide_number}: {e}")
        return None, None

def image_to_bytes(image, format='PNG'):
    """Convert PIL Image to bytes"""
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format=format)
    return img_byte_arr.getvalue()

def save_slide_images(pdf_path, session_id):
    """
    Extract all slides from PDF and save them for a session
    
    Args:
        pdf_path: Path to the PDF file
        session_id: Unique session identifier
    
    Returns:
        Dictionary mapping slide numbers to image paths
    """
    try:
        print(f"📄 Starting PDF processing: {pdf_path}")
        print(f"📁 PDF file exists: {os.path.exists(pdf_path)}")
        print(f"📏 PDF file size: {os.path.getsize(pdf_path) if os.path.exists(pdf_path) else 'N/A'} bytes")
        
        if not PDF_PROCESSING_AVAILABLE:
            print("⚠️ PDF processing not available - skipping image extraction")
            print("💡 The feedback will work but without slide images")
            print("💡 To enable slide images: brew install poppler")
            # Return empty dict to indicate no images processed
            return {}
        
        ensure_directories()
        # Get absolute path to the backend directory
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        session_dir = os.path.join(backend_dir, SLIDE_IMAGES_DIR, session_id)
        os.makedirs(session_dir, exist_ok=True)
        print(f"📁 Session directory created: {session_dir}")
        
        print(f"📄 Converting PDF to images: {pdf_path}")
        
        # Convert all pages to images with better error handling
        try:
            images = convert_from_path(pdf_path, dpi=150)
            print(f"✅ PDF conversion successful: {len(images)} pages")
        except Exception as convert_error:
            print(f"❌ PDF conversion failed: {convert_error}")
            print(f"❌ Error type: {type(convert_error)}")
            # Try with different settings
            try:
                print("🔄 Retrying with lower DPI...")
                images = convert_from_path(pdf_path, dpi=72)
                print(f"✅ PDF conversion successful with lower DPI: {len(images)} pages")
            except Exception as retry_error:
                print(f"❌ Retry also failed: {retry_error}")
                raise retry_error
        
        if not images:
            raise Exception("No pages found in PDF")
        
        slide_paths = {}
        
        for i, image in enumerate(images):
            slide_number = i + 1
            print(f"📷 Processing slide {slide_number}...")
            
            try:
                # Create thumbnail
                thumbnail = image.copy()
                thumbnail.thumbnail((300, 200), Image.Resampling.LANCZOS)
                
                # Save both full size and thumbnail
                full_path = os.path.join(session_dir, f"slide_{slide_number}_full.png")
                thumb_path = os.path.join(session_dir, f"slide_{slide_number}_thumb.png")
                
                image.save(full_path, 'PNG')
                thumbnail.save(thumb_path, 'PNG')
                
                slide_paths[slide_number] = {
                    'full': full_path,
                    'thumbnail': thumb_path
                }
                
                print(f"✅ Saved slide {slide_number}")
                
            except Exception as save_error:
                print(f"❌ Failed to save slide {slide_number}: {save_error}")
                raise save_error
        
        print(f"✅ Successfully converted {len(images)} slides")
        return slide_paths
        
    except Exception as e:
        print(f"❌ Error converting PDF to images: {e}")
        print(f"❌ Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        return {}

def get_slide_image_path(session_id, slide_number, image_type='thumbnail'):
    """
    Get the file path for a specific slide image
    
    Args:
        session_id: Session identifier
        slide_number: Slide number (1-indexed)
        image_type: 'thumbnail' or 'full'
    
    Returns:
        File path or None if not found
    """
    # Get absolute path to the backend directory
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    session_dir = os.path.join(backend_dir, SLIDE_IMAGES_DIR, session_id)
    # Map 'thumbnail' to 'thumb' for backward compatibility
    file_type = 'thumb' if image_type == 'thumbnail' else image_type
    image_file = f"slide_{slide_number}_{file_type}.png"
    image_path = os.path.join(session_dir, image_file)
    
    if os.path.exists(image_path):
        return image_path
    
    return None

def cleanup_session_images(session_id):
    """Remove all images for a specific session"""
    try:
        session_dir = os.path.join(SLIDE_IMAGES_DIR, session_id)
        if os.path.exists(session_dir):
            import shutil
            shutil.rmtree(session_dir)
            print(f"🗑️ Cleaned up images for session {session_id}")
    except Exception as e:
        print(f"⚠️ Error cleaning up images for session {session_id}: {e}")

def cleanup_old_sessions(max_age_hours=24):
    """Remove old session directories"""
    try:
        import time
        current_time = time.time()
        cutoff_time = current_time - (max_age_hours * 3600)
        
        if not os.path.exists(SLIDE_IMAGES_DIR):
            return
        
        for session_dir in os.listdir(SLIDE_IMAGES_DIR):
            session_path = os.path.join(SLIDE_IMAGES_DIR, session_dir)
            if os.path.isdir(session_path):
                # Check creation time
                creation_time = os.path.getctime(session_path)
                if creation_time < cutoff_time:
                    cleanup_session_images(session_dir)
                    
    except Exception as e:
        print(f"⚠️ Error during cleanup: {e}")