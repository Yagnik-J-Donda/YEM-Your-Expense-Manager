"use strict";

function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readStoredObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

let deletedCategories = readStoredArray("deletedCategories");
let deletedEntries = readStoredArray("deletedEntries");
let expenses = readStoredArray("expenses");
let categoryLimits = readStoredObject("categoryLimits");
let categoryKinds = readStoredObject("categoryKinds");
let categoryMeta = readStoredObject("categoryMeta");
let categoryProjections = readStoredObject("categoryProjections");
let categoryBudgetModes = readStoredObject("categoryBudgetModes");
let categoryVisibility = readStoredObject("categoryVisibility");

function saveRecycleData() {
  localStorage.setItem("deletedCategories", JSON.stringify(deletedCategories));
  localStorage.setItem("deletedEntries", JSON.stringify(deletedEntries));
  localStorage.setItem("expenses", JSON.stringify(expenses));
  localStorage.setItem("categoryLimits", JSON.stringify(categoryLimits));
  localStorage.setItem("categoryKinds", JSON.stringify(categoryKinds));
  localStorage.setItem("categoryMeta", JSON.stringify(categoryMeta));
  localStorage.setItem("categoryProjections", JSON.stringify(categoryProjections));
  localStorage.setItem("categoryBudgetModes", JSON.stringify(categoryBudgetModes));
  localStorage.setItem("categoryVisibility", JSON.stringify(categoryVisibility));
}

function setStatus(message) {
  document.getElementById("recycle-status").textContent = message;
}

function createEmptyState(icon, message) {
  const empty = document.createElement("div");
  empty.className = "recycle-bin-empty";
  const symbol = document.createElement("span");
  symbol.textContent = icon;
  const text = document.createElement("p");
  text.textContent = message;
  empty.append(symbol, text);
  return empty;
}

function formatDeletedDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

function restoreCategory(index) {
  const item = deletedCategories[index];
  if (!item) return;

  categoryLimits[item.category] = Number(item.limit) || 0;
  categoryKinds[item.category] = item.kind || "Variable";
  categoryMeta[item.category] = item.meta || {};
  categoryProjections[item.category] = item.projections || [];
  categoryBudgetModes[item.category] = item.budgetMode || "allowance";
  categoryVisibility[item.category] = item.visibility || "visible";
  deletedCategories.splice(index, 1);
  saveRecycleData();
  renderAll();
  setStatus(`Category "${item.category}" restored.`);
}

function restoreEntry(index) {
  const item = deletedEntries[index];
  if (!item) return;

  const restored = { ...item };
  delete restored.deletedAt;
  expenses.push(restored);
  deletedEntries.splice(index, 1);
  saveRecycleData();
  renderAll();
  setStatus(`Expense in "${item.category || "Uncategorized"}" restored.`);
}

function renderDeletedCategories() {
  const list = document.getElementById("deleted-categories-list");
  list.replaceChildren();

  if (!deletedCategories.length) {
    list.appendChild(createEmptyState("🗂️", "No deleted categories."));
    return;
  }

  deletedCategories.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "recycle-item";
    const content = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.category || "Unnamed category";
    const linkedCount = deletedEntries.filter(entry => entry.category === item.category).length;
    const meta = document.createElement("p");
    meta.className = "recycle-item-meta";
    meta.textContent = `${item.kind || "Variable"} · Limit $${(Number(item.limit) || 0).toFixed(2)} · ${linkedCount} deleted entr${linkedCount === 1 ? "y" : "ies"}`;
    content.append(title, meta);

    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "recycle-restore-button";
    restore.textContent = "♻️ Restore Category";
    restore.addEventListener("click", () => restoreCategory(index));
    card.append(content, restore);
    list.appendChild(card);
  });
}

function renderDeletedEntries() {
  const list = document.getElementById("deleted-entries-list");
  list.replaceChildren();

  if (!deletedEntries.length) {
    list.appendChild(createEmptyState("💵", "No deleted expense entries."));
    return;
  }

  const groups = new Map();
  deletedEntries.forEach((entry, index) => {
    const category = entry.category || "Uncategorized";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push({ entry, index });
  });

  [...groups.keys()].sort((a, b) => a.localeCompare(b)).forEach(category => {
    const group = document.createElement("section");
    group.className = "recycle-category-group";
    const heading = document.createElement("h3");
    heading.textContent = `🗂️ ${category}`;
    group.appendChild(heading);

    groups.get(category).forEach(({ entry, index }) => {
      const card = document.createElement("article");
      card.className = "recycle-item";
      const content = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = `$${(Number(entry.amount) || 0).toFixed(2)}${entry.details ? ` — ${entry.details}` : ""}`;
      const meta = document.createElement("p");
      meta.className = "recycle-item-meta";
      meta.textContent = `Expense date: ${formatDeletedDate(entry.date)}${entry.deletedAt ? ` · Deleted: ${formatDeletedDate(entry.deletedAt)}` : ""}`;
      content.append(title, meta);

      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "recycle-restore-button";
      restore.textContent = "♻️ Restore Entry";
      restore.addEventListener("click", () => restoreEntry(index));
      card.append(content, restore);
      group.appendChild(card);
    });
    list.appendChild(group);
  });
}

function selectTab(tabName) {
  const categoriesSelected = tabName === "categories";
  const categoriesTab = document.getElementById("deleted-categories-tab");
  const entriesTab = document.getElementById("deleted-entries-tab");
  categoriesTab.classList.toggle("active", categoriesSelected);
  entriesTab.classList.toggle("active", !categoriesSelected);
  categoriesTab.setAttribute("aria-selected", String(categoriesSelected));
  entriesTab.setAttribute("aria-selected", String(!categoriesSelected));
  document.getElementById("deleted-categories-panel").hidden = !categoriesSelected;
  document.getElementById("deleted-entries-panel").hidden = categoriesSelected;
  setStatus("");
}

function renderAll() {
  renderDeletedCategories();
  renderDeletedEntries();
}

document.getElementById("deleted-categories-tab").addEventListener("click", () => selectTab("categories"));
document.getElementById("deleted-entries-tab").addEventListener("click", () => selectTab("entries"));
renderAll();
