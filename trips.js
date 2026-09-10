"use strict";

(function () {
  const readArray = key => {
    try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  };
  const money = value => `$${Number(value || 0).toFixed(2)}`;
  const localDate = value => {
    const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString();
  };
  const transactionDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString();
  };
  const signedAmount = expense => (expense.transactionType === "credit" ? -1 : 1) * (Number(expense.amount) || 0);
  const id = () => globalThis.crypto?.randomUUID?.() || `trip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const paymentLabel = value => ({ "credit-card": "Credit Card", "debit-card": "Debit Card", cash: "Cash" }[value] || "Other");

  let trips = readArray("trips");
  let expenses = readArray("expenses");
  let scheduledPayments = readArray("scheduledPayments");
  const form = document.getElementById("trip-form");
  const editId = document.getElementById("trip-edit-id");

  function save() {
    localStorage.setItem("trips", JSON.stringify(trips));
    localStorage.setItem("expenses", JSON.stringify(expenses));
    localStorage.setItem("scheduledPayments", JSON.stringify(scheduledPayments));
  }

  function statusFor(trip) {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (todayKey < trip.startDate) return "Upcoming";
    if (todayKey > trip.endDate) return "Completed";
    return "Active";
  }

  function groupedTotals(entries, keyFor) {
    const totals = new Map();
    entries.forEach(entry => {
      const key = keyFor(entry);
      totals.set(key, (totals.get(key) || 0) + signedAmount(entry));
    });
    return [...totals.entries()];
  }

  function breakdown(title, rows) {
    const section = document.createElement("section");
    section.className = "trip-breakdown";
    const heading = document.createElement("h4");
    heading.textContent = title;
    section.appendChild(heading);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.textContent = "No spending recorded.";
      section.appendChild(empty);
      return section;
    }
    const list = document.createElement("dl");
    rows.forEach(([label, amount]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const value = document.createElement("dd");
      value.textContent = money(amount);
      list.append(term, value);
    });
    section.appendChild(list);
    return section;
  }

  function renderTrip(trip) {
    const entries = expenses
      .filter(expense => expense.tripId === trip.id)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const total = entries.reduce((sum, expense) => sum + signedAmount(expense), 0);
    const budget = trip.budget === null || trip.budget === "" ? null : Number(trip.budget);
    const card = document.createElement("article");
    card.className = "trip-card";

    const header = document.createElement("div");
    header.className = "trip-card-header";
    const identity = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = trip.name;
    const dates = document.createElement("p");
    dates.textContent = `${localDate(trip.startDate)} – ${localDate(trip.endDate)}`;
    identity.append(heading, dates);
    const badge = document.createElement("span");
    badge.className = `trip-status trip-status-${statusFor(trip).toLowerCase()}`;
    badge.textContent = statusFor(trip);
    header.append(identity, badge);

    const metrics = document.createElement("div");
    metrics.className = "trip-metrics";
    const metricValues = [
      ["Total spent", money(total)],
      ["Trip budget", budget === null ? "Not set" : money(budget)],
      ["Remaining", budget === null ? "Not allocated" : money(budget - total)],
      ["Entries", String(entries.length)]
    ];
    metricValues.forEach(([label, value]) => {
      const metric = document.createElement("div");
      metric.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      metrics.appendChild(metric);
    });

    const monthRows = groupedTotals(entries, expense => {
      const date = new Date(expense.date);
      return Number.isNaN(date.getTime()) ? "Unknown month" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }).sort((a, b) => a[0].localeCompare(b[0])).map(([monthKey, amount]) => {
      if (monthKey === "Unknown month") return [monthKey, amount];
      const [year, month] = monthKey.split("-").map(Number);
      return [new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }), amount];
    });
    const categoryRows = groupedTotals(entries, expense => expense.category || "Uncategorized").sort((a, b) => b[1] - a[1]);
    const paymentRows = groupedTotals(entries, expense => paymentLabel(expense.paymentMethod)).sort((a, b) => b[1] - a[1]);
    const breakdownGrid = document.createElement("div");
    breakdownGrid.className = "trip-breakdown-grid";
    breakdownGrid.append(breakdown("By month", monthRows), breakdown("By category", categoryRows), breakdown("By payment method", paymentRows));

    const details = document.createElement("details");
    details.className = "trip-entry-details";
    const summary = document.createElement("summary");
    summary.textContent = `View ${entries.length} individual ${entries.length === 1 ? "entry" : "entries"}`;
    details.appendChild(summary);
    if (entries.length) {
      const wrapper = document.createElement("div");
      wrapper.className = "table-wrapper";
      const table = document.createElement("table");
      table.innerHTML = "<thead><tr><th>Date</th><th>Category</th><th>Details</th><th>Paid with</th><th>Amount</th></tr></thead><tbody></tbody>";
      const body = table.querySelector("tbody");
      entries.forEach(expense => {
        const row = document.createElement("tr");
        [transactionDate(expense.date), expense.category || "Uncategorized", expense.details || "—", paymentLabel(expense.paymentMethod), money(signedAmount(expense))]
          .forEach(text => { const cell = document.createElement("td"); cell.textContent = text; row.appendChild(cell); });
        body.appendChild(row);
      });
      wrapper.appendChild(table);
      details.appendChild(wrapper);
    }

    const notes = document.createElement("p");
    notes.className = "trip-notes";
    notes.textContent = trip.notes || "No trip notes.";
    const actions = document.createElement("div");
    actions.className = "trip-card-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary-category-button";
    edit.textContent = "Edit trip";
    edit.addEventListener("click", () => beginEdit(trip));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-category-button";
    remove.textContent = "Delete trip";
    remove.addEventListener("click", () => deleteTrip(trip));
    actions.append(edit, remove);

    card.append(header, metrics, breakdownGrid, details, notes, actions);
    return card;
  }

  function render() {
    const list = document.getElementById("trips-list");
    const empty = document.getElementById("trips-empty");
    list.replaceChildren();
    empty.hidden = trips.length > 0;
    [...trips]
      .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)) || String(a.name).localeCompare(String(b.name)))
      .forEach(trip => list.appendChild(renderTrip(trip)));
  }

  function resetForm() {
    form.reset();
    editId.value = "";
    document.getElementById("trip-form-title").textContent = "Create a Trip";
    document.getElementById("cancel-trip-edit").hidden = true;
  }

  function beginEdit(trip) {
    editId.value = trip.id;
    document.getElementById("trip-name").value = trip.name;
    document.getElementById("trip-start").value = trip.startDate;
    document.getElementById("trip-end").value = trip.endDate;
    document.getElementById("trip-budget").value = trip.budget ?? "";
    document.getElementById("trip-notes").value = trip.notes || "";
    document.getElementById("trip-form-title").textContent = "Edit Trip";
    document.getElementById("cancel-trip-edit").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteTrip(trip) {
    const linkedCount = expenses.filter(expense => expense.tripId === trip.id).length;
    const confirmed = await yemConfirm({
      title: "Delete this trip?",
      message: `${linkedCount} linked ${linkedCount === 1 ? "expense" : "expenses"} will remain in their months and categories, but their trip link will be removed.`,
      confirmLabel: "Delete trip",
      danger: true
    });
    if (!confirmed) return;
    trips = trips.filter(item => item.id !== trip.id);
    expenses = expenses.map(expense => expense.tripId === trip.id ? { ...expense, tripId: "" } : expense);
    scheduledPayments = scheduledPayments.map(plan => plan.tripId === trip.id ? { ...plan, tripId: "" } : plan);
    save();
    if (editId.value === trip.id) resetForm();
    render();
    yemToast(`Trip "${trip.name}" deleted. Its expenses remain recorded.`, { type: "success" });
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = document.getElementById("trip-name").value.trim();
    const startDate = document.getElementById("trip-start").value;
    const endDate = document.getElementById("trip-end").value;
    const budgetValue = document.getElementById("trip-budget").value;
    const budget = budgetValue === "" ? null : Number(budgetValue);
    const notes = document.getElementById("trip-notes").value.trim();
    const currentId = editId.value;
    if (!name || !startDate || !endDate || startDate > endDate || (budget !== null && (!Number.isFinite(budget) || budget < 0))) {
      yemToast("Please enter a valid trip name, date range and optional budget.", { type: "warning" });
      return;
    }
    if (trips.some(trip => trip.id !== currentId && String(trip.name).toLowerCase() === name.toLowerCase())) {
      yemToast("A trip with this name already exists.", { type: "warning" });
      return;
    }
    if (currentId) {
      const trip = trips.find(item => item.id === currentId);
      if (!trip) return;
      Object.assign(trip, { name, startDate, endDate, budget, notes, updatedAt: new Date().toISOString() });
      yemToast(`Trip "${name}" updated.`, { type: "success" });
    } else {
      trips.push({ id: id(), name, startDate, endDate, budget, notes, createdAt: new Date().toISOString() });
      yemToast(`Trip "${name}" created. It is now available in the expense form.`, { type: "success" });
    }
    save();
    resetForm();
    render();
  });

  document.getElementById("cancel-trip-edit").addEventListener("click", resetForm);
  render();
})();
