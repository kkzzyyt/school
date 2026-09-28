"""Loopback-only OCR adapter for seating images.

The HTTP process holds one PaddleOCR pipeline and never writes uploaded images.
PaddleOCR is imported at startup so normalization tests can run without its wheel.
"""

from __future__ import annotations

import io
import json
import math
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 12_000_000
MAX_LINES = 200


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if hasattr(value, "tolist"):
        value = value.tolist()
    return value if isinstance(value, list) else []


def normalize_prediction(results: Any) -> list[dict[str, Any]]:
    """Keep only the OCR fields used by the seating grid parser."""
    lines: list[dict[str, Any]] = []
    for result in results:
        payload = getattr(result, "json", result)
        if not isinstance(payload, dict):
            continue
        body = payload.get("res", payload)
        if not isinstance(body, dict):
            continue
        texts = _as_list(body.get("rec_texts"))
        scores = _as_list(body.get("rec_scores"))
        boxes = _as_list(body.get("rec_boxes"))
        for text, score, box in zip(texts, scores, boxes):
            coordinates = _as_list(box)
            if not isinstance(text, str) or not text.strip() or len(coordinates) != 4:
                continue
            try:
                score_value = float(score)
                box_values = [int(coordinate) for coordinate in coordinates]
            except (TypeError, ValueError, OverflowError):
                continue
            if (
                not math.isfinite(score_value)
                or score_value < 0
                or score_value > 1
                or box_values[0] >= box_values[2]
                or box_values[1] >= box_values[3]
            ):
                continue
            lines.append({
                "text": text.strip(),
                "score": score_value,
                "box": box_values,
            })
            if len(lines) >= MAX_LINES:
                return lines
    return lines


def make_predictor() -> Any:
    from paddleocr import PaddleOCR

    return PaddleOCR(
        lang="ch",
        device="cpu",
        cpu_threads=1,
        enable_mkldnn=False,
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_recognition_model_name="PP-OCRv5_mobile_rec",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


def recognize_image(image_bytes: bytes, predictor: Any) -> dict[str, Any]:
    import numpy as np
    from PIL import Image, ImageOps, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(image_bytes)) as source:
            if source.format not in {"PNG", "JPEG", "WEBP"}:
                raise ValueError("unsupported image format")
            width, height = source.size
            if width < 100 or height < 100 or width * height > MAX_IMAGE_PIXELS:
                raise ValueError("image dimensions are out of range")
            image = ImageOps.exif_transpose(source).convert("RGB")
    except (UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise ValueError("invalid image") from error

    results = predictor.predict(np.asarray(image))
    return {
        "width": image.width,
        "height": image.height,
        "lines": normalize_prediction(results),
    }


def make_handler(predictor: Any) -> type[BaseHTTPRequestHandler]:
    predictor_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            # Request paths and OCR text must not enter the application log.
            return

        def _json(self, status: int, body: dict[str, Any]) -> None:
            encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self) -> None:
            if self.path != "/health":
                self._json(404, {"error": "not found"})
                return
            self._json(200, {"ready": True})

        def do_POST(self) -> None:
            if self.path != "/recognize":
                self._json(404, {"error": "not found"})
                return
            if self.headers.get_content_type() not in {"image/png", "image/jpeg", "image/webp"}:
                self._json(415, {"error": "unsupported media type"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length < 1 or length > MAX_IMAGE_BYTES:
                self._json(413, {"error": "image size is out of range"})
                return
            image_bytes = self.rfile.read(length)
            try:
                with predictor_lock:
                    result = recognize_image(image_bytes, predictor)
            except ValueError:
                self._json(400, {"error": "invalid image"})
                return
            except Exception:
                self._json(500, {"error": "recognition failed"})
                return
            self._json(200, result)

    return Handler


def main() -> None:
    host = os.getenv("OCR_BIND", "127.0.0.1")
    port = int(os.getenv("OCR_PORT", "8077"))
    predictor = make_predictor()
    server = ThreadingHTTPServer((host, port), make_handler(predictor))
    server.serve_forever()


if __name__ == "__main__":
    main()
