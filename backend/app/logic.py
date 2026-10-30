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

    recommendations, excluded = [], []
    for cid, entry in candidates.items():
        info = ref.SUPPLEMENTS[cid]
        warnings = supplement_warnings(cid, user, described, med_classes, medications)
        others = [c for c in active_catalog_ids if c != cid]
        overlaps = [w for w in ingredient_overlaps(others + [cid]) if cid in w["supplements"]]
        clash = taking_conflicts(cid, active_catalog_ids, overlaps)
        if any(w["level"] == "avoid" for w in warnings) or clash:
            excluded.append({
                "supplementId": cid,
                "name": info["name"],
                "reasons": entry["reasons"],
                "message": " ".join([w["message"] for w in warnings if w["level"] == "avoid"] + clash),
            })
            continue
        warnings += overlaps
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
    recommended = {r["supplementId"] for r in recommendations}
    current = [review_current(cid, user, described, med_classes, medications)
               for cid in dict.fromkeys(active_catalog_ids) if cid not in recommended]
    return {"recommendations": recommendations, "excluded": excluded, "warnings": flat, "notes": notes,
            "current": current, "purchaseChecks": purchase_checks(user, described, med_classes, medications, taking),
            "disclaimer": ref.DISCLAIMER}


def _plain(message):
    """추천용 문구의 '추천에서 뺐습니다.'를 걷어 낸다("…밖이라 추천에서 뺐습니다." → "…밖입니다.")."""
    return re.sub(r"이라 추천에서 뺐습니다\.$", "입니다.", message).replace(" 추천에서 뺐습니다.", "").strip()


def label_name(cid):
    """제품 원재료 표시에서 찾을 이름. 원료 이름과 대표 성분 이름이 다르면 함께 적는다(홍국(모나콜린K))."""
    info = ref.SUPPLEMENTS[cid]
    others = [k for k in info["ingredients"] if k != info["name"]]
    return f"{info['name']}({', '.join(others)})" if others and len(others) == 1 else info["name"]


def purchase_checks(user, described, med_classes, medications, taking):
    """영양제를 살 때 원재료 표시에서 확인할 성분. 같은 규칙표(약·검진 수치·진단 질환·임신, 함께 먹지 않는 원료, 하루 상한)에서 만든다.
    avoid: 든 제품은 피함, caution: 들어 있으면 먹기 전에 상담, amount: 이미 먹는 양과 합쳐 상한을 넘지 않는지 확인."""
    checks = []
    for cid, info in ref.SUPPLEMENTS.items():
        if len(info["ingredients"]) > 1:
            continue  # 종합비타민처럼 여러 성분을 묶은 제품은 성분별 항목(비타민K·철분 등)으로 안내한다.
        warnings = supplement_warnings(cid, user, described, med_classes, medications)
        avoid = [_plain(w["message"]) for w in warnings if w["level"] == "avoid"]
        for group in ref.NOT_TOGETHER:
            with_it = [c for c in taking if c in group["supplements"] and c != cid]
            if cid in group["supplements"] and cid not in taking and with_it:
                names = ", ".join(ref.SUPPLEMENTS[c]["name"] for c in with_it)
                avoid.append(f"{group['message']} 이미 {names}{_josa(names, '을', '를')} 드시고 있습니다.")
        caution = [w["message"] for w in warnings if w["level"] == "caution"]
        name = label_name(cid)
        if avoid:
            checks.append({"type": "avoid", "supplementId": cid, "ingredient": name, "message": " ".join(dict.fromkeys(avoid)),
                           "check": f"{name}{_josa(ref.SUPPLEMENTS[cid]['name'], '이', '가')} 든 제품은 피하십시오."})
        elif caution:
            checks.append({"type": "caution", "supplementId": cid, "ingredient": name, "message": " ".join(dict.fromkeys(caution)),
                           "check": f"제품에 {name}{_josa(ref.SUPPLEMENTS[cid]['name'], '이', '가')} 들어 있으면 먹기 전에 의사·약사와 상의하십시오."})
    # 하루 상한에 가까워 같은 성분이 든 제품을 하나 더하면(목록에서 가장 많이 든 양 기준) 넘는 성분만 알린다.
    found = {}
    for cid in taking:
        for ingredient, amount in ref.SUPPLEMENTS[cid]["ingredients"].items():
            if ingredient in ref.UPPER_LIMITS and _amount(amount) is not None:
                entry = found.setdefault(ingredient, {"total": 0.0, "unit": _unit(amount), "from": []})
                entry["total"] += _amount(amount)
                entry["from"].append(ref.SUPPLEMENTS[cid]["name"])
    for ingredient, entry in found.items():
        limit, unit = ref.UPPER_LIMITS[ingredient], entry["unit"]
        largest = max(_amount(i["ingredients"][ingredient]) or 0 for i in ref.SUPPLEMENTS.values() if ingredient in i["ingredients"])
        if entry["total"] + largest <= limit:
            continue
        names = ", ".join(entry["from"])
        checks.append({"type": "amount", "ingredient": ingredient, "total": f"{entry['total']:g}{unit}", "upperLimit": f"{limit:g}{unit}",
                       "message": f"추천 구성과 드시는 영양제({names})만으로 하루 {entry['total']:g}{unit}이고, 하루 상한은 {limit:g}{unit}입니다.",
                       "check": f"제품에 {ingredient}{_josa(ingredient, '이', '가')} 들어 있으면 합친 양이 하루 상한을 넘지 않는지 확인하십시오."})
    return checks


