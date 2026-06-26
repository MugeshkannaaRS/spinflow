"""
spinning_calculations.py — All spinning mill formulas for SpinFlow ERP.

Sources: Yarn Calculations reference (28-page PDF, uploaded Jun 2026).
Units are explicit in every function docstring.
All functions are pure (no I/O, no DB) so they can be called from
API endpoints, quality form saves, and frontend auto-compute.
"""
from __future__ import annotations
import math
from typing import Optional


# ─────────────────────────────────────────────────────────────────────────────
# COUNT CONVERSION
# ─────────────────────────────────────────────────────────────────────────────

def ne_to_tex(ne: float) -> float:
    """Ne (English count, indirect) → Tex (g per 1000 m)."""
    if ne <= 0:
        raise ValueError("Ne must be > 0")
    return 590.5 / ne


def ne_to_nm(ne: float) -> float:
    """Ne → Nm (metric count, indirect, km per kg)."""
    if ne <= 0:
        raise ValueError("Ne must be > 0")
    return 1.6935 * ne


def ne_to_denier(ne: float) -> float:
    """Ne → Denier (g per 9000 m)."""
    return ne_to_tex(ne) * 9


def ne_to_grex(ne: float) -> float:
    """Ne → Grex (g per 10000 m)."""
    return ne_to_tex(ne) * 10


def tex_to_ne(tex: float) -> float:
    """Tex → Ne."""
    if tex <= 0:
        raise ValueError("Tex must be > 0")
    return 590.5 / tex


def tex_to_nm(tex: float) -> float:
    """Tex → Nm."""
    if tex <= 0:
        raise ValueError("Tex must be > 0")
    return 1000.0 / tex


def tex_to_denier(tex: float) -> float:
    """Tex → Denier."""
    return tex * 9


def tex_to_grex(tex: float) -> float:
    """Tex → Grex."""
    return tex * 10


def nm_to_ne(nm: float) -> float:
    """Nm → Ne."""
    if nm <= 0:
        raise ValueError("Nm must be > 0")
    return nm / 1.6935


def nm_to_tex(nm: float) -> float:
    """Nm → Tex."""
    if nm <= 0:
        raise ValueError("Nm must be > 0")
    return 1000.0 / nm


def denier_to_ne(denier: float) -> float:
    """Denier → Ne."""
    if denier <= 0:
        raise ValueError("Denier must be > 0")
    return 5314.5 / denier


def denier_to_tex(denier: float) -> float:
    """Denier → Tex."""
    return denier / 9.0


def convert_count(value: float, from_system: str, to_system: str) -> float:
    """
    Universal count conversion.
    from_system / to_system: 'ne' | 'nm' | 'tex' | 'denier' | 'grex'
    """
    from_system = from_system.lower().strip()
    to_system = to_system.lower().strip()
    if from_system == to_system:
        return value

    # Convert everything to Tex first
    to_tex = {
        "ne": ne_to_tex,
        "nm": lambda v: 1000.0 / v,
        "tex": lambda v: v,
        "denier": denier_to_tex,
        "grex": lambda v: v / 10.0,
    }
    from_tex = {
        "ne": tex_to_ne,
        "nm": tex_to_nm,
        "tex": lambda v: v,
        "denier": tex_to_denier,
        "grex": tex_to_grex,
    }
    if from_system not in to_tex:
        raise ValueError(f"Unknown count system: {from_system}")
    if to_system not in from_tex:
        raise ValueError(f"Unknown count system: {to_system}")

    tex_val = to_tex[from_system](value)
    return from_tex[to_system](tex_val)


# ─────────────────────────────────────────────────────────────────────────────
# YARN LENGTH
# ─────────────────────────────────────────────────────────────────────────────

def yarn_length_yards(ne: float, weight_lb: float) -> float:
    """Length in yards for given count (Ne) and weight (lb).
    1 Hank = 840 yards.  length = Ne × weight_lb × 840
    """
    return ne * weight_lb * 840.0


def yarn_length_meters(ne: float, weight_lb: float) -> float:
    """Length in metres: yards × 0.9144."""
    return yarn_length_yards(ne, weight_lb) * 0.9144


