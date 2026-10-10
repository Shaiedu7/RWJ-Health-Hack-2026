import json
from llm import tool_call, MODEL
FAM = {"penicillin": ["penicillin", "amoxicillin", "ampicillin", "augmentin", "piperacillin"],
       "sulfa": ["sulfa", "sulfamethoxazole", "bactrim", "trimethoprim"],
       "nsaid": ["ibuprofen", "naproxen", "aspirin", "ketorolac", "diclofenac"],
       "opioid": ["codeine", "morphine", "oxycodone", "hydrocodone"]}
def empty(v):
    if isinstance(v, dict): return all(empty(x) for x in v.values())
    if isinstance(v, list): return all(empty(x) for x in v)
    return v in ("", None, 0)
def num(s):
    n = "".join(c for c in (s.split() or [""])[0].split("/")[0] if c.isdigit() or c == "."); return float(n) if n.replace(".", "", 1).isdigit() else None

def rules(p):
    o = []
    def add(path, sev, issue, fix): o.append(dict(path=path, sev=sev, issue=issue, fix=fix, src="rule", status="open"))
    c, d, n = p["clinical"], p["demographics"], p["nutrition"]
    for a in c["allergies"]:
        s = a["substance"].lower().strip()
        if not s: continue
        names = {s}
        for k, v in FAM.items():
            if k in s or s in v: names |= set(v)
        for m in p["medications"]["current"]:
            if m["name"].strip() and any(x in m["name"].lower() for x in names):
                add("medications.current", "critical", f"{m['name']} is a current medication but the patient is allergic to {a['substance']}.", "Remove the drug or correct the allergy.")
    txt = json.dumps({k: v for k, v in p.items() if k not in ("learning", "metadata")}).lower()
    if not 0 <= d["age"] <= 110: add("demographics.age", "critical", f"Age {d['age']} is not plausible.", "Correct the age.")
    if d["age"] < 18 and ("pack-year" in txt or "ppd" in txt): add("psychosocial.tobacco_and_substance_use", "warning", "Pack-year smoking history is unlikely at this age.", "Check age or history.")
    if d["sex"].lower().startswith("m") and ("pregnan" in txt or "menstrua" in txt): add("demographics.sex", "critical", "Pregnancy or menstrual history for a male patient.", "Fix sex or history.")
    if n["weight_kg"] and n["height_cm"]:
        bmi = n["weight_kg"] / (n["height_cm"] / 100) ** 2
        if not 10 <= bmi <= 70: add("nutrition", "critical", f"Weight and height give a BMI of {bmi:.0f}, which is not plausible.", "Check units (kg and cm).")
    for v in c["vitals"]:
        l, x = v["label"].lower(), num(v["value"])
        if x is not None and ("heart" in l or l in ("hr", "pulse")) and not 20 <= x <= 250: add("clinical.vitals", "critical", f"Implausible heart rate {v['value']}.", "Correct the value.")
        if x is not None and "temp" in l and not (30 <= x <= 43 or 86 <= x <= 109): add("clinical.vitals", "critical", f"Implausible temperature {v['value']}.", "Check the value and unit.")
    for a in p["artifacts"]:
        if not a["findings"].strip(): add("artifacts", "warning", f"Artifact '{a['title']}' has no findings summary.", "Add the findings.")
    for k, items in (("clinical.vitals", c["vitals"]), ("clinical.exam", c["exam"]), ("artifacts", p["artifacts"])):
        for it in items:
            t = it["trigger"]
            if t["type"] != "start" and not t.get("value", "").strip():
                add(k, "critical", f"'{it.get('label') or it.get('title')}' has a release trigger with no value.", "Fill in the trigger value.")
    for need in ("overview.chief_complaint", "clinical.hidden_diagnosis"):
        a, b = need.split(".")
        if not p[a][b].strip(): add(need, "critical", f"{b.replace('_', ' ').capitalize()} is required.", "Fill it in.")
    for sec in ("overview", "demographics", "clinical", "medications", "nutrition", "psychosocial", "disclosure", "learning", "metadata"):
        if empty(p[sec]): add(sec, "warning", f"The {sec} section is empty.", "Complete it or confirm it is intentionally blank.")
    return o

AUDIT_SYS = ("Audit this virtual patient profile like a clinician. Find contradictions or implausibilities across sections: timeline, medications vs. diagnosis and indications, "
 "vitals/labs/units vs. condition, nutrition and BMI vs. history, psychosocial vs. disclosure rules, exam vs. hidden diagnosis, learning objectives vs. the case. "
 "Return only real issues (empty list if none). critical = would mislead students; warning = minor. Use paths like 'clinical.hpi'.")
AUDIT = {"type": "object", "required": ["issues"], "properties": {"issues": {"type": "array", "items": {"type": "object",
  "required": ["path", "sev", "issue", "fix"], "properties": {"path": {"type": "string"}, "sev": {"type": "string", "enum": ["critical", "warning"]},
  "issue": {"type": "string"}, "fix": {"type": "string"}}}}}}
def audit(p):
    pp = {k: v for k, v in p.items() if k not in ("_verified", "knowledge")}
    return [dict(i, src="llm", status="open") for i in tool_call(MODEL, AUDIT_SYS, [{"text": json.dumps(pp)}], "report", AUDIT)["issues"]]
