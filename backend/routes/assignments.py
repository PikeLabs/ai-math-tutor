import os
from flask import Blueprint, send_file, request
from utils.pdf_utils import get_assignment_text, get_assignment_slides_range
from config.paths import ASSIGNMENTS_DIR
from utils.http import not_found, bad_request, ok
from utils.path_utils import path_in_assignments

bp = Blueprint("assignments", __name__)


@bp.get("/assignments/<filename>")
def serve_assignment_pdf(filename):
    """
    Route: GET /assignments/<filename>
    Purpose: Send the original assignment PDF file.
    """

    file_path = path_in_assignments(filename)
    if not os.path.exists(file_path) or not filename.lower().endswith(".pdf"):
        return not_found(f"File: {filename} not found")

    return send_file(file_path, mimetype="application/pdf")


@bp.post("/assignments/<filename>/slides")
def extract_assignment_text_range(filename):
    """
    Route: POST /assignments/<filename>/slides
    Purpose: Extract TEXT for a requested slide range from the given assignment PDF.
             (This does NOT serve images. It's purely text extraction.)
    Body: { "start_slide": number, "end_slide": number }
    """

    file_path = path_in_assignments(filename)
    if not os.path.exists(file_path):
        print("assignments/slides missing:", file_path)
        print("ASSIGNMENTS_DIR contents:", os.listdir(ASSIGNMENTS_DIR))
        return not_found("PDF not found")

    data = request.get_json(silent=True) or {}
    start_slide = data.get("start_slide")
    end_slide = data.get("end_slide")

    if start_slide is None or end_slide is None:
        return bad_request("start_slide and end_slide are required")

    slide_content = get_assignment_slides_range(filename, start_slide, end_slide)
    full_content = get_assignment_text(filename)

    if slide_content is None:
        return not_found("Could not extract slide content")

    return ok(
        {
            "slide_range": f"{start_slide}-{end_slide}",
            "focused_content": slide_content,
            "full_content": full_content,
        }
    )
