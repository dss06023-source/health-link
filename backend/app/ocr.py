"""결과지에서 검진 수치를 읽는다.

- 글자가 든 PDF는 OCR 없이 글자를 바로 꺼낸다(pdfplumber).
- 사진과 글자 없는(스캔) PDF는 무료 공개 OCR(RapidOCR + PP-OCRv5 한국어 인식 모델)로 읽는다.
  모델은 저장소에 넣지 않고 scripts/get_ocr_models.py로 받는다. 없으면 사진은 읽지 못한다.
읽은 글자를 행 단위로 묶고, 항목 이름 뒤에 처음 나오는 숫자를 그 항목의 결과로 본다
(결과통보서는 '검사항목 | 결과 | 정상A | 정상B | 질환의심' 순서라 결과가 이름 바로 뒤에 온다).
파일은 메모리에서만 다루고 저장하지 않는다.
"""

import io
import os
import re
from pathlib import Path

MODEL_DIR = Path(os.environ.get("HEALTH_ITDA_OCR_MODELS", Path(__file__).parent.parent / "models"))
REC_MODEL = MODEL_DIR / "korean_pp-ocrv5_mobile_rec.onnx"
REC_DICT = MODEL_DIR / "ppocrv5_korean_dict.txt"

# 항목 코드 → 결과지에 쓰이는 이름들. 혈압은 '126/82'를 수축기·이완기로 나눈다.
ALIASES = {
    "bp": ["혈압"],
    "sbp": ["수축기"],
    "dbp": ["이완기"],
    "fbs": ["공복혈당", "식전혈당"],
    "tc": ["총콜레스테롤", "총 콜레스테롤"],
    "hdl": ["HDL", "고밀도"],
    "ldl": ["LDL", "저밀도"],
    "tg": ["중성지방", "트리글리세라이드"],
    "ast": ["AST", "SGOT"],
    "alt": ["ALT", "SGPT"],
    "ggt": ["감마지티피", "감마GTP", "γ-GTP", "y-GTP", "r-GTP", "GGT"],
    "hb": ["혈색소", "헤모글로빈"],
    "bmi": ["체질량지수", "BMI"],
    "waist": ["허리둘레"],
    "creatinine": ["크레아티닌"],
    "egfr": ["신사구체여과율", "e-GFR", "eGFR"],
}
# 사람이 가질 수 있는 값의 대략적 범위. 벗어나면 잘못 읽었을 수 있어 확인을 요청한다.
PLAUSIBLE = {
    "sbp": (60, 250), "dbp": (30, 150), "fbs": (30, 600), "tc": (50, 600), "hdl": (5, 200),
    "ldl": (10, 400), "tg": (10, 3000), "ast": (1, 1000), "alt": (1, 1000), "ggt": (1, 2000),
    "hb": (3, 25), "bmi": (10, 70), "waist": (40, 200), "creatinine": (0.1, 20), "egfr": (1, 200),
}
NUMBER = re.compile(r"^\d+(\.\d+)?$")
PAIR = re.compile(r"^(\d+)\s*/\s*(\d+)$")
REVIEW_SCORE = 0.9

_engine = None


class OCRUnavailable(RuntimeError):
    pass


def available():
    try:
        import rapidocr  # noqa: F401
    except ImportError:
        return False
    return REC_MODEL.exists() and REC_DICT.exists()


def _get_engine():
    global _engine
    if _engine is None:
        if not available():
            raise OCRUnavailable("사진 인식 모델이 설치되지 않았습니다.")
        from rapidocr import RapidOCR
        # 방향 분류는 끈다. 표 글자를 180도로 잘못 돌려 읽는 일이 있었다.
        _engine = RapidOCR(params={"Global.use_cls": False, "Global.log_level": "error",
                                   "Rec.model_path": str(REC_MODEL), "Rec.rec_keys_path": str(REC_DICT)})
    return _engine


def _rows_from_boxes(items):
    """[(x, y, h, text, score)] → 같은 줄끼리 묶어 x순으로 정렬한 [(text, score)] 행 목록."""
    rows = []
    for item in sorted(items, key=lambda i: i[1]):
        x, y, h = item[0], item[1], item[2]
        if rows and abs(rows[-1]["y"] - y) < max(h, rows[-1]["h"]) * 0.6:
            rows[-1]["items"].append(item)
        else:
            rows.append({"y": y, "h": h, "items": [item]})
    return [[(i[3], i[4]) for i in sorted(r["items"], key=lambda i: i[0])] for r in rows]


