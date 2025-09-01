from optparse import Option
import os
import PyPDF2
from typing import Optional
from utils.path_utils import path_in_assignments


def _resolve_pdf_path(pdf: str) -> Optional[str]:
    """
    Return an absolute path to a PDF under ASSIGNMENTS_DIR if it exists
    and has a .pdf extension. Otherwise return None.
    """
    pdf_path = path_in_assignments(pdf)
    if os.path.exists(pdf_path) and pdf_path.lower().endswith(".pdf"):
        return pdf_path

    return None


def extract_pdf_text(pdf_path: str) -> Optional[str]:
    """
    Extract text content from a PDF file.

    Args:
        pdf_path (str): Path to the PDF file

    Returns:
        Optional[str]: Extracted text content or None if extraction fails
    """
    try:
        # if not os.path.exists(pdf_path):
        #     return None

        text_content = ""

        with open(pdf_path, "rb") as file:
            pdf_reader = PyPDF2.PdfReader(file)

            # Extract text from all pages
            for page_num in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_num]
                text_content += page.extract_text() + "\n"

        return text_content.strip() if text_content.strip() else None

    except Exception as e:
        print(f"Error extracting PDF text: {str(e)}")
        return None


def get_assignment_text(pdf: str) -> Optional[str]:
    """
    Get text content from an assignment PDF file.

    Args:
        filename (str): Name of the PDF file in the assignments directory

    Returns:
        Optional[str]: Extracted text content or None if extraction fails
    """

    pdf_path = _resolve_pdf_path(pdf)
    if not pdf_path:
        return None
    return extract_pdf_text(pdf_path)


def extract_pdf_slides_range(
    pdf_path: str, start_slide: int, end_slide: int
) -> Optional[str]:
    """
    Extract text content from a specific range of slides/pages in a PDF.

    Args:
        pdf_path (str): Path to the PDF file
        start_slide (int): Starting slide number (1-indexed)
        end_slide (int): Ending slide number (1-indexed)

    Returns:
        Optional[str]: Extracted text content from the slide range or None if extraction fails
    """
    try:
        # if not os.path.exists(pdf_path):
        #     return None

        text_content = ""

        with open(pdf_path, "rb") as file:
            pdf_reader = PyPDF2.PdfReader(file)
            total_pages = len(pdf_reader.pages)

            # Convert to 0-indexed and validate range
            start_idx = max(0, start_slide - 1)
            end_idx = min(total_pages - 1, end_slide - 1)

            # Extract text from specified pages
            for page_num in range(start_idx, end_idx + 1):
                page = pdf_reader.pages[page_num]
                page_text = page.extract_text()
                text_content += f"--- Slide {page_num + 1} ---\n{page_text}\n\n"

        return text_content.strip() if text_content.strip() else None

    except Exception as e:
        print(f"Error extracting PDF slide range: {str(e)}")
        return None


def get_assignment_slides_range(
    pdf: str,
    start_slide: int,
    end_slide: int,
) -> Optional[str]:
    """
    Get text content from a specific slide range in an assignment PDF file.

    Args:
        filename (str): Name of the PDF file in the assignments directory
        start_slide (int): Starting slide number (1-indexed)
        end_slide (int): Ending slide number (1-indexed)

    Returns:
        Optional[str]: Extracted text content from the slide range or None if extraction fails
    """
    pdf_path = _resolve_pdf_path(pdf)
    if not pdf_path:
        return None

    if start_slide is None or end_slide is None:
        return None

    return extract_pdf_slides_range(pdf_path, start_slide, end_slide)
