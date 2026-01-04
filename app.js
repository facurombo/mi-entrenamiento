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

let state = loadState();
let selectedDayId = state.days[0]?.id ?? null;

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
    if(!raw) return { days: [] };
    const parsed = JSON.parse(raw);
    if(!parsed?.days) return { days: [] };
    return parsed;
  }catch{
    return { days: [] };
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

  return {
    id: uid(),
    name,
    note,
    sets
  };
}

function parseBulk(text){
  const cleaned = text.trim();
  const parsed = JSON.parse(cleaned);

  if(Array.isArray(parsed)){
    return parsed.map(normalizeExercise).filter(Boolean);
  }

  if(parsed && Array.isArray(parsed.exercises)){
    return parsed.exercises.map(normalizeExercise).filter(Boolean);
  }

  if(parsed && Array.isArray(parsed.days) && parsed.days[0]?.exercises){
    return parsed.days[0].exercises.map(normalizeExercise).filter(Boolean);
  }

  throw new Error("Formato no reconocido. Pegá un array de ejercicios o {exercises:[...]}");
}

/* ================= RENDER ================= */

function render(){
  renderDays();
  renderDay();
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
      render();
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

/* ---------- DÍA / EJERCICIOS ---------- */

function renderDay(){
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

  const host = document.getElementById("exercises");

  if(!day.exercises.length){
    host.innerHTML = `<div class="empty">Sin ejercicios.</div>`;
    return;
  }

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
        <button class="btn btn--primary" data-add>+ Serie</button>
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

      seriesI.oninput = commit;   // ✅ FIX MINIMO: era SeriesI
      repsI.oninput   = commit;
      kgI.oninput     = commit;
      rirI.oninput    = commit;

      row.querySelector("button").onclick = () => {
        if (ex.sets.length === 1) {
          ex.sets[0] = blankSet();
        } else {
          ex.sets.splice(i, 1);
        }
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

/* ================= TOP ACTIONS ================= */

$btnAddDay.onclick = async ()=>{
  const name = await openPrompt({
    title:"Nuevo día",
    label:"Nombre",
    placeholder:"Ej: Pecho"
  });
  if(!name) return;

  state.days.unshift({
    id: uid(),
    name,
    exercises:[]
  });
  selectedDayId = state.days[0].id;
  saveState();
  render();
};

$btnReset.onclick = ()=>{
  if(!confirm("¿Borrar todo?")) return;
  state = { days: [] };
  selectedDayId = null;
  saveState();
  render();
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
    state = data;
    selectedDayId = state.days[0]?.id ?? null;
    saveState();
    render();
  }catch{
    alert("No se pudo importar.");
  }
};

/* INIT */
render();
