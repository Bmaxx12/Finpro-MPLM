"""
FM NCF Calculator — FastAPI Web Application
Perhitungan Net Cash Flow & Indikator Ekonomi Lapangan Migas
"""
import io
import csv
import json
import math
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from core.depreciation import compute_depreciation
from core.cashflow import compute_cashflow
from core.indicators import compute_all_indicators, discounted_ncf

BASE_DIR = Path(__file__).parent
PROJECTS_FILE = BASE_DIR / "data" / "projects.json"

app = FastAPI(title="FM NCF Calculator", version="2.0.0")

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
    depr_base: str = "capital_only"
    depr_life: int = 10
    tax_rate: float = 0.52
    discount_rate: float = 0.10
    use_lcf: bool = False
    reserve_mbbl: Optional[float] = None

class ProjectCreate(BaseModel):
    name: str
    description: str = ""

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    rows: Optional[List[dict]] = None
    params: Optional[dict] = None

def _ensure_data_dir():
    PROJECTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not PROJECTS_FILE.exists():
        PROJECTS_FILE.write_text("[]", encoding="utf-8")

def _load_projects() -> list:
    _ensure_data_dir()
    return json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))

def _save_projects(projects: list):
    _ensure_data_dir()
    PROJECTS_FILE.write_text(json.dumps(projects, ensure_ascii=False, indent=2), encoding="utf-8")

def _find_project(project_id: str) -> tuple:
    projects = _load_projects()
    for i, p in enumerate(projects):
        if p["id"] == project_id:
            return projects, i
    raise HTTPException(status_code=404, detail="Project tidak ditemukan")

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

    total_capital = sum(capital_lst) if req.depr_base == "capital_only" else sum(capital_lst) + sum(ncap_lst)
    n_prod = sum(1 for i, r in enumerate(rows) if r.tahun > 0)

    if req.depr_method == "unit_of_production":
        reserve = req.reserve_mbbl or sum(production)
        prod_only = [p for p in production if p > 0]
        depr = compute_depreciation(
            req.depr_method, total_capital, req.depr_life,
            reserve=reserve, production=prod_only
        )
    else:
        depr = compute_depreciation(req.depr_method, total_capital, req.depr_life)

    cf_rows = compute_cashflow(
        years, production, oil_price, capital_lst, ncap_lst, opex_lst,
        depr, req.tax_rate, req.use_lcf
    )

    ncf_list = [r["ncf_undiscounted"] for r in cf_rows]
    investment = sum(r.capital_usd + r.non_capital_usd for r in rows)

    disc = discounted_ncf(ncf_list, req.discount_rate)
    for i, row in enumerate(cf_rows):
        row["ncf_discounted"] = disc[i]
        row["discount_factor"] = 1 / ((1 + req.discount_rate) ** i)

    indicators = compute_all_indicators(ncf_list, investment, req.discount_rate)

    return {
        "cashflow": cf_rows,
        "indicators": {k: _safe(v) for k, v in indicators.items()},
        "depreciation_schedule": depr,
        "total_capital": total_capital,
        "investment": investment,
        "n_prod_years": n_prod,
        "params": {
            "depr_method": req.depr_method,
            "depr_base": req.depr_base,
            "depr_life": req.depr_life,
            "tax_rate": req.tax_rate,
            "discount_rate": req.discount_rate,
            "use_lcf": req.use_lcf,
        }
    }

@app.get("/", response_class=HTMLResponse)
async def index():
    with open(BASE_DIR / "static" / "index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/api/projects")
async def list_projects():
    projects = _load_projects()
    return JSONResponse(content=[{
        "id": p["id"],
        "name": p["name"],
        "description": p.get("description", ""),
        "created_at": p["created_at"],
        "updated_at": p.get("updated_at", p["created_at"]),
        "has_results": p.get("last_result") is not None,
        "row_count": len(p.get("rows", [])),
    } for p in projects])

@app.get("/api/history")
async def get_history():
    projects = _load_projects()
    all_history = []
    for p in projects:
        if "history" in p:
            for h in p["history"]:
                # Sertakan info project
                item = {
                    "project_id": p["id"],
                    "project_name": p["name"],
                    "history_id": h["id"],
                    "timestamp": h["timestamp"],
                    "params": h["params"],
                    "npv": h["result"]["indicators"].get("NPV"),
                    "ror": h["result"]["indicators"].get("ROR"),
                    "feasible": h["result"]["indicators"].get("feasible", False)
                }
                all_history.append(item)
                
    # Sort descending by timestamp
    all_history.sort(key=lambda x: x["timestamp"], reverse=True)
    return JSONResponse(content=all_history)

@app.post("/api/projects")
async def create_project(req: ProjectCreate):
    projects = _load_projects()
    now = datetime.now().isoformat()
    project = {
        "id": str(uuid.uuid4())[:8],
        "name": req.name,
        "description": req.description,
        "created_at": now,
        "updated_at": now,
        "rows": [],
        "params": {
            "depr_method": "straight_line",
            "depr_base": "capital_only",
            "depr_life": 10,
            "tax_rate": 0.52,
            "discount_rate": 0.10,
            "use_lcf": False,
            "reserve_mbbl": 4180,
        },
        "last_result": None,
    }
    projects.append(project)
    _save_projects(projects)
    return JSONResponse(content={"id": project["id"], "message": "Project berhasil dibuat"})

@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    projects, idx = _find_project(project_id)
    return JSONResponse(content=projects[idx])

