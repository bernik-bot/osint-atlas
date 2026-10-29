// Stars and notes live only in this browser (localStorage). Every access is
// wrapped because storage can be disabled, full or missing in private windows.

const KEY = "osint-atlas:v1";

export function loadPrefs() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      starred: new Set(Array.isArray(data.starred) ? data.starred.filter((s) => typeof s === "string") : []),
      notes: cleanNotes(data.notes),
    };
  } catch {
    return { starred: new Set(), notes: {} };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ starred: [...prefs.starred], notes: prefs.notes }));
    return true;
  } catch {
    return false;
  }
}

function cleanNotes(notes) {
  const out = {};
  if (notes && typeof notes === "object") {
    for (const [id, text] of Object.entries(notes)) {
      if (typeof text === "string" && text.trim()) out[id] = text.slice(0, 4000);
    }
  }
  return out;
}

/** Save stars and notes as a JSON file, e.g. to move them to another browser. */
export function exportPrefs(prefs) {
  const payload = {
    app: "osint-atlas",
    version: 1,
    exported: new Date().toISOString(),
    starred: [...prefs.starred].sort(),
    notes: prefs.notes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "osint-atlas-notes.json";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Merge an exported file into the current prefs. Returns how many items came in. */
export function importPrefs(prefs, text) {
  const data = JSON.parse(text);
  if (!data || data.app !== "osint-atlas") throw new Error("Not an OSINT Atlas export file.");
  let added = 0;
  for (const id of Array.isArray(data.starred) ? data.starred : []) {
    if (typeof id === "string" && !prefs.starred.has(id)) {
      prefs.starred.add(id);
      added++;
    }
  }
  for (const [id, text] of Object.entries(cleanNotes(data.notes))) {
    if (prefs.notes[id] !== text) added++;
    prefs.notes[id] = text;
  }
  return added;
}
