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

    results = []
    cumulative = 0.0
    lcf = 0.0

    # mapping depresiasi hanya ke tahun produksi (>0)
    depr_by_year = {}

    prod_indexes = [i for i, yr in enumerate(years) if yr > 0]

    for j, idx in enumerate(prod_indexes):
        depr_by_year[idx] = depreciation[j] if j < len(depreciation) else 0.0

    for i, yr in enumerate(years):

        prod = production[i]
        price = oil_price[i]
        cap = capital[i]
        ncap = non_capital[i]
        op = opex[i]

        depr = depr_by_year.get(i, 0.0)

        # Revenue
        income = prod * price

        # Taxable income
        taxable = income - op - depr

        # Loss Carry Forward
        if use_lcf:
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

        # Tax
        tax = tax_rate * tax_base

        if yr == 0:
            ncf = -(cap + ncap)
        else:
            ncf = income - op - tax - cap - ncap

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