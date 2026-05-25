"""
FM NCF Calculator — FastAPI Web Application
Perhitungan Net Cash Flow & Indikator Ekonomi Lapangan Migas
"""
import io
import csv
import json
import math
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from core.depreciation import compute_depreciation
from core.cashflow import compute_cashflow
from core.indicators import compute_all_indicators, discounted_ncf

BASE_DIR = Path(__file__).parent

app = FastAPI(title="FM NCF Calculator", version="1.0.0")


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class YearRow(BaseModel):
    tahun: int
    produksi_mbbl: float = 0.0
    harga_minyak_usd: float = 20.0
    capital_usd: float = 0.0
    non_capital_usd: float = 0.0
    opex_usd: float = 0.0


class CalcRequest(BaseModel):
    rows: List[YearRow]
    depr_method: str = "straight_line"
    tax_rate: float = 0.52
    discount_rate: float = 0.15
    use_lcf: bool = False
    reserve_mbbl: Optional[float] = None  # required for unit_of_production


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _safe(v):
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def run_calculation(req: CalcRequest) -> dict:
    rows = sorted(req.rows, key=lambda r: r.tahun)

    years       = [r.tahun for r in rows]
    production  = [r.produksi_mbbl for r in rows]
    oil_price   = [r.harga_minyak_usd for r in rows]
    capital_lst = [r.capital_usd for r in rows]
    ncap_lst    = [r.non_capital_usd for r in rows]
    opex_lst    = [r.opex_usd for r in rows]

    # Total capital for depreciation (sum of all capital investments)
    total_capital = sum(capital_lst)
    # Number of production years (non-zero production OR non-investment years)
    n_prod = sum(1 for i, r in enumerate(rows) if r.tahun > 0)

    # Depreciation
    if req.depr_method == "unit_of_production":
        reserve = req.reserve_mbbl or sum(production)
        prod_only = [p for p in production if p > 0]
        depr = compute_depreciation(
            req.depr_method, total_capital, n_prod,
            reserve=reserve, production=prod_only
        )
    else:
        depr = compute_depreciation(req.depr_method, total_capital, n_prod)

    # Cash flow
    cf_rows = compute_cashflow(
        years, production, oil_price, capital_lst, ncap_lst, opex_lst,
        depr, req.tax_rate, req.use_lcf
    )

    # NCF list for indicators
    ncf_list = [r["ncf_undiscounted"] for r in cf_rows]
    investment = sum(r.capital_usd + r.non_capital_usd for r in rows)

    # Discounted NCF
    disc = discounted_ncf(ncf_list, req.discount_rate)
    for i, row in enumerate(cf_rows):
        row["ncf_discounted"] = disc[i]
        row["discount_factor"] = 1 / ((1 + req.discount_rate) ** i)

    # Indicators
    indicators = compute_all_indicators(ncf_list, investment, req.discount_rate)

    # All depr values mapped back to each row
    depr_mapped = [0.0] + list(depr) + [0.0] * max(0, n_prod - len(depr))

    return {
        "cashflow": cf_rows,
        "indicators": {k: _safe(v) for k, v in indicators.items()},
        "depreciation_schedule": depr,
        "total_capital": total_capital,
        "investment": investment,
        "n_prod_years": n_prod,
        "params": {
            "depr_method": req.depr_method,
            "tax_rate": req.tax_rate,
            "discount_rate": req.discount_rate,
            "use_lcf": req.use_lcf,
        }
    }


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    with open(BASE_DIR / "static" / "index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.post("/api/calculate")
async def calculate(req: CalcRequest):
    try:
        result = run_calculation(req)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    """Parse uploaded CSV and return structured rows."""
    try:
        content = await file.read()
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        rows = []
        for row in reader:
            def g(k, default=0.0):
                v = row.get(k, "").strip().replace(",", ".")
                try:
                    return float(v) if v else default
                except ValueError:
                    return default
            rows.append({
                "tahun": int(g("tahun", 0)),
                "produksi_mbbl": g("produksi_mbbl"),
                "harga_minyak_usd": g("harga_minyak_usd", 20.0),
                "capital_usd": g("capital_usd"),
                "non_capital_usd": g("non_capital_usd"),
                "opex_usd": g("opex_usd"),
            })
        return JSONResponse(content={"rows": rows, "count": len(rows)})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membaca CSV: {e}")


@app.post("/api/export-csv")
async def export_csv(req: CalcRequest):
    """Calculate and return results as CSV download."""
    result = run_calculation(req)
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "Tahun", "Produksi (MBbl)", "Harga Minyak ($/bbl)",
        "Capital ($)", "Non-Capital ($)", "Opex ($)",
        "Income ($)", "Depresiasi ($)", "Taxable Income ($)",
        "Tax ($)", "NCF Undiscounted ($)", "Discount Factor",
        "NCF Discounted ($)", "Cumulative NCF ($)"
    ])

    for row in result["cashflow"]:
        writer.writerow([
            row["tahun"], row["produksi"], row["harga_minyak"],
            row["capital"], row["non_capital"], row["opex"],
            round(row["income"], 2), round(row["depresiasi"], 2),
            round(row["taxable_income"], 2), round(row["tax"], 2),
            round(row["ncf_undiscounted"], 2),
            round(row.get("discount_factor", 1.0), 5),
            round(row.get("ncf_discounted", 0), 2),
            round(row["cumulative_ncf"], 2)
        ])

    # Indicators
    writer.writerow([])
    writer.writerow(["INDIKATOR EKONOMI"])
    ind = result["indicators"]
    writer.writerow(["POT", ind.get("POT_str", "-")])
    writer.writerow(["NPV", f"{ind.get('NPV', 0):.2f}"])
    writer.writerow(["ROR", f"{(ind.get('ROR') or 0)*100:.3f}%"])
    writer.writerow(["DPR", f"{ind.get('DPR', 0):.4f}"])
    writer.writerow(["PIR", f"{ind.get('PIR', 0):.4f}"])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=fm_ncf_result.csv"}
    )


@app.get("/api/template-csv")
async def get_template():
    """Return example CSV template (Soal 1 from FM module)."""
    template = """tahun,produksi_mbbl,harga_minyak_usd,capital_usd,non_capital_usd,opex_usd
0,0,20,6500,3000,0
1,215,20,0,0,175
2,425,20,0,0,175
3,740,20,0,0,175
4,825,20,0,0,175
5,710,20,0,0,175
6,525,20,0,0,175
7,350,20,0,0,175
8,150,20,0,0,175
9,130,20,0,0,175
10,110,20,0,0,175
"""
    return StreamingResponse(
        iter([template]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=template_fm.csv"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)