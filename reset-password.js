(function () {
  const config = window.DENTALVIBE_SUPABASE_CONFIG;
  const supabaseApi = window.supabase;
  const feedback = document.querySelector("#reset-feedback");
  const form = document.querySelector("#reset-form");
  const submit = document.querySelector("#reset-submit");
  const statusPanel = document.querySelector("#reset-status-panel");
  const successPanel = document.querySelector("#reset-success-panel");
  const formPanel = document.querySelector("#reset-form-panel");
  const statusTitle = document.querySelector("#reset-status-title");
  const statusText = document.querySelector("#reset-status-text");
  const backLink = document.querySelector("#back-to-site");
  const emailInput = document.querySelector("#reset-email");

  function setFeedback(message, isError) {
    feedback.textContent = message || "";
    feedback.classList.toggle("feedback-error", Boolean(isError));
  }

  function showStatus(title, text) {
    formPanel.hidden = true;
    successPanel.hidden = true;
    statusPanel.hidden = false;
    statusTitle.textContent = title;
    statusText.textContent = text;
  }

  function showForm(user) {
    statusPanel.hidden = true;
    successPanel.hidden = true;
    formPanel.hidden = false;
    if (user && user.email) {
      emailInput.value = user.email;
      emailInput.hidden = false;
      document.querySelector('label[for="reset-email"]').hidden = false;
    } else {
      emailInput.value = "";
      emailInput.hidden = true;
      document.querySelector('label[for="reset-email"]').hidden = true;
    }
    setFeedback("");
    document.querySelector("#new-password").focus();
  }

  function showSuccess() {
    formPanel.hidden = true;
    statusPanel.hidden = true;
    successPanel.hidden = false;
  }

  function deriveSiteUrl() {
    if (config && config.siteUrl) return config.siteUrl;
    try {
      const url = new URL(window.location.href);
      url.hash = "";
      url.search = "";
      if (/reset-password\.html$/i.test(url.pathname)) {
        url.pathname = url.pathname.replace(/reset-password\.html$/i, "index.html");
      }
      return url.href;
    } catch (error) {
      return "index.html";
    }
  }

  backLink.href = deriveSiteUrl();

  document.querySelectorAll("[data-toggle-password]").forEach(function (toggle) {
    toggle.addEventListener("click", function () {
      const input = document.getElementById(toggle.dataset.togglePassword);
      const willShow = input.type === "password";
      input.type = willShow ? "text" : "password";
      toggle.textContent = willShow ? "Hide" : "Show";
      toggle.setAttribute("aria-label", (willShow ? "Hide " : "Show ") + "password");
      toggle.setAttribute("aria-pressed", String(willShow));
    });
  });

  if (!config || !config.url || !config.publishableKey || !supabaseApi || !supabaseApi.createClient) {
    showStatus("Reset unavailable", "This password reset page is not configured. Please contact the clinic or return to the main site.");
    return;
  }

  const client = supabaseApi.createClient(config.url, config.publishableKey, {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true
    }
  });

  let recoveryReady = false;

  client.auth.onAuthStateChange(function (event, session) {
    if (event === "PASSWORD_RECOVERY") {
      recoveryReady = true;
      showForm(session && session.user);
      return;
    }
    if (event === "SIGNED_IN" && recoveryReady && session && session.user) {
      showForm(session.user);
    }
  });

  (async function initialize() {
    try {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const errorCode = params.get("error") || hash.get("error");
      const errorDescription = params.get("error_description") || hash.get("error_description");
      if (errorCode) {
        showStatus("Reset link problem", decodeURIComponent((errorDescription || "This password reset link is invalid or has expired.").replace(/\+/g, " ")));
        return;
      }

      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      const isRecovery = params.get("type") === "recovery" || hash.get("type") === "recovery";
      if (data.session && data.session.user && (isRecovery || recoveryReady)) {
        recoveryReady = true;
        showForm(data.session.user);
        return;
      }

      if (isRecovery) {
        setTimeout(function () {
          if (!recoveryReady) {
            showStatus("Checking reset link", "We could not confirm a valid password reset session. The link may have expired or already been used. Request a new reset link from the sign-in page.");
          }
        }, 1500);
        return;
      }

      showStatus("Open from your reset email", "To change your password, use the password reset link sent to your email from Dentalvibe. If you have not requested a reset, you can return to the main site.");
    } catch (error) {
      showStatus("Could not verify reset link", error.message || "Something went wrong while checking your reset link.");
    }
  })();

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setFeedback("");

    const password = String(document.querySelector("#new-password").value || "");
    const confirm = String(document.querySelector("#confirm-password").value || "");

    if (password.length < 8) {
      setFeedback("Use at least 8 characters for your new password.", true);
      return;
    }
    if (password !== confirm) {
      setFeedback("The passwords do not match. Please try again.", true);
      return;
    }

    submit.disabled = true;
    submit.textContent = "Updating password…";
    try {
      const { data, error } = await client.auth.updateUser({ password: password });
      if (error) throw error;
      if (!data || !data.user) throw new Error("Your password could not be updated. Please request a new reset link.");
      try {
        await client.auth.signOut({ scope: "local" });
      } catch (signOutError) {
        console.error("Password updated but local sign-out failed.", signOutError);
      }
      form.reset();
      showSuccess();
    } catch (error) {
      setFeedback(error.message || "Could not update your password. Request a new reset link and try again.", true);
    } finally {
      submit.disabled = false;
      submit.textContent = "Update password";
    }
  });
})();
