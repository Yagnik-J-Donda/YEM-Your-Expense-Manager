"use strict";

function readObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

let categoryLimits = readObject("categoryLimits");
let categoryKinds = readObject("categoryKinds");
let categoryMeta = readObject("categoryMeta");
let categoryProjections = readObject("categoryProjections");
let categoryBudgetModes = readObject("categoryBudgetModes");
let categoryVisibility = readObject("categoryVisibility");
let categoryBudgetSnapshots = readObject("categoryBudgetSnapshots");
let expenses = readArray("expenses");
let deletedCategories = readArray("deletedCategories");
let categoryBeingEdited = null;

const categoryForm = document.getElementById("category-form");
const editCategoryForm = document.getElementById("edit-category-form");
const confirmAddButton = document.getElementById("confirm-add-type-btn");
const overlay = document.getElementById("category-modal-overlay");
const newKindInput = document.getElementById("new-type-kind");
const newModeInput = document.getElementById("new-calculation-mode");
const newLimitInput = document.getElementById("new-type-limit");
const newUnlimitedInput = document.getElementById("new-category-unlimited");
const newVariableScheduleInput = document.getElementById("new-schedule-variable");
const newScheduledDayInput = document.getElementById("new-scheduled-day");
const editKindInput = document.getElementById("edit-type-kind");
const editModeInput = document.getElementById("edit-calculation-mode");
const editLimitInput = document.getElementById("edit-type-limit");
const editUnlimitedInput = document.getElementById("edit-category-unlimited");
const projectionList = document.getElementById("edit-projection-list");

function populateScheduledDays(select) {
  if (select.options.length > 2) return;
  for (let day = 1; day <= 31; day += 1) select.add(new Option(`Day ${day}`, String(day)));
}

populateScheduledDays(newScheduledDayInput);

function validateRange(startDate, endDate) {
  return !startDate || !endDate || startDate <= endDate;
}

function normalizedMode(category) {
  return categoryBudgetModes[category] === "projections" ? "projections" : "allowance";
}

function syncDurationInputs(checkbox, startInput, endInput) {
  startInput.disabled = checkbox.checked;
  endInput.disabled = checkbox.checked;
}

function syncNewSchedule(resetFixedDefault = false) {
  newVariableScheduleInput.disabled = false;
  if (resetFixedDefault) newVariableScheduleInput.checked = true;
  newScheduledDayInput.disabled = newVariableScheduleInput.checked;
  newScheduledDayInput.required = newModeInput.value === "projections" && !newVariableScheduleInput.checked;
  newScheduledDayInput.closest(".category-form-group").classList.toggle("schedule-field-disabled", newVariableScheduleInput.checked);
}

function syncNewMode() {
  const projectionsMode = newModeInput.value === "projections";
  document.querySelectorAll(".new-projection-only").forEach(element => { element.hidden = !projectionsMode; });
  document.getElementById("new-allowance-group").hidden = false;
  document.getElementById("new-amount-label").textContent = projectionsMode ? "Initial Projection Amount ($) *" : "Monthly Allowance ($) *";
  newLimitInput.required = true;
  document.getElementById("new-projection-name").required = projectionsMode;
  syncNewSchedule();
}

function syncEditMode() {
  const projectionsMode = editModeInput.value === "projections";
  document.getElementById("edit-projections-section").hidden = !projectionsMode;
  document.getElementById("edit-allowance-duration").hidden = projectionsMode;
  editLimitInput.closest(".category-form-group").hidden = projectionsMode;
  editLimitInput.required = !projectionsMode;
  if (projectionsMode && !projectionList.children.length) addProjectionRow();
}

function saveCategoryData() {
  localStorage.setItem("categoryLimits", JSON.stringify(categoryLimits));
  localStorage.setItem("categoryKinds", JSON.stringify(categoryKinds));
  localStorage.setItem("categoryMeta", JSON.stringify(categoryMeta));
  localStorage.setItem("categoryProjections", JSON.stringify(categoryProjections));
  localStorage.setItem("categoryBudgetModes", JSON.stringify(categoryBudgetModes));
  localStorage.setItem("categoryVisibility", JSON.stringify(categoryVisibility));
  localStorage.setItem("categoryBudgetSnapshots", JSON.stringify(categoryBudgetSnapshots));
  localStorage.setItem("expenses", JSON.stringify(expenses));
  localStorage.setItem("deletedCategories", JSON.stringify(deletedCategories));
}

function rangeOverlapsMonth(startDate, endDate, year, month) {
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  return (!startDate || startDate <= monthEnd) && (!endDate || endDate >= monthStart);
}

