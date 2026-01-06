const STORAGE_KEY = "mi_entreno_iphone_final_v2";

const $daysList = document.getElementById("daysList");
const $dayView  = document.getElementById("dayView");

const $btnAddDay = document.getElementById("btnAddDay");
const $btnReset  = document.getElementById("btnReset");
const $btnExport = document.getElementById("btnExport");
const $btnImport = document.getElementById("btnImport");

const $modal = document.getElementById("modal");
const $modalTitle = document.getElementById("modalTitle");
const $modalLabel = document.getElementById("modalLabel");
const $modalInput = document.getElementById("modalInput");
const $fileInput  = document.getElementById("fileInput");

/* Bulk paste modal */
const $bulkModal = document.getElementById("bulkModal");
const $bulkText  = document.getElementById("bulkText");

/* ✅ modo vista */
let viewMode = "workout"; // "workout" | "weight"

let state = loadState();
let selectedDayId = state.days[0]?.id ?? null;

/* ===== Calendario (mes visible) ===== */
let calView = { y: new Date().getFullYear(), m: new Date().getMonth() };

/* ================= UTIL ================= */

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return { days: [], history: [], weights: [] };

    const parsed = JSON.parse(raw);
    if(!parsed?.days) parsed.days = [];
    if(!Array.isArray(parsed.history)) parsed.history = [];
    if(!Array.isArray(parsed.weights)) parsed.weights = [];
    return parsed;
  }catch{
    return { days: [], history: [], weights: [] };
  }
}

function findDay(id){
  return state.days.find(d => d.id === id) ?? null;
}

function blankSet(){
  return { series:"", reps:"", kg:"", rir:"" };
}

