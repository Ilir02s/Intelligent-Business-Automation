from app.ai.rules import SENSITIVE, matches

WORKFLOWS = {
    "Billing": ("Billing review", "Finance", "Verify invoice, payment, and customer records"),
    "Customer support": ("Customer case triage", "Customer Success", "Verify order details and review the customer issue"),
    "IT support": ("IT incident intake", "IT Operations", "Review the affected service, account, or device"),
    "Sales": ("Sales inquiry routing", "Sales", "Review the prospect’s requirements and prepare a response"),
    "General inquiries": ("General request routing", "Operations", "Review the request and assign an owner"),
}


def plan(text, category, priority):
    name, department, action = WORKFLOWS[category]
    needs_approval = priority == "Critical" or matches(SENSITIVE, text)
    steps = [{"label": "Classify and route request", "status": "completed"}]
    if needs_approval:
        steps.append({"label": "Review and decide on approval", "status": "pending"})
    steps.append({"label": action, "status": "blocked" if needs_approval else "ready"})
    return name, department, steps, needs_approval