def _skew(boxes):
    """글자 상자 윗변 기울기의 중앙값(도). 사진이 기울어 찍히면 행이 섞여서 먼저 바로 세운다."""
    import math

    angles = sorted(math.degrees(math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]))
                    for b in boxes if b[1][0] - b[0][0] > 40)
    return angles[len(angles) // 2] if angles else 0.0


def image_rows(data):
    import numpy as np
    from PIL import Image, ImageOps

    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    if img.width < 1400:  # 작은 사진은 키워야 글자를 더 잘 읽는다.
        img = img.resize((1400, round(img.height * 1400 / img.width)), Image.LANCZOS)
    result = _get_engine()(np.array(img))
    if result.boxes is None:
        return []
    angle = _skew(result.boxes)
    if abs(angle) > 0.5:
        img = img.rotate(angle, expand=True, fillcolor="white", resample=Image.BICUBIC)
        result = _get_engine()(np.array(img))
        if result.boxes is None:
            return []
    items = []
    for box, text, score in zip(result.boxes, result.txts, result.scores):
        ys = [p[1] for p in box]
        items.append((min(p[0] for p in box), sum(ys) / 4, max(ys) - min(ys), text, float(score)))
    return _rows_from_boxes(items)


def pdf_rows(data):
    """글자가 든 PDF면 그 글자를, 없으면 페이지를 그림으로 바꿔 OCR한 결과를 돌려준다."""
    import pdfplumber

    rows = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages[:5]:
            words = page.extract_words(keep_blank_chars=False, use_text_flow=False)
            items = [(w["x0"], (w["top"] + w["bottom"]) / 2, w["bottom"] - w["top"], w["text"], 1.0) for w in words]
            rows += _rows_from_boxes(items)
    if any(rows):
        return rows, "pdf-text"
    import pypdfium2

    doc = pypdfium2.PdfDocument(data)
    for i in range(min(len(doc), 5)):
        buf = io.BytesIO()
        doc[i].render(scale=2.5).to_pil().save(buf, format="PNG")
        rows += image_rows(buf.getvalue())
    return rows, "ocr"


def _find_label(text):
    """행 글자에서 가장 앞에 나오는 항목 이름을 찾는다. (코드, 이름이 끝나는 위치)"""
    best = None
    for code, names in ALIASES.items():
        for name in names:
            pos = text.find(name)
            # '고혈압'(목표질환 칸)의 '혈압'처럼 다른 낱말 안에 든 경우는 건너뛴다.
            while pos > 0 and code == "bp" and text[pos - 1] not in " |":
                pos = text.find(name, pos + 1)
            if pos >= 0 and (best is None or pos < best[1] or (pos == best[1] and len(name) > best[2])):
                best = (code, pos, len(name))
    return (best[0], best[1] + best[2]) if best else (None, None)


def _fuzzy_label(text):
    """사진이 흐려 '공복협당'처럼 한두 글자를 잘못 읽은 경우: 첫 숫자 바로 앞 낱말을 이름과 닮은 정도로 고른다."""
    from difflib import SequenceMatcher

    tokens = text.split()
    idx = next((i for i, t in enumerate(tokens) if re.search(r"\d", t) and not t.startswith("(")), None)
    if not idx:
        return None, None
    word = re.split(r"[(\[]", tokens[idx - 1])[0]
    best, best_ratio = None, 0.6
    for code, names in ALIASES.items():
        for name in names:
            if len(name) < 3:
                continue
            ratio = SequenceMatcher(None, word, name).ratio()
            if ratio > best_ratio:
                best, best_ratio = code, ratio
    if best is None:
        return None, None
    return best, len(" ".join(tokens[:idx]))


def parse_rows(rows):
    """행 목록에서 항목별 값을 찾는다. {code: (value, score)}"""
    found = {}
    for row in rows:
        text = " ".join(t for t, _ in row)
        code, end = _find_label(text)
        fuzzy = code is None
        if fuzzy:
            code, end = _fuzzy_label(text)
        if code is None:
            continue
        # 이름 뒤 낱말들 중 숫자가 든 첫 낱말이 결과다. 단위 괄호처럼 숫자 없는 낱말은 건너뛴다.
        scores = {t: s for t, s in row}
        for token in text[end:].split():
            if token.startswith("(") or not re.search(r"\d", token):
                continue
            score = next((s for t, s in scores.items() if token in t), 1.0)
            if fuzzy:  # 이름을 추정했으니 사용자 확인을 받는다.
                score = min(score, REVIEW_SCORE - 0.01)
            pair = PAIR.match(token)
            if code == "bp" and pair:
                found.setdefault("sbp", (float(pair.group(1)), score))
                found.setdefault("dbp", (float(pair.group(2)), score))
            elif code != "bp" and NUMBER.match(token):
                found.setdefault(code, (float(token), score))
            break
    return found


def fields(found, names_units):
    out = []
    for code, (value, score) in found.items():
        if code not in names_units:
            continue
        lo, hi = PLAUSIBLE.get(code, (float("-inf"), float("inf")))
        value = int(value) if value.is_integer() else value
        out.append({
            "code": code, "name": names_units[code][0], "value": value, "unit": names_units[code][1],
            "confidence": round(score, 2), "needsReview": score < REVIEW_SCORE or not lo <= value <= hi,
        })
    order = list(names_units)
    return sorted(out, key=lambda f: order.index(f["code"]))


def read(data, is_pdf):
    """파일 → (찾은 값 {code: (value, score)}, 엔진 이름). HEALTH_ITDA_OCR=mock이면 읽지 않는다(시험용)."""
    if os.environ.get("HEALTH_ITDA_OCR") == "mock":
        raise OCRUnavailable("모의 모드")
    if is_pdf:
        rows, engine = pdf_rows(data)
    else:
        rows, engine = image_rows(data), "ocr"
    return parse_rows(rows), engine