function esc(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function openPrompt({ title, label, placeholder="", value="" }){
  $modalTitle.textContent = title;
  $modalLabel.textContent = label;
  $modalInput.placeholder = placeholder;
  $modalInput.value = value;

  $modal.showModal();
  $modalInput.focus();

  return new Promise(resolve=>{
    $modal.addEventListener("close", ()=>{
      if($modal.returnValue === "cancel") return resolve(null);
      const v = $modalInput.value.trim();
      resolve(v || null);
    }, { once:true });
  });
}

function nowISO(){
  return new Date().toISOString();
}

function fmtDateTime(iso){
  const d = new Date(iso);
  const yy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  const hh = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  return `${yy}-${mm}-${dd} ${hh}:${mi}`;
}

function cloneWorkoutDay(day){
  return {
    name: day.name,
    exercises: (day.exercises || []).map(ex => ({
      name: ex.name,
      note: ex.note || "",
      sets: (ex.sets || []).map(s => ({
        series: s.series ?? "",
        reps:   s.reps ?? "",
        kg:     s.kg ?? "",
        rir:    s.rir ?? ""
      }))
    }))
  };
}

/* ===== Calendario helpers ===== */
function ymdLocal(dateObj){
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth()+1).padStart(2,"0");
  const d = String(dateObj.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function ymdFromISO(iso){
  return ymdLocal(new Date(iso));
}
function monthLabel(y,m){
  const names = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${names[m]} ${y}`;
}

/* detalle en página */
function workoutDetailsHTML(item){
  const sleep = (typeof item.sleepScore === "number") ? `${item.sleepScore}/10` : "-";
  const eat   = (typeof item.eatScore === "number") ? `${item.eatScore}/10` : "-";

  const w = item.workout || { exercises: [] };
  const exHTML = (w.exercises || []).map(ex=>{
    const setsHTML = (ex.sets || []).map(s=>{
      const series = esc(s.series ?? "");
      const reps   = esc(s.reps ?? "");
      const kg     = esc(s.kg ?? "");
      const rir    = esc(s.rir ?? "");

      const left = series ? `${series}x` : "";
      const mid  = reps ? `${reps}` : "";
      const right= kg ? `@${kg}kg` : "";
      const tail = rir ? ` RIR${rir}` : "";

      return `<div class="dayItem__small">• ${esc(`${left}${mid} ${right}${tail}`.trim())}</div>`;
    }).join("");

    const note = (ex.note || "").trim();
    const noteHTML = note ? `<div class="dayItem__small">Nota: ${esc(note)}</div>` : "";

    return `
      <div class="card" style="padding:10px;">
        <div style="font-weight:900; font-size:14px;">${esc(ex.name)}</div>
        <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
          ${setsHTML || `<div class="dayItem__small">Sin líneas</div>`}
          ${noteHTML}
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="card" style="padding:12px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div>
          <div style="font-weight:900; font-size:16px;">${esc(item.dayName)}</div>
          <div class="muted">${esc(fmtDateTime(item.at))}</div>
          <div class="muted">Dormí: ${esc(sleep)} · Comí: ${esc(eat)}</div>
        </div>
        <button class="btn btn--danger" data-close-detail>✕</button>
      </div>
    </div>
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${exHTML || `<div class="empty">Sin ejercicios guardados.</div>`}
    </div>
  `;
}

function renderCalendarForDay(day, hostEl){
  const y = calView.y;
  const m = calView.m;

  const first = new Date(y, m, 1);
  const last  = new Date(y, m+1, 0);

  const startDow = (first.getDay() + 6) % 7;
  const daysInMonth = last.getDate();

  const entries = (state.history || []).filter(h => h.dayId === day.id);
  const map = new Map();
  for(const e of entries){
    const key = ymdFromISO(e.at);
    if(!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }

  hostEl.innerHTML = `
    <div class="cal">
      <div class="calHead">
        <button id="calPrev" class="btn">◀</button>
        <div class="calTitle">${monthLabel(y,m)}</div>
        <button id="calNext" class="btn">▶</button>
      </div>

      <div class="calGrid">
        <div class="calDow">L</div><div class="calDow">M</div><div class="calDow">X</div><div class="calDow">J</div><div class="calDow">V</div><div class="calDow">S</div><div class="calDow">D</div>
      </div>

      <div id="calCells" class="calGrid" style="margin-top:8px;"></div>
      <div id="calDetailList" class="calList"></div>
      <div id="calDetailView" style="margin-top:10px; display:none;"></div>
    </div>
  `;

  const $cells     = hostEl.querySelector("#calCells");
  const $detailLst = hostEl.querySelector("#calDetailList");
  const $detailVw  = hostEl.querySelector("#calDetailView");

  function showDetail(item){
    $detailVw.style.display = "";
    $detailVw.innerHTML = workoutDetailsHTML(item);

    $detailVw.querySelector("[data-close-detail]").onclick = () => {
      $detailVw.style.display = "none";
      $detailVw.innerHTML = "";
    };
  }

  function renderDayEntriesList(key, list){
    if(!list.length){
      $detailLst.innerHTML = `<div class="pill">Sin registros el ${esc(key)}</div>`;
      $detailVw.style.display = "none";
      $detailVw.innerHTML = "";
      return;
    }

    $detailLst.innerHTML = list.map(e => {
      const sleep = (typeof e.sleepScore === "number") ? `${e.sleepScore}/10` : "-";
      const eat   = (typeof e.eatScore === "number") ? `${e.eatScore}/10` : "-";
      return `
        <div class="calItem">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div>
              <div><b>${esc(fmtDateTime(e.at))}</b></div>
              <div class="calItemSmall">Dormí: ${esc(sleep)} · Comí: ${esc(eat)}</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
              <button class="btn" data-view="${esc(e.id)}">Ver</button>
              <button class="btn btn--danger" data-del="${esc(e.id)}">✕</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    $detailLst.querySelectorAll("[data-view]").forEach(btn=>{
      btn.onclick = () => {
        const id = btn.getAttribute("data-view");
        const item = (state.history || []).find(h => h.id === id);
        if(!item) return;
        showDetail(item);
        $detailVw.scrollIntoView({ behavior:"smooth", block:"start" });
      };
    });

    $detailLst.querySelectorAll("[data-del]").forEach(btn=>{
      btn.onclick = () => {
        const id = btn.getAttribute("data-del");
        if(!confirm("¿Borrar este registro?")) return;
        state.history = (state.history || []).filter(h => h.id !== id);
        saveState();
        render();
      };
    });
  }

  for(let i=0;i<startDow;i++){
    const c = document.createElement("div");
    c.className = "calCell calCell--off";
    $cells.appendChild(c);
  }

  for(let d=1; d<=daysInMonth; d++){
    const dt = new Date(y, m, d);
    const key = ymdLocal(dt);
    const list = map.get(key) || [];

    const cell = document.createElement("div");
    cell.className = "calCell";
    cell.innerHTML = `
      <button data-key="${key}">
        <div class="calDayRow">
          <div class="calDayNum">${d}</div>
          ${list.length ? `<div class="calBadge">${list.length}</div>` : ``}
        </div>
      </button>
    `;

    cell.querySelector("button").onclick = () => {
      renderDayEntriesList(key, list);
      $detailLst.scrollIntoView({ behavior:"smooth", block:"start" });
    };

    $cells.appendChild(cell);
  }

  hostEl.querySelector("#calPrev").onclick = () => {
    calView.m--;
    if(calView.m < 0){ calView.m = 11; calView.y--; }
    render();
  };

  hostEl.querySelector("#calNext").onclick = () => {
    calView.m++;
    if(calView.m > 11){ calView.m = 0; calView.y++; }
    render();
  };

  $detailLst.innerHTML = `<div class="pill">Tocá un día para ver registros</div>`;
}

/* ============ BULK IMPORT HELPERS ============ */

function normalizeSet(s){
  const series = (s?.series ?? "").toString();
  const reps   = (s?.reps ?? "").toString();
  const kg     = (s?.kg ?? "").toString();
  const rir    = (s?.rir ?? "").toString();
  return { series, reps, kg, rir };
}

function normalizeExercise(ex){
  const name = (ex?.name ?? "").toString().trim();
  if(!name) return null;

  const note = (ex?.note ?? "").toString();
  const setsIn = Array.isArray(ex?.sets) ? ex.sets : [];
  const sets = setsIn.length ? setsIn.map(normalizeSet) : [blankSet()];

  return { id: uid(), name, note, sets };
}

function parseBulk(text){
  const cleaned = text.trim();
  const parsed = JSON.parse(cleaned);

  if(Array.isArray(parsed)) return parsed.map(normalizeExercise).filter(Boolean);
  if(parsed && Array.isArray(parsed.exercises)) return parsed.exercises.map(normalizeExercise).filter(Boolean);
  if(parsed && Array.isArray(parsed.days) && parsed.days[0]?.exercises) return parsed.days[0].exercises.map(normalizeExercise).filter(Boolean);

  throw new Error("Formato no reconocido. Pegá un array de ejercicios o {exercises:[...]}");
}

/* ================= PANTALLAS (tabs) ================= */

function showDays(){
  const tabDays = document.getElementById("tabDays");
  const tabRoutine = document.getElementById("tabRoutine");
  const screenDays = document.getElementById("screenDays");
  const screenRoutine = document.getElementById("screenRoutine");
  if(!tabDays || !tabRoutine || !screenDays || !screenRoutine) return;

  tabDays.classList.add("tab--active");
  tabRoutine.classList.remove("tab--active");
  screenDays.hidden = false;
  screenRoutine.hidden = true;
}

function showRoutine(){
  const tabDays = document.getElementById("tabDays");
  const tabRoutine = document.getElementById("tabRoutine");
  const screenDays = document.getElementById("screenDays");
  const screenRoutine = document.getElementById("screenRoutine");
  if(!tabDays || !tabRoutine || !screenDays || !screenRoutine) return;

  tabRoutine.classList.add("tab--active");
  tabDays.classList.remove("tab--active");
  screenDays.hidden = true;
  screenRoutine.hidden = false;
}

function goToRoutineScreen(){
  showRoutine();
}

/* ================= PESO VIEW ================= */

function toKgNumber(input){
  const raw = (input ?? "").toString().trim().replace(",", ".");
  const n = Number(raw);
  if(!isFinite(n)) return null;
  return n;
}

function renderWeightView(){
  const items = Array.isArray(state.weights) ? state.weights.slice() : [];
  items.sort((a,b)=> new Date(b.at) - new Date(a.at));

  const last = items[0]?.kg;
  const prev = items[1]?.kg;
  const delta = (typeof last === "number" && typeof prev === "number") ? (last - prev) : null;

  const kgVals = items.map(x=>x.kg).filter(x=> typeof x === "number");
  const minKg = kgVals.length ? Math.min(...kgVals) : 0;
  const maxKg = kgVals.length ? Math.max(...kgVals) : 0;
  const span  = (maxKg - minKg) || 1;

  const chartHTML = items.slice(0, 12).reverse().map(x=>{
    const pct = (typeof x.kg === "number") ? Math.round(((x.kg - minKg) / span) * 100) : 0;
    return `
      <div style="flex:1; display:flex; flex-direction:column; gap:6px; align-items:stretch;">
        <div style="height:64px; display:flex; align-items:flex-end;">
          <div style="width:100%; border-radius:10px; background:rgba(255,255,255,0.08); height:${pct}%;"></div>
        </div>
        <div class="muted" style="font-size:11px; text-align:center;">${esc(String(x.kg ?? "-"))}</div>
      </div>
    `;
  }).join("");

  $dayView.className = "";
  $dayView.innerHTML = `
    <div class="dayHeader">
      <div class="dayTitle">
        <div class="dayTitle__label">Sección</div>
        <div class="dayTitle__name">Peso corporal</div>
      </div>

      <div class="row">
        <button id="backToWorkout" class="btn">Volver</button>
        <button id="addWeightEntry" class="btn btn--primary">+ Registrar kg</button>
      </div>
    </div>

    <div class="card" style="padding:12px;">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap;">
        <div>
          <div class="muted">Último</div>
          <div style="font-weight:900; font-size:20px;">${typeof last === "number" ? esc(last.toFixed(1)) + " kg" : "-"}</div>
        </div>
        <div>
          <div class="muted">Cambio vs anterior</div>
          <div style="font-weight:900; font-size:16px;">${delta === null ? "-" : esc((delta>=0?"+":"") + delta.toFixed(1)) + " kg"}</div>
        </div>
        <div>
          <div class="muted">Registros</div>
          <div style="font-weight:900; font-size:16px;">${items.length}</div>
        </div>
      </div>
    </div>

    <div class="card" style="padding:12px;">
      <div style="font-weight:900; margin-bottom:10px;">Evolución (últimos)</div>
      <div style="display:flex; gap:8px; align-items:flex-end;">
        ${items.length ? chartHTML : `<div class="empty" style="width:100%;">Todavía no hay registros.</div>`}
      </div>
      <div class="muted" style="margin-top:8px;">(Gráfico simple para ver tendencia.)</div>
    </div>

    <div style="display:flex; flex-direction:column; gap:10px;">
      <div style="font-weight:900; margin-top:4px;">Historial</div>
      <div id="weightList"></div>
    </div>
  `;

  document.getElementById("backToWorkout").onclick = ()=>{
    viewMode = "workout";
    render();
  };

  const $list = document.getElementById("weightList");
  if(!items.length){
    $list.innerHTML = `<div class="empty">Cargá tu primer peso con “+ Registrar kg”.</div>`;
  }else{
    $list.innerHTML = items.map(it=>{
      return `
        <div class="calItem">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div>
              <div><b>${esc(String(it.kg ?? "-"))} kg</b></div>
              <div class="calItemSmall">${esc(fmtDateTime(it.at))}</div>
            </div>
            <button class="btn btn--danger" data-wdel="${esc(it.id)}">✕</button>
          </div>
        </div>
      `;
    }).join("");

    $list.querySelectorAll("[data-wdel]").forEach(btn=>{
      btn.onclick = () => {
        const id = btn.getAttribute("data-wdel");
        if(!confirm("¿Borrar este peso?")) return;
        state.weights = (state.weights || []).filter(x => x.id !== id);
        saveState();
        render();
      };
    });
  }

  document.getElementById("addWeightEntry").onclick = async () => {
    const raw = await openPrompt({
      title:"Registrar peso corporal",
      label:"Kg (ej: 65.4)",
      placeholder:"Ej: 65.4"
    });
    if(!raw) return;

    const kg = toKgNumber(raw);
    if(kg === null || kg <= 0 || kg > 400){
      alert("Ingresá un número válido de kg.");
      return;
    }

    state.weights.unshift({ id: uid(), at: nowISO(), kg });
    saveState();
    render();
  };
}

/* ================= WORKOUT VIEW ================= */

function renderWorkoutView(){
  const day = selectedDayId ? findDay(selectedDayId) : null;

  if(!day){
    $dayView.className = "empty";
    $dayView.textContent = "Elegí un día.";
    return;
  }

  $dayView.className = "";
  $dayView.innerHTML = `
    <div class="dayHeader">
      <div class="dayTitle">
        <div class="dayTitle__label">Día</div>
        <div class="dayTitle__name">${esc(day.name)}</div>
      </div>

      <div class="row">
        <button id="bulkLoad" class="btn">Cargar ejercicios</button>
        <button id="addExercise" class="btn btn--primary">+ Ejercicio</button>
      </div>
    </div>

    <div id="exercises"></div>

    <div style="margin-top:14px; display:flex; flex-direction:column; gap:10px;">
      <button id="saveWorkout" class="btn btn--primary">Guardar entrenamiento</button>
      <div id="calendarBox"></div>
    </div>
  `;

  document.getElementById("bulkLoad").onclick = () => {
    $bulkText.value = "";
    $bulkModal.showModal();
    $bulkText.focus();

    $bulkModal.addEventListener("close", () => {
      if($bulkModal.returnValue === "cancel") return;

      const text = ($bulkText.value || "").trim();
      if(!text) return;

      try{
        const exercises = parseBulk(text);
        if(!exercises.length){
          alert("No se encontraron ejercicios en el texto.");
          return;
        }

        day.exercises = exercises;
        saveState();
        render();
      }catch(err){
        alert(err?.message || "No pude leer ese JSON.");
      }
    }, { once:true });
  };

  document.getElementById("addExercise").onclick = async ()=>{
    const name = await openPrompt({
      title:"Nuevo ejercicio",
      label:"Nombre",
      placeholder:"Ej: Press banca"
    });
    if(!name) return;

    day.exercises.push({
      id: uid(),
      name,
      note:"",
      sets:[ blankSet() ]
    });
    saveState();
    render();
  };

  document.getElementById("saveWorkout").onclick = () => {
    if(!day.exercises.length){
      alert("No hay ejercicios para guardar.");
      return;
    }

    let sleepScore = prompt("¿Qué tan bien dormiste? (1 a 10)");
    if(sleepScore === null) return;
    sleepScore = Number(sleepScore);
    if(isNaN(sleepScore) || sleepScore < 1 || sleepScore > 10){
      alert("Dormir: ingresá un número del 1 al 10");
      return;
    }

    let eatScore = prompt("¿Qué tan bien comiste? (1 a 10)");
    if(eatScore === null) return;
    eatScore = Number(eatScore);
    if(isNaN(eatScore) || eatScore < 1 || eatScore > 10){
      alert("Comida: ingresá un número del 1 al 10");
      return;
    }

    const entry = {
      id: uid(),
      dayId: day.id,
      dayName: day.name,
      at: nowISO(),
      sleepScore,
      eatScore,
      workout: cloneWorkoutDay(day)
    };

    state.history.unshift(entry);
    saveState();
    render();
  };

  const host = document.getElementById("exercises");

  if(!day.exercises.length){
    host.innerHTML = `<div class="empty">Sin ejercicios.</div>`;
  } else {
    day.exercises.forEach(ex=>{
      const card = document.createElement("div");
      card.className = "exercise";
      card.innerHTML = `
        <div class="exerciseTop">
          <div class="exerciseName">${esc(ex.name)}</div>
          <div class="row">
            <button class="btn" data-r>Renombrar</button>
            <button class="btn btn--danger" data-d>Borrar</button>
          </div>
        </div>

        <div class="setTable"></div>

        <div class="row" style="margin-top:10px">
          <button class="btn btn--primary" data-add>+ Línea</button>
        </div>

        <div class="noteBlock">
          <div class="smallLabel">Notas del ejercicio</div>
          <input class="input" data-note placeholder="Opcional" value="${esc(ex.note || "")}">
        </div>
      `;

      card.querySelector("[data-r]").onclick = async ()=>{
        const n = await openPrompt({
          title:"Renombrar ejercicio",
          label:"Nombre",
          value:ex.name
        });
        if(!n) return;
        ex.name = n;
        saveState();
        render();
      };

      card.querySelector("[data-d]").onclick = ()=>{
        if(!confirm("¿Borrar ejercicio?")) return;
        day.exercises = day.exercises.filter(x=>x.id!==ex.id);
        saveState();
        render();
      };

      const noteInput = card.querySelector("[data-note]");
      noteInput.oninput = ()=>{
        ex.note = noteInput.value;
        saveState();
      };

      const table = card.querySelector(".setTable");

      ex.sets.forEach((s,i)=>{
        const row = document.createElement("div");
        row.className = "setRow";
        row.innerHTML = `
          <input class="input" inputmode="numeric" placeholder="Series" value="${esc(s.series ?? "")}">
          <input class="input" inputmode="numeric" placeholder="Reps" value="${esc(s.reps ?? "")}">
          <input class="input" inputmode="numeric" placeholder="Kg" value="${esc(s.kg ?? "")}">
          <input class="input" inputmode="numeric" placeholder="RIR" value="${esc(s.rir ?? "")}">
          <button class="btn btn--danger del">✕</button>
        `;

        const [seriesI, repsI, kgI, rirI] = row.querySelectorAll("input");

        const commit = ()=>{
          s.series = seriesI.value;
          s.reps   = repsI.value;
          s.kg     = kgI.value;
          s.rir    = rirI.value;
          saveState();
        };

        seriesI.oninput = commit;
        repsI.oninput   = commit;
        kgI.oninput     = commit;
        rirI.oninput    = commit;

        row.querySelector("button").onclick = () => {
          if (ex.sets.length === 1) ex.sets[0] = blankSet();
          else ex.sets.splice(i, 1);
          saveState();
          render();
        };

        table.appendChild(row);
      });

      card.querySelector("[data-add]").onclick = ()=>{
        ex.sets.push(blankSet());
        saveState();
        render();
      };

      host.appendChild(card);
    });
  }

  const calendarBox = document.getElementById("calendarBox");
  renderCalendarForDay(day, calendarBox);
}

/* ================= RENDER ================= */

function render(){
  renderDays();
  if(viewMode === "weight") renderWeightView();
  else renderWorkoutView();

  // ✅ re-enganchar el botón Peso y tabs si hace falta
  bindWeightButton();
}

/* ================= BINDINGS ================= */

function bindWeightButton(){
  const btn = document.getElementById("btnWeight");
  if(!btn) return;

  btn.onclick = ()=>{
    viewMode = "weight";
    goToRoutineScreen(); // ✅ CLAVE: mostrar la pantalla Rutina
    render();
  };
}

/* ---------- DÍAS ---------- */

function renderDays(){
  $daysList.innerHTML = "";

  if(!state.days.length){
    $daysList.innerHTML = `<div class="empty">No hay días creados.</div>`;
    return;
  }

  state.days.forEach(day=>{
    const el = document.createElement("div");
    el.className = "dayItem";
    el.innerHTML = `
      <div class="dayItem__meta">
        <div class="dayItem__name">${esc(day.name)}</div>
        <div class="dayItem__small">${day.exercises.length} ejercicios</div>
      </div>
      <div class="dayItem__actions">
        <button class="btn" data-r>Renombrar</button>
        <button class="btn btn--danger" data-d>Borrar</button>
      </div>
    `;

    el.onclick = e=>{
      if(e.target.tagName === "BUTTON") return;
      selectedDayId = day.id;
      viewMode = "workout";
      calView = { y: new Date().getFullYear(), m: new Date().getMonth() };
      render();
      goToRoutineScreen(); // ✅ al elegir día, ir a Rutina
    };

    el.querySelector("[data-r]").onclick = async e=>{
      e.stopPropagation();
      const name = await openPrompt({
        title:"Renombrar día",
        label:"Nombre",
        value:day.name
      });
      if(!name) return;
      day.name = name;
      saveState();
      render();
    };

    el.querySelector("[data-d]").onclick = e=>{
      e.stopPropagation();
      if(!confirm("¿Borrar día?")) return;
      state.days = state.days.filter(d=>d.id!==day.id);
      selectedDayId = state.days[0]?.id ?? null;
      saveState();
      render();
    };

    $daysList.appendChild(el);
  });
}

/* ================= TOP ACTIONS ================= */

$btnAddDay.onclick = async ()=>{
  const name = await openPrompt({
    title:"Nuevo día",
    label:"Nombre",
    placeholder:"Ej: Pecho"
  });
  if(!name) return;

  state.days.unshift({ id: uid(), name, exercises:[] });
  selectedDayId = state.days[0].id;
  viewMode = "workout";
  calView = { y: new Date().getFullYear(), m: new Date().getMonth() };
  saveState();
  render();
  goToRoutineScreen();
};

$btnReset.onclick = ()=>{
  if(!confirm("¿Borrar todo?")) return;
  state = { days: [], history: [], weights: [] };
  selectedDayId = null;
  viewMode = "workout";
  saveState();
  render();
  showDays();
};

$btnExport.onclick = ()=>{
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mi-entreno-backup.json";
  a.click();
};

$btnImport.onclick = ()=>{
  $fileInput.value = "";
  $fileInput.click();
};

$fileInput.onchange = async ()=>{
  const f = $fileInput.files[0];
  if(!f) return;

  try{
    const txt = await f.text();
    const data = JSON.parse(txt);
    if(!data?.days) return alert("Archivo inválido");

    if(!Array.isArray(data.history)) data.history = [];
    if(!Array.isArray(data.weights)) data.weights = [];
    state = data;

    selectedDayId = state.days[0]?.id ?? null;
    saveState();
    render();
  }catch{
    alert("No se pudo importar.");
  }
};

/* ================= INIT ================= */

// enganchar tabs (por si querés mover todo al JS y no depender del script inline)
(function bindTabs(){
  const tabDays = document.getElementById("tabDays");
  const tabRoutine = document.getElementById("tabRoutine");
  if(tabDays) tabDays.addEventListener("click", showDays);
  if(tabRoutine) tabRoutine.addEventListener("click", showRoutine);
})();

bindWeightButton();
render();
