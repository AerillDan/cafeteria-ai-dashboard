// =============================================================================
// Spoilage Risk Dashboard: browser logic
// window.MODEL (model.js) holds the scikit-learn DecisionTreeRegressor trained in
// training/train_model.py, plus the survey weekday pattern and meal split.
// =============================================================================
const M = window.MODEL;
const ITEMS = M.options.items;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n, d = 1) => Number(n).toFixed(d);

const WEATHER_ICON = { "Clear": "☀️", "Heavy Rain": "🌧️" };
const PERIOD_LABEL = { "Regular Week": "Regular", "Exam Week": "Exam week", "Semester Break": "Break" };
const ACTION_ICON = ["🍽️", "🔥", "🏷️", "📉"];   // menu, pre-cook, promo, smaller order (vendor interview Q5)

// ---------- AI model 1: demand predictor (exported DecisionTreeRegressor) ----------
function encode(weather, period, item) {
  const on = new Set([`Weather_${weather}`, `Academic_Period_${period}`, `Item_Category_${item}`]);
  return M.model.feature_names.map((name) => (on.has(name) ? 1 : 0));
}

function treePredict(x) {
  const t = M.model;
  let node = 0;
  while (t.left[node] !== -1) node = x[t.feature[node]] <= t.threshold[node] ? t.left[node] : t.right[node];
  return t.value[node];
}

function forecast(weather, period, day) {
  const f = M.weekday_factor[day];                   // weekday pattern from the student survey
  return ITEMS.map((item) => ({
    item,
    normal: treePredict(encode("Clear", "Regular Week", item)) * f,
    predicted: treePredict(encode(weather, period, item)) * f,
  }));
}

// ---------- AI model 2: spoilage risk classifier (rule-based) ----------
function classifyRisk(stock, predicted, daysLeft) {
  if (stock > predicted && daysLeft <= 2) return "High";
  if (stock > predicted && daysLeft >= 3 && daysLeft <= 4) return "Medium";
  return "Low";
}

// ---------- controls ----------
function tomorrowWeekday() {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kuala_Lumpur", weekday: "long" })
    .format(new Date(Date.now() + 864e5));
}

function segmented(id, options, value, label = (o) => o) {
  $(id).innerHTML = options.map((o, i) => `
    <input type="radio" name="${id}" id="${id}${i}" value="${esc(o)}"${o === value ? " checked" : ""}>
    <label for="${id}${i}">${label(o)}</label>`).join("");
}
const segValue = (id) => document.querySelector(`input[name="${id}"]:checked`).value;

function buildControls() {
  segmented("weather", M.options.weather, "Clear", (o) => `${WEATHER_ICON[o] || ""} ${esc(o)}`);
  segmented("period", M.options.period, "Regular Week", (o) => esc(PERIOD_LABEL[o] || o));
  const tmr = tomorrowWeekday();
  $("day").innerHTML = M.options.weekdays.map((d) => `<option${d === tmr ? " selected" : ""}>${d}</option>`).join("");

  // Inventory rows (inputs + results in one table)
  $("inv").innerHTML = `<div class="inv-row head" role="row"><span>Item</span><span>In stock (kg)</span><span>Days left</span>
      <span>Needed tmrw</span><span>Extra stock</span><span>Risk</span></div>` +
    ITEMS.map((item, i) => {
      const [stock, days] = M.mock_inventory[item];
      return `<div class="inv-row" id="row${i}" role="row">
        <span class="name">${esc(item)}</span>
        <div class="c-stock"><span class="cell-label">In stock (kg)</span>
          <input type="number" id="stock${i}" min="0" max="200" step="0.5" value="${stock}" aria-label="${esc(item)} stock in kg"></div>
        <div class="c-days"><span class="cell-label">Days left</span>
          <input type="number" id="days${i}" min="0" max="30" step="1" value="${days}" aria-label="${esc(item)} days until expiry"></div>
        <div class="c-need num"><span class="cell-label">Needed tomorrow</span><span id="need${i}"></span></div>
        <div class="c-surplus num"><span class="cell-label">Extra stock</span><span id="surplus${i}"></span></div>
        <span class="pill" id="pill${i}"></span>
      </div>`;
    }).join("");

  const markStale = () => { $("stale").hidden = false; $("run").classList.add("pulse"); };
  document.querySelectorAll(".controls input, .controls select, .inv input").forEach((el) => {
    el.addEventListener("input", markStale);
    el.addEventListener("change", markStale);
  });
  $("run").addEventListener("click", run);
}

