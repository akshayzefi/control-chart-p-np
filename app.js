/*
 * Attribute Control Charts — P & NP
 * Plain JavaScript implementation for an industrial engineering lab.
 * Sections: data loading/parsing, SPC logic, chart rendering, DOM events.
 */

const DEFAULT_ROWS = [
  { label: "Day 01", n: 100, d: 5 }, { label: "Day 02", n: 120, d: 4 },
  { label: "Day 03", n: 90, d: 3 }, { label: "Day 04", n: 110, d: 6 },
  { label: "Day 05", n: 100, d: 4 }, { label: "Day 06", n: 140, d: 7 },
  { label: "Day 07", n: 80, d: 2 }, { label: "Day 08", n: 100, d: 5 },
  { label: "Day 09", n: 130, d: 8 }, { label: "Day 10", n: 95, d: 4 }
];

const PISTON_ROWS = [
  { label: "Batch 01", n: 250, d: 10 }, { label: "Batch 02", n: 300, d: 13 },
  { label: "Batch 03", n: 275, d: 11 }, { label: "Batch 04", n: 320, d: 16 },
  { label: "Batch 05", n: 240, d: 9 }, { label: "Batch 06", n: 290, d: 14 },
  { label: "Batch 07", n: 260, d: 12 }, { label: "Batch 08", n: 310, d: 15 },
  { label: "Batch 09", n: 280, d: 14 }, { label: "Batch 10", n: 350, d: 19 },
  { label: "Batch 11", n: 230, d: 8 }, { label: "Batch 12", n: 300, d: 14 },
  { label: "Batch 13", n: 270, d: 10 }, { label: "Batch 14", n: 340, d: 16 },
  { label: "Batch 15", n: 255, d: 11 }, { label: "Batch 16", n: 315, d: 15 }
];

const ANTIBIOTIC_ROWS = [
  { label: "Week 01", n: 500, d: 19 }, { label: "Week 02", n: 500, d: 22 },
  { label: "Week 03", n: 500, d: 18 }, { label: "Week 04", n: 500, d: 21 },
  { label: "Week 05", n: 500, d: 20 }, { label: "Week 06", n: 500, d: 24 },
  { label: "Week 07", n: 500, d: 22 }, { label: "Week 08", n: 500, d: 23 },
  { label: "Week 09", n: 500, d: 20 }, { label: "Week 10", n: 500, d: 19 },
  { label: "Week 11", n: 500, d: 25 }, { label: "Week 12", n: 500, d: 21 },
  { label: "Week 13", n: 500, d: 23 }, { label: "Week 14", n: 500, d: 27 },
  { label: "Week 15", n: 500, d: 24 }, { label: "Week 16", n: 500, d: 44 }
];

let subgroups = DEFAULT_ROWS.map(row => ({ ...row }));
let chartInstance = null;
let lastResult = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const formatPercent = (value) => `${(value * 100).toFixed(2)}%`;
const formatNumber = (value, digits = 3) => Number(value).toFixed(digits);
const THEME_STORAGE_KEY = "attribute-chart-theme";

function getInitialTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (error) {
    return "light";
  }
}

function applyTheme(theme, persist = false) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  if (persist) {
    try { localStorage.setItem(THEME_STORAGE_KEY, nextTheme); } catch (error) { /* Storage may be unavailable in private browsing. */ }
  }
  const toggle = $("#theme-toggle");
  if (toggle) {
    const dark = nextTheme === "dark";
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    toggle.querySelector(".theme-toggle-icon").textContent = dark ? "☀" : "☾";
    toggle.querySelector(".theme-toggle-label").textContent = dark ? "Light" : "Dark";
  }
  if (lastResult) renderChart(lastResult);
}

document.documentElement.dataset.theme = getInitialTheme();

// -----------------------------
// Data parsing and loading
// -----------------------------
function loadDemoPistonData() {
  subgroups = PISTON_ROWS.map(row => ({ ...row }));
  renderInputRows();
  showMessage("Piston manufacturing sample loaded. Compute the p-chart when ready.", "success");
}

