// ── State ────────────────────────────────────────────────────────────────────
let rows = [];
let lastResult = null;
let ncfChart = null;
let prodChart = null;
let rowIdCounter = 0;
let currentProjectId = null;

// ── Utility ──────────────────────────────────────────────────────────────────
const fmt = (n, dec=1) => n == null ? '—' : Number(n).toLocaleString('id-ID', {minimumFractionDigits:dec, maximumFractionDigits:dec});
const fmtPct = (n) => n == null ? '—' : (Number(n)*100).toFixed(2) + '%';
const cls = (n) => n < 0 ? 'neg' : (n > 0 ? 'pos' : '');

function showLoading(v){ document.getElementById('loading').classList.toggle('show',v) }
function showToast(msg, type='success'){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(()=>t.classList.remove('show'), 3000);
}

function setActiveNav(navId) {
  // Hapus class active dari semua menu utama
  document.querySelectorAll('.sidebar-section .sidebar-nav .nav-link').forEach(link => {
    link.classList.remove('active');
  });
  // Tambahkan class active ke menu yang sesuai
  if(navId) {
    const activeEl = document.getElementById(navId);
    if(activeEl) activeEl.classList.add('active');
  }
}

// ── Navigation ───────────────────────────────────────────────────────────────
function goToProjects(){
  setActiveNav('nav-projects');
  document.getElementById('page-projects').style.display = '';
  document.getElementById('page-detail').style.display = 'none';
  if(document.getElementById('page-history')) document.getElementById('page-history').style.display = 'none';
  const pageGuide = document.getElementById('page-guide');
  if(pageGuide) pageGuide.style.display = 'none';
  const shortcuts = document.getElementById('sidebar-shortcuts');
  if(shortcuts) shortcuts.style.display = 'none';
  currentProjectId = null;
  loadProjectsList();
}

function goToProject(id, historyId = null){
  setActiveNav('nav-projects');
  currentProjectId = id;
  document.getElementById('page-projects').style.display = 'none';
  document.getElementById('page-detail').style.display = '';
  if(document.getElementById('page-history')) document.getElementById('page-history').style.display = 'none';
  const pageGuide = document.getElementById('page-guide');
  if(pageGuide) pageGuide.style.display = 'none';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('btn-export').disabled = true;
  const shortcuts = document.getElementById('sidebar-shortcuts');
  if(shortcuts) shortcuts.style.display = 'block';
  lastResult = null;
  window.regressionParams = null;
  loadProjectDetail(id, historyId);
}

function goToHistory(){
  setActiveNav('nav-history');
  document.getElementById('page-projects').style.display = 'none';
  document.getElementById('page-detail').style.display = 'none';
  if(document.getElementById('page-guide')) document.getElementById('page-guide').style.display = 'none';
  if(document.getElementById('sidebar-shortcuts')) document.getElementById('sidebar-shortcuts').style.display = 'none';
  if(document.getElementById('page-history')) document.getElementById('page-history').style.display = 'block';
  loadHistoryList();
}

// bikin fungsi buat buka halaman panduan
function goToGuide(){
  setActiveNav('nav-guide');
  document.getElementById('page-projects').style.display = 'none';
  document.getElementById('page-detail').style.display = 'none';
  if(document.getElementById('page-history')) document.getElementById('page-history').style.display = 'none';
  const pageGuide = document.getElementById('page-guide');
  if(pageGuide) pageGuide.style.display = 'block';
  const shortcuts = document.getElementById('sidebar-shortcuts');
  if(shortcuts) shortcuts.style.display = 'none';
}

// ── Modal ────────────────────────────────────────────────────────────────────
function openModal(){
  document.getElementById('modal-overlay').classList.add('show');
  document.getElementById('modal-name').value = '';
  document.getElementById('modal-desc').value = '';
  setTimeout(()=>document.getElementById('modal-name').focus(), 100);
}
function closeModal(){
  document.getElementById('modal-overlay').classList.remove('show');
}

// ── Project CRUD ─────────────────────────────────────────────────────────────
async function loadProjectsList(){
  try {
    const res = await fetch('/api/projects');
    const projects = await res.json();
    const grid = document.getElementById('projects-grid');
    const empty = document.getElementById('empty-state');

    if(projects.length === 0){
      grid.style.display = 'none';
      empty.style.display = '';
      if(document.getElementById('projects-count')) {
        document.getElementById('projects-count').innerText = 0;
      }
      lucide.createIcons();
      return;
    }

    if(document.getElementById('projects-count')) {
      document.getElementById('projects-count').innerText = projects.length;
    }

    grid.style.display = '';
    empty.style.display = 'none';

    grid.innerHTML = projects.map(p => {
      const date = new Date(p.updated_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
      const statusBadge = p.has_results
        ? '<span class="badge badge-green">Calculated</span>'
        : '<span class="badge badge-orange">Draft</span>';
      return `
        <div class="project-card" onclick="goToProject('${p.id}')">
          <div class="project-card-actions">
            <button class="card-action-btn danger" onclick="event.stopPropagation();deleteProject('${p.id}')" title="Hapus Project">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
          <div class="project-card-name">${escHtml(p.name)}</div>
          <div class="project-card-desc">${escHtml(p.description || 'Tidak ada deskripsi')}</div>
          <div class="project-card-meta">
            <span>${p.row_count} baris data · ${date}</span>
            ${statusBadge}
          </div>
        </div>
      `;
    }).join('');
    
    lucide.createIcons();
  } catch(e){
    showToast('Gagal memuat projects: ' + e.message, 'error');
  }
}

function escHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function createProject(){
  const name = document.getElementById('modal-name').value.trim();
  if(!name){ showToast('Nama project tidak boleh kosong', 'error'); return; }
  const desc = document.getElementById('modal-desc').value.trim();
  try {
    const res = await fetch('/api/projects', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name, description:desc})
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.detail || 'Error');
    closeModal();
    showToast('Project "' + name + '" berhasil dibuat');
    goToProject(data.id);
  } catch(e){
    showToast(e.message, 'error');
  }
}

