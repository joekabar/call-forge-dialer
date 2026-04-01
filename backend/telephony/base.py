"""
backend/telephony/base.py
─────────────────────────
Abstract base class for all telephony providers.

Every provider (Twilio, Asterisk, Vonage, etc.) implements this interface.
The rest of the codebase interacts ONLY with this interface — never with
provider-specific code directly. This makes swapping providers a config change.

Architecture:
    PhoneTab (React) ←→ /api/telephony/* (FastAPI) ←→ TelephonyProvider (this)
                                                          ↓
                                                    TwilioProvider  |  AsteriskProvider  |  ...
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, Any


# ── Enums ─────────────────────────────────────────────────────

class CallDirection(str, Enum):
    OUTBOUND = "outbound"
    INBOUND  = "inbound"

class CallState(str, Enum):
    IDLE        = "idle"
    INITIATING  = "initiating"   # provider is placing the call
    RINGING     = "ringing"      # remote phone is ringing
    IN_PROGRESS = "in_progress"  # call connected, audio flowing
    ON_HOLD     = "on_hold"
    COMPLETED   = "completed"
    FAILED      = "failed"
    BUSY        = "busy"
    NO_ANSWER   = "no_answer"
    CANCELLED   = "cancelled"

class DialingMode(str, Enum):
    PREVIEW     = "preview"      # agent sees contact, clicks to call
    POWER       = "power"        # auto-dials next after wrap-up
    PROGRESSIVE = "progressive"  # auto-dials when agent becomes available
    PREDICTIVE  = "predictive"   # over-dials based on predicted availability


# ── Data classes ──────────────────────────────────────────────

@dataclass
class TelephonyCredentials:
    """
    Provider credentials for one org. Stored encrypted in Supabase.
    Each provider type uses different fields — unused ones stay None.
    """
    provider:         str                        # "twilio" | "asterisk" | "vonage" | ...
    account_sid:      Optional[str] = None       # Twilio Account SID / Vonage API Key
    auth_token:       Optional[str] = None       # Twilio Auth Token / Vonage API Secret
    api_key_sid:      Optional[str] = None       # Twilio API Key SID (for access tokens)
    api_key_secret:   Optional[str] = None       # Twilio API Key Secret
    twiml_app_sid:    Optional[str] = None       # Twilio TwiML Application SID
    phone_number:     Optional[str] = None       # E.164 outbound caller ID
    sip_domain:       Optional[str] = None       # Asterisk SIP trunk domain
    sip_username:     Optional[str] = None       # Asterisk SIP auth user
    sip_password:     Optional[str] = None       # Asterisk SIP auth password
    webhook_base_url: Optional[str] = None       # Base URL for provider callbacks
    extra:            Dict[str, Any] = field(default_factory=dict)  # Provider-specific extras


@dataclass
class AccessTokenResult:
    """Returned when generating a client-side token for browser calling."""
    token:    str               # JWT or session token the browser uses
    identity: str               # Agent identity registered with the provider
    ttl:      int = 3600        # Token lifetime in seconds
    extra:    Dict[str, Any] = field(default_factory=dict)


@dataclass
class CallResult:
    """Returned after initiating or querying a call."""
    call_id:     str                         # Provider-specific call identifier
    state:       CallState                   # Current call state
    direction:   CallDirection               # Inbound or outbound
    from_number: Optional[str] = None        # Caller ID (E.164)
    to_number:   Optional[str] = None        # Destination (E.164)
    duration_sec: Optional[int] = None       # Call duration so far
    recording_url: Optional[str] = None      # If recording is active
    extra:       Dict[str, Any] = field(default_factory=dict)


@dataclass
class CallbackEvent:
    """Normalized event from provider webhooks (status callbacks)."""
    call_id:      str
    state:        CallState
    direction:    CallDirection
    from_number:  Optional[str] = None
    to_number:    Optional[str] = None
    duration_sec: Optional[int] = None
    recording_url: Optional[str] = None
    timestamp:    Optional[str] = None
    raw:          Dict[str, Any] = field(default_factory=dict)  # Original provider payload


# ── Abstract base ─────────────────────────────────────────────

class TelephonyProvider(ABC):
    """
    Contract that every telephony provider must implement.

    Usage:
        provider = get_provider(org_id, db)       # factory resolves which impl
        token    = await provider.generate_token(agent_id, agent_name)
        call     = await provider.make_call(to="+32470123456")
        await provider.hangup(call.call_id)
    """

    def __init__(self, credentials: TelephonyCredentials):
        self.credentials = credentials

    # ── Token (for browser-based WebRTC calling) ──────────────

    @abstractmethod
    async def generate_token(
        self,
        agent_id: str,
        agent_name: str,
        ttl: int = 3600,
    ) -> AccessTokenResult:
        """
        Generate a short-lived access token for the browser client.
        The frontend uses this token to initialize the softphone device.
        """
        ...

    # ── Outbound calls ────────────────────────────────────────

    @abstractmethod
    async def make_call(
        self,
        to: str,
        from_number: Optional[str] = None,
        agent_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> CallResult:
        """
        Initiate an outbound call to the given E.164 number.
        If from_number is None, use the org's default caller ID.
        """
        ...

    # ── In-call controls ──────────────────────────────────────

    @abstractmethod
    async def hangup(self, call_id: str) -> CallResult:
        """End an active call."""
        ...

    @abstractmethod
    async def hold(self, call_id: str) -> CallResult:
        """Put the call on hold (play hold music)."""
        ...

    @abstractmethod
    async def unhold(self, call_id: str) -> CallResult:
        """Resume a held call."""
        ...

    @abstractmethod
    async def mute(self, call_id: str) -> CallResult:
        """Mute the agent's microphone (remote party can't hear agent)."""
        ...

    @abstractmethod
    async def unmute(self, call_id: str) -> CallResult:
        """Unmute the agent's microphone."""
        ...

    @abstractmethod
    async def send_dtmf(self, call_id: str, digits: str) -> CallResult:
        """Send DTMF tones (e.g., navigating an IVR)."""
        ...

    # ── Recording ─────────────────────────────────────────────

    @abstractmethod
    async def start_recording(self, call_id: str) -> CallResult:
        """Start recording the call."""
        ...

    @abstractmethod
    async def stop_recording(self, call_id: str) -> CallResult:
        """Stop recording the call."""
        ...

    # ── Transfer ──────────────────────────────────────────────

    @abstractmethod
    async def transfer(
        self,
        call_id: str,
        to: str,
        announce: bool = False,
    ) -> CallResult:
        """
        Transfer the call. Cold transfer by default.
        If announce=True, agent speaks to the target first.
        """
        ...

    # ── Webhook parsing ───────────────────────────────────────

    @abstractmethod
    async def parse_callback(
        self,
        request_body: Dict[str, Any],
        headers: Optional[Dict[str, str]] = None,
    ) -> CallbackEvent:
        """
        Parse an incoming webhook/callback from the provider into
        a normalized CallbackEvent. Each provider sends events differently;
        this method translates them into our standard format.
        """
        ...

    # ── Voice response (for TwiML-like webhook responses) ─────

    @abstractmethod
    async def build_dial_response(
        self,
        to: str,
        from_number: Optional[str] = None,
        caller_name: Optional[str] = None,
        record: bool = False,
        timeout: int = 30,
    ) -> str:
        """
        Build the voice response markup (TwiML for Twilio, dialplan for
        Asterisk, etc.) that instructs the provider what to do when
        a call connects. Returns the raw response body as a string.
        """
        ...

    # ── Phone number management ───────────────────────────────

    @abstractmethod
    async def list_numbers(self) -> list:
        """List phone numbers available on this account."""
        ...

    @abstractmethod
    async def validate_credentials(self) -> bool:
        """
        Check that the stored credentials are valid.
        Returns True if the provider API responds successfully.
        Called during onboarding when an org sets up their telephony.
        """
        ...

    # ── Optional: conference / predictive support ─────────────

    async def create_conference(self, name: str, **kwargs) -> Dict[str, Any]:
        """Create a conference room (needed for predictive dialing)."""
        raise NotImplementedError(
            f"{self.__class__.__name__} does not support conferencing"
        )

    async def add_to_conference(
        self, conference_id: str, call_id: str, **kwargs
    ) -> Dict[str, Any]:
        """Add a call leg to an existing conference."""
        raise NotImplementedError(
            f"{self.__class__.__name__} does not support conferencing"
        )
