"""해석·추천·중복 점검·변화 리포트 계산. 모두 규칙표만 쓰므로 같은 입력이면 같은 결과가 나온다."""

import re

from . import reference as ref

STATUS_RANK = {ref.NORMAL: 0, ref.CAUTION: 1, ref.DANGER: 2}


def interpret(values, gender, history=None):
    """검진 수치 전체를 해석한다. history는 [{date, values}] (오래된 순)."""
    items = []
    for code in ref.CHECKUP_ITEMS:
        if code not in values:
            continue
        item = ref.describe(code, values[code], gender)
        item["history"] = [
            {"date": h["date"], "value": h["values"][code]} for h in (history or []) if code in h["values"]
        ]
        items.append(item)
    caution = [i for i in items if i["status"] != ref.NORMAL]
    worst = max((i["status"] for i in items), key=STATUS_RANK.get, default=ref.NORMAL)
    if not caution:
        headline = "모든 항목이 기준치 범위 안입니다."
    else:
        names = ", ".join(i["name"] for i in caution[:3])
        more = f" 외 {len(caution) - 3}개" if len(caution) > 3 else ""
        headline = f"{names}{more} 항목이 기준치를 벗어났습니다."
        if worst == ref.DANGER:
            headline += " 의사 상담을 권장합니다."
    return {
        "summary": {
            "overall": worst,
            "headline": headline,
            "totalCount": len(items),
            "cautionCount": len(caution),
        },
        "items": items,
        "cautionItems": [i["code"] for i in caution],
    }


def medication_classes(medications):
    return {ref.MEDICATIONS.get(m) for m in medications} - {None}


def _amount(text):
    match = re.match(r"([\d.]+)", text)
    return float(match.group(1)) if match else None


def _unit(text):
    return re.sub(r"^[\d.]+", "", text)


def ingredient_overlaps(catalog_ids):
    """같은 성분이 두 제품 이상에 들어 있으면 경고한다. 상한 초과 여부도 본다."""
    found = {}
    for cid in catalog_ids:
        for ingredient, amount in ref.SUPPLEMENTS[cid]["ingredients"].items():
            found.setdefault(ingredient, []).append((cid, amount))
    warnings = []
    for ingredient, entries in found.items():
        if len(entries) < 2:
            continue
        amounts = [_amount(a) for _, a in entries]
        total = sum(a for a in amounts if a is not None)
        unit = _unit(entries[0][1])
        limit = ref.UPPER_LIMITS.get(ingredient)
        over = limit is not None and total > limit
        names = ", ".join(ref.SUPPLEMENTS[cid]["name"] for cid, _ in entries)
        message = f"{ingredient} 성분이 {names}에 함께 들어 있습니다. 하루 합계 {total:g}{unit}"
        if limit is not None:
            message += f"(상한 {limit:g}{unit})"
        message += "로 상한을 넘습니다. 한 제품을 줄이십시오." if over else "입니다."
        warnings.append({
            "type": "duplicate",
            "level": "caution" if over else "info",
            "ingredient": ingredient,
            "supplements": [cid for cid, _ in entries],
            "total": f"{total:g}{unit}",
            "upperLimit": f"{limit:g}{unit}" if limit is not None else None,
            "message": message,
        })
    return warnings


def interaction_warnings(catalog_id, med_classes, medications):
    out = {}
    for rule in ref.INTERACTIONS:
        if rule["supplement"] == catalog_id and rule["drugClass"] in med_classes:
            drugs = [m for m in medications if ref.MEDICATIONS.get(m) == rule["drugClass"]]
            # 항응고제·항혈소판제처럼 계열이 달라도 문구가 같으면 한 건으로 합친다.
            if rule["message"] in out:
                out[rule["message"]]["drugs"] += drugs
            else:
                out[rule["message"]] = {"type": "interaction", "level": rule["level"], "drugs": drugs, "message": rule["message"]}
                if "hours" in rule:
                    out[rule["message"]]["hours"] = rule["hours"]
    return list(out.values())


def _spacing_target_present(target, taking, med_classes):
    kind, _, name = target.partition(":")
    if kind == "drug":
        return name in med_classes
    if kind == "nutrient":
        return any(name in ref.SUPPLEMENTS[c]["ingredients"] for c in taking)
    return target in taking


def spacing_warnings(catalog_id, taking, med_classes):
    """함께 먹는 영양제·약과 시간 간격을 둬야 하면 알린다."""
    out = []
    for rule in ref.SPACING_RULES:
        if rule["a"] == catalog_id:
            other = rule["b"]
        elif rule["b"] == catalog_id:
            other = rule["a"]
        else:
            continue
        if _spacing_target_present(other, taking - {catalog_id}, med_classes):
            out.append({"type": "spacing", "level": "info", "hours": rule["hours"], "message": rule["message"]})
    return out