async function deleteProject(id){
  if(!confirm('Hapus project ini?')) return;
  try {
    await fetch(`/api/projects/${id}`, {method:'DELETE'});
    showToast('Project berhasil dihapus');
    loadProjectsList();
  } catch(e){
    showToast('Gagal menghapus: ' + e.message, 'error');
  }
}

async function loadProjectDetail(id, historyId = null){
  showLoading(true);
  try {
    const res = await fetch(`/api/projects/${id}`);
    const p = await res.json();
    if(!res.ok) throw new Error(p.detail || 'Error');

    document.getElementById('project-title').textContent = p.name;
    document.getElementById('project-desc').textContent = p.description || '';

    // Cari spesifik history jika diminta, jika tidak pakai parameter project dan last_result
    let activeParams = p.params || {};
    let activeResult = p.last_result || null;
    
    if(historyId && p.history) {
      const h = p.history.find(item => item.id === historyId);
      if(h) {
        activeParams = h.params;
        activeResult = h.result;
        showToast('Memuat riwayat perhitungan...');
      }
    }

    // Load params
    document.getElementById('depr-method').value = activeParams.depr_method || 'declining_balance';
    document.getElementById('depr-life').value = activeParams.depr_life || 10;
    document.getElementById('tax-rate').value = ((activeParams.tax_rate || 0.52) * 100).toFixed(1);
    document.getElementById('discount-rate').value = ((activeParams.discount_rate || 0.15) * 100).toFixed(1);
    document.getElementById('use-lcf').checked = activeParams.use_lcf || false;
    if(activeParams.reserve_mbbl) document.getElementById('reserve-mbbl').value = activeParams.reserve_mbbl;
    document.getElementById('reserve-row').style.display = activeParams.depr_method === 'unit_of_production' ? 'block' : 'none';

    // Load rows
    rows = [];
    rowIdCounter = 0;
    if(p.rows && p.rows.length > 0){
      p.rows.forEach(r => addRow(r));
    } else {
      addRow();
    }

    // If has results, render them
    if(activeResult){
      lastResult = activeResult;
      renderResults(activeResult);
      document.getElementById('btn-export').disabled = false;
    }
    
    setTimeout(() => lucide.createIcons(), 50);
  } catch(e){
    showToast(e.message, 'error');
    goToProjects();
  } finally {
    showLoading(false);
  }
}

async function saveProjectData(){
  if(!currentProjectId) return;
  collectRows();
  const params = {
    depr_method: document.getElementById('depr-method').value,
    depr_base: document.getElementById('depr-base') ? document.getElementById('depr-base').value : 'total',
    depr_life: parseInt(document.getElementById('depr-life').value) || 10,
    tax_rate: parseFloat(document.getElementById('tax-rate').value)/100,
    discount_rate: parseFloat(document.getElementById('discount-rate').value)/100,
    use_lcf: document.getElementById('use-lcf').checked,
    reserve_mbbl: parseFloat(document.getElementById('reserve-mbbl').value)||null,
  };
  const saveRows = rows.map(r => ({
    tahun: r.tahun,
    produksi_mbbl: r.produksi_mbbl,
    harga_minyak_usd: r.harga_minyak_usd,
    capital_usd: r.capital_usd,
    non_capital_usd: r.non_capital_usd,
    opex_usd: r.opex_usd,
  }));
  try {
    const res = await fetch(`/api/projects/${currentProjectId}`, {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({rows: saveRows, params})
    });
    if(!res.ok) throw new Error('Gagal menyimpan');
    showToast('Data project berhasil disimpan');
  } catch(e){
    showToast('Error: ' + e.message, 'error');
  }
}

