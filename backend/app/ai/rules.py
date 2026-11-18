import re

from app.schemas.requests import AnalysisContent

SIGNALS = {
    "Billing": r"invoice|refund|payment|billing|chargeback|overcharg\w*|credit note|transfer",
    "IT support": r"password|vpn|outage|server|network|laptop|login|credentials|account access|phishing",
    "Customer support": r"order|delivery|shipment|damaged|complaint|return|package|replacement",
    "Sales": r"quote|pricing|proposal|subscription|demo|purchase|sales",
}
CRITICAL = r"\b(?:critical|outage|data breach|security breach|fraud|ransomware|compromised)\b"
SENSITIVE = r"\b(?:refund\w*|reimburs\w*|chargeback|credit note|transfer\w*|payment\w*|bank details|password|credentials?|grant access|account access|delet\w*)\b"
ENTITY_PATTERNS = {
    "Email": r"[\w.+-]+@[\w.-]+\.[a-z]{2,}",
    "Reference": r"\b(?:INV|ORD|TKT|PO)[- ]\d+\b",
    "Amount": r"(?:[$€£]\s?\d[\d,.]*|\b(?:USD|EUR|CHF|GBP)\s?\d[\d,.]*)",
    "Date": r"\b\d{4}-\d{2}-\d{2}\b",
}


def matches(pattern, text):
    return re.search(pattern, text, re.IGNORECASE) is not None


def classify(text):
    scores = {
        category: len(re.findall(rf"\b(?:{pattern})\b", text, re.IGNORECASE))
        for category, pattern in SIGNALS.items()
    }
    category = max(scores, key=scores.get) if any(scores.values()) else "General inquiries"
    if matches(CRITICAL, text):
        priority = "Critical"
    elif matches(r"\b(?:urgent|asap|blocked|today|immediately|deadline)\b", text):
        priority = "High"
    elif matches(r"\b(?:low priority|no rush|whenever)\b", text):
        priority = "Low"
    else:
        priority = "Normal"
    entities = [
        {"type": label, "value": value[:200]}
        for label, pattern in ENTITY_PATTERNS.items()
        for value in dict.fromkeys(re.findall(pattern, text, re.IGNORECASE))
    ]
    summary = " ".join(text.split())
    return AnalysisContent(
        category=category, priority=priority,
        summary=summary if len(summary) <= 300 else summary[:297] + "…",
        entities=entities[:30],
    )
