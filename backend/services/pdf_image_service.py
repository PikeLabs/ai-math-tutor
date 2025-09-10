import os, glob, io, subprocess
from config.paths import SLIDE_IMAGES_DIR, ASSIGNMENTS_DIR


# Check if PDF processing is available
try:
    from pdf2image import convert_from_path
    from PIL import Image

    # Test if poppler is available
    result = subprocess.run(["which", "pdftoppm"], capture_output=True)
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


def ensure_directories():
    os.makedirs(SLIDE_IMAGES_DIR, exist_ok=True)


def image_to_bytes(image, format="PNG"):
    """Convert PIL Image to bytes"""
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format=format)
    return img_byte_arr.getvalue()


def save_slide_images(pdf_path, session_id):
    """
    Extract all slides from PDF and save them for a session

    Args:
        pdf_path: Path to the PDF file
        session_id: Unique identifier for the current upload

    Returns:
        Dictionary mapping slide numbers to image paths
    """
    try:
        if not PDF_PROCESSING_AVAILABLE:
            print("⚠️ PDF processing not available - skipping image extraction")
            print("💡 The feedback will work but without slide images")
            print("💡 To enable slide images: brew install poppler")
            # Return empty dict to indicate no images processed
            return {}

        if convert_from_path is None or Image is None:
            print(
                "⚠️ PDF processing libraries not available - skipping image extraction"
            )
            return {}

        ensure_directories()
        # Get absolute path to the backend directory
        slides_dir = os.path.join(SLIDE_IMAGES_DIR, session_id)
        os.makedirs(slides_dir, exist_ok=True)
        print(f"📁 Session directory created: {slides_dir}")

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
                print(
                    f"✅ PDF conversion successful with lower DPI: {len(images)} pages"
                )
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
                full_path = os.path.join(slides_dir, f"slide_{slide_number}_full.png")
                thumb_path = os.path.join(slides_dir, f"slide_{slide_number}_thumb.png")

                image.save(full_path, "PNG")
                thumbnail.save(thumb_path, "PNG")

                slide_paths[slide_number] = {"full": full_path, "thumbnail": thumb_path}

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


# TODO: Rename to cleanup_session_slide_images
def cleanup_session_slide_images(session_id: str) -> None:
    """Remove all images for a specific upload/session id."""
    try:
        slide_dir = os.path.join(SLIDE_IMAGES_DIR, session_id)
        if os.path.exists(slide_dir):
            import shutil

            shutil.rmtree(slide_dir)
            print(f"🗑️ Cleaned up images for session {session_id}")
        else:
            print(f"ℹ️ No slide images found for session {session_id} at {slide_dir}")
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

        for slides_dir in os.listdir(SLIDE_IMAGES_DIR):
            slides_path = os.path.join(SLIDE_IMAGES_DIR, slides_dir)
            if os.path.isdir(slides_path):
                # Check creation time
                creation_time = os.path.getctime(slides_path)
                if creation_time < cutoff_time:
                    cleanup_session_slide_images(slides_dir)

    except Exception as e:
        print(f"⚠️ Error during cleanup: {e}")


def cleanup_local_pdf_images(session_id: str):
    """
    Our saved PDF name pattern: uploaded_{session_id}_{originalName}.pdf
    We remove any that match this processing id.
    """
    pattern = os.path.join(ASSIGNMENTS_DIR, f"uploaded_{session_id}_*.pdf")
    for path in glob.glob(pattern):
        try:
            os.remove(path)
        except Exception as e:
            print(f"⚠️ Failed to remove local PDF {path}: {e}")