def yarn_length_from_tex(tex: float, weight_grams: float) -> float:
    """Length in metres from Tex and weight_grams.  L = weight_g / (tex / 1000)."""
    if tex <= 0:
        raise ValueError("Tex must be > 0")
    return (weight_grams / tex) * 1000.0


# ─────────────────────────────────────────────────────────────────────────────
# DRAFT
# ─────────────────────────────────────────────────────────────────────────────

def actual_draft_indirect(count_delivered: float, count_fed: float,
                          doubling: int = 1) -> float:
    """
    Actual draft for indirect count systems (Ne, Nm).
    Draft = (count_delivered × doubling) / count_fed
    Doubling = number of slivers fed (draw frame default 6-8).
    """
    if count_fed <= 0:
        raise ValueError("count_fed must be > 0")
    return (count_delivered * doubling) / count_fed


def actual_draft_direct(count_fed: float, count_delivered: float,
                        doubling: int = 1) -> float:
    """
    Actual draft for direct count systems (Tex, Denier).
    Draft = (count_fed × doubling) / count_delivered
    """
    if count_delivered <= 0:
        raise ValueError("count_delivered must be > 0")
    return (count_fed * doubling) / count_delivered


def mechanical_draft(front_roller_dia_mm: float, front_roller_rpm: float,
                     back_roller_dia_mm: float, back_roller_rpm: float) -> float:
    """
    Mechanical draft = (π × D_F × N_F) / (π × D_B × N_B)
                     = (D_F × N_F) / (D_B × N_B)
    D in mm, N in RPM.
    """
    if back_roller_dia_mm <= 0 or back_roller_rpm <= 0:
        raise ValueError("Back roller dimensions must be > 0")
    return (front_roller_dia_mm * front_roller_rpm) / (back_roller_dia_mm * back_roller_rpm)


def draft_constant(mechanical_draft: float, actual_draft: float) -> float:
    """Draft constant = mechanical_draft / actual_draft."""
    if actual_draft <= 0:
        raise ValueError("actual_draft must be > 0")
    return mechanical_draft / actual_draft


# ─────────────────────────────────────────────────────────────────────────────
# TWIST (TPI / TPM)
# ─────────────────────────────────────────────────────────────────────────────

def tpi_from_speed(flyer_rpm: float, front_roller_surface_speed_inches_min: float) -> float:
    """
    TPI = flyer_rpm / front_roller_surface_speed (inches/min)
    Front roller surface speed = π × D_F(inches) × RPM_F
    """
    if front_roller_surface_speed_inches_min <= 0:
        raise ValueError("Surface speed must be > 0")
    return flyer_rpm / front_roller_surface_speed_inches_min


def front_roller_surface_speed(dia_inches: float, rpm: float) -> float:
    """Surface speed in inches/min = π × D × N."""
    return math.pi * dia_inches * rpm


def tpi_from_tm(twist_multiplier: float, count_ne: float) -> float:
    """
    TPI = TM × √Ne
    Simplex TM ≈ 1.0–1.4; Ring Frame TM ≈ 3.0–5.0.
    """
    if count_ne <= 0:
        raise ValueError("count_ne must be > 0")
    return twist_multiplier * math.sqrt(count_ne)


def twist_multiplier_from_tpi(tpi: float, count_ne: float) -> float:
    """TM = TPI / √Ne."""
    if count_ne <= 0:
        raise ValueError("count_ne must be > 0")
    return tpi / math.sqrt(count_ne)


def tpm_from_tpi(tpi: float) -> float:
    """Twists Per Metre = TPI × 39.37."""
    return tpi * 39.3701


def tpi_from_tpm(tpm: float) -> float:
    """TPI = TPM / 39.37."""
    return tpm / 39.3701


# ─────────────────────────────────────────────────────────────────────────────
# CLEANING EFFICIENCY
# ─────────────────────────────────────────────────────────────────────────────

def cleaning_efficiency(trash_fed_pct: float, trash_delivered_pct: float) -> float:
    """
    Cleaning efficiency (%) = (trash_fed - trash_del) / trash_fed × 100
    Used in Blow Room and Carding waste analysis.
    """
    if trash_fed_pct <= 0:
        raise ValueError("trash_fed_pct must be > 0")
    return ((trash_fed_pct - trash_delivered_pct) / trash_fed_pct) * 100.0


