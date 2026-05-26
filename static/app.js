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

// ── Navigation ───────────────────────────────────────────────────────────────
function goToProjects(){
  document.getElementById('page-projects').style.display = '';
  document.getElementById('page-detail').style.display = 'none';
  const shortcuts = document.getElementById('sidebar-shortcuts');
  if(shortcuts) shortcuts.style.display = 'none';
  currentProjectId = null;
  loadProjectsList();
}

function goToProject(id){
  currentProjectId = id;
  document.getElementById('page-projects').style.display = 'none';
  document.getElementById('page-detail').style.display = '';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('btn-export').disabled = true;
  const shortcuts = document.getElementById('sidebar-shortcuts');
  if(shortcuts) shortcuts.style.display = 'block';
  lastResult = null;
  window.regressionParams = null;
  loadProjectDetail(id);
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

async function loadProjectDetail(id){
  showLoading(true);
  try {
    const res = await fetch(`/api/projects/${id}`);
    const p = await res.json();
    if(!res.ok) throw new Error(p.detail || 'Error');

    document.getElementById('project-title').textContent = p.name;
    document.getElementById('project-desc').textContent = p.description || '';

    // Load params
    const params = p.params || {};
    document.getElementById('depr-method').value = params.depr_method || 'declining_balance';
    document.getElementById('depr-life').value = params.depr_life || 10;
    document.getElementById('tax-rate').value = ((params.tax_rate || 0.52) * 100).toFixed(1);
    document.getElementById('discount-rate').value = ((params.discount_rate || 0.15) * 100).toFixed(1);
    document.getElementById('use-lcf').checked = params.use_lcf || false;
    if(params.reserve_mbbl) document.getElementById('reserve-mbbl').value = params.reserve_mbbl;
    document.getElementById('reserve-row').style.display = params.depr_method === 'unit_of_production' ? 'block' : 'none';

    // Load rows
    rows = [];
    rowIdCounter = 0;
    if(p.rows && p.rows.length > 0){
      p.rows.forEach(r => addRow(r));
    } else {
      addRow();
    }

    // If has results, render them
    if(p.last_result){
      lastResult = p.last_result;
      renderResults(p.last_result);
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

// ── Row Management ────────────────────────────────────────────────────────────
function addRow(data=null){
  const id = rowIdCounter++;
  const lastTahun = rows.length ? rows[rows.length-1].tahun : -1;
  const row = data || { tahun: lastTahun+1, produksi_mbbl:0, harga_minyak_usd:20, capital_usd:0, non_capital_usd:0, opex_usd:0 };
  row._id = id;
  rows.push(row);
  renderTable();
}

// bikin fungsi generate otomatis sampai 20 tahun
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
function loadExample(){
  window.regressionParams = null;
  const data = [
    {tahun:0,  produksi_mbbl:0,   harga_minyak_usd:20, capital_usd:6500, non_capital_usd:3000, opex_usd:0},
    {tahun:1,  produksi_mbbl:215, harga_minyak_usd:20, capital_usd:0, non_capital_usd:0, opex_usd:175},
    {tahun:2,  produksi_mbbl:425, harga_minyak_usd:20, capital_usd:0, non_capital_usd:0, opex_usd:175},
    {tahun:3,  produksi_mbbl:740, harga_minyak_usd:20, capital_usd:0, non_capital_usd:0, opex_usd:175},
    {tahun:4,  produksi_mbbl:825, harga_minyak_usd:20, capital_usd:0, non_capital_usd:0, opex_usd:175},
    {tahun:5,  produksi_mbbl:710, harga_minyak_usd:20, capital_usd:0, non_capital_usd:0, opex_usd:175},
    {tahun:6,  produksi_mbbl:525, harga_minyak_usd:20, capital_usd:0, non_capital_usd:0, opex_usd:175},
    {tahun:7,  produksi_mbbl:350, harga_minyak_usd:20, capital_usd:0, non_capital_usd:0, opex_usd:175},
    {tahun:8,  produksi_mbbl:150, harga_minyak_usd:20, capital_usd:0, non_capital_usd:0, opex_usd:175},
    {tahun:9,  produksi_mbbl:130, harga_minyak_usd:20, capital_usd:0, non_capital_usd:0, opex_usd:175},
    {tahun:10, produksi_mbbl:110, harga_minyak_usd:20, capital_usd:0, non_capital_usd:0, opex_usd:175},
  ];
  rows = [];
  data.forEach(d=>addRow(d));
  showToast('Data contoh Soal 1 FM berhasil dimuat');
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
  
  // 1. Cash Flow Insight
  const totalTax = cf.reduce((s, r) => s + (r.tax || 0), 0);
  const totalOpex = cf.reduce((s, r) => s + (r.opex || 0), 0);
  const totalCapital = cf.reduce((s, r) => s + (r.capital || 0), 0);
  const cfBox = document.getElementById('insight-cashflow');
  const cfText = document.getElementById('insight-text-cashflow');
  if (cfBox && cfText) {
    cfText.innerHTML = `Analisis Cash Flow menunjukkan total pengeluaran kapital sebesar <strong>$${fmt(totalCapital, 1)}</strong> dan operasi sebesar <strong>$${fmt(totalOpex, 1)}</strong>. Proyek ini berkontribusi pada penerimaan negara melalui pajak total sebesar <strong>$${fmt(totalTax, 1)}</strong> selama masa operasinya.`;
    cfBox.style.display = 'flex';
  }

  // 2. NCF Insight
  const ncfBox = document.getElementById('insight-ncf');
  const ncfText = document.getElementById('insight-text-ncf');
  if (ncfBox && ncfText) {
    if (ind.feasible) {
      ncfText.innerHTML = `Kurva kumulatif menukik di awal karena investasi kapital, kemudian berbalik positif pada <strong>Tahun ke-${ind.POT_str ? ind.POT_str.split(' ')[0] : '?'}</strong>. Net Present Value tercapai di angka <strong>$${fmt(ind.NPV, 1)}</strong> dengan tingkat pengembalian (IRR) sebesar <strong>${(ind.ROR*100).toFixed(2)}%</strong>.`;
    } else {
      ncfText.innerHTML = `Proyek ini <strong>tidak layak (NPV negatif)</strong>. Kurva kumulatif gagal menembus titik impas (Break-even) hingga akhir umur proyek. Evaluasi ulang pengeluaran kapital atau batas minimum ekonomi diperlukan.`;
    }
    ncfBox.style.display = 'flex';
  }

  // 3. Prod Insight
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
    prodText.innerHTML = `Puncak produksi (Peak) diproyeksikan terjadi pada <strong>Tahun ke-${peakYear}</strong> sebesar <strong>${fmt(maxProd, 1)} MBbl</strong>. Setelah fase tersebut, produksi akan mengalami tren penurunan (*decline*) seiring berkurangnya tekanan reservoir.`;
    prodBox.style.display = 'flex';
  }

  // 4. Depr Insight
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
    deprText.innerHTML = `Skema <strong>${method}</strong> membebankan biaya depresiasi aset kapital selama umur ekonomis <strong>${deprLife} tahun</strong>. Hal ini memengaruhi pengurangan (*tax deduction*) terhadap Pajak Pendapatan di tahun-tahun awal beroperasinya lapangan.`;
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
          backgroundColor:'#0d1117', borderColor:cBorder, borderWidth:1,
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
          backgroundColor: '#0d1117',
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

async function applyRegressionProjection() {
  collectRows();
  
  // 1. Find all active production points
  const points = rows.filter(r => r.tahun > 0 && r.produksi_mbbl > 0);
  if (points.length < 2) {
    showToast('❌ Butuh minimal 2 baris data produksi > 0 untuk melakukan regresi', 'error');
    return;
  }
  
  const method = document.getElementById('reg-method').value;
  const projYears = parseInt(document.getElementById('proj-years').value) || 20;
  
  // 2. Select points to fit
  let fitPoints = points;
  let peakYear = 0;
  if (method.includes('_peak')) {
    let peakRow = points.reduce((max, p) => p.produksi_mbbl > max.produksi_mbbl ? p : max, points[0]);
    peakYear = peakRow.tahun;
    fitPoints = points.filter(p => p.tahun >= peakYear);
    if (fitPoints.length < 2) {
      fitPoints = points; // fallback
      peakYear = 0;
    }
  }
  
  const N = fitPoints.length;
  let slope = 0, intercept = 0;
  let isExpo = method.startsWith('expo');
  
  if (isExpo) {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    fitPoints.forEach(p => {
      const x = p.tahun;
      const y = Math.log(p.produksi_mbbl);
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });
    // Check denom
    const denom = (N * sumX2 - sumX * sumX);
    if (Math.abs(denom) < 1e-9) {
      showToast('❌ Error perhitungan regresi (pembagi nol)', 'error');
      return;
    }
    slope = (N * sumXY - sumX * sumY) / denom;
    intercept = (sumY - slope * sumX) / N;
  } else {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    fitPoints.forEach(p => {
      const x = p.tahun;
      const y = p.produksi_mbbl;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });
    const denom = (N * sumX2 - sumX * sumX);
    if (Math.abs(denom) < 1e-9) {
      showToast('❌ Error perhitungan regresi (pembagi nol)', 'error');
      return;
    }
    slope = (N * sumXY - sumX * sumY) / denom;
    intercept = (sumY - slope * sumX) / N;
  }
  
  // 3. Get last row parameters to copy forward
  let maxYear = 0;
  let lastPrice = 20.0;
  let lastOpex = 175.0;
  rows.forEach(r => {
    if (r.tahun > maxYear) maxYear = r.tahun;
  });
  
  // Let's find the actual last row data
  const lastRow = rows.find(r => r.tahun === maxYear);
  if (lastRow) {
    lastPrice = lastRow.harga_minyak_usd;
    lastOpex = lastRow.opex_usd;
  }
  
  // 4. Extend the rows array up to projYears
  let addedCount = 0;
  for (let y = maxYear + 1; y <= projYears; y++) {
    // Predict production
    let predProd = 0;
    if (isExpo) {
      predProd = Math.exp(intercept) * Math.exp(slope * y);
    } else {
      predProd = Math.max(0, slope * y + intercept);
    }
    
    // Add row
    const id = rowIdCounter++;
    rows.push({
      _id: id,
      tahun: y,
      produksi_mbbl: parseFloat(predProd.toFixed(3)),
      harga_minyak_usd: lastPrice,
      capital_usd: 0.0,
      non_capital_usd: 0.0,
      opex_usd: lastOpex
    });
    addedCount++;
  }
  
  // Sort rows by year
  rows.sort((a, b) => a.tahun - b.tahun);
  renderTable();
  
  // Store the regression params in global state for charting
  window.regressionParams = {
    type: isExpo ? 'expo' : 'linear',
    slope,
    intercept,
    peakYear,
    isExpo
  };
  
  showToast(`✓ Berhasil memproyeksikan data. Ditambahkan ${addedCount} baris baru (Tahun ${maxYear + 1} - ${projYears})`);
  
  // Automatically run calculation to update tables & charts!
  runCalculation();
}

function projectProductionLinearRegression() {
  collectRows();
  
  // ambil data yang belum diprediksi aja
  const originalPoints = rows.filter(r => r.tahun > 0 && !r.is_predicted);
  if (originalPoints.length < 2) {
    showToast('❌ Butuh minimal 2 baris data produksi asli (belum diprediksi) untuk regresi', 'error');
    return;
  }

  // cari tahun peak (puncak produksi)
  let peakRow = originalPoints.reduce((max, p) => p.produksi_mbbl > max.produksi_mbbl ? p : max, originalPoints[0]);
  let peakYear = peakRow.tahun;
  let points = originalPoints.filter(p => p.tahun >= peakYear);
  if (points.length < 2) points = originalPoints; // fallback
  
  const N = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  points.forEach(p => {
    const x = p.tahun;
    const y = p.produksi_mbbl;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });
  
  const denom = (N * sumX2 - sumX * sumX);
  if (Math.abs(denom) < 1e-9) {
    showToast('❌ Error perhitungan regresi linear', 'error');
    return;
  }
  
  const slope = (N * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / N;
  
  document.getElementById('linear-reg-info').innerHTML = `Slope: ${slope.toFixed(2)}, Intercept: ${intercept.toFixed(2)}`;
  
  let maxYear = Math.max(...rows.map(r => r.tahun));
  let lastPrice = 20.0;
  let lastOpex = 175.0;
  const lastRow = rows.find(r => r.tahun === maxYear);
  if (lastRow) {
    lastPrice = lastRow.harga_minyak_usd;
    lastOpex = lastRow.opex_usd;
  }
  
  let addedCount = 0;
  for (let y = maxYear + 1; y <= 20; y++) {
    let predProd = slope * y + intercept;
    // pastiin produksi ga negatif
    if (predProd < 0) predProd = 0;
    
    const id = rowIdCounter++;
    rows.push({
      _id: id,
      tahun: y,
      produksi_mbbl: parseFloat(predProd.toFixed(3)),
      harga_minyak_usd: lastPrice,
      capital_usd: 0.0,
      non_capital_usd: 0.0,
      opex_usd: lastOpex,
      is_predicted: true
    });
    addedCount++;
  }
  
  rows.sort((a, b) => a.tahun - b.tahun);
  renderTable();
  
  window.regressionParams = {
    type: 'linear',
    slope,
    intercept,
    peakYear: 0,
    isExpo: false
  };
  
  showToast(`Proyeksi Linear berhasil. Slope: ${slope.toFixed(2)}, Intercept: ${intercept.toFixed(2)}`);
  runCalculation();
}

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
