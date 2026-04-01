"""
backend/contacts/serializer.py
────────────────────────────────
Controls exactly which fields each role receives.

KEY RULE: Agents never see the original address.
They must enter the address themselves during the call.
This is intentional for data quality — the verified address
is always more accurate than the imported one.
"""

from auth.jwt_validator import AgentContext


# Fields agents can see — original address columns excluded
AGENT_FIELDS = [
    "id",
    "first_name",
    "last_name",
    "phone",            # shown masked in UI: +32 470 *** **56
    "email",
    "lead_score",
    "status",
    "campaign_id",
    "call_count",
    "last_outcome",
    "callback_at",
    # Verified address IS shown if agent already filled it in
    "street_verified",
    "city_verified",
    "postal_code_verified",
    "address_verified_at",
]

# Admins and supervisors see everything including original address
ADMIN_FIELDS = "__all__"


def serialize_contact(contact: dict, agent: AgentContext) -> dict:
    """
    Returns a contact dict filtered to only the fields
    the requesting user is allowed to see.

    For agents: original address columns are removed entirely.
    For admins/supervisors: full contact returned including
    both original and verified address for comparison.
    """
    if agent.role in ("admin", "supervisor"):
        # Add a helper flag showing whether address has been verified
        contact["address_verified"] = bool(contact.get("street_verified"))
        return contact

    # Agent view: pick only allowed fields
    result = {k: contact[k] for k in AGENT_FIELDS if k in contact}

    # Mask phone number for display; keep dialable E.164 number for VoIP SDK
    if result.get("phone"):
        result["phone_masked"] = _mask_phone(result["phone"])
        result["phone_e164"]   = _to_e164(result["phone"])  # +32XXXXXXXXX for Twilio
        del result["phone"]                                  # raw field replaced by masked + e164

    # Flag: has this contact's address been verified yet?
    result["address_verified"] = bool(result.get("street_verified"))

    return result


def _to_e164(phone: str) -> str:
    """
    Ensure the phone number is in E.164 format (+XXXXXXXXXXX) for Twilio.
    Stored format is digits-only: 32470123456 → +32470123456
    """
    if not phone:
        return phone
    digits = "".join(c for c in phone if c.isdigit())
    return f"+{digits}" if digits else phone


def _mask_phone(phone: str) -> str:
    """
    +32 470 12 34 56  →  +32 470 *** **56
    0470123456        →  0470 *** **56

    Keeps first 7 digits and last 2 visible.
    Middle digits replaced with asterisks.
    """
    digits = "".join(c for c in phone if c.isdigit() or c == "+")
    if len(digits) < 8:
        return phone   # Too short to mask safely — return as-is

    visible_start = digits[:6]
    visible_end   = digits[-2:]
    hidden_count  = len(digits) - 8
    masked        = "*" * hidden_count

    return f"{visible_start} {masked} {visible_end}"