def waste_extraction_pct(input_weight: float, output_weight: float) -> float:
    """Waste % = (input - output) / input × 100."""
    if input_weight <= 0:
        raise ValueError("input_weight must be > 0")
    return ((input_weight - output_weight) / input_weight) * 100.0


# ─────────────────────────────────────────────────────────────────────────────
# BEATS PER INCH (Blow Room)
# ─────────────────────────────────────────────────────────────────────────────

def beats_per_inch(beater_rpm: float, arms_per_revolution: int,
                   feed_roller_dia_inches: float, feed_roller_rpm: float) -> float:
    """
    Beats/inch = (beater_rpm × arms) / (π × D_feed × N_feed)
    beater_rpm: main beater speed (RPM)
    arms_per_revolution: number of beater blades/arms (typically 2 or 3)
    feed_roller_dia_inches: feed roller diameter in inches
    feed_roller_rpm: feed roller speed (RPM)
    """
    if feed_roller_dia_inches <= 0 or feed_roller_rpm <= 0:
        raise ValueError("Feed roller dimensions must be > 0")
    surface_speed = math.pi * feed_roller_dia_inches * feed_roller_rpm
    return (beater_rpm * arms_per_revolution) / surface_speed


# ─────────────────────────────────────────────────────────────────────────────
# PRODUCTION RATE CALCULATORS (per machine type)
# ─────────────────────────────────────────────────────────────────────────────

def production_scutcher(
    delivery_roller_dia_inches: float,
    delivery_roller_rpm: float,
    lap_weight_oz_per_yard: float,
    efficiency_pct: float = 85.0,
) -> float:
    """
    Scutcher / Blow Room lap production (oz/hr).
    P = π × D × N / 36 × 60 × lap_weight_oz_yd × η
    D: delivery roller diameter (inches)
    N: delivery roller RPM
    """
    surface_speed_yd_hr = (math.pi * delivery_roller_dia_inches * delivery_roller_rpm * 60) / 36.0
    return surface_speed_yd_hr * lap_weight_oz_per_yard * (efficiency_pct / 100.0)


def production_scutcher_kg_hr(
    delivery_roller_dia_inches: float,
    delivery_roller_rpm: float,
    lap_weight_oz_per_yard: float,
    efficiency_pct: float = 85.0,
) -> float:
    """Scutcher production in kg/hr (1 oz = 0.028349 kg)."""
    oz = production_scutcher(delivery_roller_dia_inches, delivery_roller_rpm,
                             lap_weight_oz_per_yard, efficiency_pct)
    return oz * 0.028349


def production_card(
    delivery_roller_dia_inches: float,
    delivery_roller_rpm: float,
    sliver_grains_per_yard: float,
    efficiency_pct: float = 85.0,
    tension_draft: float = 1.0,
) -> float:
    """
    Card production (lb/hr).
    P = π × D × N / 36 × 60 × sliver_gr_yd / 7000 × tension_draft × η
    sliver_grains_per_yard: sliver hank in grains/yard (1 lb = 7000 grains)
    tension_draft: usually 1.0–1.02
    """
    surface_speed_yd_hr = (math.pi * delivery_roller_dia_inches * delivery_roller_rpm * 60) / 36.0
    return surface_speed_yd_hr * (sliver_grains_per_yard / 7000.0) * tension_draft * (efficiency_pct / 100.0)


def production_card_kg_hr(
    delivery_roller_dia_inches: float,
    delivery_roller_rpm: float,
    sliver_grains_per_yard: float,
    efficiency_pct: float = 85.0,
    tension_draft: float = 1.0,
) -> float:
    """Card production in kg/hr."""
    return production_card(
        delivery_roller_dia_inches, delivery_roller_rpm,
        sliver_grains_per_yard, efficiency_pct, tension_draft
    ) * 0.453592


