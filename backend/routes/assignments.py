import os
from flask import Blueprint, jsonify, send_file, request
from pdf_utils import get_assignment_text, get_assignment_slides_range

bp = Blueprint("assignments", __name__)


@bp.get("/assignments")
def get_assignments():
    try:
        assignments_dir = os.path.join(os.path.dirname(__file__), "..", "assignments")
        assignments_dir = os.path.abspath(assignments_dir)

        if not os.path.exists(assignments_dir):
            return jsonify({"assignments": []}), 200

        pdf_files = []
        for filename in os.listdir(assignments_dir):
            if filename.endswith(".pdf"):
                pdf_files.append(
                    {
                        "filename": filename,
                        "displayName": filename.replace(".pdf", "")
                        .replace("_", " ")
                        .title(),
                    }
                )

        return jsonify({"assignments": pdf_files})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/assignments/<filename>")
def get_assignment_file(filename):
    try:
        assignments_dir = os.path.join(os.path.dirname(__file__), "..", "assignments")
        file_path = os.path.abspath(os.path.join(assignments_dir, filename))

        if not os.path.exists(file_path) or not filename.endswith(".pdf"):
            return jsonify({"error": "File not found"}), 404

        return send_file(file_path, mimetype="application/pdf")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/assignments/<filename>/slides")
def get_assignment_slides(filename):
    try:
        data = request.get_json()
        start_slide = data.get("start_slide")
        end_slide = data.get("end_slide")

        if not start_slide or not end_slide:
            return jsonify({"error": "start_slide and end_slide are required"}), 400

        slide_content = get_assignment_slides_range(filename, start_slide, end_slide)
        full_content = get_assignment_text(filename)

        if slide_content is None:
            return jsonify({"error": "Could not extract slide content"}), 404

        return jsonify(
            {
                "slide_range": f"{start_slide}-{end_slide}",
                "focused_content": slide_content,
                "full_content": full_content,
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
