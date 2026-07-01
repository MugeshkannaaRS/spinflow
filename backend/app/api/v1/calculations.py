"""
calculations.py — Spinning Calculations REST API for SpinFlow ERP.

All endpoints are stateless (no DB writes). They accept machine parameters
and return auto-computed values. Frontend forms call these to populate
read-only derived fields in real time.

Accessible by any authenticated user with quality or production module access.
"""
from __future__ import annotations
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import require_module
from app.models.user import User
from app.core.spinning_calculations import (
    # Count conversion
    convert_count,
    actual_draft_indirect, actual_draft_direct, tpi_from_tm, tpi_from_speed, twist_multiplier_from_tpi,
    tpm_from_tpi, front_roller_surface_speed,
    # Quality metrics
    cleaning_efficiency, beats_per_inch,
    cv_percent, u_percent_approx, actual_hank_ne,
    csp, splice_efficiency_pct,
    # Machine calculators
    calculate_ring_frame, calculate_simplex, calculate_draw_frame,
    calculate_blow_room, calculate_carding,
    production_lap_former, production_comber,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/calculations", tags=["Spinning Calculations"])


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic request/response models
# ─────────────────────────────────────────────────────────────────────────────

class CountConvertRequest(BaseModel):
    value: float = Field(..., gt=0, description="Count value to convert")
    from_system: str = Field(..., description="Source system: ne|nm|tex|denier|grex")
    to_system: str = Field(..., description="Target system: ne|nm|tex|denier|grex")


class CountConvertResponse(BaseModel):
    input_value: float
    input_system: str
    output_value: float
    output_system: str
    all_systems: Dict[str, float]


class DraftRequest(BaseModel):
    count_system: str = Field("indirect", description="indirect (Ne/Nm) or direct (Tex/Denier)")
    count_fed: float = Field(..., gt=0)
    count_delivered: float = Field(..., gt=0)
    doubling: int = Field(1, ge=1, description="Number of slivers fed (draw frame: 6-8)")


class TpiRequest(BaseModel):
    method: str = Field(..., description="tm | speed")
    # For method=tm
    twist_multiplier: Optional[float] = None
    count_ne: Optional[float] = None
    # For method=speed
    flyer_rpm: Optional[float] = None
    front_roller_dia_inches: Optional[float] = None
    front_roller_rpm: Optional[float] = None


class CleaningEfficiencyRequest(BaseModel):
    trash_fed_pct: float = Field(..., gt=0, le=100)
    trash_delivered_pct: float = Field(..., ge=0, le=100)


class BeatsPerInchRequest(BaseModel):
    beater_rpm: float = Field(..., gt=0)
    arms_per_revolution: int = Field(2, ge=1, le=12)
    feed_roller_dia_inches: float = Field(..., gt=0)
    feed_roller_rpm: float = Field(..., gt=0)


class HankRequest(BaseModel):
    weights_grams: list[float] = Field(..., min_length=1, description="Individual wrap weights (g)")
    length_yards: float = Field(120.0, gt=0, description="Wrap reel circumference × laps")
    std_hank: Optional[float] = Field(None, gt=0, description="Standard/nominal hank (Ne)")


class HankResponse(BaseModel):
    avg_weight_grams: float
    actual_hank_ne: float
    cv_pct: Optional[float]
    u_pct_approx: Optional[float]
    min_weight: float
    max_weight: float
    within_spec_pct: Optional[float]  # % readings within ±0.5% of std_hank


class ProductionRequest(BaseModel):
    machine_type: str = Field(
        ...,
        description="ring_frame | simplex | draw_frame | blow_room | card | lap_former | comber"
    )
    params: Dict[str, Any] = Field(..., description="Machine-specific parameters")


class CspRequest(BaseModel):
    lea_strength_lb: float = Field(..., gt=0)
    count_ne: float = Field(..., gt=0)


class SpliceRequest(BaseModel):
    splice_strength: float = Field(..., gt=0)
    yarn_strength: float = Field(..., gt=0)


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/count-convert", response_model=CountConvertResponse)
async def count_conversion(
    body: CountConvertRequest,
    current_user: User = Depends(require_module("quality")),
):
    """
    Convert a yarn count from one system to all others.
    Supports: Ne (English) ↔ Nm (metric) ↔ Tex ↔ Denier ↔ Grex.
    """
    try:
        output = convert_count(body.value, body.from_system, body.to_system)

        # Build "all systems" by routing through Te x
        systems = ["ne", "nm", "tex", "denier", "grex"]
        all_vals: Dict[str, float] = {}
        for sys in systems:
            try:
                all_vals[sys] = round(convert_count(body.value, body.from_system, sys), 6)
            except Exception:
                pass

        return CountConvertResponse(
            input_value=body.value,
            input_system=body.from_system,
            output_value=round(output, 6),
            output_system=body.to_system,
            all_systems=all_vals,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/count-convert")
async def count_conversion_get(
    value: float,
    from_system: str,
    to_system: str,
    current_user: User = Depends(require_module("quality")),
):
    """GET version for easy URL-based calls from frontend."""
    try:
        systems = ["ne", "nm", "tex", "denier", "grex"]
        all_vals: Dict[str, float] = {}
        for sys in systems:
            try:
                all_vals[sys] = round(convert_count(value, from_system, sys), 6)
            except Exception:
                pass
        output = convert_count(value, from_system, to_system)
        return {
            "input_value": value,
            "input_system": from_system,
            "output_value": round(output, 6),
            "output_system": to_system,
            "all_systems": all_vals,
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/draft")
async def compute_draft(
    body: DraftRequest,
    current_user: User = Depends(require_module("quality")),
):
    """Compute actual draft (indirect or direct count system)."""
    try:
        if body.count_system.lower() == "indirect":
            draft = actual_draft_indirect(body.count_delivered, body.count_fed, body.doubling)
        else:
            draft = actual_draft_direct(body.count_fed, body.count_delivered, body.doubling)
        return {"actual_draft": round(draft, 4), "count_system": body.count_system}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/tpi")
async def compute_tpi(
    body: TpiRequest,
    current_user: User = Depends(require_module("quality")),
):
    """
    Compute TPI.
    method=tm: TPI = TM × √Ne
    method=speed: TPI = flyer_rpm / (π × D_front × N_front)
    """
    try:
        result: Dict[str, Any] = {}
        if body.method == "tm":
            if not body.twist_multiplier or not body.count_ne:
                raise HTTPException(status_code=422, detail="twist_multiplier and count_ne required for method=tm")
            tpi = tpi_from_tm(body.twist_multiplier, body.count_ne)
            result["tpi"] = round(tpi, 3)
            result["tpm"] = round(tpm_from_tpi(tpi), 2)
            result["method"] = "tm"
        elif body.method == "speed":
            if not all([body.flyer_rpm, body.front_roller_dia_inches, body.front_roller_rpm]):
                raise HTTPException(status_code=422, detail="flyer_rpm, front_roller_dia_inches, front_roller_rpm required for method=speed")
            ss = front_roller_surface_speed(body.front_roller_dia_inches, body.front_roller_rpm)
            tpi = tpi_from_speed(body.flyer_rpm, ss)
            result["tpi"] = round(tpi, 3)
            result["tpm"] = round(tpm_from_tpi(tpi), 2)
            result["surface_speed_in_min"] = round(ss, 2)
            result["method"] = "speed"
            if body.count_ne:
                result["twist_multiplier"] = round(twist_multiplier_from_tpi(tpi, body.count_ne), 3)
        else:
            raise HTTPException(status_code=422, detail="method must be 'tm' or 'speed'")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/cleaning-efficiency")
async def compute_cleaning_efficiency(
    body: CleaningEfficiencyRequest,
    current_user: User = Depends(require_module("quality")),
):
    """Blow Room / Carding cleaning efficiency %."""
    try:
        eff = cleaning_efficiency(body.trash_fed_pct, body.trash_delivered_pct)
        return {
            "cleaning_efficiency_pct": round(eff, 3),
            "trash_removed_pct": round(body.trash_fed_pct - body.trash_delivered_pct, 4),
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/beats-per-inch")
async def compute_beats_per_inch(
    body: BeatsPerInchRequest,
    current_user: User = Depends(require_module("quality")),
):
    """Blow Room beater intensity: beats per inch of material fed."""
    try:
        bpi = beats_per_inch(
            body.beater_rpm, body.arms_per_revolution,
            body.feed_roller_dia_inches, body.feed_roller_rpm
        )
        return {"beats_per_inch": round(bpi, 3)}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/hank", response_model=HankResponse)
async def compute_hank(
    body: HankRequest,
    current_user: User = Depends(require_module("quality")),
):
    """
    Compute actual hank, CV%, U% from individual wrap weights.
    Used by Carding Wrapping, Drawing Sliver Wrapping, Simplex Hank Test.
    """
    weights = [w for w in body.weights_grams if w and w > 0]
    if not weights:
        raise HTTPException(status_code=422, detail="At least one weight reading required")
    avg_wt = sum(weights) / len(weights)
    hank = actual_hank_ne(avg_wt, body.length_yards)
    cv = cv_percent(weights)
    u_pct = u_percent_approx(cv) if cv is not None else None

    within_spec: Optional[float] = None
    if body.std_hank and body.std_hank > 0:
        lo = body.std_hank * 0.995
        hi = body.std_hank * 1.005
        # Convert each weight to hank and check range
        hanks = [actual_hank_ne(w, body.length_yards) for w in weights if w > 0]
        in_spec = sum(1 for h in hanks if lo <= h <= hi)
        within_spec = round((in_spec / len(hanks)) * 100.0, 1)

    return HankResponse(
        avg_weight_grams=round(avg_wt, 4),
        actual_hank_ne=round(hank, 4),
        cv_pct=round(cv, 3) if cv is not None else None,
        u_pct_approx=round(u_pct, 3) if u_pct is not None else None,
        min_weight=round(min(weights), 4),
        max_weight=round(max(weights), 4),
        within_spec_pct=within_spec,
    )


@router.post("/production")
async def compute_production(
    body: ProductionRequest,
    current_user: User = Depends(require_module("quality")),
):
    """
    Compute production rate for any machine type.
    machine_type: ring_frame | simplex | draw_frame | blow_room | card | lap_former | comber
    """
    mt = body.machine_type.lower().replace("-", "_").replace(" ", "_")
    calculators = {
        "ring_frame": calculate_ring_frame,
        "simplex": calculate_simplex,
        "draw_frame": calculate_draw_frame,
        "blow_room": calculate_blow_room,
        "card": calculate_carding,
        "carding": calculate_carding,
    }
    if mt not in calculators:
        # Lap former & comber: compute inline
        if mt in ("lap_former", "comber"):
            p = body.params
            try:
                if mt == "lap_former":
                    lb = production_lap_former(
                        float(p.get("delivery_roller_dia_inches", 0)),
                        float(p.get("delivery_roller_rpm", 0)),
                        float(p.get("lap_grains_per_yard", 0)),
                        float(p.get("efficiency_pct", 85)),
                        int(p.get("machines", 1)),
                    )
                    return {"production_lb_hr": round(lb, 3), "production_kg_hr": round(lb * 0.453592, 3)}
                else:  # comber
                    lb = production_comber(
                        float(p.get("delivery_roller_dia_inches", 0)),
                        float(p.get("delivery_roller_rpm", 0)),
                        float(p.get("sliver_grains_per_yard", 0)),
                        float(p.get("nips_per_min", 0)),
                        float(p.get("efficiency_pct", 85)),
                        int(p.get("heads", 8)),
                        int(p.get("machines", 1)),
                        float(p.get("noil_waste_pct", 15)),
                        float(p.get("feed_per_nip_mm", 5)),
                    )
                    return {"production_lb_hr": round(lb, 3), "production_kg_hr": round(lb * 0.453592, 3)}
            except (ValueError, ZeroDivisionError) as e:
                raise HTTPException(status_code=422, detail=str(e))
        raise HTTPException(
            status_code=422,
            detail=f"Unknown machine_type '{mt}'. Choose: ring_frame, simplex, draw_frame, blow_room, card, lap_former, comber"
        )
    try:
        result = calculators[mt](body.params)
        return {"machine_type": mt, **result}
    except (ValueError, ZeroDivisionError) as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/csp")
async def compute_csp(
    body: CspRequest,
    current_user: User = Depends(require_module("quality")),
):
    """CSP = lea_strength_lb × count_ne."""
    return {
        "csp": round(csp(body.lea_strength_lb, body.count_ne), 2),
        "lea_strength_lb": body.lea_strength_lb,
        "count_ne": body.count_ne,
    }


@router.post("/splice-efficiency")
async def compute_splice_efficiency(
    body: SpliceRequest,
    current_user: User = Depends(require_module("quality")),
):
    """Splice efficiency % = splice_strength / yarn_strength × 100."""
    try:
        eff = splice_efficiency_pct(body.splice_strength, body.yarn_strength)
        return {"splice_efficiency_pct": round(eff, 2)}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/reference")
async def get_formula_reference(
    current_user: User = Depends(require_module("quality")),
):
    """
    Return the complete spinning formula reference sheet (for in-app help).
    """
    return {
        "count_systems": {
            "ne": "English count (Ne) — indirect, hanks (840 yd) per lb",
            "nm": "Metric count (Nm) — indirect, km per kg",
            "tex": "Tex — direct, grams per 1000 m",
            "denier": "Denier — direct, grams per 9000 m",
            "grex": "Grex — direct, grams per 10000 m",
        },
        "conversions": {
            "ne_to_tex": "Tex = 590.5 / Ne",
            "ne_to_nm": "Nm = 1.6935 × Ne",
            "ne_to_denier": "Denier = 5314.5 / Ne",
            "tex_to_ne": "Ne = 590.5 / Tex",
            "nm_to_ne": "Ne = Nm / 1.6935",
        },
        "twist": {
            "tpi_from_tm": "TPI = TM × √Ne  (TM: Simplex 1.0–1.4, Ring 3.0–5.0)",
            "tpi_from_speed": "TPI = flyer_rpm / (π × D_front × N_front)",
            "tpm_from_tpi": "TPM = TPI × 39.37",
        },
        "draft": {
            "indirect": "Draft = (count_delivered × doubling) / count_fed",
            "direct": "Draft = (count_fed × doubling) / count_delivered",
            "mechanical": "Mech. Draft = (D_front × N_front) / (D_back × N_back)",
        },
        "production": {
            "scutcher": "P(oz/hr) = π×D×N/36 × 60 × lap_wt_oz_yd × η",
            "card": "P(lb/hr) = π×D×N/36 × 60 × sliver_gr_yd/7000 × tension_draft × η",
            "draw_frame": "P(lb/hr) = π×D×N/36 × 60 × del_sliver_gr_yd/7000 × η × heads × machines",
            "lap_former": "P(lb/hr) = π×D×N/36 × 60 × lap_gr_yd/7000 × η × machines",
            "comber": "P(lb/hr) = f × π×D×N/36 × 60 × sliver_gr_yd/7000 × η × nips × heads × machines × (1-waste%)",
            "simplex": "P(lb/hr) = π×D×N/36 × 60 × roving_gr_yd/7000 × η × spindles",
            "ring_frame": "P(oz/shift/spindle) = spindle_rpm×60 / (TPI×36) × 16×shift_h / (840×Ne) × η",
        },
        "quality": {
            "actual_hank": "Hank (Ne) = (length_yards × 453.592) / (840 × weight_grams)",
            "cv_pct": "CV% = (σ / mean) × 100  (σ = sample std dev)",
            "u_pct": "U% ≈ CV% / √2  (for normal distribution)",
            "cleaning_efficiency": "CE% = (trash_fed - trash_delivered) / trash_fed × 100",
            "beats_per_inch": "Beats/inch = (beater_rpm × arms) / (π × D_feed × N_feed)",
            "csp": "CSP = lea_strength_lb × count_Ne",
            "splice_efficiency": "Splice Eff% = splice_strength / yarn_strength × 100",
        },
        "notes": [
            "1 Hank = 840 yards",
            "1 lb = 453.592 g = 7000 grains",
            "1 oz = 28.349 g",
            "1 inch = 25.4 mm",
            "Standard wrap reel: 1.5 yard arm → 120 yards in 80 laps",
        ],
    }