function snapshotCategoryHistory(category) {
  const now = new Date();
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const projections = Array.isArray(categoryProjections[category]) ? categoryProjections[category] : [];
  const meta = categoryMeta[category] || {};
  const candidates = [meta.startDate, ...projections.flatMap(item => [item.startDate, item.createdAt, item.date]),
    ...expenses.filter(item => item.category === category).map(item => item.date)].filter(Boolean);
  if (!candidates.length) return;
  const dates = candidates.map(value => new Date(value)).filter(date => !Number.isNaN(date.getTime()));
  if (!dates.length) return;
  const earliest = new Date(Math.min(...dates));
  let cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  let safety = 0;
  while (cursor <= previousMonthEnd && safety < 2400) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const mode = normalizedMode(category);
    let relevant = false;
    let amount = 0;
    if (mode === "allowance") {
      relevant = meta.unlimited === true || (!meta.startDate && !meta.endDate) || rangeOverlapsMonth(meta.startDate, meta.endDate, year, month);
      amount = relevant ? Number(categoryLimits[category]) || 0 : 0;
    } else {
      const active = projections.filter(item => rangeOverlapsMonth(item.startDate, item.endDate, year, month));
      relevant = active.length > 0;
      amount = active.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }
    if (relevant) {
      categoryBudgetSnapshots[key] ||= {};
      if (!Object.prototype.hasOwnProperty.call(categoryBudgetSnapshots[key], category)) categoryBudgetSnapshots[key][category] = amount;
    }
    cursor = new Date(year, month + 1, 1);
    safety += 1;
  }
}

function showModal(modal) {
  overlay.style.display = "block";
  modal.style.display = "block";
}

function hideOverlayIfUnused() {
  const open = ["edit-category-modal", "confirm-add-type-modal"].some(id => {
    const modal = document.getElementById(id);
    return modal && getComputedStyle(modal).display !== "none";
  });
  if (!open) overlay.style.display = "none";
}

function closeCategoryEditModal() {
  document.getElementById("edit-category-modal").style.display = "none";
  categoryBeingEdited = null;
  hideOverlayIfUnused();
}

function closeConfirmAddTypeModal() {
  document.getElementById("confirm-add-type-modal").style.display = "none";
  window.tempNewType = null;
  hideOverlayIfUnused();
}

function scheduleLabel(item) {
  if (item.scheduleVariable !== false) return "Variable";
  return item.scheduleDay === "last" ? "Last day of month" : `Day ${item.scheduleDay || 1}`;
}

function renderCategoryManagementList() {
  const list = document.getElementById("category-management-list");
  const empty = document.getElementById("category-empty-state");
  const query = document.getElementById("category-search").value.trim().toLowerCase();
  const kindFilter = document.getElementById("category-kind-filter").value;
  list.replaceChildren();
  const names = Object.keys(categoryLimits)
    .filter(name => name.toLowerCase().includes(query))
    .filter(name => kindFilter === "all" || (categoryKinds[name] || "Variable") === kindFilter)
    .sort((a, b) => {
      const aStarts = a.toLowerCase().split(/\s+/).some(word => word.startsWith(query));
      const bStarts = b.toLowerCase().split(/\s+/).some(word => word.startsWith(query));
      return aStarts !== bStarts ? (aStarts ? -1 : 1) : a.localeCompare(b, undefined, { sensitivity: "base" });
    });
  empty.hidden = names.length > 0;

  names.forEach(name => {
    const mode = normalizedMode(name);
    const projections = Array.isArray(categoryProjections[name]) ? categoryProjections[name] : [];
    const amountValue = mode === "projections"
      ? projections.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
      : Number(categoryLimits[name]) || 0;
    const card = document.createElement("article");
    card.className = "category-management-card";
    const top = document.createElement("div");
    top.className = "category-card-top";
    const icon = document.createElement("div");
    icon.className = "category-card-icon";
    icon.textContent = "🗂️";
    const badge = document.createElement("span");
    badge.className = "category-kind-badge";
    badge.textContent = categoryKinds[name] || "Variable";
    top.append(icon, badge);
    const content = document.createElement("div");
    content.className = "category-card-content";
    const heading = document.createElement("h3");
    heading.textContent = name;
    const modeLine = document.createElement("p");
    modeLine.textContent = mode === "projections" ? `Sum of ${projections.length} projection${projections.length === 1 ? "" : "s"}` : "Monthly allowance";
    const amount = document.createElement("p");
    amount.textContent = `Configured amount: $${amountValue.toFixed(2)}`;
    const visibility = document.createElement("p");
    visibility.textContent = categoryVisibility[name] === "hidden" ? "Budget table: Hidden by user" : "Budget table: Visible when applicable";
    content.append(heading, modeLine, amount, visibility);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "category-card-edit-button";
    edit.textContent = "✏️ Edit Category";
    edit.addEventListener("click", () => openCategoryEditModal(name));
    card.append(top, content, edit);
    list.appendChild(card);
  });
}

