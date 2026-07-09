import io
from pypdf import PdfReader

# ── Mock constants kept for reference / dev tooling only. ──────────────────
# These are NEVER returned as real extraction results. Do not use them as
# fallbacks in the extraction path.


# ── End mock constants ──────────────────────────────────────────────────────


def extract_text_from_pdf(pdf_bytes: bytes, filename: str = "") -> str:
    """
    Extracts text from a PDF file.

    Strategy:
      1. Try native text extraction via pypdf (fast, zero cost).
         Return immediately if ≥100 meaningful characters are found.
      2. If the PDF has no embedded text (scanned/image-only), convert pages
         to images with pdf2image and run pytesseract OCR.
      3. On genuine failure (corrupted file, empty scan, etc.) raise
         RuntimeError with a clear reason — no silent placeholder text.

    Signature is unchanged: (pdf_bytes: bytes, filename: str = "") -> str
    """

    # ── Layer 1: native embedded-text extraction ────────────────────────────
    native_text = ""
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        for page in reader.pages:
            text = page.extract_text()
            if text:
                native_text += text + "\n"
    except Exception as e:
        print(f"[ocr] pypdf extraction failed for '{filename}': {e}")
        # Don't raise yet — attempt OCR before giving up.

    if len(native_text.strip()) >= 100:
        return native_text

    # ── Layer 2: OCR for scanned / image-based PDFs ─────────────────────────
    print(f"[ocr] Native text insufficient ({len(native_text.strip())} chars) "
          f"for '{filename}'. Attempting OCR via pdf2image + pytesseract.")

    try:
        from pdf2image import convert_from_bytes  # type: ignore
        import pytesseract                         # type: ignore
    except ImportError as e:
        raise RuntimeError(
            f"OCR dependencies missing ({e}). "
            "Install: pip install pdf2image pytesseract  "
            "and system packages: poppler-utils tesseract-ocr"
        ) from e

    try:
        images = convert_from_bytes(pdf_bytes, dpi=200)
    except Exception as e:
        raise RuntimeError(
            f"Failed to render PDF pages for '{filename}': {e}. "
            "Is poppler-utils installed? (apt-get install poppler-utils)"
        ) from e

    if not images:
        raise RuntimeError(
            f"pdf2image returned no pages for '{filename}'. "
            "The file may be empty or corrupted."
        )

    ocr_text = ""
    for i, image in enumerate(images):
        try:
            page_text = pytesseract.image_to_string(image)
            if page_text:
                ocr_text += page_text + "\n"
        except Exception as e:
            print(f"[ocr] pytesseract failed on page {i + 1} of '{filename}': {e}")

    if len(ocr_text.strip()) >= 10:
        return ocr_text

    # ── Genuine failure ──────────────────────────────────────────────────────
    raise RuntimeError(
        f"Could not extract any text from '{filename}'. "
        "The file may be corrupted, encrypted, or a blank scan. "
        "Manual review required — no mock data returned."
    )
