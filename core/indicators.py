"""
Economic indicators: POT, NPV, ROR (IRR), DPR, PIR.
"""
import math


def pay_out_time(ncf_list: list[float]) -> float:
    """
    POT in decimal years.
    Finds when cumulative NCF crosses from negative to positive.
    """
    cumulative = 0.0
    for i, ncf in enumerate(ncf_list):
        prev = cumulative
        cumulative += ncf
        if prev < 0 and cumulative >= 0:
            fraction = -prev / ncf if ncf != 0 else 0
            return (i - 1) + fraction  # 0-indexed; year i covers period i
        elif cumulative >= 0 and i == 0:
            return 0.0
    return float("nan")  # never paid out


def net_present_value(ncf_list: list[float], discount_rate: float) -> float:
    """NPV = Σ NCF_t / (1+r)^t"""
    return sum(ncf / ((1 + discount_rate) ** t) for t, ncf in enumerate(ncf_list))


def rate_of_return(ncf_list: list[float], tol: float = 1e-6, max_iter: int = 2000) -> float:
    """
    Find r such that NPV = 0, using bisection method.
    Returns ROR as decimal (e.g. 0.4693).
    Returns NaN if not solvable.
    """
    # Check if solution exists: need sign change
    npv_low = net_present_value(ncf_list, 0.0)
    npv_high = net_present_value(ncf_list, 9.99)  # 999%

    if npv_low * npv_high > 0:
        return float("nan")

    lo, hi = 0.0, 9.99
    for _ in range(max_iter):
        mid = (lo + hi) / 2
        npv_mid = net_present_value(ncf_list, mid)
        if abs(npv_mid) < tol or (hi - lo) / 2 < tol:
            return mid
        if npv_mid * npv_low < 0:
            hi = mid
        else:
            lo = mid
            npv_low = npv_mid
    return (lo + hi) / 2


def discounted_pir(npv: float, investment: float) -> float:
    """DPR = NPV / Total Investment"""
    if investment == 0:
        return float("nan")
    return npv / investment


def profit_investment_ratio(ncf_list: list[float], investment: float) -> float:
    """PIR = Σ NCF_undiscounted / Investment"""
    if investment == 0:
        return float("nan")
    total = sum(ncf_list)
    return total / investment


def discounted_ncf(ncf_list: list[float], discount_rate: float) -> list[float]:
    """Return list of discounted NCF per year."""
    return [ncf / ((1 + discount_rate) ** t) for t, ncf in enumerate(ncf_list)]


def compute_all_indicators(
    ncf_list: list[float],
    investment: float,
    discount_rate: float,
) -> dict:
    """Compute POT, NPV, ROR, DPR, PIR in one call."""
    pot = pay_out_time(ncf_list)
    npv = net_present_value(ncf_list, discount_rate)
    ror = rate_of_return(ncf_list)
    dpr = discounted_pir(npv, investment)
    pir = profit_investment_ratio(ncf_list, investment)

    # Format POT nicely
    if not math.isnan(pot):
        pot_years = int(pot)
        pot_months = round((pot - pot_years) * 12)
        pot_str = f"{pot_years} tahun {pot_months} bulan"
    else:
        pot_str = "Tidak tercapai"

    return {
        "POT": pot,
        "POT_str": pot_str,
        "NPV": npv,
        "ROR": ror,
        "DPR": dpr,
        "PIR": pir,
        "feasible": npv > 0,
    }