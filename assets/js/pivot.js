import { h, extLink, hostOf, copyButton } from "./dom.js";
import { detect, normalise, buildLinks, sha256Hex } from "./selectors.js";

const EXAMPLES = [
  ["username", "torvalds"],
  ["email", "someone@example.com"],
  ["domain", "example.com"],
  ["ip", "1.1.1.1"],
  ["phone", "+421 905 123 456"],
  ["image", "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg"],
  ["crypto", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"],
  ["hash", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
];

export function initPivot(data) {
  const types = data.types;
  const labelOf = Object.fromEntries(types.map((t) => [t.id, t.label]));
  const input = document.getElementById("pivot-input");
  const typeBox = document.getElementById("pivot-types");
  const output = document.getElementById("pivot-output");
  const form = document.getElementById("pivot-form");

  // "auto" follows detection; any other value is a manual override.
  let chosen = "auto";
  let renderToken = 0;

  const chips = new Map();
  const addChip = (id, label) => {
    const chip = h("button", { type: "button", class: "chip", role: "radio", "aria-checked": "false", "data-type": id }, label);
    chip.addEventListener("click", () => {
      chosen = id;
      update();
    });
    chips.set(id, chip);
    typeBox.append(chip);
  };
  addChip("auto", "Auto");
  types.forEach((t) => addChip(t.id, t.label));

  form.addEventListener("submit", (event) => event.preventDefault());
  input.addEventListener("input", () => update());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setValue("");
  });
  document.getElementById("pivot-clear").addEventListener("click", () => {
    setValue("");
    input.focus();
  });

  function setValue(value, type = "auto") {
    input.value = value;
    chosen = type;
    update();
  }

  async function update() {
    const token = ++renderToken;
    const raw = input.value;
    const detected = detect(raw);
    const type = chosen === "auto" ? detected?.type : chosen;

    for (const [id, chip] of chips) {
      chip.setAttribute("aria-checked", String(id === chosen));
      chip.classList.toggle("detected", chosen === "auto" && detected?.type === id);
    }

    if (!raw.trim()) {
      output.replaceChildren(renderIntro());
      return;
    }
    if (!type) {
      output.replaceChildren(
        h("p", { class: "unknown" }, "Can't tell what this is. Pick a type above to pivot on it anyway.")
      );
      return;
    }

    const norm = normalise(type, raw);
    if (type === "email") {
      norm.ctx.sha256 = await sha256Hex(norm.value);
      if (!norm.ctx.sha256) norm.notes.push("Gravatar links need HTTPS or localhost to hash the address.");
    }
    if (token !== renderToken) return; // a newer keystroke already rendered

    const links = buildLinks(data.pivots, type, norm);
    output.replaceChildren(renderResult(type, norm, links));
  }

  function renderResult(type, norm, links) {
    const groups = new Map();
    for (const link of links) {
      if (!groups.has(link.group)) groups.set(link.group, []);
      groups.get(link.group).push(link);
    }

    const summary = h(
      "div",
      { class: "pivot-summary" },
      h("span", { class: "kind" }, labelOf[type]),
      h("span", { class: "value" }, norm.value),
      h("span", { class: "spacer" }),
      h("span", { class: "total" }, `${links.length} lookups in ${groups.size} groups`),
      copyButton("Copy all as checklist", () => checklist(labelOf[type], norm, groups))
    );

    const notes = norm.notes.length ? h("ul", { class: "notes" }, norm.notes.map((n) => h("li", {}, n))) : null;

    const related = norm.related.length
      ? h(
          "div",
          { class: "related" },
          "Pivot on:",
          norm.related.map((r) =>
            h("button", { type: "button", class: "chip", onclick: () => setValue(r.value, r.type) }, `${labelOf[r.type]}: ${r.value}`)
          )
        )
      : null;

    const groupEls = [...groups].map(([name, items]) =>
      h(
        "section",
        { class: "link-group" },
        h(
          "h3",
          {},
          name,
          h("span", { class: "n" }, items.length),
          copyButton("Copy", () => items.map((l) => l.href).join("\n"))
        ),
        h(
          "ul",
          { class: "links" },
          items.map((link) =>
            h(
              "li",
              {},
              extLink(
                link.href,
                { title: link.href },
                h("span", { class: "name" }, link.name),
                h("span", { class: "host" }, hostOf(link.href)),
                link.note ? h("span", { class: "note" }, link.note) : null
              )
            )
          )
        )
      )
    );

    return h("div", {}, summary, notes, related, h("div", { class: "link-groups" }, groupEls));
  }

  function renderIntro() {
    return h(
      "div",
      {},
      h(
        "div",
        { class: "examples" },
        h("h2", {}, "Try an example"),
        h(
          "div",
          { class: "example-list" },
          EXAMPLES.map(([type, value]) =>
            h(
              "button",
              { type: "button", onclick: () => setValue(value) },
              h("span", { class: "t" }, labelOf[type]),
              h("span", { class: "v" }, value.length > 34 ? `${value.slice(0, 31)}…` : value)
            )
          )
        )
      ),
      h(
        "div",
        { class: "how" },
        h("div", {}, h("b", {}, "1. Paste a selector"), h("p", {}, "The type is detected for you. Click a chip to override it.")),
        h("div", {}, h("b", {}, "2. Open what you need"), h("p", {}, "Links are grouped by purpose: profiles, breaches, DNS, reputation, archives.")),
        h("div", {}, h("b", {}, "3. Keep notes"), h("p", {}, "Copy every link as a Markdown checklist for your case file."))
      )
    );
  }

  update();
  return { focus: () => input.focus() };
}

function checklist(label, norm, groups) {
  const lines = [`## ${label}: ${norm.value}`, ""];
  for (const [name, items] of groups) {
    lines.push(`### ${name}`);
    for (const link of items) lines.push(`- [ ] [${link.name}](${link.href})`);
    lines.push("");
  }
  return lines.join("\n");
}
