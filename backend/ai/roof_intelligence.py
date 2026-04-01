"""
backend/ai/roof_intelligence.py  [v2 addition]
────────────────────────────────────────────────
Analyses a property's roof via Google Solar API.
Called automatically when a contact loads in the dialer.
Results are cached per address for 90 days (~€0.004/call).

Returns panel count, kWp, annual kWh, savings, and payback years
so the agent opens every call already knowing the numbers.
"""

import os
import httpx
from dataclasses import dataclass, asdict

SOLAR_API_KEY   = os.getenv("GOOGLE_SOLAR_API_KEY")
GEOCODING_KEY   = os.getenv("GOOGLE_GEOCODING_KEY")

KWH_PRICE       = {"BE": 0.28, "NL": 0.31, "FR": 0.22, "DE": 0.30}
PANEL_KWP       = 0.40    # kWp per 400W panel
EFFICIENCY      = 0.80    # inverter + shading losses
PEAK_SUN_HOURS  = {"BE": 1000, "NL": 950, "FR": 1200, "DE": 1050}
INSTALL_COST_KWP = 1400   # € per kWp installed


@dataclass
class RoofAnalysis:
    address:            str
    roof_area_m2:       float
    usable_area_m2:     float
    orientation:        str
    tilt_degrees:       float
    panel_count:        int
    system_kwp:         float
    annual_kwh:         int
    annual_savings_eur: int
    monthly_savings_eur: int
    payback_years:      float
    co2_saved_kg:       int
    trees_equivalent:   int
    solar_score:        int      # 0–100 suitability score
    opening_line_nl:    str      # Dutch opening line suggestion
    confidence:         str      # high | medium | low
    data_source:        str


async def get_or_analyse_roof(
    contact_id: str,
    address:    str,
    country:    str,
    db,
) -> RoofAnalysis | None:
    """
    Check 90-day cache first. Fetch fresh if not found.
    Returns None if address cannot be geocoded.
    """
    cached = db.table("roof_analysis_cache")\
        .select("result")\
        .eq("contact_id", contact_id)\
        .gte("analysed_at", "now() - interval '90 days'")\
        .maybe_single()\
        .execute()

    if cached.data:
        return RoofAnalysis(**cached.data["result"])

    result = await analyse_roof(address, country)

    if result:
        db.table("roof_analysis_cache").upsert({
            "contact_id":  contact_id,
            "address":     address,
            "country":     country,
            "result":      asdict(result),
            "analysed_at": "now()",
        }).execute()

    return result


async def analyse_roof(address: str, country: str = "BE") -> RoofAnalysis | None:
    coords = await _geocode(address)
    if not coords:
        return None

    solar = await _call_solar_api(coords["lat"], coords["lng"])

    if solar:
        return _parse_solar(solar, address, country)
    else:
        return _estimate_from_coords(coords, address, country)


async def _geocode(address: str) -> dict | None:
    async with httpx.AsyncClient(timeout=5) as c:
        r = await c.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": address, "key": GEOCODING_KEY},
        )
        data = r.json()
        if data.get("results"):
            loc = data["results"][0]["geometry"]["location"]
            return {"lat": loc["lat"], "lng": loc["lng"]}
    return None


async def _call_solar_api(lat: float, lng: float) -> dict | None:
    async with httpx.AsyncClient(timeout=8) as c:
        r = await c.get(
            "https://solar.googleapis.com/v1/buildingInsights:findClosest",
            params={
                "location.latitude":  lat,
                "location.longitude": lng,
                "requiredQuality":    "LOW",
                "key": SOLAR_API_KEY,
            },
        )
        if r.status_code == 200:
            return r.json()
    return None


def _parse_solar(data: dict, address: str, country: str) -> RoofAnalysis:
    potential = data.get("solarPotential", {})
    segments  = potential.get("roofSegmentStats", [{}])
    best      = segments[0] if segments else {}

    roof_area   = best.get("stats", {}).get("areaMeters2", 40.0)
    usable_area = roof_area * 0.70
    panel_count = max(1, int(usable_area / 1.7))
    system_kwp  = round(panel_count * PANEL_KWP, 1)
    sun_hours   = PEAK_SUN_HOURS.get(country, 1000)
    annual_kwh  = int(system_kwp * sun_hours * EFFICIENCY)
    price       = KWH_PRICE.get(country, 0.28)
    annual_sav  = int(annual_kwh * 0.65 * price)   # 65% self-consumption
    monthly_sav = annual_sav // 12
    payback     = round((system_kwp * INSTALL_COST_KWP) / max(annual_sav, 1), 1)
    co2         = int(annual_kwh * 0.233)
    trees       = co2 // 21
    azimuth     = best.get("azimuthDegrees", 180)
    orientation = _azimuth_label(azimuth)
    score       = _solar_score(orientation, best.get("pitchDegrees", 35), system_kwp)
    opening     = (
        f"Uw dak past {panel_count} panelen — dat is een besparing van "
        f"ongeveer €{monthly_sav} per maand."
    )

    return RoofAnalysis(
        address=address,
        roof_area_m2=round(roof_area, 1),
        usable_area_m2=round(usable_area, 1),
        orientation=orientation,
        tilt_degrees=round(best.get("pitchDegrees", 35), 1),
        panel_count=panel_count,
        system_kwp=system_kwp,
        annual_kwh=annual_kwh,
        annual_savings_eur=annual_sav,
        monthly_savings_eur=monthly_sav,
        payback_years=payback,
        co2_saved_kg=co2,
        trees_equivalent=trees,
        solar_score=score,
        opening_line_nl=opening,
        confidence="high",
        data_source="google_solar",
    )


def _estimate_from_coords(coords, address, country) -> RoofAnalysis:
    """Fallback when Solar API returns no data — use average Belgian roof."""
    return _parse_solar({
        "solarPotential": {
            "roofSegmentStats": [{"stats": {"areaMeters2": 42.0}, "azimuthDegrees": 175, "pitchDegrees": 35}]
        }
    }, address, country)


def _azimuth_label(deg: float) -> str:
    for boundary, label in [(22.5,"North"),(67.5,"North-East"),(112.5,"East"),
                             (157.5,"South-East"),(202.5,"South"),(247.5,"South-West"),
                             (292.5,"West"),(337.5,"North-West")]:
        if deg < boundary:
            return label
    return "North"


def _solar_score(orientation: str, tilt: float, kwp: float) -> int:
    base = {"South": 95, "South-West": 88, "South-East": 85,
            "West": 72, "East": 70, "North-West": 50,
            "North-East": 50, "North": 40}.get(orientation, 65)
    tilt_bonus = 5 if 30 <= tilt <= 45 else 0
    size_bonus = min(5, int(kwp / 2))
    return min(100, base + tilt_bonus + size_bonus)
