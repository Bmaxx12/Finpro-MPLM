"""
Economic indicators: POT, NPV, ROR (IRR), DPR, PIR.
Semua formula sesuai modul FM dosen Bab IV.
"""
import math


def pay_out_time(ncf_list: list[float]) -> float:
    """
    POT = waktu saat kumulatif NCF berubah dari (-) ke (+).

    Contoh dari modul (Soal 1):
      Tahun 0 s/d 2 → kumulatif = -2881.8   (masih negatif)
      Tahun 0 s/d 3 → kumulatif = +4412      (positif)
      POT = 2 + 2881.8/7293.8 ≈ 2.6 tahun = 2 tahun 7 bulan

    Cara hitung: saat kumulatif baru positif di tahun ke-i,
      fraksi = |kumulatif_sebelumnya| / NCF_tahun_i
      POT = (i - 1) + fraksi   [dalam indeks tahun sebenarnya]
    """
    cumulative = 0.0
    prev = 0.0
    for i, ncf in enumerate(ncf_list):
        prev = cumulative
        cumulative += ncf
        if prev < 0 and cumulative >= 0 and ncf != 0:
            # fraksi = berapa bulan dari tahun ini yang dibutuhkan
            fraction = abs(prev) / ncf
            # i adalah indeks (0-based), tahun produksi dimulai i=1
            # POT dalam satuan "tahun project" = (i-1) + fraction
            # tapi karena tahun 0 adalah investasi, POT = (i-1) + fraction
            return (i - 1) + fraction
        elif cumulative >= 0 and i == 0:
            return 0.0
    return float("nan")  # tidak pernah balik modal


def net_present_value(ncf_list: list[float], discount_rate: float) -> float:
    """NPV = Σ NCF_t / (1+r)^t  (t dari 0 sampai N)"""
    return sum(ncf / ((1 + discount_rate) ** t) for t, ncf in enumerate(ncf_list))


def rate_of_return(ncf_list: list[float], tol: float = 1e-6, max_iter: int = 2000) -> float:
    """
    Cari r sehingga NPV = 0, menggunakan metode bisection.
    Kembalikan ROR sebagai desimal (mis. 0.4693 = 46.93%).
    Kembalikan NaN jika tidak dapat diselesaikan.
    """
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
    """DPR = NPV / Total Investasi"""

    if investment == 0:
        return float("nan")

    return npv / investment

def profit_investment_ratio(ncf_list: list[float], investment: float) -> float:
    """PIR = Σ NCF_undiscounted / Investasi"""
    if investment == 0:
        return float("nan")
    total = sum(ncf_list)
    return total / investment


def discounted_ncf(ncf_list: list[float], discount_rate: float) -> list[float]:
    """Kembalikan list NCF discounted per tahun."""
    return [ncf / ((1 + discount_rate) ** t) for t, ncf in enumerate(ncf_list)]

def compute_all_indicators(
    ncf_list: list[float],
    investment: float,
    discount_rate: float,
) -> dict:
    """Hitung POT, NPV, ROR, DPR, PIR sekaligus."""

    pot = pay_out_time(ncf_list)
    npv = net_present_value(ncf_list, discount_rate)
    ror = rate_of_return(ncf_list)
    dpr = discounted_pir(npv, investment)
    pir = profit_investment_ratio(ncf_list, investment)

    # Format POT ke "X tahun Y bulan"
    if not math.isnan(pot):

        pot_years = int(pot)

        pot_months = round((pot - pot_years) * 12)

        if pot_months == 12:
            pot_years += 1
            pot_months = 0

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