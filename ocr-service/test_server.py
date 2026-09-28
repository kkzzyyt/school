import unittest
import io
import json
import threading
import urllib.request
from http.server import ThreadingHTTPServer

from PIL import Image

from server import make_handler, normalize_prediction, recognize_image


class NormalizePredictionTests(unittest.TestCase):
    def test_returns_text_score_and_box_from_paddle_result(self):
        class Result:
            json = {
                "res": {
                    "rec_texts": ["第1排", "张三"],
                    "rec_scores": [0.99, 0.82],
                    "rec_boxes": [[10, 20, 70, 40], [100, 20, 160, 40]],
                }
            }

        self.assertEqual(
            normalize_prediction([Result()]),
            [
                {"text": "第1排", "score": 0.99, "box": [10, 20, 70, 40]},
                {"text": "张三", "score": 0.82, "box": [100, 20, 160, 40]},
            ],
        )

    def test_ignores_incomplete_boxes(self):
        self.assertEqual(
            normalize_prediction([{"res": {"rec_texts": ["张三"], "rec_scores": [0.9], "rec_boxes": []}}]),
            [],
        )


class ServerTests(unittest.TestCase):
    @staticmethod
    def image_bytes():
        buffer = io.BytesIO()
        Image.new("RGB", (200, 120), "white").save(buffer, format="PNG")
        return buffer.getvalue()

    def test_normalizes_image_and_invokes_the_predictor(self):
        class Predictor:
            def predict(self, image):
                assert image.shape == (120, 200, 3)
                return [{"res": {
                    "rec_texts": ["张三"],
                    "rec_scores": [0.94],
                    "rec_boxes": [[20, 40, 70, 60]],
                }}]

        self.assertEqual(recognize_image(self.image_bytes(), Predictor()), {
            "width": 200,
            "height": 120,
            "lines": [{"text": "张三", "score": 0.94, "box": [20, 40, 70, 60]}],
        })

    def test_health_and_recognition_endpoints_without_paddle_installation(self):
        class Predictor:
            def predict(self, image):
                return [{"res": {"rec_texts": [], "rec_scores": [], "rec_boxes": []}}]

        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(Predictor()))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"
            with urllib.request.urlopen(base + "/health", timeout=2) as response:
                self.assertEqual(json.load(response), {"ready": True})
            request = urllib.request.Request(
                base + "/recognize",
                self.image_bytes(),
                {"Content-Type": "image/png"},
            )
            with urllib.request.urlopen(request, timeout=2) as response:
                self.assertEqual(json.load(response)["lines"], [])
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()


if __name__ == "__main__":
    unittest.main()