function createDaySelect(value = "") {
  const select = document.createElement("select");
  select.className = "projection-schedule-day";
  select.add(new Option("Select day", ""));
  select.add(new Option("Last day of the month", "last"));
  for (let day = 1; day <= 31; day += 1) select.add(new Option(`Day ${day}`, String(day)));
  select.value = value;
  return select;
}

function addProjectionRow(item = {}) {
  const row = document.createElement("article");
  row.className = "projection-editor-card";
  row.dataset.id = item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  row.dataset.createdAt = item.createdAt || new Date().toISOString();
  const title = document.createElement("input");
  title.className = "projection-name";
  title.placeholder = "Expense name";
  title.value = item.name || "";
  const amount = document.createElement("input");
  amount.className = "projection-amount";
  amount.type = "number";
  amount.min = "0";
  amount.step = "0.01";
  amount.placeholder = "Amount";
  amount.value = item.amount ?? "";
  const variableLabel = document.createElement("label");
  variableLabel.className = "projection-variable-check";
  const variable = document.createElement("input");
  variable.type = "checkbox";
  variable.className = "projection-variable";
  variable.checked = item.scheduleVariable !== false;
  variableLabel.append(variable, document.createTextNode(" Variable schedule"));
  const day = createDaySelect(item.scheduleDay || "");
  const start = document.createElement("input");
  start.type = "date";
  start.className = "projection-start";
  start.value = item.startDate || "";
  const end = document.createElement("input");
  end.type = "date";
  end.className = "projection-end";
  end.value = item.endDate || "";
  const notes = document.createElement("input");
  notes.className = "projection-notes";
  notes.placeholder = "Notes (optional)";
  notes.value = item.notes || "";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "delete-category-button projection-remove";
  remove.textContent = "Remove";
  remove.addEventListener("click", async () => {
    if (await yemConfirm({
      title: "Remove projection?",
      message: `Remove the projection "${title.value || "Untitled"}"?`,
      confirmLabel: "Remove projection",
      danger: true
    })) row.remove();
  });
  const sync = () => {
    day.disabled = variable.checked;
    day.required = !variable.checked;
  };
  variable.addEventListener("change", sync);
  sync();
  row.append(title, amount, variableLabel, day, start, end, notes, remove);
  projectionList.appendChild(row);
}

function collectProjectionRows() {
  const rows = [...projectionList.querySelectorAll(".projection-editor-card")];
  return rows.map(row => ({
    id: row.dataset.id,
    name: row.querySelector(".projection-name").value.trim(),
    amount: Number.parseFloat(row.querySelector(".projection-amount").value),
    scheduleVariable: row.querySelector(".projection-variable").checked,
    scheduleDay: row.querySelector(".projection-variable").checked ? "" : row.querySelector(".projection-schedule-day").value,
    startDate: row.querySelector(".projection-start").value,
    endDate: row.querySelector(".projection-end").value,
    notes: row.querySelector(".projection-notes").value.trim(),
    createdAt: row.dataset.createdAt || new Date().toISOString()
  }));
}

function validProjections(items) {
  return items.length > 0 && items.every(item => item.name && Number.isFinite(item.amount) && item.amount >= 0 &&
    (item.scheduleVariable || item.scheduleDay) && validateRange(item.startDate, item.endDate));
}

function openCategoryEditModal(name) {
  if (!Object.prototype.hasOwnProperty.call(categoryLimits, name)) return;
  categoryBeingEdited = name;
  const mode = normalizedMode(name);
  const meta = categoryMeta[name] || {};
  document.getElementById("edit-type-name").value = name;
  editLimitInput.value = Number(categoryLimits[name]) || 0;
  editKindInput.value = categoryKinds[name] || "Variable";
  editModeInput.value = mode;
  document.getElementById("edit-category-start").value = meta.startDate || "";
  document.getElementById("edit-category-end").value = meta.endDate || "";
  editUnlimitedInput.checked = meta.unlimited === true || (!meta.startDate && !meta.endDate);
  syncDurationInputs(editUnlimitedInput, document.getElementById("edit-category-start"), document.getElementById("edit-category-end"));
  projectionList.replaceChildren();
  const projections = Array.isArray(categoryProjections[name]) ? categoryProjections[name] : [];
  projections.forEach(addProjectionRow);
  syncEditMode();
  showModal(document.getElementById("edit-category-modal"));
}

