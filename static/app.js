// ── State ────────────────────────────────────────────────────────────────────
let rows = [];
let lastResult = null;
let ncfChart = null;
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
  currentProjectId = null;
  loadProjectsList();
}

function goToProject(id){
  currentProjectId = id;
  document.getElementById('page-projects').style.display = 'none';
  document.getElementById('page-detail').style.display = '';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('btn-export').disabled = true;
  lastResult = null;
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
      return;
    }

    grid.style.display = '';
    empty.style.display = 'none';

    grid.innerHTML = projects.map(p => {
      const date = new Date(p.updated_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
      const statusBadge = p.has_results
        ? '<span class="badge badge-green">✓ Calculated</span>'
        : '<span class="badge badge-orange">Draft</span>';
      return `
        <div class="project-card" onclick="goToProject('${p.id}')">
          <div class="project-card-actions">
            <button class="card-action-btn danger" onclick="event.stopPropagation();deleteProject('${p.id}','${p.name.replace(/'/g,"\\'")}')">🗑</button>
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
  } catch(e){
    showToast('❌ Gagal memuat projects: ' + e.message, 'error');
  }
}

function escHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function createProject(){
  const name = document.getElementById('modal-name').value.trim();
  if(!name){ showToast('❌ Nama project tidak boleh kosong', 'error'); return; }
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
    showToast('✓ Project "' + name + '" berhasil dibuat');
    goToProject(data.id);
  } catch(e){
    showToast('❌ ' + e.message, 'error');
  }
}

async function deleteProject(id, name){
  if(!confirm(`Hapus project "${name}"?`)) return;
  try {
    await fetch(`/api/projects/${id}`, {method:'DELETE'});
    showToast('✓ Project berhasil dihapus');
    loadProjectsList();
  } catch(e){
    showToast('❌ Gagal menghapus', 'error');
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
    }

    // If has results, render them
    if(p.last_result){
      lastResult = p.last_result;
      renderResults(p.last_result);
      document.getElementById('btn-export').disabled = false;
    }
  } catch(e){
    showToast('❌ ' + e.message, 'error');
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
    showToast('✓ Data project berhasil disimpan');
  } catch(e){
    showToast('❌ ' + e.message, 'error');
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

function removeRow(id){
  rows = rows.filter(r=>r._id !== id);
  renderTable();
}

function clearAll(){
  rows = [];
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
      <td class="col-del"><button class="del-btn" onclick="removeRow(${r._id})" title="Hapus baris">×</button></td>
    </tr>
  `).join('');
  document.getElementById('row-count').textContent = rows.length + ' baris';
}

// ── Example Data ─────────────────────────────────────────────────────────────
function loadExample(){
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
    showToast(`✓ ${data.count} baris berhasil diimport`);
  } catch(e){
    showToast('❌ ' + e.message, 'error');
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
    showToast('❌ Minimal butuh 2 baris data (tahun 0 + minimal 1 tahun produksi)', 'error');
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
    showToast('✓ Perhitungan selesai');
  } catch(e){
    showToast('❌ ' + e.message, 'error');
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
  document.getElementById('verdict-icon').textContent = feasible ? '✅' : '❌';
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
      <td style="color:var(--muted)">${fmt(r.discount_factor,4)}</td>
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
}

function renderChart(cf){
  const labels = cf.map(r=>r.tahun===0?'Thn 0':'Thn '+r.tahun);
  const ncfData = cf.map(r=>r.ncf_undiscounted);
  const cumData = cf.map(r=>r.cumulative_ncf);
  const discData = cf.map(r=>r.ncf_discounted||0);

  if(ncfChart) ncfChart.destroy();
  const ctx = document.getElementById('ncf-chart').getContext('2d');
  ncfChart = new Chart(ctx, {
    data:{
      labels,
      datasets:[
        {
          type:'bar', label:'NCF Undiscounted ($)',
          data: ncfData,
          backgroundColor: ncfData.map(v=>v>=0?'rgba(34,197,94,.7)':'rgba(239,68,68,.7)'),
          borderColor: ncfData.map(v=>v>=0?'#22c55e':'#ef4444'),
          borderWidth:1, yAxisID:'y',
        },
        {
          type:'line', label:'Kumulatif NCF ($)',
          data: cumData,
          borderColor:'#f5a623', backgroundColor:'rgba(245,166,35,.1)',
          borderWidth:2, fill:true, tension:.3, pointRadius:4,
          pointBackgroundColor:'#f5a623', yAxisID:'y',
        },
        {
          type:'line', label:'NCF Discounted ($)',
          data: discData,
          borderColor:'#38bdf8', borderWidth:1.5, borderDash:[4,3],
          pointRadius:3, pointBackgroundColor:'#38bdf8',
          fill:false, tension:.3, yAxisID:'y',
        }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:true,
      plugins:{
        legend:{ labels:{ color:'#e8ecf0', font:{family:'Space Mono',size:11} } },
        tooltip:{
          backgroundColor:'#181c22', borderColor:'#2a313c', borderWidth:1,
          titleColor:'#f5a623', bodyColor:'#e8ecf0',
          callbacks:{ label(ctx){ return ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('id-ID',{minimumFractionDigits:1})}` } }
        }
      },
      scales:{
        x:{ ticks:{color:'#7a8799', font:{family:'Space Mono', size:10}}, grid:{color:'#2a313c'} },
        y:{ ticks:{color:'#7a8799', font:{family:'Space Mono', size:10}, callback:v=>v.toLocaleString('id-ID',{maximumFractionDigits:0})}, grid:{color:'#2a313c'} }
      }
    }
  });
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(id, el){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(id).classList.add('active');
}

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
    showToast('✓ File CSV berhasil didownload');
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
  showToast('✓ File CSV berhasil didownload');
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
