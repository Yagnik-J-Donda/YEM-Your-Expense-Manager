(function () {
  "use strict";

  const config = window.YEM_SUPABASE_CONFIG || {};
  const isConfigured = Boolean(config.url && config.publishableKey);
  const isLoginPage = /(?:^|\/)login\.html$/.test(window.location.pathname);
  let client = null;

  function safeReturnPath() {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    if (!requested || requested.includes(":") || requested.startsWith("//")) return "index.html";
    return requested;
  }

  function showSetupMessage() {
    const status = document.getElementById("auth-status");
    if (status) {
      status.textContent = "Cloud login is ready for your Supabase project URL and publishable key.";
      status.className = "auth-status info";
    }
    document.querySelectorAll("#login-form input, #login-form button").forEach((field) => {
      field.disabled = true;
    });
  }

  function showStatus(message, type) {
    const status = document.getElementById("auth-status");
    if (!status) return;
    status.textContent = message;
    status.className = `auth-status ${type || "info"}`;
  }

  function setSubmitting(submitting) {
    const button = document.getElementById("login-submit");
    if (!button) return;
    button.disabled = submitting;
    button.textContent = submitting ? "Please wait…" : "Sign in";
  }

  function redirectToLogin() {
    const current = `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search}`;
    window.location.replace(`login.html?returnTo=${encodeURIComponent(current)}`);
  }

  async function requireSession() {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) {
      redirectToLogin();
      return null;
    }
    document.documentElement.classList.remove("auth-checking");
    updateAccountUI(data.session.user);
    return data.session;
  }

  function updateAccountUI(user) {
    document.querySelectorAll("[data-auth-email]").forEach((element) => {
      element.textContent = user && user.email ? user.email : "Account";
    });
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    window.location.replace("login.html");
  }

  function bindAccountButtons() {
    document.querySelectorAll("[data-auth-signout]").forEach((button) => {
      button.addEventListener("click", signOut);
    });
  }

  function bindLoginForm() {
    const form = document.getElementById("login-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;
      setSubmitting(true);
      showStatus("Signing in securely…", "info");

      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        showStatus(error.message, "error");
        setSubmitting(false);
        return;
      }
      window.location.replace(safeReturnPath());
    });
  }

  async function initialize() {
    bindAccountButtons();
    if (!isConfigured || !window.supabase) {
      document.documentElement.classList.remove("auth-checking");
      if (isLoginPage) showSetupMessage();
      return;
    }

    client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.yemSupabase = client;

    if (isLoginPage) {
      const { data } = await client.auth.getSession();
      if (data.session) {
        window.location.replace(safeReturnPath());
        return;
      }
      bindLoginForm();
      document.documentElement.classList.remove("auth-checking");
      return;
    }

    await requireSession();
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) redirectToLogin();
      else updateAccountUI(session.user);
    });
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
