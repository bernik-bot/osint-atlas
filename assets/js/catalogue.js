import { h, extLink, displayUrl, foldText } from "./dom.js";

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

/**
 * Catalogue view. Filter state lives in the URL hash (#catalogue?q=…&cat=…)
 * so a filtered view can be bookmarked or shared.
 */
export function initCatalogue(data, { onStateChange }) {
  const categories = data.categories;
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const tools = data.tools.map((tool, order) => ({
    ...tool,
    order,
    haystack: foldText(
      [
        tool.name,
        tool.description,
        catById[tool.category]?.name,
        TYPE_LABELS[tool.type],
        tool.type,
        tool.pricing,
        tool.region,
        tool.openSource ? "open source oss" : "",
        tool.account ? "account registration" : "no account",
        displayUrl(tool.url),
      ].join(" ")
    ),
    nameFolded: foldText(tool.name),
  }));

  const search = document.getElementById("tool-search");
  const free = document.getElementById("f-free");
  const noAcct = document.getElementById("f-noacct");
  const oss = document.getElementById("f-oss");
  const type = document.getElementById("f-type");
  const chipBox = document.getElementById("category-chips");
  const list = document.getElementById("tool-list");
  const count = document.getElementById("result-count");

  let category = "";

  const chipEls = new Map();
  const makeChip = (id, label) => {
    const chip = h("button", { type: "button", class: "chip", "aria-pressed": "false" }, label, h("span", { class: "n" }));
    chip.addEventListener("click", () => {
      category = category === id ? "" : id;
      render(true);
    });
    chipEls.set(id, chip);
    chipBox.append(chip);
  };
  makeChip("", "All");
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
  [free, noAcct, oss, type].forEach((el) => el.addEventListener("change", () => render(true)));
  document.getElementById("f-reset").addEventListener("click", reset);

  function reset() {
    search.value = "";
    free.checked = noAcct.checked = oss.checked = false;
    type.value = "";
    category = "";
    render(true);
  }

  function readFilters() {
    return {
      q: search.value.trim(),
      cat: category,
      free: free.checked,
      noacct: noAcct.checked,
      oss: oss.checked,
      type: type.value,
    };
  }

  function matches(tool, f, tokens, ignoreCategory = false) {
    if (!ignoreCategory && f.cat && tool.category !== f.cat) return false;
    if (f.free && tool.pricing !== "free") return false;
    if (f.noacct && tool.account) return false;
    if (f.oss && !tool.openSource) return false;
    if (f.type && tool.type !== f.type) return false;
    return tokens.every((t) => tool.haystack.includes(t));
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

    // Chip counts respect every filter except the category itself.
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
      chip.hidden = n === 0 && id !== f.cat;
    }

    const shown = tools
      .filter((tool) => matches(tool, f, tokens))
      .sort((a, b) => score(b, tokens) - score(a, tokens) || a.order - b.order);

    count.textContent =
      shown.length === tools.length ? `${tools.length} tools in ${categories.length} categories` : `${shown.length} of ${tools.length} tools`;

    if (!shown.length) {
      list.replaceChildren(
        h("p", { class: "empty" }, "No tools match these filters.", h("button", { type: "button", class: "ghost small-btn", onclick: reset }, "Clear filters"))
      );
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
    return h(
      "article",
      { class: "card" },
      h("h3", {}, extLink(tool.url, {}, tool.name, h("span", { class: "arrow", "aria-hidden": "true" }, "↗"))),
      h("p", {}, tool.description),
      h(
        "div",
        { class: "meta" },
        h("span", { class: "host", title: tool.url }, displayUrl(tool.url)),
        h("span", { class: `pill ${tool.pricing === "free" ? "free" : tool.pricing === "paid" ? "paid" : ""}` }, PRICING_LABELS[tool.pricing]),
        h("span", { class: "pill" }, TYPE_LABELS[tool.type]),
        tool.openSource ? h("span", { class: "pill oss" }, "Open source") : null,
        tool.account ? h("span", { class: "pill acct" }, "Account") : null,
        tool.region ? h("span", { class: "pill", title: "Mainly useful for this region" }, tool.region) : null
      )
    );
  }

  function toQuery(f) {
    const params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.cat) params.set("cat", f.cat);
    if (f.free) params.set("free", "1");
    if (f.noacct) params.set("noacct", "1");
    if (f.oss) params.set("oss", "1");
    if (f.type) params.set("type", f.type);
    return params.toString();
  }

  /** Apply filters from the hash query string, e.g. "cat=email&free=1". */
  function applyQuery(query) {
    const params = new URLSearchParams(query);
    search.value = params.get("q") || "";
    category = catById[params.get("cat")] ? params.get("cat") : "";
    free.checked = params.get("free") === "1";
    noAcct.checked = params.get("noacct") === "1";
    oss.checked = params.get("oss") === "1";
    type.value = TYPE_LABELS[params.get("type")] ? params.get("type") : "";
    render(false);
  }

  return { applyQuery, focus: () => search.focus(), total: tools.length };
}
