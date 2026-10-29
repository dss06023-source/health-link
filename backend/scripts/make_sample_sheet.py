"""시험용 가상 결과지(PNG 사진, 글자 있는 PDF)를 만든다. 값은 모두 가상이다.

python -m scripts.make_sample_sheet <출력 폴더>
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"

# 결과통보서 '검사 결과' 표를 흉내 낸 행: (목표질환, 검사항목, 결과, 정상A, 정상B, 질환의심)
ROWS = [
    ("비만", "체질량지수(kg/m²)", "24.4", "18.5~24.9", "-", "25 이상"),
    ("", "허리둘레(cm)", "86", "남 90 미만", "-", "남 90 이상"),
    ("고혈압", "혈압(최고/최저)(mmHg)", "126/82", "120/80 미만", "120~139/80~89", "140/90 이상"),
    ("빈혈", "혈색소(g/dL)", "14.9", "13~16.5", "12~12.9", "12 미만"),
    ("당뇨병", "공복혈당(mg/dL)", "101", "100 미만", "100~125", "126 이상"),
    ("이상지질혈증", "총콜레스테롤(mg/dL)", "205", "200 미만", "200~239", "240 이상"),
    ("", "HDL-콜레스테롤(mg/dL)", "47", "60 이상", "40~59", "40 미만"),
    ("", "중성지방(mg/dL)", "162", "150 미만", "150~199", "200 이상"),
    ("", "LDL-콜레스테롤(mg/dL)", "128", "130 미만", "130~159", "160 이상"),
    ("신장질환", "혈청 크레아티닌(mg/dL)", "0.9", "1.5 이하", "-", "1.5 초과"),
    ("", "신사구체여과율(e-GFR)", "92", "60 이상", "-", "60 미만"),
    ("간장질환", "AST(SGOT)(U/L)", "31", "40 이하", "41~50", "51 이상"),
    ("", "ALT(SGPT)(U/L)", "37", "35 이하", "36~45", "46 이상"),
    ("", "감마지티피(γ-GTP)(U/L)", "58", "남 11~63", "남 64~77", "남 78 이상"),
]
HEADER = ("목표질환", "검사항목", "결과", "정상A", "정상B(경계)", "질환의심")
EXPECTED = {"bmi": 24.4, "waist": 86, "sbp": 126, "dbp": 82, "hb": 14.9, "fbs": 101, "tc": 205, "hdl": 47,
            "tg": 162, "ldl": 128, "creatinine": 0.9, "egfr": 92, "ast": 31, "alt": 37, "ggt": 58}
COLS = [40, 190, 520, 640, 820, 1010, 1180]


def draw_png(path, rotate=0.0):
    img = Image.new("RGB", (1220, 160 + 52 * (len(ROWS) + 1)), "white")
    d = ImageDraw.Draw(img)
    title, body = ImageFont.truetype(FONT, 34), ImageFont.truetype(FONT, 22)
    d.text((40, 30), "일반건강검진 결과통보서 (가상 견본)", font=title, fill="black")
    d.text((40, 85), "수검일 2026-10-20 · 수검자 가상인물", font=body, fill="black")
    y = 140
    for row in [HEADER, *ROWS]:
        d.line((COLS[0], y, COLS[-1], y), fill="gray")
        for x, text in zip(COLS, row):
            d.text((x + 8, y + 12), text, font=body, fill="black")
        y += 52
    d.line((COLS[0], y, COLS[-1], y), fill="gray")
    for x in COLS:
        d.line((x, 140, x, y), fill="gray")
    if rotate:
        img = img.rotate(rotate, expand=True, fillcolor="white")
    img.save(path)


def draw_pdf(path):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas

    pdfmetrics.registerFont(TTFont("wqy", FONT, subfontIndex=0))
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setFont("wqy", 16)
    c.drawString(40, 800, "일반건강검진 결과통보서 (가상 견본)")
    c.setFont("wqy", 9)
    y = 760
    for row in [HEADER, *ROWS]:
        for x, text in zip([40, 100, 250, 320, 400, 480], row):
            c.drawString(x, y, text)
        y -= 20
    c.save()


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out.mkdir(parents=True, exist_ok=True)
    draw_png(out / "sample_sheet.png")
    draw_png(out / "sample_sheet_tilted.png", rotate=2.5)
    draw_pdf(out / "sample_sheet.pdf")