def supplement_warnings(cid, user, described, med_classes, medications):
    """약·검진 수치·진단 질환·임신 등으로 이 영양제에 붙는 주의. level이 avoid면 먹지 않아야 한다."""
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
    lifestyle = user.get("lifestyle", {})
    stages = [ref.LIFE_STAGE_LABELS[s] for s in info.get("lifeStageAvoid", []) if lifestyle.get(s)]
    if stages:
        warnings.append({"type": "lifeStage", "level": "avoid",
                         "message": f"{'·'.join(stages)}에는 {info['name']} 섭취를 피해야 합니다. 추천에서 뺐습니다."})
    return warnings


def taking_conflicts(cid, active_catalog_ids, overlaps):
    """이미 먹는 영양제와 부딪히는 이유. 함께 먹지 않도록 묶인 원료이거나, 같은 성분이 하루 상한을 넘으면 새로 추천하지 않는다."""
    if cid in active_catalog_ids:
        return []
    out = []
    for group in ref.NOT_TOGETHER:
        taking = [c for c in active_catalog_ids if c in group["supplements"] and c != cid]
        if cid in group["supplements"] and taking:
            names = ", ".join(ref.SUPPLEMENTS[c]["name"] for c in taking)
            out.append(f"{group['message']} 이미 {names}{_josa(names, '을', '를')} 드시고 있어 추천에서 뺐습니다.")
    for w in overlaps:
        if w["level"] == "caution":
            names = ", ".join(ref.SUPPLEMENTS[c]["name"] for c in w["supplements"] if c != cid)
            out.append(f"이미 드시는 {names}{_josa(names, '과', '와')} {w['ingredient']} 성분이 겹쳐 하루 상한({w['upperLimit']})을 넘으므로 추천에서 뺐습니다.")
    return out


def review_current(cid, user, described, med_classes, medications):
    """이미 먹는 영양제(추천에 없는 것)를 계속 먹어도 되는지. 피해야 할 조합이 있으면 conflict."""
    info = ref.SUPPLEMENTS[cid]
    warnings = supplement_warnings(cid, user, described, med_classes, medications)
    avoid = [_plain(w["message"]) for w in warnings if w["level"] == "avoid"]
    cautions = [_plain(w["message"]) for w in warnings if w["level"] != "avoid"]
    # 고시의 섭취 시 주의사항 중 이 사람에게 해당하는 것(약·질환이 있거나 흡연)을 함께 보여 준다.
    smoking = user.get("lifestyle", {}).get("smoking") in (True, "current")
    cautions += [c for c in info.get("cautions", []) if c not in cautions and (
        (medications and ("의약품" in c or "항응고제" in c)) or (user.get("conditions") and "질환" in c) or (smoking and "흡연" in c))]
    purpose = info.get("purpose")
    if avoid:
        status = "conflict"
        message = " ".join(avoid) + " 드시고 있다고 하셔서 복용 관리에는 넣어 두었습니다. 계속 드실지는 의사·약사와 상의하십시오."
    else:
        status = "keep"
        lead = f"{purpose}{_josa(purpose, '을', '를')} 위해 드신다면 계속 드셔도 됩니다. " if purpose else ""
        message = lead + "입력하신 약·질환·검진 수치와 부딪히는 규칙이 없어 복용 관리에 함께 넣었습니다."
        if cautions:
            message += " 다만 아래 내용은 확인하십시오."
    return {"supplementId": cid, "name": info["name"], "claim": info["claim"], "purpose": purpose,
            "status": status, "message": message, "cautions": cautions}


def _josa(word, with_final, without_final):
    """받침이 있으면 앞의 조사, 없으면 뒤의 조사. 영문 글자는 읽는 소리로 본다(비타민K → 케이, HCA → 에이)."""
    last = word.rstrip(")")[-1:] if word else ""
    if "가" <= last <= "힣":
        return with_final if (ord(last) - 0xAC00) % 28 else without_final
    if last.isascii() and last.isalpha():
        return with_final if last.upper() in "LMNR" else without_final
    return with_final


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
