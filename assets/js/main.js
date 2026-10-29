import { initPivot } from "./pivot.js";
import { initCatalogue } from "./catalogue.js";

const VIEWS = ["pivot", "catalogue", "about"];

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function parseHash() {
  const raw = location.hash.replace(/^#/, "");
  const [view, query = ""] = raw.split("?");
  return { view: VIEWS.includes(view) ? view : "pivot", query };
}

function showView(view) {
  for (const id of VIEWS) {
    document.getElementById(`view-${id}`).hidden = id !== view;
    const tab = document.getElementById(`tab-${id}`);
    tab.setAttribute("aria-selected", String(id === view));
    tab.tabIndex = id === view ? 0 : -1;
  }
}

async function start() {
  let tools, pivots;
  try {
    [tools, pivots] = await Promise.all([loadJson("data/tools.json"), loadJson("data/pivots.json")]);
  } catch (error) {
    const box = document.getElementById("load-error");
    box.hidden = false;
    box.textContent =
      location.protocol === "file:"
        ? "Browsers block loading the data files from file://. Start a local server in this folder (python -m http.server) and open http://localhost:8000."
        : `Could not load the data files (${error.message}).`;
    showView("about");
    return;
  }

  const pivot = initPivot(pivots);
  const catalogue = initCatalogue(tools, {
    onStateChange: (query) => history.replaceState(null, "", `#catalogue${query ? `?${query}` : ""}`),
  });
  document.getElementById("tool-total").textContent = catalogue.total;

  let current = null;
  const route = () => {
    const { view, query } = parseHash();
    showView(view);
    if (view === "catalogue") catalogue.applyQuery(query);
    if (view !== current && view === "pivot" && matchMedia("(min-width: 641px)").matches) pivot.focus();
    current = view;
  };
  window.addEventListener("hashchange", route);
  route();

  // "/" jumps to the search box of the open view, like on GitHub.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest("input, textarea, select")) return;
    event.preventDefault();
    (current === "catalogue" ? catalogue : pivot).focus();
  });
}

start();