async function loadHistoryList(){
  showLoading(true);
  try {
    const res = await fetch('/api/history');
    const history = await res.json();
    const tbody = document.getElementById('history-tbody');
    const empty = document.getElementById('history-empty');
    
    if(history.length === 0){
      tbody.parentElement.style.display = 'none';
      empty.style.display = 'flex';
      return;
    }
    
    tbody.parentElement.style.display = 'table';
    empty.style.display = 'none';
    
    const methodNames = {
      straight_line:'Straight Line', declining_balance:'Declining Balance',
      double_declining:'Double Declining', unit_of_production:'Unit of Production',
      sum_of_year:'Sum of Year'
    };
    
    tbody.innerHTML = history.map(h => {
      const date = new Date(h.timestamp).toLocaleString('id-ID',{day:'numeric',month:'short',year:'numeric', hour:'2-digit', minute:'2-digit'});
      const badge = h.feasible 
        ? '<span class="badge badge-green">LAYAK</span>' 
        : '<span class="badge badge-red">TIDAK LAYAK</span>';
        
      return `
        <tr>
          <td>${date}</td>
          <td style="font-weight:600; color:var(--accent);">${escHtml(h.project_name)}</td>
          <td>${methodNames[h.params.depr_method] || h.params.depr_method}</td>
          <td style="font-weight:700;">${fmt(h.npv,1)}</td>
          <td>${badge}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="goToProject('${h.project_id}', '${h.history_id}')">
              Lihat Detail
            </button>
          </td>
        </tr>
      `;
    }).join('');
    
  } catch(e){
    showToast('Gagal memuat history: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ── Row Management ────────────────────────────────────────────────────────────
function addRow(data=null){
  const id = rowIdCounter++;
  const lastTahun = rows.length ? rows[rows.length-1].tahun : -1;
  const row = data || { tahun: lastTahun+1, produksi_mbbl:0, harga_minyak_usd:20, capital_usd:0, non_capital_usd:0, opex_usd:0 };
  row._id = id;
  rows.push(row);
  renderTable();
}

// bikin data otomatis ke depan
function generateDeclineCurve(){
  collectRows();
  if(rows.length === 0) return showToast("Tambahkan minimal 1 baris data dulu", "error");
  
  let lastRow = rows[rows.length-1];
  let currentYear = lastRow.tahun;
  if(currentYear >= 20) return showToast("Sudah mencapai atau melebihi tahun ke-20", "error");

  const decRate = parseFloat(document.getElementById('decline-rate').value) || 3;
  const opxEsc = parseFloat(document.getElementById('opex-escalation').value) || 2.5;

  let currentProd = lastRow.produksi_mbbl;
  let currentOpex = lastRow.opex_usd;
  const currentPrice = lastRow.harga_minyak_usd;

  for(let y = currentYear + 1; y <= 20; y++){
    currentProd = currentProd * (1 - (decRate / 100));
    currentOpex = currentOpex * (1 + (opxEsc / 100));
    
    const id = rowIdCounter++;
    rows.push({
      _id: id,
      tahun: y,
      produksi_mbbl: currentProd,
      harga_minyak_usd: currentPrice,
      capital_usd: 0,
      non_capital_usd: 0,
      opex_usd: currentOpex
    });
  }
  
  renderTable();
  showToast("Auto-generate data sampai tahun ke-20 berhasil", "success");
  
  // panggil auto hitung tanpa tekan tombol
  runCalculation();
}

function removeRow(id){
  rows = rows.filter(r=>r._id !== id);
  renderTable();
}

function clearAll(){
  rows = [];
  window.regressionParams = null;
  renderTable();
  document.getElementById('results-section').style.display='none';
}

function getRowValues(id){
  const row = rows.find(r=>r._id===id);
  if(!row) return;
  row.tahun = parseInt(document.getElementById(`r${id}-tahun`).value)||0;
  row.produksi_mbbl = parseFloat(document.getElementById(`r${id}-prod`).value)||0;
  row.harga_minyak_usd = parseFloat(document.getElementById(`r${id}-harga`).value)||0;
  row.capital_usd = parseFloat(document.getElementById(`r${id}-cap`).value)||0;
  row.non_capital_usd = parseFloat(document.getElementById(`r${id}-ncap`).value)||0;
  row.opex_usd = parseFloat(document.getElementById(`r${id}-opex`).value)||0;
}

function collectRows(){
  rows.forEach(r => getRowValues(r._id));
}

function renderTable(){
  const tbody = document.getElementById('input-tbody');
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="col-year"><input id="r${r._id}-tahun" type="number" value="${r.tahun}" style="text-align:center;width:50px"/></td>
      <td><input id="r${r._id}-prod" type="number" value="${r.produksi_mbbl}" step="0.001"/></td>
      <td><input id="r${r._id}-harga" type="number" value="${r.harga_minyak_usd}" step="0.01"/></td>
      <td><input id="r${r._id}-cap" type="number" value="${r.capital_usd}" step="0.01"/></td>
      <td><input id="r${r._id}-ncap" type="number" value="${r.non_capital_usd}" step="0.01"/></td>
      <td><input id="r${r._id}-opex" type="number" value="${r.opex_usd}" step="0.01"/></td>
      <td class="col-del">
        <button class="del-btn" onclick="removeRow(${r._id})" title="Hapus baris">
          <i data-lucide="x"></i>
        </button>
      </td>
    </tr>
  `).join('');
  document.getElementById('row-count').textContent = rows.length + ' baris';
  lucide.createIcons();
}

// ── Example Data ─────────────────────────────────────────────────────────────
// Cari function loadExample() di dalam file static/app.js
function loadExample() {
  const excelData = [
    { thn: 0, prod: 0, price: 32, cap: 13000, ncap: 8000, opex: 0 },
    { thn: 1, prod: 175, price: 32, cap: 0, ncap: 0, opex: 180 },
    { thn: 2, prod: 201, price: 32, cap: 0, ncap: 0, opex: 180 },
    { thn: 3, prod: 217, price: 32, cap: 0, ncap: 0, opex: 180 },
    { thn: 4, prod: 198, price: 32, cap: 0, ncap: 0, opex: 184.5 },
    { thn: 5, prod: 192.06, price: 32, cap: 0, ncap: 0, opex: 189.1125 },
    { thn: 6, prod: 186.29, price: 32, cap: 0, ncap: 0, opex: 193.8403 },
    { thn: 7, prod: 180.70, price: 32, cap: 0, ncap: 0, opex: 198.6863 },
    { thn: 8, prod: 175.28, price: 32, cap: 0, ncap: 0, opex: 203.6535 },
    { thn: 9, prod: 170.02, price: 32, cap: 0, ncap: 0, opex: 208.7448 },
    { thn: 10, prod: 164.92, price: 32, cap: 0, ncap: 0, opex: 213.9634 },
    { thn: 11, prod: 159.97, price: 32, cap: 0, ncap: 0, opex: 219.3125 },
    { thn: 12, prod: 155.17, price: 32, cap: 0, ncap: 0, opex: 224.7953 },
    { thn: 13, prod: 150.52, price: 32, cap: 0, ncap: 0, opex: 230.4152 },
    { thn: 14, prod: 146.00, price: 32, cap: 0, ncap: 0, opex: 236.1756 },
    { thn: 15, prod: 141.62, price: 32, cap: 0, ncap: 0, opex: 242.0800 },
    { thn: 16, prod: 137.37, price: 32, cap: 0, ncap: 0, opex: 248.1320 },
    { thn: 17, prod: 133.25, price: 32, cap: 0, ncap: 0, opex: 254.3353 },
    { thn: 18, prod: 129.26, price: 32, cap: 0, ncap: 0, opex: 260.6937 },
    { thn: 19, prod: 125.38, price: 32, cap: 0, ncap: 0, opex: 267.2110 },
    { thn: 20, prod: 121.62, price: 32, cap: 0, ncap: 0, opex: 273.8913 }
  ];
  
  // Kosongkan tabel saat ini (jangan hapus logika yang ini dari app.js kamu)
  document.getElementById("input-tbody").innerHTML = "";
  
  // Masukkan data baru ke tabel
  excelData.forEach(row => {
    // logika insert row yang sudah ada di app.js kamu
    _addRowWithData(row.thn, row.prod, row.price, row.cap, row.ncap, row.opex);
  });
}

// ── CSV Upload ───────────────────────────────────────────────────────────────
async function uploadCSV(input){
  const file = input.files[0];
  if(!file) return;
  const formData = new FormData();
  formData.append('file', file);
  showLoading(true);
  try {
    const res = await fetch('/api/upload-csv', {method:'POST', body:formData});
    const data = await res.json();
    if(!res.ok) throw new Error(data.detail || 'Gagal upload');
    rows = [];
    data.rows.forEach(r=>addRow(r));
    showToast(`${data.count} baris berhasil diimport`);
  } catch(e){
    showToast('Error: ' + e.message, 'error');
  } finally {
    showLoading(false);
    input.value='';
  }
}

// ── Depr method toggle ───────────────────────────────────────────────────────
document.getElementById('depr-method').addEventListener('change', function(){
  document.getElementById('reserve-row').style.display = this.value==='unit_of_production'?'block':'none';
});

// ── Calculation ──────────────────────────────────────────────────────────────
async function runCalculation(){
  collectRows();
  if(rows.length < 2){
    showToast('Minimal butuh 2 baris data (tahun 0 + minimal 1 tahun produksi)', 'error');
    return;
  }

  // Save first if in a project
  if(currentProjectId) await saveProjectData();

  const payload = {
    rows: rows.map(r=>({
      tahun: r.tahun, produksi_mbbl: r.produksi_mbbl,
      harga_minyak_usd: r.harga_minyak_usd, capital_usd: r.capital_usd,
      non_capital_usd: r.non_capital_usd, opex_usd: r.opex_usd,
    })),
    depr_method: document.getElementById('depr-method').value,
    depr_base: document.getElementById('depr-base') ? document.getElementById('depr-base').value : 'total',
    depr_life: parseInt(document.getElementById('depr-life').value) || 10,
    tax_rate: parseFloat(document.getElementById('tax-rate').value)/100,
    discount_rate: parseFloat(document.getElementById('discount-rate').value)/100,
    use_lcf: document.getElementById('use-lcf').checked,
    reserve_mbbl: parseFloat(document.getElementById('reserve-mbbl').value)||null,
  };
  showLoading(true);
  try {
    let url = '/api/calculate';
    if(currentProjectId) url = `/api/projects/${currentProjectId}/calculate`;

    const res = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: currentProjectId ? undefined : JSON.stringify(payload)
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.detail || 'Error');
    lastResult = data;
    renderResults(data);
    document.getElementById('btn-export').disabled = false;
    showToast('Perhitungan selesai');
  } catch(e){
    showToast(e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ── Render Results ───────────────────────────────────────────────────────────
function renderResults(data){
  const sec = document.getElementById('results-section');
  sec.style.display='block';
  sec.scrollIntoView({behavior:'smooth', block:'start'});

  const ind = data.indicators;
  const params = data.params;
  const methodNames = {
    straight_line:'Straight Line', declining_balance:'Declining Balance',
    double_declining:'Double Declining', unit_of_production:'Unit of Production',
    sum_of_year:'Sum of Year'
  };

  // Verdict
  const vbox = document.getElementById('verdict-box');
  const feasible = ind.feasible;
  vbox.className = 'verdict ' + (feasible?'go':'nogo');
  document.getElementById('verdict-icon').innerHTML = feasible 
    ? '<i data-lucide="check-circle-2"></i>' 
    : '<i data-lucide="x-circle"></i>';
  document.getElementById('verdict-text').textContent = feasible
    ? `Lapangan LAYAK dikembangkan (NPV > 0) — Metode: ${methodNames[params.depr_method]}, Tax: ${(params.tax_rate*100).toFixed(0)}%, r: ${(params.discount_rate*100).toFixed(0)}%`
    : `Lapangan TIDAK LAYAK dikembangkan (NPV ≤ 0) — Metode: ${methodNames[params.depr_method]}, Tax: ${(params.tax_rate*100).toFixed(0)}%, r: ${(params.discount_rate*100).toFixed(0)}%`;

  // KPIs
  const rorVal = ind.ROR != null ? (ind.ROR*100).toFixed(2)+'%' : 'N/A';
  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi"><div class="kpi-label">POT</div><div class="kpi-value" style="font-size:1rem">${ind.POT_str||'—'}</div><div class="kpi-sub">Pay Out Time</div></div>
    <div class="kpi ${feasible?'feasible':'not-feasible'}"><div class="kpi-label">NPV</div><div class="kpi-value" style="color:${feasible?'var(--green)':'var(--red)'}">${fmt(ind.NPV,1)}</div><div class="kpi-sub">r = ${(params.discount_rate*100).toFixed(0)}% | $</div></div>
    <div class="kpi"><div class="kpi-label">ROR / IRR</div><div class="kpi-value">${rorVal}</div><div class="kpi-sub">Rate of Return</div></div>
    <div class="kpi"><div class="kpi-label">DPR</div><div class="kpi-value">${fmt(ind.DPR,4)}</div><div class="kpi-sub">Discounted P/I Ratio</div></div>
    <div class="kpi"><div class="kpi-label">PIR</div><div class="kpi-value">${fmt(ind.PIR,4)}</div><div class="kpi-sub">Profit/Investment Ratio</div></div>
  `;

  // Cash flow table
  const tbody = document.getElementById('result-tbody');
  let sumIncome=0,sumOpex=0,sumDepr=0,sumTaxInc=0,sumTax=0,sumNCF=0,sumDisc=0;
  tbody.innerHTML = data.cashflow.map(r=>{
    sumIncome+=r.income||0; sumOpex+=r.opex||0; sumDepr+=r.depresiasi||0;
    sumTaxInc+=r.taxable_income||0; sumTax+=r.tax||0;
    sumNCF+=r.ncf_undiscounted; sumDisc+=(r.ncf_discounted||0);
    return `<tr>
      <td>${r.tahun}</td>
      <td>${fmt(r.produksi,1)}</td>
      <td class="${cls(r.income)}">${fmt(r.income,1)}</td>
      <td class="${cls(-r.capital)}">${r.capital>0?'('+fmt(r.capital,1)+')':'—'}</td>
      <td class="${cls(-r.non_capital)}">${r.non_capital>0?'('+fmt(r.non_capital,1)+')':'—'}</td>
      <td class="${cls(-r.opex)}">${r.opex>0?'('+fmt(r.opex,1)+')':'—'}</td>
      <td>${r.depresiasi>0?fmt(r.depresiasi,1):'—'}</td>
      <td class="${cls(r.taxable_income)}">${fmt(r.taxable_income,1)}</td>
      <td>${r.tax>0?'('+fmt(r.tax,1)+')':'—'}</td>
      <td class="${cls(r.ncf_undiscounted)} " style="font-weight:700">${fmt(r.ncf_undiscounted,1)}</td>
      <td style="color:var(--text-dim)">${fmt(r.discount_factor,4)}</td>
      <td class="${cls(r.ncf_discounted)}">${fmt(r.ncf_discounted,1)}</td>
      <td class="${cls(r.cumulative_ncf)}">${fmt(r.cumulative_ncf,1)}</td>
    </tr>`;
  }).join('');

  document.getElementById('result-tfoot').innerHTML = `<tr>
    <td>TOTAL</td><td>—</td>
    <td>${fmt(sumIncome,1)}</td><td>—</td><td>—</td>
    <td>(${fmt(sumOpex,1)})</td><td>${fmt(sumDepr,1)}</td>
    <td>${fmt(sumTaxInc,1)}</td><td>(${fmt(sumTax,1)})</td>
    <td class="${cls(sumNCF)}">${fmt(sumNCF,1)}</td><td>—</td>
    <td class="${cls(sumDisc)}">${fmt(sumDisc,1)}</td><td>—</td>
  </tr>`;

  // Depreciation schedule
  let cumDepr = 0;
  document.getElementById('depr-tbody').innerHTML = data.depreciation_schedule.map((d,i)=>{
    cumDepr+=d;
    return `<tr><td>${i+1}</td><td>${fmt(d,2)}</td><td>${fmt(cumDepr,2)}</td></tr>`;
  }).join('');

  // Chart
  renderChart(data.cashflow);
  renderProdChart(data.cashflow);
  generateDynamicInsights(data);
  lucide.createIcons();
}

function generateDynamicInsights(data) {
  const cf = data.cashflow;
  const ind = data.indicators;
  
  // bikin teks insight lebih gampang dibaca orang awam
  const totalTax = cf.reduce((s, r) => s + (r.tax || 0), 0);
  const totalOpex = cf.reduce((s, r) => s + (r.opex || 0), 0);
  const totalCapital = cf.reduce((s, r) => s + (r.capital || 0), 0);
  const cfBox = document.getElementById('insight-cashflow');
  const cfText = document.getElementById('insight-text-cashflow');
  if (cfBox && cfText) {
    cfText.innerHTML = `Proyek ini membutuhkan alokasi pengeluaran modal (<em>Capital Expenditure</em>) awal sebesar <strong>$${fmt(totalCapital, 1)}</strong> untuk pembangunan fasilitas produksi. Selama periode umur operasionalnya, estimasi total biaya operasional (<em>Opex</em>) yang diperlukan mencapai <strong>$${fmt(totalOpex, 1)}</strong>. Selain mencetak pendapatan kotor, proyek ini juga memproyeksikan kontribusi pajak kepada negara sebesar total <strong>$${fmt(totalTax, 1)}</strong>, yang menunjukkan kepatuhan dan kelayakan komersial yang baik.`;
    cfBox.style.display = 'flex';
  }

  const ncfBox = document.getElementById('insight-ncf');
  const ncfText = document.getElementById('insight-text-ncf');
  if (ncfBox && ncfText) {
    if (ind.feasible) {
      ncfText.innerHTML = `Berdasarkan proyeksi arus kas, seluruh biaya modal awal diperkirakan akan mencapai titik impas (<em>Pay Out Time</em>) pada <strong>Tahun ke-${ind.POT_str ? ind.POT_str.split(' ')[0] : '?'}</strong>. Proyek ini dinyatakan LAYAK (<em>Feasible</em>) dengan proyeksi keuntungan bersih masa kini (Net Present Value/NPV) mencapai <strong>$${fmt(ind.NPV, 1)}</strong>. Selain itu, tingkat pengembalian modal (IRR) berada di angka <strong>${(ind.ROR*100).toFixed(2)}%</strong> per tahun, yang menunjukkan indikator keekonomian yang solid.`;
    } else {
      ncfText.innerHTML = `Sayangnya, proyeksi keekonomian menunjukkan bahwa proyek ini <strong>TIDAK LAYAK</strong> secara komersial. Arus kas kumulatif gagal mencapai titik impas (<em>Pay Out Time</em>) hingga akhir masa produksi, menghasilkan Net Present Value (NPV) yang negatif. Evaluasi ulang terhadap struktur pengeluaran modal (<em>Capital</em>) atau asumsi harga minyak bumi (<em>Oil Price</em>) sangat direkomendasikan sebelum mengambil keputusan final.`;
    }
    ncfBox.style.display = 'flex';
  }

  const prodBox = document.getElementById('insight-prod');
  const prodText = document.getElementById('insight-text-prod');
  if (prodBox && prodText) {
    let maxProd = 0;
    let peakYear = 0;
    cf.forEach(r => {
      if (r.produksi > maxProd) {
        maxProd = r.produksi;
        peakYear = r.tahun;
      }
    });
    prodText.innerHTML = `Profil produksi sumur menunjukkan bahwa volume produksi puncak (<em>Peak Production</em>) akan tercapai pada <strong>Tahun ke-${peakYear}</strong> dengan total ekstraksi <strong>${fmt(maxProd, 1)} Ribu Barel (MBbl)</strong>. Melewati fase puncak tersebut, sumur akan memasuki periode penurunan produksi alami (<em>Decline Phase</em>) sejalan dengan berkurangnya tekanan reservoar seiring berjalannya waktu eksploitasi.`;
    prodBox.style.display = 'flex';
  }

  const deprBox = document.getElementById('insight-depr');
  const deprText = document.getElementById('insight-text-depr');
  const methodNames = {
    straight_line: 'Straight Line', declining_balance: 'Declining Balance',
    double_declining: 'Double Declining', unit_of_production: 'Unit of Production',
    sum_of_year: 'Sum of Year'
  };
  if (deprBox && deprText && data.depreciation_schedule) {
    const deprArr = data.depreciation_schedule;
    const deprLife = data.params.depr_life;
    const method = methodNames[data.params.depr_method] || 'Metode';
    let endYear = deprLife;
    if (deprArr.length > 0 && deprArr[deprArr.length-1] === 0) {
      endYear = deprArr.findIndex(v => v === 0);
    }
    deprText.innerHTML = `Nilai buku aset fasilitas produksi diperhitungkan menggunakan metode depresiasi <strong>${method}</strong> dengan rentang umur ekonomis <strong>${deprLife} tahun</strong>. Beban penyusutan ini bukan merupakan pengeluaran tunai (<em>non-cash expense</em>), namun berperan krusial sebagai pengurang penghasilan kena pajak (<em>Tax Deduction</em>) yang secara otomatis akan meningkatkan arus kas bersih proyek di tahun-tahun awal operasi.`;
    deprBox.style.display = 'flex';
  }
}

function renderChart(cf){
  const labels = cf.map(r=>r.tahun===0?'Thn 0':'Thn '+r.tahun);
  const ncfData = cf.map(r=>r.ncf_undiscounted);
  const cumData = cf.map(r=>r.cumulative_ncf);
  const discData = cf.map(r=>r.ncf_discounted||0);

  // ambil warna dari css variables biar sinkron sama tema aktif
  const s = getComputedStyle(document.documentElement);
  const cText = s.getPropertyValue('--text').trim() || '#f1f5f9';
  const cDim = s.getPropertyValue('--text-dim').trim() || '#94a3b8';
  const cBorder = s.getPropertyValue('--glass-border').trim() || 'rgba(255,255,255,0.1)';
  const cAccent = s.getPropertyValue('--accent').trim() || '#818cf8';
  const cAccentGlow = s.getPropertyValue('--accent-glow').trim() || 'rgba(99, 102, 241, 0.2)';
  const cGreen = s.getPropertyValue('--green').trim() || '#34d399';
  const cRed = s.getPropertyValue('--red').trim() || '#f43f5e';
  const cTooltipBg = s.getPropertyValue('--bg-secondary').trim() || '#161b22';

  if(ncfChart) ncfChart.destroy();
  const ctx = document.getElementById('ncf-chart').getContext('2d');
  ncfChart = new Chart(ctx, {
    data:{
      labels,
      datasets:[
        {
          type:'bar', label:'NCF Undiscounted ($)',
          data: ncfData,
          backgroundColor: ncfData.map(v=>v>=0?'rgba(52, 211, 153, 0.45)':'rgba(244, 63, 94, 0.45)'),
          borderColor: ncfData.map(v=>v>=0?cGreen:cRed),
          borderWidth:1.5, yAxisID:'y', borderRadius: 6,
        },
        {
          type:'line', label:'Kumulatif NCF ($)',
          data: cumData,
          borderColor:'#fbbf24', backgroundColor:'rgba(251,191,36,0.06)',
          borderWidth:2.5, fill:true, tension:.3, pointRadius:4,
          pointBackgroundColor:'#fbbf24', yAxisID:'y',
        },
        {
          type:'line', label:'NCF Discounted ($)',
          data: discData,
          borderColor:cAccent, borderWidth:2, borderDash:[5,4],
          pointRadius:3, pointBackgroundColor:cAccent,
          fill:false, tension:.3, yAxisID:'y',
        }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ labels:{ color: cText, font:{family:'Plus Jakarta Sans', size:12, weight:'600'} } },
        tooltip: {
          backgroundColor: cTooltipBg, borderColor:cBorder, borderWidth:1,
          cornerRadius:10, padding:12, titleColor:cAccent, bodyColor:cText,
          titleFont: {family: 'Plus Jakarta Sans', size: 12, weight: 'bold'},
          bodyFont: {family: 'JetBrains Mono', size: 11},
          callbacks:{ label(ctx){ return ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('id-ID',{minimumFractionDigits:1})}` } }
        }
      },
      scales:{
        x:{ ticks:{color: cDim, font:{family:'JetBrains Mono', size:10}}, grid:{color: cBorder} },
        y:{ ticks:{color: cDim, font:{family:'JetBrains Mono', size:10}, callback:v=>v.toLocaleString('id-ID',{maximumFractionDigits:0})}, grid:{color: cBorder} }
      }
    }
  });
}

function getOrComputeRegressionParams(cf) {
  if (window.regressionParams) return window.regressionParams;
  
  // Fit default expo_peak regression on the fly
  const points = cf.filter(r => r.tahun > 0 && r.produksi > 0).map(r => ({
    tahun: r.tahun,
    produksi_mbbl: r.produksi
  }));
  if (points.length < 2) return null;
  
  // Find peak
  let peakRow = points.reduce((max, p) => p.produksi_mbbl > max.produksi_mbbl ? p : max, points[0]);
  let fitPoints = points.filter(p => p.tahun >= peakRow.tahun);
  if (fitPoints.length < 2) fitPoints = points;
  
  const N = fitPoints.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  fitPoints.forEach(p => {
    const x = p.tahun;
    const y = Math.log(p.produksi_mbbl);
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });
  const denom = (N * sumX2 - sumX * sumX);
  if (Math.abs(denom) < 1e-9) return null;
  
  const slope = (N * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / N;
  
  return {
    type: 'expo',
    slope,
    intercept,
    peakYear: peakRow.tahun,
    isExpo: true
  };
}

function renderProdChart(cf) {
  const labels = cf.map(r => r.tahun === 0 ? 'Thn 0' : 'Thn ' + r.tahun);
  const prodData = cf.map(r => r.produksi);
  
  let regParams = window.regressionParams || getOrComputeRegressionParams(cf);
  let regData = [];
  if (regParams) {
    const { isExpo, slope, intercept, peakYear } = regParams;
    cf.forEach(r => {
      if (r.tahun === 0) {
        regData.push(null);
      } else if (peakYear > 0 && r.tahun < peakYear) {
        regData.push(null);
      } else {
        let val = isExpo 
          ? Math.exp(intercept) * Math.exp(slope * r.tahun)
          : (slope * r.tahun + intercept);
        regData.push(val < 0 ? 0 : val);
      }
    });
  }
  
  const s = getComputedStyle(document.documentElement);
  const cText = s.getPropertyValue('--text').trim() || '#f1f5f9';
  const cDim = s.getPropertyValue('--text-dim').trim() || '#94a3b8';
  const cBorder = s.getPropertyValue('--glass-border').trim() || 'rgba(255,255,255,0.1)';
  const cAccent = s.getPropertyValue('--accent').trim() || '#818cf8';
  const cAccentGlow = s.getPropertyValue('--accent-glow').trim() || 'rgba(99, 102, 241, 0.2)';
  const cTooltipBg = s.getPropertyValue('--bg-secondary').trim() || '#161b22';

  if (prodChart) prodChart.destroy();
  const ctx = document.getElementById('prod-chart').getContext('2d');
  
  const datasets = [
    {
      type: 'bar',
      label: 'Produksi Minyak (MBbl)',
      data: prodData,
      backgroundColor: cAccentGlow,
      borderColor: cAccent,
      borderWidth: 1.5, borderRadius: 6,
      yAxisID: 'y'
    }
  ];
  
  if (regData.length > 0) {
    datasets.push({
      type: 'line',
      label: 'Tren Regresi / Decline Curve (MBbl)',
      data: regData,
      borderColor: '#fbbf24',
      borderDash: [5, 5],
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: '#fbbf24',
      fill: false,
      tension: 0.1,
      yAxisID: 'y'
    });
  }
  
  prodChart = new Chart(ctx, {
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: cText, font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' } } },
        tooltip: {
          backgroundColor: cTooltipBg,
          borderColor: cBorder,
          borderWidth: 1, cornerRadius: 10, padding: 12,
          titleColor: cAccent,
          bodyColor: cText,
          titleFont: {family: 'Plus Jakarta Sans', size: 12, weight: 'bold'},
          bodyFont: {family: 'JetBrains Mono', size: 11},
          callbacks: {
            label(ctx) {
              return ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('id-ID', { minimumFractionDigits: 1 })} MBbl`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: cDim, font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: cBorder } },
        y: { 
          ticks: { 
            color: cDim, 
            font: { family: 'JetBrains Mono', size: 10 },
            callback: v => v.toLocaleString('id-ID', { maximumFractionDigits: 0 })
          }, 
          grid: { color: cBorder } 
        }
      }
    }
  });
}

// dihapus karena pake decline curve murni

// ── Tabs ──────────────────────────────────────────────────────────────────────
// Tabs removed

// ── Export CSV ────────────────────────────────────────────────────────────────
async function exportCSV(){
  if(!lastResult) return;

  if(currentProjectId){
    // Use project export
    const res = await fetch(`/api/projects/${currentProjectId}/export-csv`, {method:'POST'});
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fm_ncf_result.csv';
    a.click();
    showToast('File CSV berhasil didownload');
    return;
  }

  collectRows();
  const payload = {
    rows: rows.map(r=>({
      tahun: r.tahun, produksi_mbbl: r.produksi_mbbl,
      harga_minyak_usd: r.harga_minyak_usd, capital_usd: r.capital_usd,
      non_capital_usd: r.non_capital_usd, opex_usd: r.opex_usd,
    })),
    depr_method: document.getElementById('depr-method').value,
    depr_base: document.getElementById('depr-base') ? document.getElementById('depr-base').value : 'total',
    depr_life: parseInt(document.getElementById('depr-life').value) || 10,
    tax_rate: parseFloat(document.getElementById('tax-rate').value)/100,
    discount_rate: parseFloat(document.getElementById('discount-rate').value)/100,
    use_lcf: document.getElementById('use-lcf').checked,
    reserve_mbbl: parseFloat(document.getElementById('reserve-mbbl').value)||null,
  };
  const res = await fetch('/api/export-csv',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='fm_ncf_result.csv';
  a.click();
  showToast('File CSV berhasil didownload');
}

// ── Drag & Drop ──────────────────────────────────────────────────────────────
const uploadZone = document.getElementById('upload-zone');
if(uploadZone){
  uploadZone.addEventListener('dragover', e=>{e.preventDefault();uploadZone.style.borderColor='var(--accent)'});
  uploadZone.addEventListener('dragleave', ()=>uploadZone.style.borderColor='');
  uploadZone.addEventListener('drop', e=>{
    e.preventDefault();
    uploadZone.style.borderColor='';
    const file = e.dataTransfer.files[0];
    if(file){
      const input = document.getElementById('file-input');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      uploadCSV(input);
    }
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────
loadProjectsList();

// ── Theme Switcher: ganti tema dark / light ────────────────────────────────
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
  // cek tema tersimpan di localstorage, kalo ga ada pake dark sebagai default
  const saved = localStorage.getItem('theme');
  const initial = saved || 'dark';
  
  document.documentElement.setAttribute('data-theme', initial);
  
  const iconEl = document.getElementById('theme-icon');
  if (iconEl) {
    iconEl.setAttribute('data-lucide', initial === 'dark' ? 'sun' : 'moon');
    lucide.createIcons();
  }
  
  // event klik buat toggle tema
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    
    const iconEl = document.getElementById('theme-icon');
    if (iconEl) {
      iconEl.setAttribute('data-lucide', next === 'dark' ? 'sun' : 'moon');
      lucide.createIcons();
    }
    
    // render ulang chart biar warnanya ikut berubah
    if (ncfChart && lastResult) renderChart(lastResult.cashflow);
    if (prodChart && lastResult) renderProdChart(lastResult.cashflow);
  });
}

function filterProjects() {
  const filter = document.getElementById('project-search').value.toLowerCase();
  const cards = document.querySelectorAll('#projects-grid .project-card');
  cards.forEach(card => {
    const name = card.querySelector('.project-card-name').innerText.toLowerCase();
    const desc = card.querySelector('.project-card-desc').innerText.toLowerCase();
    if(name.includes(filter) || desc.includes(filter)) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
}

function toggleSidebar() {
  const layout = document.querySelector('.app-layout');
  const sidebar = document.querySelector('.sidebar');
  if(layout) layout.classList.toggle('collapsed');
  if(sidebar) sidebar.classList.toggle('collapsed');
}