@app.put("/api/projects/{project_id}")
async def update_project(project_id: str, req: ProjectUpdate):
    projects, idx = _find_project(project_id)
    p = projects[idx]
    if req.name is not None:
        p["name"] = req.name
    if req.description is not None:
        p["description"] = req.description
    if req.rows is not None:
        p["rows"] = req.rows
    if req.params is not None:
        p["params"].update(req.params)
    p["updated_at"] = datetime.now().isoformat()
    _save_projects(projects)
    return JSONResponse(content={"message": "Project berhasil diupdate"})

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    projects, idx = _find_project(project_id)
    projects.pop(idx)
    _save_projects(projects)
    return JSONResponse(content={"message": "Project berhasil dihapus"})

@app.post("/api/projects/{project_id}/calculate")
async def calculate_project(project_id: str):
    projects, idx = _find_project(project_id)
    p = projects[idx]
    if not p.get("rows") or len(p["rows"]) < 2:
        raise HTTPException(status_code=400, detail="Minimal butuh 2 baris data")

    year_rows = [YearRow(**r) for r in p["rows"]]
    params = p.get("params", {})
    calc_req = CalcRequest(
        rows=year_rows,
        depr_method=params.get("depr_method", "straight_line"),
        depr_base=params.get("depr_base", "capital_only"),
        depr_life=params.get("depr_life", 10),
        tax_rate=params.get("tax_rate", 0.52),
        discount_rate=params.get("discount_rate", 0.10),
        use_lcf=params.get("use_lcf", False),
        reserve_mbbl=params.get("reserve_mbbl"),
    )
    try:
        result = run_calculation(calc_req)
        p["last_result"] = result
        
        # Simpan ke history
        if "history" not in p:
            p["history"] = []
            
        history_id = str(uuid.uuid4())[:8]
        history_item = {
            "id": history_id,
            "timestamp": datetime.now().isoformat(),
            "params": result["params"],
            "result": result
        }
        p["history"].insert(0, history_item)
        if len(p["history"]) > 30: # Limit history
            p["history"] = p["history"][:30]
            
        p["updated_at"] = datetime.now().isoformat()
        _save_projects(projects)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/projects/{project_id}/export-csv")
async def export_project_csv(project_id: str):
    projects, idx = _find_project(project_id)
    p = projects[idx]

    if not p.get("rows") or len(p["rows"]) < 2:
        raise HTTPException(status_code=400, detail="Tidak ada data untuk diexport")

    year_rows = [YearRow(**r) for r in p["rows"]]
    params = p.get("params", {})
    calc_req = CalcRequest(
        rows=year_rows,
        depr_method=params.get("depr_method", "straight_line"),
        depr_base=params.get("depr_base", "capital_only"),
        depr_life=params.get("depr_life", 10),
        tax_rate=params.get("tax_rate", 0.52),
        discount_rate=params.get("discount_rate", 0.10),
        use_lcf=params.get("use_lcf", False),
        reserve_mbbl=params.get("reserve_mbbl"),
    )
    result = run_calculation(calc_req)

    output = io.StringIO()
    writer = csv.writer(output)
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
    writer.writerow([])
    writer.writerow(["INDIKATOR EKONOMI"])
    ind = result["indicators"]
    writer.writerow(["POT", ind.get("POT_str", "-")])
    writer.writerow(["NPV", f"{ind.get('NPV', 0):.2f}"])
    writer.writerow(["ROR", f"{(ind.get('ROR') or 0)*100:.3f}%"])
    writer.writerow(["DPR", f"{ind.get('DPR', 0):.4f}"])
    writer.writerow(["PIR", f"{ind.get('PIR', 0):.4f}"])

    safe_name = p["name"].replace(" ", "_").lower()
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={safe_name}_ncf.csv"}
    )

@app.post("/api/calculate")
async def calculate(req: CalcRequest):
    try:
        result = run_calculation(req)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
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

@app.get("/api/example-data")
async def get_example_data():
    try:
        # Load the CSV file from data directory
        file_path = BASE_DIR / "data" / "template_excel_dosen (3).csv"
        if not file_path.exists():
            # Fallback to older file name if needed
            file_path = BASE_DIR / "data" / "template_excel_dosen.csv"
            if not file_path.exists():
                raise HTTPException(status_code=404, detail="File CSV contoh tidak ditemukan di folder data")
        
        with open(file_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
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
        raise HTTPException(status_code=400, detail=f"Gagal memuat contoh CSV: {e}")

@app.post("/api/export-csv")
async def export_csv(req: CalcRequest):
    result = run_calculation(req)
    output = io.StringIO()
    writer = csv.writer(output)

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
    # DATA TEMPLATE EXCEL DOSEN FULL 20 TAHUN
    template = """tahun,produksi_mbbl,harga_minyak_usd,capital_usd,non_capital_usd,opex_usd
0,0,32,13000,8000,0
1,175,32,0,0,180
2,201,32,0,0,180
3,217,32,0,0,180
4,198,32,0,0,184.5
5,192.06,32,0,0,189.1125
6,186.29,32,0,0,193.8403125
7,180.7013,32,0,0,198.6863203
8,175.280261,32,0,0,203.6534783
9,170.0218532,32,0,0,208.7448153
10,164.9211976,32,0,0,213.9634357
11,159.9735616,32,0,0,219.3125216
12,155.1743548,32,0,0,224.7953346
13,150.5191242,32,0,0,230.415218
14,146.0035504,32,0,0,236.1755984
15,141.6234439,32,0,0,242.0799884
16,137.3747406,32,0,0,248.1319881
17,133.2534984,32,0,0,254.3352878
18,129.2558934,32,0,0,260.69367
19,125.3782166,32,0,0,267.2110117
20,121.6168701,32,0,0,273.891287
"""
    return StreamingResponse(
        iter([template]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=template_excel_dosen.csv"}
    )

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)