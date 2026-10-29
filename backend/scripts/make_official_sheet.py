"""공식 양식(「건강검진 실시기준」 별지 제6호서식, 4쪽)에 가상 수치를 채운 시험용 결과지를 만든다.

python -m scripts.make_official_sheet <출력 폴더>
→ official_sheet.pdf(글자 있는 PDF), official_sheet_p{1..4}.jpg(휴대폰으로 찍은 듯한 사진)
빈 양식은 scripts/assets/checkup_form_6.pdf(국가법령정보센터 첨부 서식). 값은 모두 가상이며 수치는 EXPECTED와 같다.
reportlab·pypdf가 필요하다(서버 실행에는 필요 없음): pip install reportlab pypdf
"""
import io
import sys
from pathlib import Path

import numpy as np
import pdfplumber
import pypdfium2 as pdfium
from PIL import Image, ImageFilter
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from scripts.make_sample_sheet import FONT

src = Path(__file__).parent / "assets" / "checkup_form_6.pdf"
H = 841
pdfmetrics.registerFont(TTFont("KR", FONT, subfontIndex=0))

with pdfplumber.open(src) as pdf:
    WORDS = [pg.extract_words(x_tolerance=1.5) for pg in pdf.pages]

ops = {i: [] for i in range(4)}

def text(p, x, top, s, size=9.5, align="left"):
    ops[p].append(("t", x, top, s, size, align))

def white(p, x0, top, x1, bottom):
    ops[p].append(("w", x0, top, x1, bottom))

def tick(p, label, top, nth=0):
    cands = [w for w in WORDS[p] if w["text"].lstrip("□").startswith(label) and abs(w["top"] - top) < 4]
    assert cands, (p, label, top)
    w = sorted(cands, key=lambda w: w["x0"])[nth]
    if w["text"].startswith("□"):
        box = (w["x0"], w["top"], w["x0"] + (w["bottom"] - w["top"]), w["bottom"])
    else:
        boxes = [b for b in WORDS[p] if b["text"] == "□" and abs(b["top"] - w["top"]) < 4 and 0 <= w["x0"] - b["x1"] < 20]
        assert boxes, (p, label, top)
        b = boxes[0]
        box = (b["x0"], b["top"], b["x1"], b["bottom"])
    ops[p].append(("v", *box))

# ---------- 1쪽: 수검자, 종합소견 ----------
for p, dy in ((0, 0), (3, 6.2)):
    text(p, 158, 95.8 + dy, "김건강")
    text(p, 366, 95.8 + dy, "800101-1******")
    text(p, 158, 117.2 + dy, "2026. 10. 20.")
    tick(p, "내원", 117.2 + dy)
tick(0, "정상B(경계)", 212.9)
white(0, 98.6, 282.5, 141.0, 296.0)
white(0, 99.0, 338.8, 141.5, 352.4)
text(0, 101.5, 283.2, "김건강", 12.5)
text(0, 102.0, 339.5, "김건강", 12.5)
text(0, 303, 283.2, "구강검진", 11)
text(0, 80, 557, "해당 없음", 10.5)
text(0, 80, 634, "공복혈당이 경계 수준(101mg/dL)입니다. 체중 관리와 절주, 주 3회 이상 유산소 운동을 권합니다.", 9.5)
text(0, 80, 648, "중성지방(162mg/dL)과 ALT(37IU/L), 감마지티피(58IU/L)가 참고치보다 조금 높습니다.", 9.5)
text(0, 80, 702, "1년 뒤 공복혈당·간기능 재확인을 권합니다.", 9.5)

# ---------- 2쪽: 검사 결과 ----------
text(1, 352, 48.0, "172.4 cm")
text(1, 412, 48.0, "72.5 kg")
text(1, 268, 69.5, "24.4", 10)
tick(1, "정상", 64.1)
text(1, 268, 90.8, "86", 10)
tick(1, "정상", 91.3)
text(1, 270, 107.5, "1.0"); text(1, 312, 107.5, "0.9")
text(1, 270, 123.9, "정상"); text(1, 312, 123.9, "정상")
tick(1, "정상", 123.9)
text(1, 166, 151.8, "126", 10); text(1, 200, 151.8, "82", 10)
tick(1, "고혈압", 152.3)
VALUES = [(191.5, "14.9"), (215.5, "101"), (235.5, "205"), (252.0, "47"), (268.6, "162"), (285.9, "128"),
          (303.1, "0.9"), (318.2, "92"), (341.1, "31"), (359.2, "37"), (377.9, "58")]
for top, v in VALUES:
    text(1, 280, top + 0.5, v, 10)
