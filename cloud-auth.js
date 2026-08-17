(function () {
  "use strict";

  const config = window.YEM_SUPABASE_CONFIG || {};
  const isConfigured = Boolean(config.url && config.publishableKey);
  const isLoginPage = /(?:^|\/)login\.html$/.test(window.location.pathname);
  const guestModeKey = "yemGuestMode";
  const modes = {
    signin: ["Welcome back", "Sign in to continue to your expense manager."],
    signup: ["Create your account", "Use your email to create secure YEM access."],
    forgot: ["Reset your password", "We’ll email you a secure password-reset link."],
    reset: ["Choose a new password", "Enter a new password for your YEM account."]
  };
  let client = null;
  let pendingConfirmationEmail = "";

  function isGuestMode() {
    return localStorage.getItem(guestModeKey) === "true";
  }

  function safeReturnPath() {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    if (!requested || requested.includes(":") || requested.startsWith("//")) return "index.html";
    return requested;
  }

  function loginPageUrl(params) {
    const current = new URL(window.location.href);
    const result = new URL("login.html", current);
    result.search = "";
    result.hash = "";
    Object.entries(params || {}).forEach(([key, value]) => result.searchParams.set(key, value));
    return result.toString();
  }

  function showStatus(message, type) {
    const status = document.getElementById("auth-status");
    if (!status) return;
    status.textContent = message;
    status.className = `auth-status ${type || "info"}`;
  }

  function setBusy(form, busy, label) {
    const submit = form.querySelector('button[type="submit"]');
    if (!submit) return;
    if (!submit.dataset.label) submit.dataset.label = submit.textContent;
    submit.disabled = busy;
    submit.textContent = busy ? (label || "Please wait…") : submit.dataset.label;
  }

  function validPassword(password) {
    return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
  }

  function setMode(mode, options) {
    const activeMode = modes[mode] ? mode : "signin";
    document.querySelectorAll("[data-auth-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.authPanel !== activeMode;
    });
    document.querySelectorAll("#auth-tabs [data-auth-mode]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.authMode === activeMode));
    });
    const tabs = document.getElementById("auth-tabs");
    if (tabs) tabs.hidden = activeMode === "reset";
    document.getElementById("auth-title").textContent = modes[activeMode][0];
    document.getElementById("auth-description").textContent = modes[activeMode][1];
    if (!options || !options.keepStatus) showStatus("", "info");
  }

  function showSetupMessage() {
    showStatus("Cloud authentication needs a Supabase project URL and publishable key.", "error");
    document.querySelectorAll("form input, form button").forEach((field) => { field.disabled = true; });
  }

  function redirectToLogin() {
    const current = `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search}`;
    window.location.replace(`login.html?returnTo=${encodeURIComponent(current)}`);
  }

  function updateAccountUI(user) {
    document.querySelectorAll("[data-auth-email]").forEach((element) => {
      element.textContent = user && user.email ? user.email : "Account";
    });
  }

  function startGuestMode() {
    localStorage.setItem(guestModeKey, "true");
    localStorage.removeItem("yemOnboardingVersion");
    window.location.replace(safeReturnPath());
  }

  function activateGuestUI() {
    document.documentElement.classList.remove("auth-checking");
    document.body.classList.add("guest-mode");
    updateAccountUI({ email: "Guest mode" });
    const badge = document.createElement("div");
    badge.className = "guest-mode-badge";
    badge.setAttribute("role", "status");
    badge.textContent = "Guest mode · data stays in this browser";
    document.body.appendChild(badge);
    document.querySelectorAll("[data-auth-signout]").forEach((button) => {
      button.textContent = "Exit guest mode";
    });
    window.dispatchEvent(new CustomEvent("yem:guest-ready"));
  }

  async function requireSession() {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) return redirectToLogin();
    document.documentElement.classList.remove("auth-checking");
    updateAccountUI(data.session.user);
  }

  async function signOut() {
    if (isGuestMode()) {
      localStorage.removeItem(guestModeKey);
      window.location.replace("login.html");
      return;
    }
    if (!client) return;
    await client.auth.signOut();
    window.location.replace("login.html");
  }

  function bindSharedControls() {
    document.querySelectorAll("[data-auth-signout]").forEach((button) => button.addEventListener("click", signOut));
    document.querySelectorAll("[data-guest-start]").forEach((button) => button.addEventListener("click", startGuestMode));
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.authMode));
    });
    document.querySelectorAll("[data-password-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordTarget);
        const reveal = input.type === "password";
        input.type = reveal ? "text" : "password";
        button.textContent = reveal ? "Hide" : "Show";
        button.setAttribute("aria-label", `${reveal ? "Hide" : "Show"} password`);
      });
    });
  }

  function bindAuthForms() {
    const signInForm = document.getElementById("signin-form");
    const signUpForm = document.getElementById("signup-form");
    const forgotForm = document.getElementById("forgot-form");
    const resetForm = document.getElementById("reset-form");

    signInForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setBusy(signInForm, true, "Signing in…");
      showStatus("Signing in securely…", "info");
      const email = document.getElementById("signin-email").value.trim();
      const password = document.getElementById("signin-password").value;
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        const unconfirmed = /confirm/i.test(error.message);
        pendingConfirmationEmail = unconfirmed ? email : "";
        document.getElementById("confirmation-actions").hidden = !unconfirmed;
        showStatus(error.message, "error");
        setBusy(signInForm, false);
        return;
      }
      localStorage.removeItem(guestModeKey);
      window.location.replace(safeReturnPath());
    });

    signUpForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.getElementById("signup-email").value.trim();
      const password = document.getElementById("signup-password").value;
      const confirmation = document.getElementById("signup-confirm-password").value;
      if (!validPassword(password)) return showStatus("Use at least 8 characters with uppercase, lowercase and a number.", "error");
      if (password !== confirmation) return showStatus("The passwords do not match.", "error");
      setBusy(signUpForm, true, "Creating account…");
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: loginPageUrl({ message: "confirmed" }) }
      });
      if (error) {
        showStatus(error.message, "error");
        setBusy(signUpForm, false);
        return;
      }
      if (data.session) {
        localStorage.removeItem(guestModeKey);
        return window.location.replace(safeReturnPath());
      }
      pendingConfirmationEmail = email;
      document.getElementById("confirmation-actions").hidden = false;
      showStatus("Account created. Check your email and confirm your address before signing in.", "success");
      setBusy(signUpForm, false);
    });

    forgotForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setBusy(forgotForm, true, "Sending link…");
      const email = document.getElementById("forgot-email").value.trim();
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: loginPageUrl({ mode: "reset" })
      });
      showStatus(error ? error.message : "If that account exists, a password-reset link has been sent.", error ? "error" : "success");
      setBusy(forgotForm, false);
    });

    resetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = document.getElementById("reset-password").value;
      const confirmation = document.getElementById("reset-confirm-password").value;
      if (!validPassword(password)) return showStatus("Use at least 8 characters with uppercase, lowercase and a number.", "error");
      if (password !== confirmation) return showStatus("The passwords do not match.", "error");
      setBusy(resetForm, true, "Updating password…");
      const { error } = await client.auth.updateUser({ password });
      if (error) {
        showStatus(error.message, "error");
        setBusy(resetForm, false);
        return;
      }
      await client.auth.signOut();
      setMode("signin", { keepStatus: true });
      showStatus("Password updated. Sign in with your new password.", "success");
    });

    document.getElementById("resend-confirmation").addEventListener("click", async () => {
      if (!pendingConfirmationEmail) return showStatus("Enter your email and try signing in first.", "info");
      const { error } = await client.auth.resend({
        type: "signup",
        email: pendingConfirmationEmail,
        options: { emailRedirectTo: loginPageUrl({ message: "confirmed" }) }
      });
      showStatus(error ? error.message : "Confirmation email sent again.", error ? "error" : "success");
    });
  }

  async function initializeLoginPage() {
    bindAuthForms();
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("mode");
    const { data } = await client.auth.getSession();
    if (requestedMode === "reset") {
      setMode("reset");
      if (!data.session) showStatus("Open the latest password-reset link from your email to continue.", "error");
    } else if (data.session) {
      window.location.replace(safeReturnPath());
      return;
    } else {
      setMode(requestedMode === "signup" ? "signup" : "signin");
      if (params.get("message") === "confirmed") showStatus("Email confirmed. You can now sign in.", "success");
    }
    document.documentElement.classList.remove("auth-checking");
  }

  async function initialize() {
    bindSharedControls();
    if (!isLoginPage && isGuestMode()) {
      activateGuestUI();
      return;
    }
    if (!isConfigured || !window.supabase) {
      document.documentElement.classList.remove("auth-checking");
      if (isLoginPage) showSetupMessage();
      return;
    }
    client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.yemSupabase = client;
    if (isLoginPage) return initializeLoginPage();
    await requireSession();
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) redirectToLogin();
      else updateAccountUI(session.user);
    });
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