def production_draw_frame(
    delivery_roller_dia_inches: float,
    delivery_roller_rpm: float,
    delivered_sliver_grains_per_yard: float,
    efficiency_pct: float = 85.0,
    heads: int = 2,
    machines: int = 1,
) -> float:
    """
    Draw Frame production (lb/hr).
    P = π × D × N / 36 × 60 × del_sliver_gr_yd / 7000 × η × heads × machines
    heads: deliveries per machine (typically 2)
    """
    surface_speed_yd_hr = (math.pi * delivery_roller_dia_inches * delivery_roller_rpm * 60) / 36.0
    return (surface_speed_yd_hr * (delivered_sliver_grains_per_yard / 7000.0)
            * (efficiency_pct / 100.0) * heads * machines)


def production_draw_frame_kg_hr(
    delivery_roller_dia_inches: float,
    delivery_roller_rpm: float,
    delivered_sliver_grains_per_yard: float,
    efficiency_pct: float = 85.0,
    heads: int = 2,
    machines: int = 1,
) -> float:
    """Draw Frame production in kg/hr."""
    return production_draw_frame(
        delivery_roller_dia_inches, delivery_roller_rpm,
        delivered_sliver_grains_per_yard, efficiency_pct, heads, machines
    ) * 0.453592


def production_lap_former(
    delivery_roller_dia_inches: float,
    delivery_roller_rpm: float,
    lap_grains_per_yard: float,
    efficiency_pct: float = 85.0,
    machines: int = 1,
) -> float:
    """
    Lap Former / Sliver Lap / Ribbon Lap production (lb/hr).
    P = π × D × N / 36 × 60 × lap_gr_yd / 7000 × η × machines
    """
    surface_speed_yd_hr = (math.pi * delivery_roller_dia_inches * delivery_roller_rpm * 60) / 36.0
    return (surface_speed_yd_hr * (lap_grains_per_yard / 7000.0)
            * (efficiency_pct / 100.0) * machines)


def production_comber(
    delivery_roller_dia_inches: float,
    delivery_roller_rpm: float,
    sliver_grains_per_yard: float,
    nips_per_min: float,
    efficiency_pct: float = 85.0,
    heads: int = 8,
    machines: int = 1,
    noil_waste_pct: float = 15.0,
    feed_per_nip_mm: float = 5.0,
) -> float:
    """
    Comber production (lb/hr).
    P = f × π × D × N / 36 × 60 × sliver_gr_yd / 7000 × η × nips × heads × machines × (1 - waste%)
    f: feed per nip (mm → fraction, typically 4.7–5.7 mm)
    nips_per_min: nip rate (nips/min)
    """
    feed_fraction = feed_per_nip_mm / 25.4  # mm to inches
    surface_speed_yd_hr = (math.pi * delivery_roller_dia_inches * delivery_roller_rpm * 60) / 36.0
    return (feed_fraction * surface_speed_yd_hr * (sliver_grains_per_yard / 7000.0)
            * (efficiency_pct / 100.0) * heads * machines * (1 - noil_waste_pct / 100.0))


def production_simplex(
    flyer_dia_inches: float,
    flyer_rpm: float,
    roving_grains_per_yard: float,
    efficiency_pct: float = 85.0,
    spindles: int = 120,
) -> float:
    """
    Simplex / Speed Frame production (lb/hr).
    P = π × D × N / 36 × 60 × roving_gr_yd / 7000 × η × spindles
    D: flyer diameter (inches), N: flyer RPM
    """
    surface_speed_yd_hr = (math.pi * flyer_dia_inches * flyer_rpm * 60) / 36.0
    return (surface_speed_yd_hr * (roving_grains_per_yard / 7000.0)
            * (efficiency_pct / 100.0) * spindles)


def production_ring_frame_oz_per_shift_per_spindle(
    spindle_rpm: float,
    tpi: float,
    count_ne: float,
    efficiency_pct: float = 85.0,
    shift_hours: float = 8.0,
) -> float:
    """
    Ring Frame production (oz / shift / spindle).
    P = spindle_rpm × 60 / (TPI × 36) × 16 × shift_hours / (840 × count_ne) × η
    """
    if tpi <= 0 or count_ne <= 0:
        raise ValueError("TPI and count_ne must be > 0")
    return (
        (spindle_rpm * 60.0 / (tpi * 36.0))
        * 16.0 * shift_hours
        / (840.0 * count_ne)
        * (efficiency_pct / 100.0)
    )


