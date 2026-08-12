(function () {
  "use strict";

  let entries = readEntries();

  function readEntries() {
    try { return JSON.parse(localStorage.getItem("incomeEntries") || "[]"); }
    catch { return []; }
  }

  function save() {
    localStorage.setItem("incomeEntries", JSON.stringify(entries));
  }

  function makeId() {
    return `income-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function selectedMonth() {
    const month = Number(document.getElementById("month-select").value);
    const year = Number(document.getElementById("year-select").value);
    return { month, year, key: `${year}-${String(month + 1).padStart(2, "0")}` };
  }

  function money(value) {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(value) || 0);
  }

  function render() {
    const { key } = selectedMonth();
    const monthEntries = entries
      .filter(item => String(item.date || "").slice(0, 7) === key)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const body = document.getElementById("income-summary-body");
    body.replaceChildren();
    if (!monthEntries.length) {
      const row = document.createElement("tr");
      row.innerHTML = '<td colspan="5">No income has been received in this month.</td>';
      body.appendChild(row);
      return;
    }
    monthEntries.forEach(item => {
      const row = document.createElement("tr");
      [item.date, item.source, money(item.amount), item.notes || "—"].forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      const actions = document.createElement("td");
      actions.append(actionButton("Edit", () => editEntry(item.id)), actionButton("Delete", () => deleteEntry(item.id)));
      row.appendChild(actions);
      body.appendChild(row);
    });
  }

  function actionButton(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "income-action-button";
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function editEntry(entryId) {
    const item = entries.find(value => value.id === entryId);
    if (!item) return;
    const amount = prompt(`Amount received from ${item.source}:`, item.amount);
    if (amount === null) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return alert("Enter a valid amount greater than zero.");
    item.amount = parsed;
    save(); render(); updateRemainingBudget();
  }

  function deleteEntry(entryId) {
    if (!confirm("Delete this income entry? This cannot be undone.")) return;
    entries = entries.filter(item => item.id !== entryId);
    save(); render(); updateRemainingBudget();
  }

  document.getElementById("income-entry-form").addEventListener("submit", event => {
    event.preventDefault();
    entries.push({
      id: makeId(),
      source: document.getElementById("income-entry-source").value.trim(),
      amount: Number(document.getElementById("income-entry-amount").value),
      date: document.getElementById("income-entry-date").value,
      notes: document.getElementById("income-entry-notes").value.trim(),
      createdAt: new Date().toISOString()
    });
    save();
    event.target.reset();
    setDefaultDate();
    render();
    updateRemainingBudget();
    if (typeof window.yemEntryDialogSubmitted === "function") window.yemEntryDialogSubmitted("income");
  });

  function setDefaultDate() {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    document.getElementById("income-entry-date").value ||= localDate;
  }

  document.getElementById("month-select").addEventListener("change", render);
  document.getElementById("year-select").addEventListener("change", render);
  window.addEventListener("storage", () => { entries = readEntries(); render(); });
  window.yemRefreshIncomeSummary = render;
  const originalBudgetRefresh = window.updateRemainingBudget;
  if (typeof originalBudgetRefresh === "function") {
    window.updateRemainingBudget = function () {
      const result = originalBudgetRefresh.apply(this, arguments);
      render();
      return result;
    };
  }
  setDefaultDate();
  render();
})();
