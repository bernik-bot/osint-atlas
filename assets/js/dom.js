// Tiny DOM helpers. Everything is built with createElement/textContent,
// never innerHTML, so data from the JSON files cannot inject markup.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Link that opens in a new tab without leaking the referrer or window handle. */
export function extLink(href, attrs, ...children) {
  return h("a", { href, target: "_blank", rel: "noopener noreferrer", referrerpolicy: "no-referrer", ...attrs }, ...children);
}

export function hostOf(href) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Host plus path, shortened for display: "github.com/sherlock-project/sherlock". */
export function displayUrl(href) {
  try {
    const url = new URL(href);
    const path = url.pathname.replace(/\/$/, "");
    return url.hostname.replace(/^www\./, "") + (path.length > 1 ? path : "");
  } catch {
    return href;
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // CSSOM styles are allowed under the page's CSP; a style attribute is not.
    const area = h("textarea", {}, text);
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** Button that copies text and briefly shows "Copied". */
export function copyButton(label, getText) {
  const button = h("button", { type: "button", class: "small-btn" }, label);
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    const ok = await copyText(getText());
    button.textContent = ok ? "Copied" : "Copy failed";
    button.classList.toggle("done", ok);
    setTimeout(() => {
      button.textContent = label;
      button.classList.remove("done");
    }, 1400);
  });
  return button;
}

export function foldText(text) {
  return String(text).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
