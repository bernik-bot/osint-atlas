import { h, extLink, displayUrl, foldText } from "./dom.js";
import { loadPrefs, savePrefs, exportPrefs, importPrefs } from "./storage.js";

const TYPE_LABELS = {
  web: "Web",
  cli: "CLI",
  extension: "Extension",
  app: "App",
  api: "API",
  dataset: "Dataset",
  guide: "Guide",
};
const PRICING_LABELS = { free: "Free", freemium: "Freemium", paid: "Paid" };
const FLAGS = ["free", "noacct", "nokey", "oss", "starred"];

/** Stable id for stars and notes. scripts/validate.py checks these are unique. */
export function toolId(name) {
  return foldText(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatDate(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Catalogue view. Filter state lives in the URL hash (#catalogue?q=…&cat=…)
 * so a filtered view can be bookmarked or shared. Stars and notes stay local.
 */
export function initCatalogue(data, { onStateChange, linkStatus }) {
  const categories = data.categories;
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const issues = linkStatus?.issues || {};
  const checkedOn = linkStatus?.checked ? formatDate(linkStatus.checked) : null;

  const tools = data.tools.map((tool, order) => ({
    ...tool,
    id: toolId(tool.name),
    order,
    unreachable: issues[tool.url]?.state === "broken",
    haystack: foldText(
      [
        tool.name,
        tool.description,
        catById[tool.category]?.name,
        TYPE_LABELS[tool.type],
        tool.type,
        tool.pricing,
        tool.region,
        ...(tool.tags || []),
        tool.openSource ? "open source oss" : "",
        tool.account ? "account registration" : "no account",
        tool.apiKey ? "api key" : "",
        displayUrl(tool.url),
      ].join(" ")
    ),
    nameFolded: foldText(tool.name),
  }));

  const prefs = loadPrefs();
  const el = (id) => document.getElementById(id);
  const search = el("tool-search");
  const toggles = { free: el("f-free"), noacct: el("f-noacct"), nokey: el("f-nokey"), oss: el("f-oss"), starred: el("f-starred") };
  const type = el("f-type");
  const nav = el("category-chips");
  const list = el("tool-list");
  const count = el("result-count");
  const myList = el("mylist-count");

  let category = "";

  const chipEls = new Map();
  const makeChip = (id, label) => {
    const chip = h("button", { type: "button", class: "chip", "aria-pressed": "false" }, h("span", { class: "label" }, label), h("span", { class: "n" }));
    chip.addEventListener("click", () => {
      category = category === id ? "" : id;
      render(true);
      const top = list.getBoundingClientRect().top;
      if (top < 0) window.scrollBy({ top: top - 16 });
    });
    chipEls.set(id, chip);
    nav.append(chip);
  };
  makeChip("", "All tools");
  categories.forEach((c) => makeChip(c.id, c.name));

  let typingTimer;
  search.addEventListener("input", () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => render(true), 120);
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      search.value = "";
      render(true);
    }
  });
  [...Object.values(toggles), type].forEach((input) => input.addEventListener("change", () => render(true)));
  el("f-reset").addEventListener("click", reset);

  el("prefs-export").addEventListener("click", () => exportPrefs(prefs));
  el("prefs-import").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const added = importPrefs(prefs, await file.text());
      savePrefs(prefs);
      render(false);
      flash(`Imported ${added} item${added === 1 ? "" : "s"}.`);
    } catch (error) {
      flash(`Import failed: ${error.message}`);
    }
  });

  function flash(message) {
    myList.textContent = message;
    setTimeout(updateMyList, 2500);
  }

  function updateMyList() {
    const notes = Object.keys(prefs.notes).length;
    myList.textContent = `★ ${prefs.starred.size} starred · ${notes} note${notes === 1 ? "" : "s"}`;
  }

  function persist() {
    if (!savePrefs(prefs)) flash("This browser blocks storage, so stars and notes will not be kept.");
    else updateMyList();
  }

  function reset() {
    search.value = "";
    Object.values(toggles).forEach((t) => (t.checked = false));
    type.value = "";
    category = "";
    render(true);
  }

  function readFilters() {
    const f = { q: search.value.trim(), cat: category, type: type.value };
    for (const flag of FLAGS) f[flag] = toggles[flag].checked;
    return f;
  }

  function matches(tool, f, tokens, ignoreCategory = false) {
    if (!ignoreCategory && f.cat && tool.category !== f.cat) return false;
    if (f.free && tool.pricing !== "free") return false;
    if (f.noacct && tool.account) return false;
    if (f.nokey && tool.apiKey) return false;
    if (f.oss && !tool.openSource) return false;
    if (f.starred && !prefs.starred.has(tool.id)) return false;
    if (f.type && tool.type !== f.type) return false;
    return tokens.every((t) => tool.haystack.includes(t) || (prefs.notes[tool.id] && foldText(prefs.notes[tool.id]).includes(t)));
  }

  function score(tool, tokens) {
    if (!tokens.length) return 0;
    const q = tokens.join(" ");
    if (tool.nameFolded === q) return 3;
    if (tool.nameFolded.startsWith(q)) return 2;
    if (tokens.some((t) => tool.nameFolded.includes(t))) return 1;
    return 0;
  }

  function render(fromUser = false) {
    const f = readFilters();
    const tokens = foldText(f.q).split(/\s+/).filter(Boolean);

    // Category counts respect every filter except the category itself.
    const perCategory = {};
    let totalForChips = 0;
    for (const tool of tools) {
      if (!matches(tool, f, tokens, true)) continue;
      perCategory[tool.category] = (perCategory[tool.category] || 0) + 1;
      totalForChips++;
    }
    for (const [id, chip] of chipEls) {
      const n = id ? perCategory[id] || 0 : totalForChips;
      chip.querySelector(".n").textContent = n;
      chip.setAttribute("aria-pressed", String(id === f.cat));
      chip.hidden = n === 0 && id !== f.cat && id !== "";
    }
    // In the swipeable row on phones, bring the selected category into view.
    const active = chipEls.get(f.cat);
    if (nav.scrollWidth > nav.clientWidth && active) {
      nav.scrollLeft = active.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft - 16;
    }

    const shown = tools
      .filter((tool) => matches(tool, f, tokens))
      .sort((a, b) => score(b, tokens) - score(a, tokens) || a.order - b.order);

    const what =
      shown.length === tools.length ? `${tools.length} tools in ${categories.length} categories` : `${shown.length} of ${tools.length} tools`;
    count.textContent = checkedOn ? `${what} · links checked ${checkedOn}` : what;
    updateMyList();

    if (!shown.length) {
      const hint = f.starred && prefs.starred.size === 0 ? "You have not starred any tools yet." : "No tools match these filters.";
      list.replaceChildren(h("p", { class: "empty" }, hint, h("button", { type: "button", class: "small-btn", onclick: reset }, "Clear filters")));
    } else {
      list.replaceChildren(...categories.map((c) => renderSection(c, shown.filter((t) => t.category === c.id))).filter(Boolean));
    }

    if (fromUser) onStateChange(toQuery(f));
  }

  function renderSection(cat, items) {
    if (!items.length) return null;
    return h(
      "section",
      { class: "cat-section", id: `cat-${cat.id}` },
      h("header", {}, h("h2", {}, cat.name, h("span", { class: "n" }, items.length)), h("p", { class: "blurb" }, cat.blurb)),
      h("div", { class: "cards" }, items.map(renderCard))
    );
  }

  function renderCard(tool) {
    const card = h("article", { class: "card" });
    const fill = () => card.replaceChildren(...cardContent(tool, card, fill).filter(Boolean));
    fill();
    return card;
  }

  function cardContent(tool, card, refresh) {
    const starred = prefs.starred.has(tool.id);
    const note = prefs.notes[tool.id] || "";
    card.classList.toggle("starred", starred);
    card.classList.toggle("unreachable", tool.unreachable);

    const star = h(
      "button",
      { type: "button", class: "star", "aria-pressed": String(starred), "aria-label": `${starred ? "Unstar" : "Star"} ${tool.name}`, title: starred ? "Unstar" : "Star" },
      starred ? "★" : "☆"
    );
    star.addEventListener("click", () => {
      if (prefs.starred.has(tool.id)) prefs.starred.delete(tool.id);
      else prefs.starred.add(tool.id);
      persist();
      if (toggles.starred.checked) render(false);
      else refresh();
    });

    const noteBtn = h("button", { type: "button", class: "note-btn", "aria-expanded": "false" }, note ? "Edit note" : "Add note");
    noteBtn.addEventListener("click", () => openEditor(tool, card, noteBtn, refresh));

    return [
      h("div", { class: "card-head" }, h("h3", {}, extLink(tool.url, {}, tool.name, h("span", { class: "arrow", "aria-hidden": "true" }, "↗"))), star),
      h("p", {}, tool.description),
      note ? h("p", { class: "note-text" }, note) : null,
      h(
        "div",
        { class: "meta" },
        h("span", { class: "host", title: tool.url }, displayUrl(tool.url)),
        h("span", { class: `pill ${tool.pricing === "free" ? "free" : tool.pricing === "paid" ? "paid" : ""}` }, PRICING_LABELS[tool.pricing]),
        h("span", { class: "pill" }, TYPE_LABELS[tool.type]),
        tool.openSource ? h("span", { class: "pill oss" }, "Open source") : null,
        tool.account ? h("span", { class: "pill" }, "Account") : null,
        tool.apiKey ? h("span", { class: "pill" }, "API key") : null,
        tool.region ? h("span", { class: "pill", title: "Mainly useful for this region" }, tool.region) : null,
        tool.unreachable ? h("span", { class: "pill bad", title: `No response at the last link check (${checkedOn})` }, "Unreachable") : null,
        noteBtn
      ),
    ];
  }

  function openEditor(tool, card, button, refresh) {
    if (card.querySelector(".note-input")) return;
    button.setAttribute("aria-expanded", "true");
    const input = h("textarea", { class: "note-input", rows: "3", maxlength: "4000", placeholder: "Your note, saved in this browser only", "aria-label": `Note for ${tool.name}` }, prefs.notes[tool.id] || "");
    let timer;
    const save = () => {
      const text = input.value.trim();
      if (text) prefs.notes[tool.id] = text;
      else delete prefs.notes[tool.id];
      persist();
    };
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(save, 300);
    });
    const done = h("button", { type: "button", class: "small-btn" }, "Done");
    const close = () => {
      clearTimeout(timer);
      save();
      refresh();
    };
    done.addEventListener("click", close);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) close();
    });
    card.append(h("div", { class: "note-editor" }, input, done));
    input.focus();
  }

  function toQuery(f) {
    const params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.cat) params.set("cat", f.cat);
    for (const flag of FLAGS) if (f[flag]) params.set(flag, "1");
    if (f.type) params.set("type", f.type);
    return params.toString();
  }

  /** Apply filters from the hash query string, e.g. "cat=email&free=1". */
  function applyQuery(query) {
    const params = new URLSearchParams(query);
    search.value = params.get("q") || "";
    category = catById[params.get("cat")] ? params.get("cat") : "";
    for (const flag of FLAGS) toggles[flag].checked = params.get(flag) === "1";
    type.value = TYPE_LABELS[params.get("type")] ? params.get("type") : "";
    render(false);
  }

  return { applyQuery, focus: () => search.focus(), total: tools.length };
}