function loadDemoAntibioticData() {
  subgroups = ANTIBIOTIC_ROWS.map(row => ({ ...row }));
  renderInputRows();
  showMessage("Antibiotic manufacturing sample loaded. Compute the np-chart when ready.", "success");
}

function resetData() {
  subgroups = DEFAULT_ROWS.map(row => ({ ...row }));
  renderInputRows();
  showMessage("Rows reset to a small starter sample.", "success");
}

function parseTabularRows(rows, sourceName = "dataset") {
  const nonEmptyRows = rows.filter(row => row.some(cell => String(cell ?? "").trim()));
  if (!nonEmptyRows.length) throw new Error(`No rows found in the ${sourceName}.`);

  const parsed = [];
  nonEmptyRows.forEach((cells, index) => {
    const normalized = cells.map(cell => String(cell ?? "").trim().replace(/^['"]|['"]$/g, ""));
    const looksLikeHeader = index === 0 && /label/i.test(normalized[0]) && /n/i.test(normalized[1]) && /d/i.test(normalized[2]);
    if (looksLikeHeader) return;
    if (normalized.length < 3) throw new Error(`${sourceName} row ${index + 1} needs three values: Label,n,d.`);
    const [label, nText, dText] = normalized;
    const n = Number(nText);
    const d = Number(dText);
    if (!label || !Number.isFinite(n) || !Number.isFinite(d)) throw new Error(`${sourceName} row ${index + 1} contains an invalid value.`);
    parsed.push({ label, n, d });
  });
  if (!parsed.length) throw new Error(`No data rows found in the ${sourceName} after the header.`);
  return validateSubgroups(parsed);
}

function parseCSV(text) {
  const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => line.split(","));
  if (!rows.length) throw new Error("Paste at least one row of CSV data.");
  return parseTabularRows(rows, "CSV file");
}

function parseExcel(buffer) {
  if (typeof XLSX === "undefined") throw new Error("The Excel parser is still loading. Please try again in a moment.");
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("The Excel workbook does not contain a readable sheet.");
  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
  return parseTabularRows(rows, "Excel workbook");
}

async function importDataFile(file) {
  if (!file) return;
  const extension = file.name.split(".").pop().toLowerCase();
  try {
    const imported = extension === "csv" ? parseCSV(await file.text()) : parseExcel(await file.arrayBuffer());
    subgroups = imported;
    renderInputRows();
    switchTab("manual");
    computeChart();
    $("#file-import-status").textContent = `${file.name} loaded · ${imported.length} subgroup${imported.length === 1 ? "" : "s"} analyzed.`;
    showMessage("Imported data calculated successfully.", "success");
  } catch (error) {
    $("#file-import-status").textContent = "Import failed. Check the file format and required columns.";
    showMessage(error.message);
  }
}

function validateSubgroups(rows) {
  if (!rows.length) throw new Error("Add at least one subgroup before computing.");
  return rows.map((row, index) => {
    const label = String(row.label || `Row ${index + 1}`).trim();
    const n = Number(row.n);
    const d = Number(row.d);
    if (!label) throw new Error(`Row ${index + 1} needs a subgroup label.`);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${label}: sample size n must be a positive whole number.`);
    if (!Number.isInteger(d) || d < 0 || d > n) throw new Error(`${label}: defectives d must be a whole number from 0 to n.`);
    return { label, n, d };
  });
}

function renderInputRows() {
  const tbody = $("#input-rows");
  tbody.innerHTML = subgroups.map((row, index) => `
    <tr data-row-index="${index}">
      <td><input aria-label="Subgroup label ${index + 1}" data-field="label" type="text" value="${escapeHtml(row.label)}" /></td>
      <td><input aria-label="Sample size for ${escapeHtml(row.label)}" data-field="n" type="number" min="1" step="1" value="${row.n}" /></td>
      <td><input aria-label="Defectives for ${escapeHtml(row.label)}" data-field="d" type="number" min="0" step="1" value="${row.d}" /></td>
      <td><button class="remove-row" type="button" aria-label="Remove ${escapeHtml(row.label)}" title="Remove row">×</button></td>
    </tr>`).join("");
  $("#row-count").textContent = `${subgroups.length} subgroup${subgroups.length === 1 ? "" : "s"}`;
  tbody.querySelectorAll("input").forEach(input => input.addEventListener("input", updateRowsFromDOM));
  tbody.querySelectorAll(".remove-row").forEach(button => button.addEventListener("click", (event) => {
    const index = Number(event.currentTarget.closest("tr").dataset.rowIndex);
    subgroups.splice(index, 1);
    renderInputRows();
  }));
}

function updateRowsFromDOM() {
  subgroups = $$("#input-rows tr").map(row => ({
    label: row.querySelector('[data-field="label"]').value,
    n: row.querySelector('[data-field="n"]').value,
    d: row.querySelector('[data-field="d"]').value
  }));
  $("#row-count").textContent = `${subgroups.length} subgroup${subgroups.length === 1 ? "" : "s"}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

// -----------------------------
// Statistical process control logic
// -----------------------------
function computePChart(rows) {
  const totalN = rows.reduce((sum, row) => sum + row.n, 0);
  const totalD = rows.reduce((sum, row) => sum + row.d, 0);
  const pBar = totalD / totalN;
  const results = rows.map(row => {
    const p = row.d / row.n;
    const sigma = Math.sqrt((pBar * (1 - pBar)) / row.n);
    const UCL = pBar + 3 * sigma;
    const LCL = Math.max(0, pBar - 3 * sigma);
    return { ...row, p, CL: pBar, UCL, LCL, expected: row.n * pBar, isOutOfControl: p > UCL || p < LCL };
  });
  return { type: "p", pBar, results, lowExpected: results.some(row => row.expected < 5) };
}

function computeNPChart(rows) {
  const n = rows[0].n;
  const totalD = rows.reduce((sum, row) => sum + row.d, 0);
  const pBar = totalD / (rows.length * n);
  const npBar = n * pBar;
  const sigma = Math.sqrt(n * pBar * (1 - pBar));
  const UCL = npBar + 3 * sigma;
  const LCL = Math.max(0, npBar - 3 * sigma);
  const results = rows.map(row => ({ ...row, p: row.d / row.n, CL: npBar, UCL, LCL, expected: npBar, isOutOfControl: row.d > UCL || row.d < LCL }));
  return { type: "np", n, pBar, npBar, sigma, UCL, LCL, results, lowExpected: false };
}

function findRuns(points, centerLine) {
  const runs = [];
  let direction = null;
  let start = 0;
  points.forEach((point, index) => {
    const nextDirection = point === centerLine ? null : point > centerLine ? "above" : "below";
    if (nextDirection && nextDirection === direction) return;
    if (direction && index - start >= 8) runs.push({ direction, start: start + 1, end: index });
    direction = nextDirection;
    start = index;
  });
  if (direction && points.length - start >= 8) runs.push({ direction, start: start + 1, end: points.length });
  return runs;
}

// Western Electric rules use standardized distances from the center line.
// For a p-chart the sigma changes with n, so each subgroup gets its own z-score.
function detectWesternElectricRules(result) {
  const values = result.results.map(row => result.type === "p" ? row.p : row.d);
  const center = result.type === "p" ? result.pBar : result.npBar;
  const zScores = result.results.map((row, index) => {
    const sigma = result.type === "p"
      ? Math.sqrt((result.pBar * (1 - result.pBar)) / row.n)
      : result.sigma;
    return sigma > 0 ? (values[index] - center) / sigma : 0;
  });
  const rules = [
    { id: "Rule 1", name: "1 point beyond 3σ", indices: new Set(), description: "One point is outside the 3-sigma control limits." },
    { id: "Rule 2", name: "2 of 3 beyond 2σ", indices: new Set(), description: "Two of three consecutive points are beyond 2σ on the same side." },
    { id: "Rule 3", name: "4 of 5 beyond 1σ", indices: new Set(), description: "Four of five consecutive points are beyond 1σ on the same side." },
    { id: "Rule 4", name: "8 on one side", indices: new Set(), description: "Eight consecutive points fall on the same side of the center line." }
  ];

  zScores.forEach((z, index) => {
    if (Math.abs(z) > 3) rules[0].indices.add(index);
  });
  for (let end = 2; end < zScores.length; end += 1) {
    const window = zScores.slice(end - 2, end + 1);
    ["above", "below"].forEach(side => {
      const hits = window.filter(z => side === "above" ? z > 2 : z < -2);
      if (hits.length >= 2) window.forEach((z, offset) => { if (side === "above" ? z > 2 : z < -2) rules[1].indices.add(end - 2 + offset); });
    });
  }
  for (let end = 4; end < zScores.length; end += 1) {
    const window = zScores.slice(end - 4, end + 1);
    ["above", "below"].forEach(side => {
      const hits = window.filter(z => side === "above" ? z > 1 : z < -1);
      if (hits.length >= 4) window.forEach((z, offset) => { if (side === "above" ? z > 1 : z < -1) rules[2].indices.add(end - 4 + offset); });
    });
  }
  for (let end = 7; end < zScores.length; end += 1) {
    const window = zScores.slice(end - 7, end + 1);
    if (window.every(z => z > 0) || window.every(z => z < 0)) window.forEach((z, offset) => { if (z !== 0) rules[3].indices.add(end - 7 + offset); });
  }

  const triggered = rules.filter(rule => rule.indices.size > 0);
  result.results.forEach(row => { row.ruleFlags = []; });
  triggered.forEach(rule => rule.indices.forEach(index => result.results[index].ruleFlags.push(rule.id)));
  result.results.forEach(row => { row.isFlagged = row.isOutOfControl || row.ruleFlags.length > 0; });
  return { rules, triggered, zScores };
}

function setExportEnabled(enabled) {
  ["#export-png", "#export-csv", "#export-pdf"].forEach(selector => { $(selector).disabled = !enabled; });
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCSV() {
  if (!lastResult) return;
  const header = ["label", "n", "d", "value", "CL", "UCL", "LCL", "z_score", "western_electric_rules", "signal"];
  const rows = lastResult.results.map((row, index) => [
    row.label, row.n, row.d, lastResult.type === "p" ? row.p : row.d, row.CL, row.UCL, row.LCL,
    lastResult.westernElectric.zScores[index], row.ruleFlags.join("; "), row.isFlagged ? "Investigate" : "In control"
  ]);
  const csv = [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
  downloadBlob(csv, `control-chart-${lastResult.type}-report.csv`, "text/csv;charset=utf-8");
}

function exportPNG() {
  if (!chartInstance) return;
  const link = document.createElement("a");
  link.download = `control-chart-${lastResult.type}.png`;
  link.href = chartInstance.toBase64Image("image/png", 1);
  link.click();
}

function exportPDF() {
  if (!lastResult || !window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const title = lastResult.type === "p" ? "p-chart statistical report" : "np-chart statistical report";
  doc.setTextColor(21, 34, 53);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Attribute Control Charts — P & NP", margin, 48);
  doc.setFontSize(12);
  doc.text(title, margin, 69);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 97, 116);
  doc.text(`Generated ${new Date().toLocaleString()} · ${lastResult.results.length} subgroups`, margin, 87);
  const summary = lastResult.type === "p"
    ? `p-bar: ${formatPercent(lastResult.pBar)} · Beyond limits: ${lastResult.results.filter(row => row.isOutOfControl).length}`
    : `p-bar: ${formatPercent(lastResult.pBar)} · np-bar: ${formatNumber(lastResult.npBar)} · Limits: ${formatNumber(lastResult.LCL)}–${formatNumber(lastResult.UCL)}`;
  doc.setTextColor(21, 34, 53);
  doc.text(summary, margin, 112);
  const tableRows = lastResult.results.map((row, index) => [
    row.label, row.n, row.d, lastResult.type === "p" ? formatPercent(row.p) : row.d,
    lastResult.type === "p" ? formatPercent(row.CL) : formatNumber(row.CL),
    lastResult.type === "p" ? formatPercent(row.UCL) : formatNumber(row.UCL),
    lastResult.type === "p" ? formatPercent(row.LCL) : formatNumber(row.LCL), row.ruleFlags.join(", ") || "—"
  ]);
  if (typeof doc.autoTable === "function") {
    doc.autoTable({ startY: 128, head: [["Label", "n", "d", lastResult.type === "p" ? "p" : "d", "CL", "UCL", "LCL", "Rules"]], body: tableRows, theme: "grid", styles: { fontSize: 7, cellPadding: 4, textColor: [80, 97, 116] }, headStyles: { fillColor: [23, 105, 224], textColor: 255 }, alternateRowStyles: { fillColor: [246, 249, 252] } });
  }
  const ruleStart = (doc.lastAutoTable?.finalY || 220) + 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Western Electric rules", margin, ruleStart);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const ruleLines = lastResult.westernElectric.rules.map(rule => `${rule.id}: ${rule.name} — ${rule.indices.size ? `${Array.from(rule.indices).map(index => lastResult.results[index].label).join(", ")}` : "not triggered"}`);
  doc.text(ruleLines, margin, ruleStart + 15, { maxWidth: 510, lineHeightFactor: 1.55 });
  doc.save(`control-chart-${lastResult.type}-report.pdf`);
}

// -----------------------------
// Chart and result rendering
// -----------------------------
function renderChart(result) {
  if (typeof Chart === "undefined") return;
  const dark = document.documentElement.dataset.theme === "dark";
  const chartBlue = dark ? "#78adff" : "#1769e0";
  const chartInk = dark ? "#dce7f3" : "#152235";
  const chartRed = dark ? "#ff8585" : "#df4f4f";
  const chartMuted = dark ? "#91a0b2" : "#8190a0";
  const chartGrid = dark ? "rgba(216, 231, 243, .11)" : "#edf1f5";
  const labels = result.results.map(row => row.label);
  const values = result.results.map(row => result.type === "p" ? row.p : row.d);
  const points = result.results.map(row => row.isFlagged ? chartRed : chartBlue);
  const dashed = { borderDash: [6, 5], borderWidth: 1.4, pointRadius: 0, fill: false, tension: 0 };
  const datasets = [
    { label: result.type === "p" ? "Proportion defective" : "Defectives", data: values, borderColor: chartBlue, backgroundColor: points, pointBackgroundColor: points, pointBorderColor: points, pointRadius: 4, pointHoverRadius: 6, borderWidth: 1.8, tension: .24 },
    { label: "CL", data: result.results.map(row => row.CL), borderColor: chartInk, ...dashed },
    { label: "UCL", data: result.results.map(row => row.UCL), borderColor: chartRed, ...dashed },
    { label: "LCL", data: result.results.map(row => row.LCL), borderColor: chartRed, ...dashed }
  ];
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart($("#control-chart"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: dark ? "#e8f0f8" : "#152235", titleColor: dark ? "#152235" : "#ffffff", bodyColor: dark ? "#334861" : "#ffffff", padding: 10, cornerRadius: 8, titleFont: { size: 11 }, bodyFont: { size: 11 }, callbacks: { label: context => `${context.dataset.label}: ${result.type === "p" && context.datasetIndex === 0 ? formatPercent(context.parsed.y) : formatNumber(context.parsed.y, 3)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: chartMuted, font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { beginAtZero: true, grid: { color: chartGrid }, ticks: { color: chartMuted, font: { size: 9 }, callback: value => result.type === "p" ? `${(value * 100).toFixed(0)}%` : value } }
      }
    }
  });
  $("#chart-empty").style.display = "none";
}

function renderStats(result) {
  const outCount = result.results.filter(row => row.isOutOfControl).length;
  const stats = result.type === "p" ? [
    ["Chart", "p-chart", "Variable sample size"],
    ["p̄", formatPercent(result.pBar), `${result.results.length} subgroups`],
    ["Beyond limits", String(outCount), outCount ? "Investigate signal" : "No special-cause signal"],
    result.lowExpected ? ["Approximation", "Check", "Some n × p̄ < 5"] : ["Approximation", "Sound", "All n × p̄ ≥ 5"]
  ] : [
    ["Chart", "np-chart", `Constant n = ${result.n}`],
    ["p̄", formatPercent(result.pBar), `${result.results.length} subgroups`],
    ["np̄", formatNumber(result.npBar), `σ = ${formatNumber(result.sigma)}`],
    ["Limits", `${formatNumber(result.LCL)} — ${formatNumber(result.UCL)}`, `${outCount} beyond limit${outCount === 1 ? "" : "s"}`]
  ];
  $("#stats-grid").innerHTML = stats.map((stat, index) => `<div class="stat-tile ${result.type === "p" && index === 3 && result.lowExpected ? "stat-warning" : ""}"><span class="stat-label">${stat[0]}</span><strong>${stat[1]}</strong><span class="stat-detail">${stat[2]}</span></div>`).join("");
}

function renderResultsTable(result) {
  const rows = result.results.slice(0, 10);
  const valueLabel = result.type === "p" ? "p" : "d";
  $("#table-unit").textContent = result.type === "p" ? "PROPORTION" : "COUNT";
  $("#table-caption").textContent = result.results.length > 10 ? "Showing the first 10 rows." : `Showing all ${result.results.length} rows.`;
  $("#results-head").innerHTML = `<tr><th scope="col">Label</th><th scope="col">n</th><th scope="col">d</th><th scope="col">${valueLabel}</th><th scope="col">CL</th><th scope="col">UCL</th><th scope="col">LCL</th><th scope="col">Signal</th></tr>`;
  $("#results-body").innerHTML = rows.map(row => `<tr><td title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</td><td>${row.n}</td><td>${row.d}</td><td>${result.type === "p" ? formatPercent(row.p) : row.d}</td><td>${result.type === "p" ? formatPercent(row.CL) : formatNumber(row.CL)}</td><td>${result.type === "p" ? formatPercent(row.UCL) : formatNumber(row.UCL)}</td><td>${result.type === "p" ? formatPercent(row.LCL) : formatNumber(row.LCL)}</td><td><span class="signal ${row.isFlagged ? "out" : ""}">${row.isFlagged ? (row.ruleFlags.join(" / ") || "Investigate") : "In control"}</span></td></tr>`).join("");
}

function renderInterpretation(result) {
  const outRows = result.results.filter(row => row.isOutOfControl);
  const advanced = result.westernElectric;
  const typeText = result.type === "p" ? `p-chart (variable sample size)` : `np-chart (constant n = ${result.n})`;
  let text = `Chart type: ${typeText}. `;
  if (!outRows.length) text += `No points beyond the control limits; the process appears in statistical control around ${formatPercent(result.pBar)} defective.`;
  else text += `${outRows.length} point${outRows.length === 1 ? "" : "s"} beyond the control limits: ${outRows.map(row => row.label).join(", ")}. Investigate potential special causes before changing the process.`;
  if (advanced.triggered.length) text += ` Western Electric signal${advanced.triggered.length === 1 ? "" : "s"} detected: ${advanced.triggered.map(rule => rule.id).join(", ")}.`;
  $("#interpretation-text").textContent = text;
  const tags = [];
  tags.push(`<span class="tag ${outRows.length ? "tag-alert" : ""}">${outRows.length ? `${outRows.length} out-of-control` : "No out-of-control points"}</span>`);
  if (advanced.triggered.length) tags.push(`<span class="tag tag-alert">${advanced.triggered.length} Western Electric rule${advanced.triggered.length === 1 ? "" : "s"}</span>`);
  if (result.type === "p" && result.lowExpected) tags.push(`<span class="tag tag-muted">Low expected count warning</span>`);
  if (!advanced.triggered.length && !result.lowExpected) tags.push(`<span class="tag">Western Electric clear</span>`);
  $("#interpretation-tags").innerHTML = tags.join("");
  $("#advanced-rules").innerHTML = advanced.rules.map(rule => {
    const labels = Array.from(rule.indices).map(index => escapeHtml(result.results[index].label)).join(", ");
    return `<div class="advanced-rule ${rule.indices.size ? "alert" : ""}"><strong>${rule.id}</strong><span>${rule.name}: ${rule.indices.size ? labels : "not triggered"}</span></div>`;
  }).join("");
}

function showMessage(message, kind = "error") {
  const element = $("#form-message");
  element.textContent = message;
  element.style.color = kind === "success" ? "#15836f" : "var(--red)";
}

function computeChart() {
  try {
    updateRowsFromDOM();
    const rows = validateSubgroups(subgroups);
    const selectedType = $("input[name='chart-type']:checked").value;
    const allEqual = rows.every(row => row.n === rows[0].n);
    if (selectedType === "np" && !allEqual) throw new Error("np-chart needs a constant sample size n. Use Auto or Force p-chart for variable n.");
    const type = selectedType === "auto" ? (allEqual ? "np" : "p") : selectedType;
    lastResult = type === "p" ? computePChart(rows) : computeNPChart(rows);
    lastResult.westernElectric = detectWesternElectricRules(lastResult);
    const isP = lastResult.type === "p";
    $("#chart-badge").textContent = isP ? "p-chart / variable n" : "np-chart / constant n";
    $("#chart-badge").className = `chart-badge ${isP ? "is-p" : "is-np"}`;
    $("#chart-title").textContent = isP ? "Proportion defective by subgroup" : "Defectives by subgroup";
    $("#chart-subtitle").textContent = isP ? "Limits flex with each subgroup sample size." : `Limits are fixed at n = ${lastResult.n}.`;
    renderStats(lastResult);
    renderResultsTable(lastResult);
    renderInterpretation(lastResult);
    renderChart(lastResult);
    setExportEnabled(true);
    showMessage("Chart calculated from the current rows.", "success");
  } catch (error) {
    showMessage(error.message);
  }
}

// -----------------------------
// DOM event handlers
// -----------------------------
function switchTab(tabName) {
  $$(".tab").forEach(tab => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  $$(".tab-panel").forEach(panel => {
    const active = panel.id === `${tabName}-panel`;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(document.documentElement.dataset.theme);
  renderInputRows();
  $("#theme-toggle").addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
  });
  $$(".tab").forEach(tab => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
  $("#add-row").addEventListener("click", () => {
    updateRowsFromDOM();
    subgroups.push({ label: `Row ${subgroups.length + 1}`, n: 100, d: 0 });
    renderInputRows();
    const lastInput = $("#input-rows tr:last-child input");
    if (lastInput) lastInput.focus();
  });
  $("#reset-data").addEventListener("click", resetData);
  $("#parse-csv").addEventListener("click", () => {
    try {
      subgroups = parseCSV($("#csv-input").value);
      renderInputRows();
      switchTab("manual");
      showMessage(`${subgroups.length} CSV subgroup${subgroups.length === 1 ? "" : "s"} loaded into the table.`, "success");
    } catch (error) { showMessage(error.message); }
  });
  $("#csv-file").addEventListener("change", event => importDataFile(event.target.files[0]));
  $("#xlsx-file").addEventListener("change", event => importDataFile(event.target.files[0]));
  $("#demo-piston").addEventListener("click", () => { loadDemoPistonData(); switchTab("manual"); });
  $("#demo-antibiotic").addEventListener("click", () => { loadDemoAntibioticData(); switchTab("manual"); });
  $("#compute-chart").addEventListener("click", computeChart);
  $("#export-png").addEventListener("click", exportPNG);
  $("#export-csv").addEventListener("click", exportCSV);
  $("#export-pdf").addEventListener("click", exportPDF);
  setExportEnabled(false);
  computeChart();
});
