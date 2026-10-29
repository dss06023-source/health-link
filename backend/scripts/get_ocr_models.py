"""사진 인식(OCR)용 한국어 모델을 backend/models/ 에 받는다.

PaddleOCR PP-OCRv5 한국어 인식 모델을 ONNX로 바꾼 파일이다(GreatV/oar-ocr 배포본, Apache-2.0).
글자 위치 찾기 모델은 rapidocr 패키지에 들어 있어 따로 받지 않는다.
python -m scripts.get_ocr_models
"""

import hashlib
import urllib.request

from app.ocr import MODEL_DIR

BASE = "https://github.com/GreatV/oar-ocr/releases/download/v0.3.0/"
FILES = {
    "korean_pp-ocrv5_mobile_rec.onnx": "2d7ed96308065a86103325d22af07a88c4d06afc009f21602a4882342c0cc054",
    "ppocrv5_korean_dict.txt": "a88071c68c01707489baa79ebe0405b7beb5cca229f4fc94cc3ef992328802d7",
}

if __name__ == "__main__":
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for name, sha in FILES.items():
        path = MODEL_DIR / name
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == sha:
            print(f"있음: {path}")
            continue
        data = urllib.request.urlopen(BASE + name, timeout=120).read()
        if hashlib.sha256(data).hexdigest() != sha:
            raise SystemExit(f"{name}: 받은 파일의 해시가 다릅니다. 저장하지 않았습니다.")
        path.write_bytes(data)
        print(f"받음: {path}")
