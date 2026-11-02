"""약국·병원 상담 준비 자료(유료 PDF, 시연용 결제).

판단을 내려 주는 보고서가 아니다. 내가 먹는 약·영양제·검진 수치와, 공공 자료(식약처 고시·DUR 등) 원문에 적힌
주의 문구를 나란히 모으고, 상담 때 물어볼 질문을 붙인다. 판단은 상담하는 약사·의사가 한다.
(비의료 건강관리서비스 가이드라인: 수치 해석·개인 맞춤 관리 수준 설정·약물 설명은 의료행위·복약지도로 본다.)

결제는 시연용이다. 실제 결제대행사를 부르지 않고 구매 기록만 남긴다. 첫 구매만 할인한다.
"""

import io
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from . import db, logic, options
from . import reference as ref

router = APIRouter()

PRODUCT = "consult_pdf"
PRICE, FIRST_PRICE = 2900, 1900
METHODS = {"card": "신용·체크카드", "toss": "토스페이", "kakao": "카카오페이"}
KST = ZoneInfo("Asia/Seoul")
FONT_DIR = Path(__file__).parent / "assets" / "fonts"
STATUS_LABEL = {"normal": "정상", "caution": "경계", "danger": "질환의심"}
LEVEL_LABEL = {"avoid": "피함", "caution": "주의", "info": "참고"}
SUPPLEMENT_SOURCE = "식약처 고시 제2026-43호 「건강기능식품의 기준 및 규격」"


# ---------- 가격·구매 ----------

def _purchases(conn):
    rows = conn.execute("SELECT id, amount, method, created_at FROM purchases WHERE user_id = ? AND product = ? ORDER BY id",
                        (db.uid(), PRODUCT)).fetchall()
    return [{"id": r["id"], "amount": r["amount"], "method": METHODS.get(r["method"], r["method"]), "createdAt": r["created_at"]}
            for r in rows]


def _offer(conn):
    bought = _purchases(conn)
    return {"price": PRICE, "firstPrice": FIRST_PRICE, "firstPurchase": not bought,
            "amount": PRICE if bought else FIRST_PRICE, "purchases": bought[::-1], "demo": True}


@router.get("/api/consult/offer")
def offer():
    with db.connect() as conn:
        return _offer(conn)


class Checkout(BaseModel):
    method: str
    amount: int


@router.post("/api/consult/checkout", status_code=201)
def checkout(body: Checkout):
    """시연용 결제. 화면이 보여 준 금액과 서버가 계산한 금액이 다르면(그사이 다른 기기에서 샀으면) 다시 확인하게 한다."""
    if body.method not in METHODS:
        raise HTTPException(422, "결제 수단을 골라 주십시오.")
    with db.connect() as conn:
        _require_checkup(conn)
        amount = _offer(conn)["amount"]
        if body.amount != amount:
            raise HTTPException(409, f"결제 금액이 {amount:,}원으로 바뀌었습니다. 다시 확인해 주십시오.")
        now = datetime.now(KST).isoformat(timespec="seconds")
        cur = conn.execute("INSERT INTO purchases (user_id, product, amount, method, created_at) VALUES (?, ?, ?, ?, ?)",
                           (db.uid(), PRODUCT, amount, body.method, now))
        return {"purchaseId": cur.lastrowid, "amount": amount, "method": METHODS[body.method], "createdAt": now, "demo": True}


def _require_checkup(conn):
    from .main import confirmed_checkups
    checkups = confirmed_checkups(conn)
    if not checkups:
        raise HTTPException(400, "검진 결과를 먼저 등록해 주십시오.")
    return checkups[-1]


@router.get("/api/consult/{purchase_id}/pdf")
def download(purchase_id: int):
    with db.connect() as conn:
        row = conn.execute("SELECT id FROM purchases WHERE id = ? AND user_id = ? AND product = ?",
                           (purchase_id, db.uid(), PRODUCT)).fetchone()
        if not row:
            raise HTTPException(404, "구매 기록을 찾을 수 없습니다.")
        data = gather(conn)
    pdf = build_pdf(data)
    name = f"상담준비자료_{data['madeOn'].replace('-', '')}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=consult.pdf; filename*=UTF-8''{quote(name)}"})


