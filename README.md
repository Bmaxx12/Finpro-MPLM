# FM NCF Calculator — Web App

Aplikasi web berbasis **FastAPI** untuk menghitung **Net Cash Flow (NCF)** dan
indikator ekonomi lapangan minyak & gas bumi, sesuai modul kuliah
*Pengelolaan Lapangan Migas (Field Management)*.

---

## Fitur

| Fitur | Keterangan |
|---|---|
| **5 Metode Depresiasi** | Straight Line, Declining Balance, Double Declining, Unit of Production, Sum of Year |
| **Indikator Ekonomi** | POT, NPV, ROR/IRR, DPR, PIR |
| **Import CSV** | Upload file data lapangan, drag & drop |
| **Export CSV** | Download hasil perhitungan lengkap |
| **Grafik NCF** | Bar + line chart: NCF, kumulatif, discounted |
| **Loss Carry Forward** | Mode LCF bisa diaktifkan |
| **Template CSV** | Tersedia template siap pakai (Soal 1 FM) |

---

## Struktur Folder

```
fm_calculator/
├── main.py                  # FastAPI app — semua route
├── requirements.txt
├── README.md
├── core/
│   ├── __init__.py
│   ├── depreciation.py      # 5 metode depresiasi
│   ├── cashflow.py          # Hitung NCF per tahun
│   └── indicators.py        # POT, NPV, ROR, DPR, PIR
└── static/
    └── index.html           # Frontend (HTML/CSS/JS, no framework)
```

---

## Instalasi & Menjalankan

### 1. Prasyarat
- Python 3.9+

### 2. Install dependency

```bash
pip install -r requirements.txt
```

### 3. Jalankan server

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Buka di browser

```
http://localhost:8000
```

---

## Format CSV Input

```csv
tahun,produksi_mbbl,harga_minyak_usd,capital_usd,non_capital_usd,opex_usd
0,0,20,6500,3000,0
1,215,20,0,0,175
2,425,20,0,0,175
...
```

| Kolom | Satuan | Keterangan |
|---|---|---|
| `tahun` | integer | 0 = tahun investasi |
| `produksi_mbbl` | MBbl | Produksi minyak per tahun |
| `harga_minyak_usd` | $/bbl | Harga jual minyak |
| `capital_usd` | $ | Biaya kapital (didepresiasi) |
| `non_capital_usd` | $ | Biaya non-kapital |
| `opex_usd` | $ | Biaya operasi per tahun |

---

## API Endpoints

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/` | Halaman utama |
| `POST` | `/api/calculate` | Hitung NCF & indikator (JSON) |
| `POST` | `/api/upload-csv` | Parse file CSV upload |
| `POST` | `/api/export-csv` | Hitung + download hasil CSV |
| `GET` | `/api/template-csv` | Download template CSV |

---

## Formula

### Depresiasi

| Metode | Formula |
|---|---|
| Straight Line | `Di = K / N` |
| Declining Balance | `Di = K · R · (1-R)^(i-1)`, R = 1/N |
| Double Declining | `Di = K · 2R · (1-2R)^(i-1)` |
| Unit of Production | `Di = (Prod_i / Reserve) × K` |
| Sum of Year | `Di = K · 2·(N-i+1) / (N·(N+1))` |

### Net Cash Flow

```
Income_t         = Produksi_t × Harga_minyak_t
Taxable_Income_t = Income_t − Opex_t − Depresiasi_t
Tax_t            = Tax_rate × max(Taxable_Income_t, 0)
NCF_t            = Income_t − Opex_t − Tax_t        (t ≥ 1)
NCF_0            = −(Capital + Non_Capital)
```

### Indikator Ekonomi

```
POT = waktu saat kumulatif NCF berubah dari (−) ke (+)
NPV = Σ [ NCF_t / (1+r)^t ]
ROR = r yang membuat NPV = 0
DPR = NPV / Investasi
PIR = Σ NCF_undiscounted / Investasi
```

---

## Referensi

- Modul kuliah *Pengelolaan Lapangan Migas (FM)* — Bab III & IV
- Newendorp, P.D. — *Decision Analysis for Petroleum Exploration*
- Allinson, G. — *Economics of Petroleum Exploration and Production*