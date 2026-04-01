"""
backend/integrations/whatsapp.py  [v2 addition]
──────────────────────────────────────────────────
Sends WhatsApp follow-up messages after every call outcome.
Uses a single shared SolarFlow Pro WhatsApp Business account
via 360dialog — customers never need to configure anything.

Message templates are pre-approved by Meta.
Each template is personalised with prospect name + dynamic link.

Triggered automatically from complete_call.py — no agent action needed.

Cost model: ~€0.05 per WhatsApp message (360dialog pricing).
Charge this back to the customer as a usage fee or include in Pro plan.
"""

import os
import httpx

WA_BASE_URL = "https://waba.360dialog.io/v1/messages"
WA_API_KEY  = os.getenv("WHATSAPP_360DIALOG_KEY")

# Pre-approved Meta template names
# Templates must be approved before first use (24-48h review)
# Format: namespace.template_name
TEMPLATES = {
    "interested": {
        "name":     "solarflow_interested_nl",
        "language": "nl",
        # Template body (pre-approved):
        # "Hallo {{1}}, bedankt voor ons gesprek!
        #  Uw persoonlijke zonnepanelen berekening staat klaar: {{2}}
        #  Wij nemen binnenkort contact op voor een vrijblijvende afspraak."
        "params":  ["first_name", "savings_url"],
    },
    "callback": {
        "name":     "solarflow_callback_nl",
        "language": "nl",
        # Template body:
        # "Hallo {{1}}, geen probleem — we bellen u terug!
        #  Wilt u alvast een tijdstip kiezen? {{2}}"
        "params":  ["first_name", "calendar_url"],
    },
    "voicemail": {
        "name":     "solarflow_voicemail_nl",
        "language": "nl",
        # Template body:
        # "Hallo {{1}}, ik probeerde u te bereiken over zonnepanelen.
        #  Bekijk alvast wat uw dak kan besparen: {{2}}"
        "params":  ["first_name", "savings_url"],
    },
    # No WhatsApp on hard "not interested" or DNC — respect the prospect
    "not_interested": None,
    "dnc":            None,
    "wrong_number":   None,
}


async def send_followup(
    outcome:      str,
    contact:      dict,
    savings_url:  str,
    calendar_url: str,
) -> dict:
    """
    Sends the appropriate WhatsApp message for the given call outcome.
    Returns {"sent": True/False, "reason": "..."}.

    Uses SolarFlow Pro's shared WhatsApp Business account.
    Customer's org name appears as the sender display name
    (configurable per org in the admin panel).
    """
    template_cfg = TEMPLATES.get(outcome)

    if not template_cfg:
        return {"sent": False, "reason": f"No template for outcome: {outcome}"}

    if not WA_API_KEY:
        return {"sent": False, "reason": "WhatsApp API key not configured"}

    phone = _to_e164(contact.get("phone", ""))
    if not phone:
        return {"sent": False, "reason": "Invalid phone number"}

    # Build parameter values in order
    param_map = {
        "first_name":   contact.get("first_name", ""),
        "savings_url":  savings_url,
        "calendar_url": calendar_url,
    }
    components = [{
        "type": "body",
        "parameters": [
            {"type": "text", "text": param_map[p]}
            for p in template_cfg["params"]
        ],
    }]

    payload = {
        "to":   phone,
        "type": "template",
        "template": {
            "name":     template_cfg["name"],
            "language": {"code": template_cfg["language"]},
            "components": components,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                WA_BASE_URL,
                json=payload,
                headers={"D360-API-KEY": WA_API_KEY, "Content-Type": "application/json"},
            )
            if r.status_code in (200, 201):
                return {"sent": True, "template": template_cfg["name"]}
            else:
                return {"sent": False, "reason": f"API error {r.status_code}: {r.text}"}
    except Exception as e:
        return {"sent": False, "reason": str(e)}


def _to_e164(phone: str) -> str:
    """
    Normalises any Belgian/Dutch phone format to E.164 (digits only, no +).
    +32 470 12 34 56 → 32470123456
    0470/12.34.56    → 32470123456
    """
    digits = "".join(c for c in phone if c.isdigit())
    if digits.startswith("0") and len(digits) == 10:
        digits = "32" + digits[1:]   # Belgian default; extend for NL (31)
    if digits.startswith("00"):
        digits = digits[2:]
    return digits if len(digits) >= 10 else ""
