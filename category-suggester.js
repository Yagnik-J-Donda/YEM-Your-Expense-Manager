"use strict";

(function () {
  const catalogue = {
    "Groceries": "food apple banana bread milk cheese eggs rice flour vegetables fruit meat chicken fish cereal pasta coffee tea snacks grocery supermarket costco walmart", 
    "Restaurants & Dining": "restaurant cafe coffee shop pizza burger lunch dinner breakfast takeout delivery doordash uber eats skip dishes", 
    "Personal Care": "toothpaste toothbrush shampoo conditioner soap deodorant skincare cosmetics makeup haircut salon barber grooming perfume", 
    "Household": "detergent cleaner tissue toilet paper furniture cookware bedding light bulb hardware cleaning supplies", 
    "Housing": "rent mortgage property tax condo fee maintenance repair landlord", 
    "Utilities": "electricity hydro gas water internet phone mobile cable utility bill", 
    "Subscriptions": "netflix spotify disney youtube prime icloud google storage microsoft adobe subscription membership streaming", 
    "Transportation": "fuel petrol gasoline diesel bus subway train taxi uber lyft parking toll car wash transit", 
    "Vehicle": "car payment lease insurance registration oil change tire mechanic repair vehicle", 
    "Medical & Health": "doctor dentist pharmacy medicine prescription hospital therapy glasses contact lenses physiotherapy", 
    "Insurance": "insurance premium life insurance home insurance tenant insurance health insurance", 
    "Education": "tuition course book textbook school college university training stationery exam", 
    "Entertainment": "movie cinema concert game gaming theatre museum event ticket hobby", 
    "Clothing": "shirt pants jeans shoes jacket dress clothing apparel laundry dry cleaning", 
    "Electronics": "laptop computer phone charger cable keyboard mouse monitor headphones camera electronics", 
    "Travel": "flight hotel motel airbnb vacation baggage passport visa rental car travel", 
    "Banking & Fees": "bank fee interest charge overdraft credit card fee loan payment atm", 
    "Gifts & Donations": "gift present birthday wedding donation charity offering", 
    "Pets": "pet food dog cat veterinarian vet grooming litter toy", 
    "Childcare": "daycare babysitter childcare diaper baby formula school care", 
    "Fitness": "gym fitness yoga sports equipment personal trainer", 
    "Taxes": "income tax property tax sales tax accountant filing", 
    "Work & Business": "office supplies software hosting domain business expense coworking shipping", 
    "Home Improvement": "paint lumber tools renovation appliance garden lawn plumbing electrical"
  };

  const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const words = value => normalize(value).split(" ").filter(Boolean);
  const mappings = (() => {
    try { return JSON.parse(localStorage.getItem("itemCategoryMappings") || "{}"); }
    catch { return {}; }
  })();

  function currentCategories() {
    try { return Object.keys(JSON.parse(localStorage.getItem("categoryLimits") || "{}")); }
    catch { return []; }
  }

  function storedExpenses() {
    try { const value = JSON.parse(localStorage.getItem("expenses") || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  }

  function storedProjections() {
    try { return JSON.parse(localStorage.getItem("categoryProjections") || "{}"); }
    catch { return {}; }
  }

  function textSimilarity(a, b) {
    const aWords = words(a);
    const bWords = words(b);
    if (!aWords.length || !bWords.length) return 0;
    let score = 0;
    aWords.forEach(left => bWords.forEach(right => {
      if (left === right) score = Math.max(score, 12);
      else if (left.startsWith(right) || right.startsWith(left)) score = Math.max(score, 8);
      else if (left.includes(right) || right.includes(left)) score = Math.max(score, 4);
    }));
    return score;
  }

  function standardMatches(query) {
    return Object.entries(catalogue).map(([category, itemText]) => ({
      category,
      score: textSimilarity(query, `${category} ${itemText}`)
    })).filter(match => match.score > 0).sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));
  }

  function suggestionsFor(input) {
    const query = normalize(input);
    if (!query) return { suggestions: [], standards: [] };
    const categories = currentCategories();
    const scores = new Map(categories.map(category => [category, { category, score: 0, reasons: [] }]));
    const learned = mappings[query];
    if (learned && scores.has(learned)) {
      scores.get(learned).score += 1000;
      scores.get(learned).reasons.push("your saved preference");
    }
    Object.entries(mappings).forEach(([savedItem, category]) => {
      if (savedItem === query || !scores.has(category)) return;
      const match = textSimilarity(query, savedItem);
      if (match >= 8) {
        scores.get(category).score += 700 + match;
        scores.get(category).reasons.push(`similar to your saved preference: ${savedItem}`);
      }
    });
    storedExpenses().forEach(expense => {
      const match = textSimilarity(query, expense.details);
      if (match && scores.has(expense.category)) {
        scores.get(expense.category).score += 40 + match;
        scores.get(expense.category).reasons.push("previous expense history");
      }
    });
    const projections = storedProjections();
    categories.forEach(category => {
      const direct = textSimilarity(query, category);
      if (direct) {
        scores.get(category).score += 25 + direct;
        scores.get(category).reasons.push("category name");
      }
      (Array.isArray(projections[category]) ? projections[category] : []).forEach(item => {
        const match = textSimilarity(query, `${item.name || ""} ${item.notes || ""}`);
        if (match) {
          scores.get(category).score += 20 + match;
          scores.get(category).reasons.push("projection name or notes");
        }
      });
    });
    const standards = standardMatches(query).slice(0, 3);
    standards.forEach((standard, index) => {
      categories.forEach(category => {
        const match = textSimilarity(category, standard.category);
        if (match) {
          scores.get(category).score += (30 - index * 5) + match;
          scores.get(category).reasons.push(`offline catalogue: ${standard.category}`);
        }
      });
    });
    const suggestions = [...scores.values()]
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category))
      .slice(0, 5)
      .map((item, index) => ({
        ...item,
        confidence: index === 0 && item.score >= 50 ? "High" : item.score >= 30 ? "Medium" : "Possible",
        reasons: [...new Set(item.reasons)]
      }));
    return { suggestions, standards };
  }

  function renderResults(input, container, onChoose) {
    const query = normalize(input);
    container.replaceChildren();
    if (!query) {
      const prompt = document.createElement("p");
      prompt.textContent = "Enter an item, merchant or service to check its category.";
      container.appendChild(prompt);
      return;
    }
    const { suggestions, standards } = suggestionsFor(query);
    if (suggestions.length) {
      const heading = document.createElement("h4");
      heading.textContent = "Your category suggestions";
      container.appendChild(heading);
      suggestions.forEach((suggestion, index) => {
        const card = document.createElement("article");
        card.className = "category-suggestion-card";
        const text = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = `${index === 0 ? "Best match: " : ""}${suggestion.category}`;
        const reason = document.createElement("p");
        reason.textContent = `${suggestion.confidence} confidence · ${suggestion.reasons.join(", ")}`;
        text.append(title, reason);
        const use = document.createElement("button");
        use.type = "button";
        use.textContent = `Use ${suggestion.category}`;
        use.addEventListener("click", async () => {
          onChoose(suggestion.category);
          if (await yemConfirm({
            title: "Remember category preference?",
            message: `Remember "${input.trim()}" as "${suggestion.category}" for future suggestions?`,
            confirmLabel: "Remember"
          })) {
            mappings[query] = suggestion.category;
            localStorage.setItem("itemCategoryMappings", JSON.stringify(mappings));
          }
        });
        card.append(text, use);
        container.appendChild(card);
      });
    } else {
      const none = document.createElement("p");
      none.textContent = "No strong match was found in your existing categories.";
      container.appendChild(none);
    }
    if (standards.length) {
      const reference = document.createElement("p");
      reference.className = "standard-category-reference";
      reference.textContent = `Offline reference: ${standards.map(item => item.category).join(", ")}`;
      container.appendChild(reference);
    }
  }

  function renderCatalogue(container) {
    container.replaceChildren();
    Object.entries(catalogue).forEach(([category, itemText]) => {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = category;
      const paragraph = document.createElement("p");
      paragraph.textContent = itemText.split(" ").join(", ");
      details.append(summary, paragraph);
      container.appendChild(details);
    });
  }

  function renderPreferences(container) {
    container.replaceChildren();
    const entries = Object.entries(mappings).sort((a, b) => a[0].localeCompare(b[0]));
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.textContent = "No saved item-category preferences yet.";
      container.appendChild(empty);
      return;
    }
    entries.forEach(([item, category]) => {
      const card = document.createElement("article");
      card.className = "category-suggestion-card";
      const label = document.createElement("strong");
      label.textContent = `${item} → ${category}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        if (!await yemConfirm({
          title: "Remove saved preference?",
          message: `Remove the saved preference "${item}" → "${category}"?`,
          confirmLabel: "Remove",
          danger: true
        })) return;
        delete mappings[item];
        localStorage.setItem("itemCategoryMappings", JSON.stringify(mappings));
        renderPreferences(container);
      });
      card.append(label, remove);
      container.appendChild(card);
    });
  }

  function initializeExpenseAssistant() {
    const input = document.getElementById("details");
    const button = document.getElementById("suggest-entry-category");
    const results = document.getElementById("entry-category-suggestions");
    const category = document.getElementById("category");
    if (!input || !button || !results || !category) return;
    button.addEventListener("click", () => renderResults(input.value, results, selected => {
      if ([...category.options].some(option => option.value === selected)) category.value = selected;
    }));
  }

  function initializeStandaloneChecker() {
    const input = document.getElementById("category-checker-input");
    const button = document.getElementById("run-category-checker");
    const results = document.getElementById("category-checker-results");
    const browse = document.getElementById("browse-category-catalogue");
    const catalogueContainer = document.getElementById("category-catalogue-list");
    const preferencesButton = document.getElementById("manage-category-preferences");
    const preferencesContainer = document.getElementById("category-preference-list");
    if (!input || !button || !results) return;
    const run = () => renderResults(input.value, results, selected => {
      const status = document.createElement("p");
      status.className = "category-checker-status";
      status.textContent = `Selected existing category: ${selected}`;
      results.prepend(status);
    });
    button.addEventListener("click", run);
    input.addEventListener("keydown", event => { if (event.key === "Enter") run(); });
    browse.addEventListener("click", () => {
      const opening = catalogueContainer.hidden;
      catalogueContainer.hidden = !opening;
      browse.textContent = opening ? "Hide Default Catalogue" : "Browse Default Catalogue";
      if (opening) renderCatalogue(catalogueContainer);
    });
    preferencesButton.addEventListener("click", () => {
      const opening = preferencesContainer.hidden;
      preferencesContainer.hidden = !opening;
      preferencesButton.textContent = opening ? "Hide Saved Preferences" : "Manage Saved Preferences";
      if (opening) renderPreferences(preferencesContainer);
    });
  }

  initializeExpenseAssistant();
  initializeStandaloneChecker();
})();