// ---------- chart (plain SVG, drawn at real width so text stays readable) ----------
let lastForecast = null;
function drawChart(fc) {
  const W = Math.max(300, Math.round($("chart").clientWidth || 640)), H = 250;
  const pad = { l: 30, r: 6, t: 22, b: 30 };
  const max = Math.ceil(Math.max(...fc.map((d) => Math.max(d.normal, d.predicted))) / 5) * 5 || 5;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const gw = (W - pad.l - pad.r) / fc.length, bw = Math.min(44, gw * 0.3);
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let v = 0; v <= max; v += max / 5) {
    s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/>`;
    s += `<text x="${pad.l - 7}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`;
  }
  fc.forEach((d, i) => {
    const cx = pad.l + gw * (i + 0.5);
    [[d.normal, "var(--bar-normal)", -1, ""], [d.predicted, "var(--bar-ai)", 1, "vl"]].forEach(([v, c, side, cls]) => {
      const x = cx + (side < 0 ? -bw - 3 : 3);
      s += `<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(0, y(0) - y(v))}" rx="5" fill="${c}"><title>${esc(d.item)}: ${fmt(v)} kg</title></rect>`;
      s += `<text class="${cls}" x="${x + bw / 2}" y="${y(v) - 6}" text-anchor="middle">${fmt(v)}</text>`;
    });
    const label = W < 480 ? d.item.replace("Leafy Greens", "Greens") : d.item;
    s += `<text class="xl" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(label)}</text>`;
  });
  $("chart").innerHTML = s + "</svg>";
}
window.addEventListener("resize", () => { if (lastForecast) drawChart(lastForecast); });

// ---------- predict and render ----------
function run() {
  const weather = segValue("weather"), period = segValue("period"), day = $("day").value;
  const fc = forecast(weather, period, day);
  const total = fc.reduce((a, d) => a + d.predicted, 0);
  const normal = fc.reduce((a, d) => a + d.normal, 0);
  const change = (total / normal - 1) * 100;
  const lunch = M.survey.lunch_share;

  // Demand card
  const tone = change <= -40 ? "high" : change <= -15 ? "med" : "low";
  $("hero").style.setProperty("--tone", `var(--${tone})`);
  $("hero").style.setProperty("--tone-bg", `var(--${tone}-bg)`);
  $("change").textContent = `${change >= 0 ? "+" : "−"}${fmt(Math.abs(change), 0)}%`;
  $("vs").textContent = `vs a normal ${day} · ${weather.toLowerCase()} · ${period.toLowerCase()}`;
  $("advice").textContent = {
    high: "Big drop expected. Buy less and use up perishables first.",
    med: "Lower demand expected. Reduce orders and check at-risk items.",
    low: "Normal demand expected. Order as usual and use the oldest stock first.",
  }[tone];
  $("needed").textContent = `${fmt(total)} kg`;
  $("lunch").textContent = `${fmt(total * lunch)} kg`;
  $("dinner").textContent = `${fmt(total * (1 - lunch))} kg`;
  lastForecast = fc;
  drawChart(fc);

  // Inventory risk
  const rows = fc.map(({ item, predicted }, i) => {
    const stock = Math.max(0, parseFloat($(`stock${i}`).value) || 0);
    const days = Math.max(0, parseInt($(`days${i}`).value, 10) || 0);
    const risk = classifyRisk(stock, predicted, days);
    const surplus = Math.max(0, stock - predicted);
    $(`row${i}`).className = `inv-row ${risk}`;
    $(`need${i}`).textContent = `${fmt(predicted)} kg`;
    $(`surplus${i}`).textContent = surplus > 0 ? `${fmt(surplus)} kg` : "None";
    $(`pill${i}`).className = `pill ${risk}`;
    $(`pill${i}`).textContent = risk;
    return { item, days, surplus, risk };
  });

  // Recommended actions
  const byRisk = (r) => rows.filter((x) => x.risk === r).sort((a, b) => a.days - b.days);
  const high = byRisk("High"), med = byRisk("Medium"), low = byRisk("Low");
  const daysTxt = (d) => (d === 1 ? "1 day left" : `${d} days left`);
  let html = "";
  if (high.length) {
    html += `<div class="act High"><h3>High risk: act today</h3>
      <p class="items">${high.map((r) => `<b>${esc(r.item)}</b> (${fmt(r.surplus)} kg extra, ${daysTxt(r.days)})`).join(", ")}</p>
      <ul class="todo">${M.high_risk_actions.map((a, i) => `<li><span class="ic">${ACTION_ICON[i] || "•"}</span>${esc(a)}</li>`).join("")}</ul></div>`;
  }
  if (med.length) {
    html += `<div class="act Medium"><h3>Medium risk: plan ahead</h3>
      <p class="items">${med.map((r) => `<b>${esc(r.item)}</b> (${fmt(r.surplus)} kg extra, ${daysTxt(r.days)})`).join(", ")}</p>
      <p class="items">Put it on the menu within 1–2 days and cut the next supplier order by the extra amount.</p></div>`;
  }
  if (low.length) {
    html += `<div class="act Low"><h3>Low risk</h3>
      <p class="items">${low.map((r) => `<b>${esc(r.item)}</b>`).join(", ")}: normal use, oldest stock first.</p></div>`;
  }
  $("actions").innerHTML = html;
  $("count").textContent = `${high.length} high · ${med.length} medium · ${low.length} low`;

  $("stale").hidden = true;
  $("run").classList.remove("pulse");
}

buildControls();
run();   // show a first result straight away