# ---------- 자료 모으기 ----------

def _strip(message):
    """앱 화면용 '추천에서 뺐습니다.' 같은 판단 문구를 걷어 내고 원문 주의만 남긴다."""
    return logic._plain(message)


def gather(conn):
    from .main import active_supplements, extra_supplements, load_user
    user = load_user(conn)
    checkup = _require_checkup(conn)
    gender = user["gender"]
    described = {c: ref.describe(c, v, gender) for c, v in checkup["values"].items() if c in ref.CHECKUP_ITEMS}
    medications = user.get("medications", [])
    med_classes = logic.medication_classes(medications)
    taking = [s["supplementId"] for s in active_supplements(conn, include_paused=False)]
    taking += [c for c in extra_supplements(user) if c in ref.SUPPLEMENTS and c not in taking]
    rec = logic.recommend(user, checkup["values"], taking)
    recommended = [r["supplementId"] for r in rec["recommendations"] if r["supplementId"] not in taking]
    labels = {o["value"]: o["label"] for o in options.OPTIONS["conditions"]}

    supplements = []
    for cid, state in [*((c, "먹는 중") for c in taking), *((c, "추천받음") for c in recommended)]:
        info = ref.SUPPLEMENTS[cid]
        intake = info.get("dailyIntake") or {}
        supplements.append({
            "id": cid, "name": info["name"], "state": state,
            "ingredients": ", ".join(f"{k} {v}" for k, v in info["ingredients"].items()),
            "dailyIntake": f"{intake['ingredient']} {intake['min']:g}~{intake['max']:g}{intake['unit']}" if intake else "",
            "cautions": info.get("cautions", []),
        })

    rows = []
    for s in supplements:
        cid = s["id"]
        for rule in ref.INTERACTIONS:
            if rule["supplement"] == cid and rule["drugClass"] in med_classes:
                drugs = [m for m in medications if ref.MEDICATIONS.get(m) == rule["drugClass"]]
                rows.append({"supplement": s["name"], "with": ", ".join(drugs), "kind": "약", "level": rule["level"],
                             "text": _strip(rule["message"]), "basis": rule.get("basis", "")})
        for rule in ref.CONDITION_CAUTIONS:
            off = [described[c] for c in rule["items"] if described.get(c, {}).get("status", ref.NORMAL) != ref.NORMAL]
            if rule["supplement"] == cid and off:
                rows.append({"supplement": s["name"], "with": ", ".join(f"{d['name']} {d['value']:g}" for d in off), "kind": "검진 수치",
                             "level": rule["level"], "text": _strip(rule["message"]), "basis": rule.get("basis", SUPPLEMENT_SOURCE)})
        for rule in ref.DIAGNOSIS_CAUTIONS:
            hit = set(rule["conditions"]) & set(user.get("conditions", []))
            if rule["supplement"] == cid and hit:
                rows.append({"supplement": s["name"], "with": ", ".join(labels.get(c, c) for c in sorted(hit)), "kind": "진단받은 질환",
                             "level": rule["level"], "text": _strip(rule["message"]), "basis": rule.get("basis", "")})
    ids = [s["id"] for s in supplements]
    for group in ref.NOT_TOGETHER:
        both = [c for c in ids if c in group["supplements"]]
        if len(both) > 1:
            rows.append({"supplement": ", ".join(ref.SUPPLEMENTS[c]["name"] for c in both), "with": "함께 먹을 때", "kind": "영양제끼리",
                         "level": "caution", "text": group["message"], "basis": group.get("basis", "")})
    for w in logic.ingredient_overlaps(ids):
        rows.append({"supplement": ", ".join(ref.SUPPLEMENTS[c]["name"] for c in w["supplements"]), "with": f"{w['ingredient']} 합계",
                     "kind": "성분 중복", "level": w["level"],
                     "text": f"하루 합계 {w['total']}" + (f", 하루 상한 {w['upperLimit']}" if w["upperLimit"] else "") + ".",
                     "basis": "한국인 영양소 섭취기준 상한섭취량" if w["upperLimit"] else ""})

    questions = []
    for r in rows:
        if r["kind"] == "약":
            questions.append(f"{r['supplement']}{logic._josa(r['supplement'], '을', '를')} {r['with']}{logic._josa(r['with'], '과', '와')} 함께 먹어도 되는지, 먹는다면 시간 간격을 둬야 하는지")
        elif r["kind"] in ("검진 수치", "진단받은 질환"):
            questions.append(f"{r['with']}인 상태에서 {r['supplement']}{logic._josa(r['supplement'], '을', '를')} 먹어도 되는지")
        elif r["kind"] in ("영양제끼리", "성분 중복"):
            questions.append(f"{r['supplement']}{logic._josa(r['supplement'], '을', '를')} 함께 먹어도 되는지, 하나를 줄여야 하는지")
    questions = list(dict.fromkeys(questions))
    questions.append("지금 먹는 약·영양제 가운데 줄이거나 끊어야 할 것이 있는지")
    if any(d["status"] == ref.DANGER for d in described.values()):
        questions.append("'질환의심'으로 나온 검진 항목을 병원에서 다시 확인해야 하는지")

    born = user.get("birthYear")
    return {
        "name": user.get("name", ""), "age": (db.today().year - born) if born else None,
        "gender": "남" if gender == "M" else "여", "madeOn": db.today().isoformat(), "checkupDate": checkup["date"],
        "medications": medications, "conditions": [labels.get(c, c) for c in user.get("conditions", [])],
        "allergies": user.get("allergies", []) + user.get("customAllergies", []),
        "items": [d for d in described.values() if d["status"] != ref.NORMAL],
        "supplements": supplements, "rows": rows, "questions": questions,
    }