def production_ring_frame_kg_per_shift_per_spindle(
    spindle_rpm: float,
    tpi: float,
    count_ne: float,
    efficiency_pct: float = 85.0,
    shift_hours: float = 8.0,
) -> float:
    """Ring Frame production in kg / shift / spindle."""
    oz = production_ring_frame_oz_per_shift_per_spindle(
        spindle_rpm, tpi, count_ne, efficiency_pct, shift_hours
    )
    return oz * 0.028349


def production_ring_frame_total_kg(
    spindle_rpm: float,
    tpi: float,
    count_ne: float,
    active_spindles: int,
    efficiency_pct: float = 85.0,
    shift_hours: float = 8.0,
) -> float:
    """Total ring frame production (kg/shift) for all active spindles."""
    return production_ring_frame_kg_per_shift_per_spindle(
        spindle_rpm, tpi, count_ne, efficiency_pct, shift_hours
    ) * active_spindles


# ─────────────────────────────────────────────────────────────────────────────
# CSP (Count Strength Product)
# ─────────────────────────────────────────────────────────────────────────────

def csp(lea_strength_lb: float, count_ne: float) -> float:
    """CSP = lea strength (lb) × count (Ne)."""
    return lea_strength_lb * count_ne


def tenacity_cN_per_tex(breaking_force_gf: float, tex: float) -> float:
    """Tenacity (cN/tex) = breaking_force_gf × 0.981 / tex."""
    if tex <= 0:
        raise ValueError("tex must be > 0")
    return (breaking_force_gf * 0.981) / tex


# ─────────────────────────────────────────────────────────────────────────────
# HANK (wrapping / sliver measurement)
# ─────────────────────────────────────────────────────────────────────────────

def actual_hank_ne(weight_grams: float, length_yards: float = 120.0) -> float:
    """
    Actual sliver/roving hank (Ne) from wrap-reel test.
    Standard wrap: 120 yards.
    Ne = (length_yards / 840) / (weight_grams / 453.592)
       = (length_yards × 453.592) / (840 × weight_grams)
    """
    if weight_grams <= 0:
        raise ValueError("weight_grams must be > 0")
    return (length_yards * 453.592) / (840.0 * weight_grams)


def cv_percent(readings: list[float]) -> Optional[float]:
    """CV% = (std_dev / mean) × 100.  Returns None if < 2 readings."""
    n = len(readings)
    if n < 2:
        return None
    mean = sum(readings) / n
    if mean == 0:
        return None
    variance = sum((x - mean) ** 2 for x in readings) / (n - 1)
    return (math.sqrt(variance) / mean) * 100.0


def u_percent_approx(cv_percent_val: float) -> float:
    """
    Approximate Uster U% from CV%.
    U% ≈ CV% / √2  (valid for random normal mass variation).
    """
    return cv_percent_val / math.sqrt(2)


# ─────────────────────────────────────────────────────────────────────────────
# AUTOCONER / WINDING
# ─────────────────────────────────────────────────────────────────────────────

def winding_speed_mpm(drum_dia_mm: float, drum_rpm: float) -> float:
    """Winding speed (m/min) = π × D(m) × N."""
    return math.pi * (drum_dia_mm / 1000.0) * drum_rpm


def splice_efficiency_pct(splice_strength: float, yarn_strength: float) -> float:
    """Splice efficiency (%) = splice_strength / yarn_strength × 100."""
    if yarn_strength <= 0:
        raise ValueError("yarn_strength must be > 0")
    return (splice_strength / yarn_strength) * 100.0


# ─────────────────────────────────────────────────────────────────────────────
# MACHINE EFFICIENCY
# ─────────────────────────────────────────────────────────────────────────────

def machine_efficiency(actual_output: float, theoretical_output: float) -> float:
    """Efficiency % = actual / theoretical × 100."""
    if theoretical_output <= 0:
        raise ValueError("theoretical_output must be > 0")
    return (actual_output / theoretical_output) * 100.0


def spindle_utilization(active_spindles: int, total_spindles: int) -> float:
    """Spindle utilisation % = active / total × 100."""
    if total_spindles <= 0:
        raise ValueError("total_spindles must be > 0")
    return (active_spindles / total_spindles) * 100.0


# ─────────────────────────────────────────────────────────────────────────────
# CONVENIENCE: calculate all for a given machine type
# ─────────────────────────────────────────────────────────────────────────────

