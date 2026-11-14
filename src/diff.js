"use strict";

/**
 * MikroDesk — comparaison de fichiers texte.
 * Module UMD minimal, utilisable dans le processus principal et le renderer.
 * Retourne une liste de lignes typées : equal, add, del.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MikroDiff = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const MAX_LINES = 1600;

  function splitLines(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/\r\n?/g, "\n")
      .split("\n");
  }

  function fallbackDiff(oldLines, newLines) {
    const rows = [];
    const max = Math.max(oldLines.length, newLines.length);
    for (let index = 0; index < max; index += 1) {
      const before = oldLines[index];
      const after = newLines[index];
      if (before === after) {
        rows.push({ type: "equal", text: before === undefined ? "" : before, oldLine: index + 1, newLine: index + 1 });
      } else {
        if (before !== undefined) rows.push({ type: "del", text: before, oldLine: index + 1, newLine: null });
        if (after !== undefined) rows.push({ type: "add", text: after, oldLine: null, newLine: index + 1 });
      }
    }
    return rows;
  }

  function lcsDiff(oldLines, newLines) {
    const rowsA = oldLines.length;
    const columnsB = newLines.length;
    const width = columnsB + 1;
    const table = new Uint32Array((rowsA + 1) * width);
    for (let i = rowsA - 1; i >= 0; i -= 1) {
      const rowOffset = i * width;
      const nextOffset = (i + 1) * width;
      for (let j = columnsB - 1; j >= 0; j -= 1) {
        table[rowOffset + j] =
          oldLines[i] === newLines[j]
            ? table[nextOffset + j + 1] + 1
            : Math.max(table[nextOffset + j], table[rowOffset + j + 1]);
      }
    }

    const rows = [];
    let i = 0;
    let j = 0;
    while (i < rowsA && j < columnsB) {
      if (oldLines[i] === newLines[j]) {
        rows.push({ type: "equal", text: oldLines[i], oldLine: i + 1, newLine: j + 1 });
        i += 1;
        j += 1;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        rows.push({ type: "del", text: oldLines[i], oldLine: i + 1, newLine: null });
        i += 1;
      } else {
        rows.push({ type: "add", text: newLines[j], oldLine: null, newLine: j + 1 });
        j += 1;
      }
    }
    while (i < rowsA) {
      rows.push({ type: "del", text: oldLines[i], oldLine: i + 1, newLine: null });
      i += 1;
    }
    while (j < columnsB) {
      rows.push({ type: "add", text: newLines[j], oldLine: null, newLine: j + 1 });
      j += 1;
    }
    return rows;
  }

  function diffLines(oldText, newText) {
    const oldLines = splitLines(oldText);
    const newLines = splitLines(newText);
    if (oldLines.length > MAX_LINES || newLines.length > MAX_LINES) {
      return fallbackDiff(oldLines, newLines);
    }
    return lcsDiff(oldLines, newLines);
  }

  function summarize(rows) {
    let added = 0;
    let removed = 0;
    let unchanged = 0;
    (rows || []).forEach((row) => {
      if (row.type === "add") added += 1;
      else if (row.type === "del") removed += 1;
      else unchanged += 1;
    });
    return { added, removed, unchanged, changed: added + removed };
  }

  return { diffLines, summarize, splitLines };
});