# ---------- PDF ----------

def _fonts():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    if "Paperlogy" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Paperlogy", FONT_DIR / "Paperlogy-Regular.ttf"))
        pdfmetrics.registerFont(TTFont("Paperlogy-Bold", FONT_DIR / "Paperlogy-Bold.ttf"))


def _safe(text):
    # 글꼴(페이퍼로지)에 없는 글자는 비슷한 글자로 바꾼다: γ-GTP → GTP, μg → mcg, m² → m2.
    text = re.sub(r"\(γ-GTP\)|γ-", "", str(text)).replace("μ", "mc").replace("µ", "mc").replace("²", "2")
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_pdf(d):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    _fonts()
    green, line, muted = colors.HexColor("#1f7a4d"), colors.HexColor("#cfd8d3"), colors.HexColor("#5b6660")
    level_color = {"avoid": colors.HexColor("#c2413a"), "caution": colors.HexColor("#8a5b00"), "info": muted}
    base = ParagraphStyle("b", fontName="Paperlogy", fontSize=9.5, leading=14)
    small = ParagraphStyle("s", parent=base, fontSize=8.5, leading=12, textColor=muted)
    cell = ParagraphStyle("c", parent=base, fontSize=8.5, leading=12)
    head = ParagraphStyle("h", parent=base, fontName="Paperlogy-Bold", fontSize=12.5, leading=18, spaceBefore=10, spaceAfter=4, textColor=green)
    title = ParagraphStyle("t", parent=base, fontName="Paperlogy-Bold", fontSize=19, leading=25)
    P = lambda t, s=base: Paragraph(_safe(t), s)
    B = lambda t, s=cell: Paragraph(f"<font name='Paperlogy-Bold'>{_safe(t)}</font>", s)

    def table(header, body, widths):
        t = Table([[B(h, cell) for h in header], *body], colWidths=[w * mm for w in widths], repeatRows=1)
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eaf4ee")),
                               ("LINEBELOW", (0, 0), (-1, -1), 0.5, line), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        return t

    who = f"{d['name']} 님 · {d['age']}세 · {d['gender']}" if d["age"] else f"{d['name']} 님 · {d['gender']}"
    story = [P("약국·병원 상담 준비 자료", title), Spacer(1, 3 * mm),
             P(f"{who} · 작성일 {d['madeOn']} · 검진일 {d['checkupDate']}", small), Spacer(1, 3 * mm),
             P("이 자료는 진단이나 처방이 아닙니다. 입력하신 정보와 공공 자료 원문(식약처 고시, 약·영양제 상호작용 자료 등)의 주의 문구를 "
               "나란히 모은 것입니다. 먹어도 되는지, 줄여야 하는지는 상담하시는 약사·의사가 판단합니다.", small)]

    story.append(P("1. 복용 중인 약과 건강 정보", head))
    story.append(table(["구분", "내용"], [
        [P("복용 중인 약", cell), P(", ".join(d["medications"]) or "없음", cell)],
        [P("진단받은 질환", cell), P(", ".join(d["conditions"]) or "없음", cell)],
        [P("알레르기", cell), P(", ".join(d["allergies"]) or "없음", cell)],
    ], [35, 135]))

    story.append(P("2. 기준 범위를 벗어난 검진 항목", head))
    if d["items"]:
        story.append(table(["항목", "수치", "기준 범위", "결과지 판정"], [
            [P(i["name"], cell), P(f"{i['value']:g} {i['unit']}", cell), P(i["normalRange"], cell),
             Paragraph(f"<font color='{level_color['avoid' if i['status'] == 'danger' else 'caution'].hexval()}'>{STATUS_LABEL[i['status']]}</font>", cell)]
            for i in d["items"]], [55, 35, 45, 35]))
    else:
        story.append(P("기준 범위를 벗어난 항목이 없습니다.", small))

    story.append(P("3. 먹고 있거나 추천받은 영양제", head))
    story.append(table(["영양제", "상태", "원료·함량(1회분)", "고시 1일 섭취량"], [
        [B(s["name"]), P(s["state"], cell), P(s["ingredients"], cell), P(s["dailyIntake"], cell)] for s in d["supplements"]
    ], [40, 22, 60, 48]) if d["supplements"] else P("없습니다.", small))
    notes = [f"<font name='Paperlogy-Bold'>{_safe(s['name'])}</font>: {_safe(' '.join(s['cautions']))}" for s in d["supplements"] if s["cautions"]]
    if notes:
        story.append(Spacer(1, 2 * mm))
        story.append(P("고시에 적힌 섭취 시 주의사항", cell))
        story += [Paragraph(n, small) for n in notes]

    story.append(P("4. 원문 대조표", head))
    story.append(P("영양제와 약·검진 수치·질환·다른 영양제가 만나는 곳에 공공 자료가 남긴 문구입니다. 표시는 원문 규칙의 강도(피함·주의·참고)입니다.", small))
    story.append(Spacer(1, 2 * mm))
    if d["rows"]:
        story.append(table(["영양제", "만나는 것", "표시", "원문 문구", "출처"], [
            [B(r["supplement"]), P(f"{r['kind']}: {r['with']}", cell),
             Paragraph(f"<font color='{level_color.get(r['level'], muted).hexval()}'>{LEVEL_LABEL.get(r['level'], r['level'])}</font>", cell),
             P(r["text"], cell), P(r["basis"] or "-", ParagraphStyle("x", parent=small, fontSize=7.5, leading=10))]
            for r in d["rows"]], [26, 32, 13, 64, 35]))
    else:
        story.append(P("입력하신 약·질환·검진 수치와 겹치는 원문 규칙이 없습니다.", small))

    story.append(KeepTogether([P("5. 상담 때 여쭤볼 질문", head),
                               *[P(f"□ {q}", base) for q in d["questions"]]]))
    story += [Spacer(1, 6 * mm),
              P(f"출처: {SUPPLEMENT_SOURCE}(2026-06-11 개정), 국가건강검진 판정 기준(「건강검진 실시기준」 별표 4), "
                "식약처 의약품안전사용서비스(DUR)·e약은요, 표에 적은 개별 자료. 건강잇다 시연용 자료입니다.", small)]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                            title="약국·병원 상담 준비 자료", author="건강잇다")

    def footer(canvas, doc_):
        canvas.setFont("Paperlogy", 7.5)
        canvas.setFillColor(muted)
        canvas.drawString(20 * mm, 10 * mm, "건강잇다 · 상담 준비 자료 · 진단·처방을 대신하지 않습니다")
        canvas.drawRightString(A4[0] - 20 * mm, 10 * mm, f"{doc_.page}쪽")

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