categoryForm.addEventListener("submit", event => {
  event.preventDefault();
  const name = document.getElementById("new-type-name").value.trim();
  const kind = newKindInput.value;
  const mode = newModeInput.value;
  const allowance = Number.parseFloat(newLimitInput.value);
  const unlimited = newUnlimitedInput.checked;
  const startDate = unlimited ? "" : document.getElementById("new-category-start").value;
  const endDate = unlimited ? "" : document.getElementById("new-category-end").value;
  const projection = mode === "projections" ? {
    id: `${Date.now()}`,
    name: document.getElementById("new-projection-name").value.trim(),
    amount: allowance,
    scheduleVariable: newVariableScheduleInput.checked,
    scheduleDay: newVariableScheduleInput.checked ? "" : newScheduledDayInput.value,
    startDate,
    endDate,
    notes: document.getElementById("new-projection-notes").value.trim(),
    createdAt: new Date().toISOString(),
    date: new Date().toISOString().slice(0, 10)
  } : null;
  if (!name || Object.prototype.hasOwnProperty.call(categoryLimits, name)) {
    yemToast(name ? "This category already exists." : "Please enter a category name.");
    return;
  }
  if (!validateRange(startDate, endDate)) {
    yemToast("The active-until date cannot be before the active-from date.");
    return;
  }
  if (mode === "allowance" && (!Number.isFinite(allowance) || allowance < 0)) {
    yemToast("Please enter a valid monthly allowance.");
    return;
  }
  if (mode === "projections" && !validProjections([projection])) {
    yemToast("Please complete the projected expense, amount, schedule and dates correctly.");
    return;
  }
  window.tempNewType = { name, kind, mode, allowance, projection, startDate, endDate, unlimited };
  const details = document.getElementById("confirm-type-details");
  details.replaceChildren();
  const lines = [`Name: ${name}`, `Type: ${kind}`, `Calculation: ${mode === "allowance" ? "Monthly Allowance" : "Sum of Projections"}`];
  if (mode === "allowance") lines.push(`Monthly allowance: $${allowance.toFixed(2)}`);
  else lines.push(`Initial projection: ${projection.name} — $${projection.amount.toFixed(2)} — ${scheduleLabel(projection)}`);
  lines.push(unlimited ? "Plan active: Unlimited" : `Plan active: ${startDate || "No start limit"} to ${endDate || "No expiry"}`);
  lines.forEach(line => {
    const span = document.createElement("span");
    span.textContent = line;
    span.style.display = "block";
    details.appendChild(span);
  });
  showModal(document.getElementById("confirm-add-type-modal"));
});

confirmAddButton.addEventListener("click", () => {
  const item = window.tempNewType;
  if (!item) return;
  categoryKinds[item.name] = item.kind;
  categoryBudgetModes[item.name] = item.mode;
  categoryLimits[item.name] = item.mode === "allowance" ? item.allowance : item.projection.amount;
  categoryMeta[item.name] = item.mode === "allowance"
    ? { startDate: item.startDate, endDate: item.endDate, unlimited: item.unlimited }
    : { unlimited: true, startDate: "", endDate: "" };
  categoryProjections[item.name] = item.mode === "projections" ? [item.projection] : [];
  categoryVisibility[item.name] = "visible";
  saveCategoryData();
  categoryForm.reset();
  newKindInput.value = "Variable";
  newModeInput.value = "allowance";
  newUnlimitedInput.checked = true;
  syncNewMode();
  syncDurationInputs(newUnlimitedInput, document.getElementById("new-category-start"), document.getElementById("new-category-end"));
  closeConfirmAddTypeModal();
  renderCategoryManagementList();
});

editCategoryForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!categoryBeingEdited) return;
  const oldName = categoryBeingEdited;
  const newName = document.getElementById("edit-type-name").value.trim();
  const kind = editKindInput.value;
  const mode = editModeInput.value;
  const allowance = Number.parseFloat(editLimitInput.value);
  const unlimited = editUnlimitedInput.checked;
  const startDate = unlimited ? "" : document.getElementById("edit-category-start").value;
  const endDate = unlimited ? "" : document.getElementById("edit-category-end").value;
  const projections = mode === "projections" ? collectProjectionRows() : [];
  if (!newName || (newName !== oldName && Object.prototype.hasOwnProperty.call(categoryLimits, newName))) {
    yemToast(newName ? "Another category already uses this name." : "Please enter a category name.");
    return;
  }
  if (mode === "allowance" && (!Number.isFinite(allowance) || allowance < 0 || !validateRange(startDate, endDate))) {
    yemToast("Please enter a valid allowance and active period.");
    return;
  }
  if (mode === "projections" && !validProjections(projections)) {
    yemToast("Each projection needs a name, valid amount, schedule and valid active period.");
    return;
  }
  snapshotCategoryHistory(oldName);
  const wasHidden = categoryVisibility[oldName] === "hidden";
  if (wasHidden && (mode === "allowance" ? allowance > 0 : projections.some(item => item.amount > 0))) {
    if (await yemConfirm({
      title: "Show category again?",
      message: `"${newName}" was hidden from the budget table. Show it again with these active budget settings?`,
      confirmLabel: "Show category"
    })) categoryVisibility[oldName] = "visible";
  }
  categoryKinds[newName] = kind;
  categoryBudgetModes[newName] = mode;
  categoryLimits[newName] = mode === "allowance" ? allowance : projections.reduce((sum, item) => sum + item.amount, 0);
  categoryMeta[newName] = mode === "allowance" ? { startDate, endDate, unlimited } : { unlimited: true, startDate: "", endDate: "" };
  categoryProjections[newName] = projections;
  categoryVisibility[newName] = categoryVisibility[oldName] || "visible";
  if (newName !== oldName) {
    Object.values(categoryBudgetSnapshots).forEach(snapshot => {
      if (Object.prototype.hasOwnProperty.call(snapshot, oldName)) {
        snapshot[newName] = snapshot[oldName];
        delete snapshot[oldName];
      }
    });
    expenses = expenses.map(expense => expense.category === oldName ? { ...expense, category: newName } : expense);
    delete categoryLimits[oldName];
    delete categoryKinds[oldName];
    delete categoryMeta[oldName];
    delete categoryProjections[oldName];
    delete categoryBudgetModes[oldName];
    delete categoryVisibility[oldName];
  }
  saveCategoryData();
  closeCategoryEditModal();
  renderCategoryManagementList();
});

async function deleteCategory() {
  if (!categoryBeingEdited) return;
  const name = categoryBeingEdited;
  if (!await yemConfirm({
    title: "Delete category?",
    message: `Delete "${name}"? Existing expense records will remain saved and the category can be restored from the Recycle Bin.`,
    confirmLabel: "Delete category",
    danger: true
  })) return;
  snapshotCategoryHistory(name);
  deletedCategories.push({
    category: name,
    limit: Number(categoryLimits[name]) || 0,
    kind: categoryKinds[name] || "Variable",
    meta: categoryMeta[name] || {},
    projections: categoryProjections[name] || [],
    budgetMode: normalizedMode(name),
    visibility: categoryVisibility[name] || "visible",
    deletedAt: new Date().toISOString()
  });
  delete categoryLimits[name];
  delete categoryKinds[name];
  delete categoryMeta[name];
  delete categoryProjections[name];
  delete categoryBudgetModes[name];
  delete categoryVisibility[name];
  saveCategoryData();
  closeCategoryEditModal();
  renderCategoryManagementList();
}

document.getElementById("category-search").addEventListener("input", renderCategoryManagementList);
document.getElementById("category-kind-filter").addEventListener("change", renderCategoryManagementList);
newModeInput.addEventListener("change", syncNewMode);
newVariableScheduleInput.addEventListener("change", () => syncNewSchedule());
newUnlimitedInput.addEventListener("change", () => syncDurationInputs(newUnlimitedInput, document.getElementById("new-category-start"), document.getElementById("new-category-end")));
editModeInput.addEventListener("change", syncEditMode);
editUnlimitedInput.addEventListener("change", () => syncDurationInputs(editUnlimitedInput, document.getElementById("edit-category-start"), document.getElementById("edit-category-end")));
document.getElementById("add-projection-row").addEventListener("click", () => addProjectionRow());
overlay.addEventListener("click", () => { closeCategoryEditModal(); closeConfirmAddTypeModal(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") { closeCategoryEditModal(); closeConfirmAddTypeModal(); } });

window.openCategoryEditModal = openCategoryEditModal;
window.closeCategoryEditModal = closeCategoryEditModal;
window.closeConfirmAddTypeModal = closeConfirmAddTypeModal;
window.deleteCategory = deleteCategory;

syncNewMode();
syncDurationInputs(newUnlimitedInput, document.getElementById("new-category-start"), document.getElementById("new-category-end"));
renderCategoryManagementList();
