let report;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const money = value => `${report.currency} ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = value => `${Number(value || 0).toFixed(2)}%`;

function ensurePeakReportShell() {
  // Handles stale GitHub Pages/browser cache where an older index.html loads the newer data/app.
  // If the expected peak-price DOM is missing, rebuild the page shell before rendering.
  if ($('#peak-card-grid') && $('#peak-row-body') && $('#status-callout')) return;

  document.body.innerHTML = `
    <header class="hero">
      <nav class="topbar"><a href="#summary">Summary</a><a href="#peaks">Peak prices</a><a href="#rows">Raw checks</a><a href="#workflow">Action</a></nav>
      <div class="hero-grid">
        <div>
          <p class="eyebrow">Sales Excel · Category peak price detector</p>
          <h1>Category Peak Prices</h1>
          <p class="lead">Find the highest unit price in each category, then jump to the raw document and party to investigate.</p>
          <div class="actions"><a class="button primary" href="#peaks">Review category peaks</a><a class="button" href="data/category-peak-prices.csv" download>Download peak rows CSV</a></div>
        </div>
        <aside class="hero-card" id="run-card"></aside>
      </div>
    </header>
    <main>
      <section id="summary" class="section">
        <div class="section-heading"><p class="eyebrow">Peak-price summary</p><h2>Highest calculated unit price per product category.</h2></div>
        <div class="cards" id="metric-cards"></div>
        <div id="status-callout" class="callout"></div>
      </section>
      <section id="peaks" class="section panel">
        <div class="section-heading"><p class="eyebrow">Category peak cards</p><h2>Peak price, comparison point, and rows to check.</h2></div>
        <div id="peak-card-grid" class="peak-grid"></div>
        <div class="chart-grid">
          <article class="chart-card"><h3>Peak price by category</h3><div id="product-chart" class="chart"></div></article>
          <article class="chart-card"><h3>Peak rows by station</h3><div id="station-chart" class="chart"></div></article>
        </div>
      </section>
      <section id="rows" class="section">
        <div class="section-heading split">
          <div><p class="eyebrow">Raw document check list</p><h2>Every row tied at category peak price.</h2></div>
          <div class="controls"><select id="product-filter"><option value="all">All categories</option></select><select id="station-filter"><option value="all">All stations</option></select><input id="search" type="search" placeholder="Search document, station, party…" /></div>
        </div>
        <div class="table-wrap">
          <table><thead><tr><th>Category</th><th>Peak unit price</th><th>Date</th><th>Station / owner</th><th>Qty</th><th>Gross revenue</th><th>Raw document to check</th><th>Next action</th></tr></thead><tbody id="peak-row-body"></tbody></table>
        </div>
        <p class="hint">Click a row for the full investigation checklist.</p>
      </section>
      <section id="workflow" class="section panel">
        <div class="section-heading"><p class="eyebrow">Action workflow</p><h2>How to use the peak-price report.</h2></div>
        <ol id="workflow-list"></ol>
        <div class="callout"><strong>Rule:</strong> <span id="rule-summary"></span></div>
      </section>
    </main>
    <dialog id="row-dialog"><button class="close" aria-label="Close dialog">×</button><div id="dialog-content"></div></dialog>
    <footer><p>Generated from <code>Sales_Master_Consolidated_May26.xlsx</code>. DPO report remains unchanged.</p></footer>`;
}

function renderRun() {
  $('#run-card').innerHTML = `<dl>
    <div><dt>Source workbook</dt><dd>${esc(report.sourceWorkbook)}</dd></div>
    <div><dt>Period</dt><dd>${esc(report.period)}</dd></div>
    <div><dt>Currency</dt><dd>${esc(report.currency)}</dd></div>
    <div><dt>Peak rule</dt><dd>Highest unit price per category</dd></div>
    <div><dt>Output</dt><dd>Raw document + owner follow-up list</dd></div>
  </dl>`;
}

function renderCards() {
  const cards = [
    ['Categories checked', report.metrics.categoriesChecked, 'Product categories in workbook'],
    ['Peak rows', report.metrics.peakRows, 'Rows tied at category peak'],
    ['Premium peaks', report.metrics.categoriesWithPremiumPeak, 'Categories where peak > median'],
    ['Rows checked', report.metrics.totalRows, 'Total source rows reviewed'],
  ];
  $('#metric-cards').innerHTML = cards.map(card => `<article class="metric-card"><div class="value">${esc(card[1])}</div><div class="label">${esc(card[0])}</div><div class="detail">${esc(card[2])}</div></article>`).join('');
}

function renderStatus() {
  const callout = $('#status-callout');
  if (report.metrics.categoriesWithPremiumPeak === 0) {
    callout.className = 'callout ok';
    callout.innerHTML = '<strong>No category has a premium peak above its median.</strong> Current data has flat unit pricing inside each category, so all rows in each category tie at the peak price.';
  } else {
    callout.className = 'callout warn';
    callout.innerHTML = `<strong>${report.metrics.categoriesWithPremiumPeak} category/categories have peak price above median.</strong> Start with those category cards and check the listed raw documents.`;
  }
}

function renderPeakCards() {
  $('#peak-card-grid').innerHTML = report.categoryPeaks.map(product => `<article class="peak-card">
    <p class="eyebrow">${esc(product.product)}</p>
    <div class="price">${money(product.peakUnitPrice)}</div>
    <div class="meta">Peak unit price · ${esc(product.peakRowCount)} row(s) tied</div>
    <ul><li>Median: ${money(product.medianUnitPrice)}</li><li>Min: ${money(product.minUnitPrice)}</li><li>Premium vs median: ${pct(product.premiumVsMedianPct)}</li></ul>
    <p class="hint">${esc(product.action)}</p>
  </article>`).join('');
}

function barChart(element, data, type) {
  const max = Math.max(...data.map(item => type === 'price' ? item.peak : item.peakRows), 1);
  element.innerHTML = data.map(item => {
    const value = type === 'price' ? item.peak : item.peakRows;
    const label = type === 'price' ? money(item.peak) : `${item.peakRows} row(s)`;
    return `<div class="bar-row"><div class="bar-label">${esc(item.label)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, value / max * 100)}%"></div></div><div class="bar-value">${label}</div></div>`;
  }).join('');
}

