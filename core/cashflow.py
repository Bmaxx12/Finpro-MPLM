"""
Cash flow calculation module.
Computes NCF per year, taxable income, and tax.
"""
from typing import Optional


def compute_cashflow(
    years: list[int],
    production: list[float],
    oil_price: list[float],
    capital: list[float],
    non_capital: list[float],
    opex: list[float],
    depreciation: list[float],
    tax_rate: float,
    use_lcf: bool = False,
) -> list[dict]:
    """
    Returns a list of dicts, one per year, with all computed columns.

    Fields per year:
      tahun, produksi, harga_minyak, capital, non_capital, opex,
      income, depresiasi, taxable_income, tax, ncf_undiscounted,
      cumulative_ncf
    """
    results = []
    cumulative = 0.0
    lcf = 0.0  # Loss Carry Forward accumulator

    # pad depreciation to length of production period if needed
    prod_years = [(i, y) for i, y in enumerate(years) if (production[i] > 0 or (capital[i] == 0 and non_capital[i] == 0))]
    depr_idx = 0  # index into depreciation list (only advances during production years)

    # Build depreciation by year (aligned to years with investment or production)
    # We align depr per year by counting from first year where capital > 0
    # Actually, depr is pre-computed for N years starting from year 1
    # Map depreciation values to each year index (excluding year 0)
    depr_by_year = {}
    depr_counter = 0
    for i, yr in enumerate(years):
        if yr == 0:
            continue
        if depr_counter < len(depreciation):
            depr_by_year[i] = depreciation[depr_counter]
            depr_counter += 1
        else:
            depr_by_year[i] = 0.0

    for i, yr in enumerate(years):
        prod = production[i]
        price = oil_price[i]
        cap = capital[i]
        ncap = non_capital[i]
        op = opex[i]
        depr = depr_by_year.get(i, 0.0)

        income = prod * price
        taxable = income - op - depr

        if use_lcf:
            # lcf nyimpen akumulasi rugi dari tahun sebelumnya
            if taxable < 0:
                lcf += taxable
                tax_base = 0.0
            else:
                tax_base = taxable + lcf
                if tax_base > 0:
                    lcf = 0.0
                else:
                    lcf = tax_base
                    tax_base = 0.0
        else:
            tax_base = max(taxable, 0.0)

        tax = tax_rate * tax_base

        if yr == 0:
            ncf = -(cap + ncap)
        else:
            # Mengikuti logika Excel (dosen): NCF = Laba Bersih (Taxable - Tax)
            # Walaupun secara teknis ini tidak add-back depresiasi, kita ikuti permintaan user.
            ncf = (taxable - tax) - cap - ncap

        cumulative += ncf

        results.append({
            "tahun": yr,
            "produksi": prod,
            "harga_minyak": price,
            "capital": cap,
            "non_capital": ncap,
            "opex": op,
            "income": income if yr != 0 else 0.0,
            "depresiasi": depr if yr != 0 else 0.0,
            "taxable_income": taxable if yr != 0 else 0.0,
            "tax": tax if yr != 0 else 0.0,
            "ncf_undiscounted": ncf,
            "cumulative_ncf": cumulative,
        })

    return results