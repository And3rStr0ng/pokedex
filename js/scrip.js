/* ---------- 1. CONSTANTES Y ESTADO ---------- */
const STORAGE_KEY = "pokemon-lanes";             // clave de localStorage
const API = "https://pokeapi.co/api/v2/type/";   // endpoint: /type/{nombre}
const MAX_POKEMON = 20;                          // cuántos mostrar por carril
// Imagen del Pokémon construida con su id (evita una petición extra por cada uno)
const SPRITE = id =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

// Estado de la app:
//  names: tipos en orden (esto es lo que se guarda)
//  data:  info por carril { status: "loading"|"ok"|"error", items, error }
const state = { names: [], data: {} };

/* ---------- 2. REFERENCIAS AL DOM ---------- */
const lanesEl   = document.getElementById("lanes");
const dlg       = document.getElementById("dlg");
const form      = document.getElementById("form-add");
const input     = document.getElementById("input-name");
const dlgError  = document.getElementById("dlg-error");
const btnSubmit = document.getElementById("btn-submit");

/* ---------- 3. PERSISTENCIA (localStorage) ---------- */
function saveLanes() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.names)); }
  catch (e) { console.warn("No se pudo guardar:", e); }
}

function loadLanes() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (e) { return []; }   // JSON corrupto o storage bloqueado
}

/* ---------- 4. API (PokéAPI) ---------- */
// Devuelve la lista de Pokémon del tipo o lanza un Error con mensaje claro
async function fetchType(name) {
  let res;
  try {
    res = await fetch(API + encodeURIComponent(name));
  } catch (e) {
    throw new Error("No se pudo conectar con PokéAPI. Revisa tu conexión.");
  }

  if (res.status === 404) throw new Error(`El tipo "${name}" no existe. Prueba con fire, water, grass...`);
  if (res.status === 429) throw new Error("Demasiadas peticiones. Espera un momento y reintenta.");
  if (!res.ok)            throw new Error(`Error de PokéAPI (código ${res.status}).`);

  const json = await res.json();
  const list = Array.isArray(json.pokemon) ? json.pokemon : [];

  // La URL termina en /pokemon/{id}/ -> sacamos el id. Los ids >= 10000 son formas
  // alternativas (megas, regionales); las descartamos para quedarnos con los base.
  const items = list
    .map(({ pokemon }) => ({
      name: pokemon.name,
      id: Number(pokemon.url.split("/").filter(Boolean).pop()),
      type: name,
    }))
    .filter(p => p.id < 10000)
    .slice(0, MAX_POKEMON);

  if (items.length === 0) throw new Error(`El tipo "${name}" no tiene Pokémon disponibles.`);
  return items;
}

// Carga (o recarga) los datos de un carril y actualiza su estado
async function loadLane(name) {
  state.data[name] = { status: "loading" };
  render();
  try {
    state.data[name] = { status: "ok", items: await fetchType(name) };
  } catch (e) {
    state.data[name] = { status: "error", error: e.message };
  }
  render();
}

/* ---------- 5. ACCIONES: añadir, borrar ---------- */
async function addLane(rawName) {
  const name = rawName.trim().toLowerCase();
  if (!/^[a-z]{3,15}$/.test(name)) throw new Error("Nombre inválido: usa solo letras (ej. fire).");
  if (state.names.includes(name)) throw new Error(`El tipo "${name}" ya está en tus carriles.`);

  // Validamos ANTES de crear el carril: si no existe, el error sale en el popup
  const items = await fetchType(name);
  state.names.push(name);
  state.data[name] = { status: "ok", items };
  saveLanes();
  render();
}

function deleteLane(name) {
  state.names = state.names.filter(n => n !== name);
  delete state.data[name];
  saveLanes();
  render();
}

/* ---------- 6. RENDER (dibujar la interfaz) ---------- */
// Crea un elemento con clase y texto (textContent evita inyección de HTML)
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Construye el DOM de un carril completo
function buildLane(name) {
  const info = state.data[name] || { status: "loading" };
  const lane = el("article", "lane");

  // Cabecera: título + menú (Refresh / Delete)
  const head = el("div", "lane__head");
  head.append(el("h2", "lane__title", name));

  const menuBtn = el("button", "lane__menu-btn", "⋮");
  menuBtn.type = "button";
  menuBtn.setAttribute("aria-label", `Opciones del tipo ${name}`);

  const menu = el("div", "lane__menu");
  const refresh = el("button", "", "Refresh");
  const del = el("button", "danger", "Delete");
  refresh.onclick = () => loadLane(name);
  del.onclick = () => deleteLane(name);
  menu.append(refresh, del);

  menuBtn.onclick = (e) => {
    e.stopPropagation();                       // evita que el click global lo cierre
    const wasOpen = menu.classList.contains("open");
    closeMenus();
    if (!wasOpen) menu.classList.add("open");
  };
  head.append(menuBtn, menu);
  lane.append(head);

  // Cuerpo: depende del estado (cargando / error / lista)
  if (info.status === "loading") {
    lane.append(el("p", "lane__state", "Cargando…"));
  } else if (info.status === "error") {
    lane.append(el("p", "lane__state lane__state--error", info.error));
  } else {
    const list = el("ul", "posts");
    info.items.forEach(p => {
      const item = el("li", "post");
      item.append(el("div", "post__votes", "#" + p.id));   // número de Pokédex

      const img = el("img", "post__img");
      img.src = SPRITE(p.id);
      img.alt = p.name;
      img.loading = "lazy";
      img.onerror = () => img.remove();         // si falla la imagen, solo se oculta

      const body = el("div");
      body.append(el("span", "post__title", p.name),
                  el("span", "post__author", "Tipo: " + p.type));

      item.append(img, body);
      list.append(item);
    });
    lane.append(list);
  }
  return lane;
}

// Redibuja todos los carriles según state.names
function render() {
  lanesEl.replaceChildren();
  if (state.names.length === 0) {
    lanesEl.append(el("p", "lanes__empty", "Aún no hay carriles. Pulsa + para añadir un tipo."));
    return;
  }
  state.names.forEach(name => lanesEl.append(buildLane(name)));
}

function closeMenus() {
  document.querySelectorAll(".lane__menu.open").forEach(m => m.classList.remove("open"));
}

/* ---------- 7. EVENTOS ---------- */
// Abrir popup
document.getElementById("btn-add").onclick = () => {
  form.reset();
  dlgError.hidden = true;
  dlg.showModal();
  input.focus();
};

// Cancelar popup
document.getElementById("btn-cancel").onclick = () => dlg.close();

// Enviar formulario: valida, muestra error o cierra
form.onsubmit = async (e) => {
  e.preventDefault();
  dlgError.hidden = true;
  btnSubmit.disabled = true;
  btnSubmit.textContent = "Verificando…";
  try {
    await addLane(input.value);
    dlg.close();
  } catch (err) {
    dlgError.textContent = err.message;   // error claro, nunca silencioso
    dlgError.hidden = false;
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Añadir tipo";
  }
};

// Cerrar menús al hacer click fuera
document.addEventListener("click", closeMenus);

/* ---------- 8. ARRANQUE ---------- */
state.names = loadLanes();      // restaura carriles guardados
render();
state.names.forEach(loadLane);  // vuelve a pedir los datos de cada uno