def recommend(user, values, active_catalog_ids):
    gender = user["gender"]
    described = {code: ref.describe(code, v, gender) for code, v in values.items() if code in ref.CHECKUP_ITEMS}
    medications = user.get("medications", [])
    med_classes = medication_classes(medications)

    candidates = {}
    for rule in ref.RECOMMENDATION_RULES:
        reasons = []
        for code in rule["items"]:
            item = described.get(code)
            if not item or item["status"] == ref.NORMAL:
                continue
            if rule.get("direction") and item["direction"] != rule["direction"]:
                continue
            reasons.append({k: item[k] for k in ("code", "name", "value", "unit", "status")})
        if reasons:
            candidates[rule["supplement"]] = {"priority": rule["priority"], "reasons": reasons, "lifestyleReasons": []}
    for rule in ref.LIFESTYLE_RULES:
        if user.get("lifestyle", {}).get(rule["field"]):
            entry = candidates.setdefault(rule["supplement"], {"priority": rule["priority"], "reasons": [], "lifestyleReasons": []})
            entry["lifestyleReasons"].append(rule["reason"])

    lifestyle = user.get("lifestyle", {})
    recommendations, excluded = [], []
    for cid, entry in candidates.items():
        info = ref.SUPPLEMENTS[cid]
        warnings = interaction_warnings(cid, med_classes, medications)
        for rule in ref.CONDITION_CAUTIONS:
            if rule["supplement"] == cid and any(
                described.get(code, {}).get("status", ref.NORMAL) != ref.NORMAL for code in rule["items"]
            ):
                warnings.append({"type": "condition", "level": rule["level"], "message": rule["message"]})
        for rule in ref.DIAGNOSIS_CAUTIONS:
            if rule["supplement"] == cid and set(rule["conditions"]) & set(user.get("conditions", [])):
                warnings.append({"type": "diagnosis", "level": rule["level"], "message": rule["message"]})
        stages = [ref.LIFE_STAGE_LABELS[s] for s in info.get("lifeStageAvoid", []) if lifestyle.get(s)]
        if stages:
            warnings.append({"type": "lifeStage", "level": "avoid",
                             "message": f"{'·'.join(stages)}에는 {info['name']} 섭취를 피해야 합니다. 추천에서 뺐습니다."})
        if any(w["level"] == "avoid" for w in warnings):
            excluded.append({
                "supplementId": cid,
                "name": info["name"],
                "reasons": entry["reasons"],
                "message": " ".join(w["message"] for w in warnings if w["level"] == "avoid"),
            })
            continue
        others = [c for c in active_catalog_ids if c != cid]
        warnings += [w for w in ingredient_overlaps(others + [cid]) if cid in w["supplements"]]
        recommendations.append({
            "supplementId": cid,
            "name": info["name"],
            "ingredients": info["ingredients"],
            "dose": info["dose"],
            "timing": info["timing"],
            "timeSlots": info["timeSlots"],
            "timingReason": info["timingReason"],
            "claim": info["claim"],
            "dailyIntake": info.get("dailyIntake"),
            "cautions": info.get("cautions", []),
            "priority": entry["priority"],
            "reasons": entry["reasons"],
            "lifestyleReasons": entry["lifestyleReasons"],
            "alreadyTaking": cid in active_catalog_ids,
            "warnings": warnings,
        })
    recommendations.sort(key=lambda r: (r["priority"], -len(r["reasons"]), r["supplementId"]))

    # 함께 먹지 않도록 묶인 원료는 앞 순위 하나만 남긴다.
    for group in ref.NOT_TOGETHER:
        picked = [r for r in recommendations if r["supplementId"] in group["supplements"]]
        for r in picked[1:]:
            recommendations.remove(r)
            excluded.append({"supplementId": r["supplementId"], "name": r["name"], "reasons": r["reasons"],
                             "message": f"{group['message']} {picked[0]['name']}을(를) 대신 추천했습니다."})

    taking = {r["supplementId"] for r in recommendations} | set(active_catalog_ids)
    for r in recommendations:
        r["warnings"] += spacing_warnings(r["supplementId"], taking, med_classes)

    notes = []
    for rule in ref.NO_SUPPLEMENT_RULES:
        codes = [c for c in rule["items"] if described.get(c, {}).get("status", ref.NORMAL) != ref.NORMAL
                 and (not rule.get("direction") or described[c]["direction"] == rule["direction"])]
        if codes:
            notes.append({"items": codes, "message": rule["message"]})
    flat = [dict(w, supplementId=r["supplementId"]) for r in recommendations for w in r["warnings"]]
    return {"recommendations": recommendations, "excluded": excluded, "warnings": flat, "notes": notes,
            "disclaimer": ref.DISCLAIMER}


def compare(before, after, gender):
    """두 검진 결과를 항목별로 비교한다. 인과 표현은 쓰지 않는다."""
    items = []
    for code in ref.CHECKUP_ITEMS:
        if code not in before["values"] or code not in after["values"]:
            continue
        b, a = ref.describe(code, before["values"][code], gender), ref.describe(code, after["values"][code], gender)
        diff = round(a["value"] - b["value"], 1)
        rank_change = STATUS_RANK[a["status"]] - STATUS_RANK[b["status"]]
        if rank_change:
            trend = "improved" if rank_change < 0 else "worsened"
        elif b["status"] != ref.NORMAL and diff:
            # 판정은 같지만 기준치 쪽으로 움직였는지 본다.
            toward = diff < 0 if b["direction"] == "high" else diff > 0
            trend = "improved" if toward else "worsened"
        else:
            trend = "same"
        items.append({
            "code": code, "name": b["name"], "unit": b["unit"], "normalRange": a["normalRange"],
            "before": b["value"], "after": a["value"], "change": diff,
            "beforeStatus": b["status"], "afterStatus": a["status"], "statusChanged": bool(rank_change), "trend": trend,
        })
    counts = {t: sum(1 for i in items if i["trend"] == t) for t in ("improved", "same", "worsened")}
    return {
        "items": items,
        "summary": dict(counts, headline=f"기준치에 가까워진 항목 {counts['improved']}개, 멀어진 항목 {counts['worsened']}개입니다."),
        "note": "검진 수치는 식사·운동·음주·약 등 여러 요인의 영향을 받습니다. 이 비교는 영양제의 효과를 뜻하지 않습니다.",
    }