tick(1, "정상", 186.1)
tick(1, "공복혈당장애", 221.8)
tick(1, "고중성지방혈증", 261.5)
tick(1, "정상", 308.1)
tick(1, "간기능", 366.1)
tick(1, "정상", 404.3)
text(1, 470, 404.3, "(음성)", 9)
tick(1, "정상", 430.5)
text(1, 200, 454.1, "없음")
text(1, 400, 454.1, "없음")
tick(1, "절주", 466.8)
tick(1, "신체활동", 466.8)
for top in (519.6, 547.2, 568.8, 603.6, 633.9, 677.6):
    tick(1, "비해당", top)

# ---------- 3쪽: 통보, 서명 ----------
text(2, 252, 678.1, "26", 10); text(2, 284, 678.1, "10", 10); text(2, 324, 678.1, "27", 10)
text(2, 98, 708.1, "2026. 10. 27.")
text(2, 325, 708.1, "제00000호")
text(2, 443, 708.1, "가상의사")
text(2, 438, 729.8, "00000000")

# ---------- 4쪽: 생활습관평가 ----------
tick(3, "비흡연자", 151.6 - 2.6)
tick(3, "적정", 270.1)
tick(3, "유", 293.9, nth=0)
tick(3, "상담", 315.2)
tick(3, "신체활동부족", 359.2)
tick(3, "근력운동부족", 373.2)
tick(3, "유", 397.0, nth=0)
tick(3, "빠르게", 418.3)
tick(3, "근력", 433.3)
tick(3, "30분", 448.3)
tick(3, "주", 463.3, nth=1)
tick(3, "보통", 495.0)
tick(3, "유", 516.2, nth=0)
tick(3, "줄이십시오", 552.6)
tick(3, "단순당", 552.6)
tick(3, "정상", 614.8)
tick(3, "무", 638.0)

def fill_pdf():
    reader = PdfReader(src)
    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(595, 841))
        for op in ops[i]:
            if op[0] == "w":
                _, x0, top, x1, bottom = op
                c.setFillColorRGB(1, 1, 1); c.rect(x0, H - bottom, x1 - x0, bottom - top, stroke=0, fill=1)
            elif op[0] == "t":
                _, x, top, s, size, align = op
                c.setFillColorRGB(0, 0, 0); c.setFont("KR", size)
                c.drawString(x, H - top - size * 0.9, s)
            else:
                _, x0, top, x1, bottom = op
                c.setStrokeColorRGB(0, 0, 0); c.setLineWidth(1.3)
                cx, cy, s = (x0 + x1) / 2, H - (top + bottom) / 2, (x1 - x0) / 2
                p = c.beginPath(); p.moveTo(cx - s * 0.8, cy + s * 0.1); p.lineTo(cx - s * 0.15, cy - s * 0.75)
                p.lineTo(cx + s * 1.1, cy + s * 1.0); c.drawPath(p, stroke=1, fill=0)
        c.save()
        page.merge_page(PdfReader(io.BytesIO(buf.getvalue())).pages[0])
        writer.add_page(page)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def photos(pdf_bytes, out):
    """쪽마다 책상 위에서 기울여 찍은 듯한 사진(조명·그림자·노이즈)을 만든다."""
    rng = np.random.default_rng(7)
    doc = pdfium.PdfDocument(pdf_bytes)
    for i in range(len(doc)):
        page = doc[i].render(scale=2.4).to_pil().convert("RGB")
        w, h = page.size
        # 책상 위 종이: 바탕을 넓히고 살짝 기울인다.
        desk = Image.new("RGB", (int(w * 1.12), int(h * 1.08)), (120, 112, 100))
        desk.paste(page.rotate(-1.6, expand=True, fillcolor=(120, 112, 100), resample=Image.BICUBIC), (int(w * 0.05), int(h * 0.03)))
        a = np.asarray(desk).astype(np.float32)
        H, W = a.shape[:2]
        # 위쪽 조명, 오른쪽 아래 손 그림자, 약간의 노이즈
        yy, xx = np.mgrid[0:H, 0:W]
        light = 1.04 - 0.16 * (yy / H) - 0.06 * (xx / W)
        shadow = 1 - 0.22 * np.clip(((xx / W) + (yy / H) - 1.45) / 0.4, 0, 1)
        a = a * (light * shadow)[..., None] * np.array([1.0, 0.98, 0.93])
        a += rng.normal(0, 4, a.shape)
        img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
        img.save(out / f"official_sheet_p{i + 1}.jpg", quality=82)


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out.mkdir(parents=True, exist_ok=True)
    pdf = fill_pdf()
    (out / "official_sheet.pdf").write_bytes(pdf)
    photos(pdf, out)