def calculate_ring_frame(params: dict) -> dict:
    """
    Given dict of ring frame params, return all computed values.
    Required keys: spindle_rpm, tpi (or twist_multiplier+count_ne), count_ne,
                   active_spindles, efficiency_pct (optional), shift_hours (optional).
    """
    result: dict = {}
    count_ne = float(params.get("count_ne", 0) or 0)
    spindle_rpm = float(params.get("spindle_rpm", 0) or 0)
    tpi = float(params.get("tpi", 0) or 0)
    tm = float(params.get("twist_multiplier", 0) or 0)
    efficiency = float(params.get("efficiency_pct", 85) or 85)
    shift_hours = float(params.get("shift_hours", 8) or 8)
    active_spindles = int(params.get("active_spindles", 0) or 0)

    if count_ne > 0:
        result["tex"] = round(ne_to_tex(count_ne), 4)
        result["nm"] = round(ne_to_nm(count_ne), 4)
        result["denier"] = round(ne_to_denier(count_ne), 4)

    if tm > 0 and count_ne > 0:
        result["tpi_from_tm"] = round(tpi_from_tm(tm, count_ne), 2)
        if not tpi:
            tpi = result["tpi_from_tm"]
    elif tpi > 0 and count_ne > 0:
        result["twist_multiplier"] = round(twist_multiplier_from_tpi(tpi, count_ne), 3)

    if tpi > 0 and count_ne > 0 and spindle_rpm > 0:
        result["production_kg_per_shift_per_spindle"] = round(
            production_ring_frame_kg_per_shift_per_spindle(
                spindle_rpm, tpi, count_ne, efficiency, shift_hours
            ), 5
        )
        if active_spindles > 0:
            result["total_production_kg"] = round(
                production_ring_frame_total_kg(
                    spindle_rpm, tpi, count_ne, active_spindles, efficiency, shift_hours
                ), 3
            )

    return result


def calculate_simplex(params: dict) -> dict:
    """Compute simplex derived values: TPI, production."""
    result: dict = {}
    count_ne = float(params.get("count_ne", 0) or 0)
    flyer_rpm = float(params.get("flyer_rpm", 0) or 0)
    front_roller_dia = float(params.get("front_roller_dia_inches", 0) or 0)
    front_roller_rpm = float(params.get("front_roller_rpm", 0) or 0)
    tm = float(params.get("twist_multiplier", 0) or 0)
    spindles = int(params.get("spindles", 0) or 0)
    roving_grains_yd = float(params.get("roving_grains_per_yard", 0) or 0)
    efficiency = float(params.get("efficiency_pct", 85) or 85)
    flyer_dia = float(params.get("flyer_dia_inches", 0) or 0)

    if count_ne > 0:
        result["tex"] = round(ne_to_tex(count_ne), 4)

    if front_roller_dia > 0 and front_roller_rpm > 0:
        ss = front_roller_surface_speed(front_roller_dia, front_roller_rpm)
        result["front_roller_surface_speed_in_min"] = round(ss, 2)
        if flyer_rpm > 0:
            result["tpi"] = round(tpi_from_speed(flyer_rpm, ss), 3)
            if count_ne > 0:
                result["twist_multiplier"] = round(
                    twist_multiplier_from_tpi(result["tpi"], count_ne), 3
                )

    if tm > 0 and count_ne > 0:
        result["tpi_from_tm"] = round(tpi_from_tm(tm, count_ne), 3)

    if flyer_dia > 0 and flyer_rpm > 0 and roving_grains_yd > 0 and spindles > 0:
        result["production_lb_hr"] = round(
            production_simplex(flyer_dia, flyer_rpm, roving_grains_yd, efficiency, spindles), 3
        )
        result["production_kg_hr"] = round(result["production_lb_hr"] * 0.453592, 3)

    return result