function filteredRows() {
  const product = $('#product-filter').value;
  const station = $('#station-filter').value;
  const query = $('#search').value.trim().toLowerCase();
  return report.peakRows.filter(row =>
    (product === 'all' || row.product === product) &&
    (station === 'all' || row.station === station) &&
    (!query || Object.values(row).join(' ').toLowerCase().includes(query))
  );
}

function renderTable() {
  const rows = filteredRows();
  $('#peak-row-body').innerHTML = rows.map(row => `<tr data-id="${esc(`${row.product}|${row.station}|${row.date}|${row.sourceDocument}`)}">
    <td><span class="badge">${esc(row.product)}</span></td>
    <td><strong>${money(row.unitPrice)}</strong></td>
    <td>${esc(row.date)}</td>
    <td><strong>${esc(row.station)}</strong><br><span class="hint">${esc(row.investigationParty)}</span></td>
    <td>${Number(row.qty).toLocaleString()}</td>
    <td>${money(row.grossRevenue)}</td>
    <td>${esc(row.sourceDocument)}</td>
    <td>${esc(row.investigationReason)}</td>
  </tr>`).join('') || '<tr><td colspan="8">No peak rows match this filter.</td></tr>';

  $$('#peak-row-body tr[data-id]').forEach(row => row.addEventListener('click', () => showRow(row.dataset.id)));
}

function showRow(id) {
  const [product, station, date, sourceDocument] = id.split('|');
  const row = report.peakRows.find(item => item.product === product && item.station === station && item.date === date && item.sourceDocument === sourceDocument);
  if (!row) return;
  const peak = report.categoryPeaks.find(item => item.product === row.product);
  $('#dialog-content').innerHTML = `<p class="eyebrow">Category peak row</p><h2>${esc(row.product)} · ${esc(row.station)} · ${esc(row.date)}</h2>
    <div class="detail-grid">
      <div class="detail"><div class="k">Peak unit price</div><div class="v">${money(row.unitPrice)}</div></div>
      <div class="detail"><div class="k">Category median</div><div class="v">${money(peak?.medianUnitPrice)}</div></div>
      <div class="detail"><div class="k">Premium vs median</div><div class="v">${pct(peak?.premiumVsMedianPct)}</div></div>
      <div class="detail"><div class="k">Gross revenue / qty</div><div class="v">${money(row.grossRevenue)} / ${Number(row.qty).toLocaleString()}</div></div>
      <div class="detail"><div class="k">Raw document</div><div class="v">${esc(row.sourceDocument)}</div></div>
      <div class="detail"><div class="k">Investigation party</div><div class="v">${esc(row.investigationParty)}<br>${esc(row.secondaryParty)}</div></div>
    </div>
    <ol>${row.recommendedChecks.map(check => `<li>${esc(check)}</li>`).join('')}</ol>`;
  $('#row-dialog').showModal();
}

function initFilters() {
  for (const product of [...new Set(report.peakRows.map(row => row.product))].sort()) {
    $('#product-filter').insertAdjacentHTML('beforeend', `<option>${esc(product)}</option>`);
  }
  for (const station of [...new Set(report.peakRows.map(row => row.station))].sort()) {
    $('#station-filter').insertAdjacentHTML('beforeend', `<option>${esc(station)}</option>`);
  }
  $('#product-filter').addEventListener('change', renderTable);
  $('#station-filter').addEventListener('change', renderTable);
  $('#search').addEventListener('input', renderTable);
}

function init() {
  ensurePeakReportShell();
  renderRun();
  renderCards();
  renderStatus();
  renderPeakCards();
  barChart($('#product-chart'), report.charts.products, 'price');
  barChart($('#station-chart'), report.charts.stations, 'rows');
  $('#workflow-list').innerHTML = report.actionWorkflow.map(item => `<li>${esc(item)}</li>`).join('');
  $('#rule-summary').textContent = report.ruleSummary;
  initFilters();
  renderTable();
  $('.close').addEventListener('click', () => $('#row-dialog').close());
  $('#row-dialog').addEventListener('click', event => { if (event.target.id === 'row-dialog') event.target.close(); });
}

fetch('data/report-data.json?version=peak-20260522-2')
  .then(response => {
    if (!response.ok) throw new Error(`Failed to load report data: ${response.status}`);
    return response.json();
  })
  .then(data => {
    report = data;
    init();
  })
  .catch(error => {
    document.body.innerHTML = `<main class="section"><h1>Report data failed to load</h1><p>${esc(error.message)}</p></main>`;
  });