def calculate_draw_frame(params: dict) -> dict:
    """Compute draw frame draft and production."""
    result: dict = {}
    count_fed_ne = float(params.get("count_fed_ne", 0) or 0)
    count_delivered_ne = float(params.get("count_delivered_ne", 0) or 0)
    doubling = int(params.get("doubling", 6) or 6)
    efficiency = float(params.get("efficiency_pct", 85) or 85)
    heads = int(params.get("heads", 2) or 2)
    machines = int(params.get("machines", 1) or 1)
    delivery_roller_dia = float(params.get("delivery_roller_dia_inches", 0) or 0)
    delivery_roller_rpm = float(params.get("delivery_roller_rpm", 0) or 0)
    delivered_sliver_grains_yd = float(params.get("delivered_sliver_grains_per_yard", 0) or 0)

    if count_fed_ne > 0 and count_delivered_ne > 0:
        result["actual_draft"] = round(
            actual_draft_indirect(count_delivered_ne, count_fed_ne, doubling), 3
        )

    if delivery_roller_dia > 0 and delivery_roller_rpm > 0 and delivered_sliver_grains_yd > 0:
        result["production_lb_hr"] = round(
            production_draw_frame(
                delivery_roller_dia, delivery_roller_rpm,
                delivered_sliver_grains_yd, efficiency, heads, machines
            ), 3
        )
        result["production_kg_hr"] = round(result["production_lb_hr"] * 0.453592, 3)

    return result


def calculate_blow_room(params: dict) -> dict:
    """Compute blow room cleaning efficiency, beats/inch, production."""
    result: dict = {}
    trash_fed = float(params.get("trash_fed_pct", 0) or 0)
    trash_del = float(params.get("trash_delivered_pct", 0) or 0)
    beater_rpm = float(params.get("beater_rpm", 0) or 0)
    arms = int(params.get("beater_arms", 2) or 2)
    feed_dia = float(params.get("feed_roller_dia_inches", 0) or 0)
    feed_rpm = float(params.get("feed_roller_rpm", 0) or 0)
    del_dia = float(params.get("delivery_roller_dia_inches", 0) or 0)
    del_rpm = float(params.get("delivery_roller_rpm", 0) or 0)
    lap_wt_oz_yd = float(params.get("lap_weight_oz_per_yard", 0) or 0)
    efficiency = float(params.get("efficiency_pct", 85) or 85)

    if trash_fed > 0:
        result["cleaning_efficiency_pct"] = round(
            cleaning_efficiency(trash_fed, trash_del), 2
        )

    if beater_rpm > 0 and feed_dia > 0 and feed_rpm > 0:
        result["beats_per_inch"] = round(
            beats_per_inch(beater_rpm, arms, feed_dia, feed_rpm), 2
        )

    if del_dia > 0 and del_rpm > 0 and lap_wt_oz_yd > 0:
        result["production_oz_hr"] = round(
            production_scutcher(del_dia, del_rpm, lap_wt_oz_yd, efficiency), 2
        )
        result["production_kg_hr"] = round(result["production_oz_hr"] * 0.028349, 3)

    return result


def calculate_carding(params: dict) -> dict:
    """Compute carding draft, cleaning efficiency, production."""
    result: dict = {}
    trash_fed = float(params.get("trash_fed_pct", 0) or 0)
    trash_del = float(params.get("trash_delivered_pct", 0) or 0)
    delivery_dia = float(params.get("delivery_roller_dia_inches", 0) or 0)
    delivery_rpm = float(params.get("delivery_roller_rpm", 0) or 0)
    sliver_grains = float(params.get("sliver_grains_per_yard", 0) or 0)
    efficiency = float(params.get("efficiency_pct", 85) or 85)
    tension_draft = float(params.get("tension_draft", 1.0) or 1.0)
    count_fed = float(params.get("count_fed_ne", 0) or 0)
    count_del = float(params.get("count_delivered_ne", 0) or 0)

    if trash_fed > 0:
        result["cleaning_efficiency_pct"] = round(
            cleaning_efficiency(trash_fed, trash_del), 2
        )

    if count_fed > 0 and count_del > 0:
        result["actual_draft"] = round(actual_draft_indirect(count_del, count_fed), 3)

    if delivery_dia > 0 and delivery_rpm > 0 and sliver_grains > 0:
        result["production_lb_hr"] = round(
            production_card(delivery_dia, delivery_rpm, sliver_grains, efficiency, tension_draft), 3
        )
        result["production_kg_hr"] = round(result["production_lb_hr"] * 0.453592, 3)

    return result
