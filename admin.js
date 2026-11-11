const adminConfig = window.DENTALVIBE_SUPABASE_CONFIG;
const adminClient = adminConfig && window.supabase?.createClient
  ? window.supabase.createClient(adminConfig.url, adminConfig.publishableKey)
  : null;

const loginCard = document.querySelector("#admin-login-card");
const dashboard = document.querySelector("#admin-dashboard");
const loginForm = document.querySelector("#admin-login-form");
const loginFeedback = document.querySelector("#admin-login-feedback");
const dashboardFeedback = document.querySelector("#dashboard-feedback");
const integrationFeedback = document.querySelector("#integration-feedback");
const signoutButton = document.querySelector("#admin-signout");
const bookingsBody = document.querySelector("#bookings-body");
const patientsBody = document.querySelector("#patients-body");
const integrationGrid = document.querySelector("#integration-grid");
let bookings = [];
let integrations = [];

function showFeedback(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function clearFeedback() {
  showFeedback(dashboardFeedback, "");
  showFeedback(loginFeedback, "");
}

function showLoggedOut(message = "") {
  loginCard.hidden = false;
  dashboard.hidden = true;
  signoutButton.hidden = true;
  if (message) showFeedback(loginFeedback, message, true);
}

function showLoggedIn() {
  loginCard.hidden = true;
  dashboard.hidden = false;
  signoutButton.hidden = false;
  showFeedback(loginFeedback, "");
}

async function verifyAdministrator() {
  const { data: { user }, error: userError } = await adminClient.auth.getUser();
  if (userError) throw userError;
  if (!user) return false;
  const { data, error } = await adminClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function loadDashboard() {
  clearFeedback();
  let bookingsResult;
  let integrationsResult;
  let settingsResult;
  try {
    [bookingsResult, integrationsResult, settingsResult] = await Promise.all([
      adminClient.from("bookings").select("*").order("created_at", { ascending: false }),
      adminClient.from("integration_settings").select("provider, enabled, configured, updated_at").order("provider"),
      adminClient.from("clinic_settings").select("setting_key, setting_value").eq("setting_key", "clinic_profile").maybeSingle(),
    ]);
  } catch (error) {
    showFeedback(dashboardFeedback, `Could not load admin data: ${error.message}`, true);
    return;
  }
  const errors = [bookingsResult.error, integrationsResult.error, settingsResult.error].filter(Boolean);
  if (errors.length) {
    showFeedback(dashboardFeedback, `Could not load all admin data: ${errors.map((error) => error.message).join("; ")}`, true);
  }
  if (!bookingsResult.error) bookings = bookingsResult.data ?? [];
  if (!integrationsResult.error) integrations = integrationsResult.data ?? [];
  if (!settingsResult.error && settingsResult.data) {
    const profile = settingsResult.data.setting_value;
    document.querySelector("#clinic-name").value = profile.name ?? "";
    document.querySelector("#clinic-location").value = profile.location ?? "";
    document.querySelector("#clinic-phone").value = profile.phone ?? "";
  }
  updateStats();
  renderBookings();
  renderPatients();
  renderIntegrations();
  void refreshIntegrationStatus();
}

function updateStats() {
  document.querySelector("#stat-total").textContent = bookings.length;
  document.querySelector("#stat-requested").textContent = bookings.filter((booking) => booking.status === "requested").length;
  document.querySelector("#stat-confirmed").textContent = bookings.filter((booking) => booking.status === "confirmed").length;
  document.querySelector("#stat-patients").textContent = new Set(bookings.map((booking) => booking.patient_email.toLowerCase())).size;
}

function createCell(row, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  row.append(cell);
  return cell;
}

function createInput(value, type = "text", className = "") {
  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  if (className) input.className = className;
  return input;
}

function appendTableMessage(body, columns, message) {
  const row = document.createElement("tr");
  const cell = createCell(row, "table-message");
  cell.colSpan = columns;
  cell.textContent = message;
  body.replaceChildren(row);
}

function renderBookings() {
  const search = document.querySelector("#booking-search").value.trim().toLowerCase();
  const statusFilter = document.querySelector("#booking-status-filter").value;
  const filtered = bookings.filter((booking) => {
    const matchesStatus = statusFilter === "all" || booking.status === statusFilter;
    const searchable = `${booking.patient_name} ${booking.patient_email} ${booking.service}`.toLowerCase();
    return matchesStatus && searchable.includes(search);
  });
  if (filtered.length === 0) {
    appendTableMessage(bookingsBody, 8, bookings.length ? "No bookings match these filters." : "No bookings have been requested yet.");
    return;
  }

  bookingsBody.replaceChildren();
  filtered.forEach((booking) => {
    const row = document.createElement("tr");
    const patient = createCell(row, "patient-cell");
    const name = document.createElement("strong");
    name.textContent = booking.patient_name;
    const email = document.createElement("span");
    email.textContent = booking.patient_email;
    patient.append(name, email);
    if (booking.patient_phone) {
      const phone = document.createElement("span");
      phone.textContent = `${booking.patient_phone}${booking.patient_sms_opt_in ? " · SMS opted in" : ""}`;
      patient.append(phone);
    }

    const service = createCell(row);
    service.textContent = booking.service;
    const dateCell = createCell(row);
    const date = createInput(booking.appointment_date, "date");
    dateCell.append(date);
    const timeCell = createCell(row);
    const time = createInput(booking.appointment_time, "text");
    time.maxLength = 50;
    timeCell.append(time);
    const statusCell = createCell(row);
    const status = document.createElement("select");
    ["requested", "confirmed", "completed", "cancelled"].forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
      status.append(option);
    });
    status.value = booking.status;
    statusCell.append(status);
    const paymentCell = createCell(row);
    const payment = document.createElement("select");
    [
      ["not_requested", "Not requested"],
      ["awaiting_payment", "Awaiting payment"],
      ["paid", "Paid (manual)"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      payment.append(option);
    });
    payment.value = booking.payment_status ?? "not_requested";
    paymentCell.append(payment);
    const notesCell = createCell(row);
    const notes = createInput(booking.notes, "text", "notes-input");
    notes.maxLength = 2000;
    notes.placeholder = "Internal notes";
    notesCell.append(notes);
    const actions = createCell(row);
    const actionGroup = document.createElement("div");
    actionGroup.className = "row-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "row-button";
    save.textContent = "Save";
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const { error } = await adminClient.from("bookings").update({
          appointment_date: date.value,
          appointment_time: time.value.trim() || "To be confirmed",
          status: status.value,
          payment_status: payment.value,
          notes: notes.value.trim(),
        }).eq("id", booking.id);
        if (error) throw error;
        const { error: integrationError, data: integrationResult } = await adminClient.functions.invoke("dentalvibe-integrations", {
          body: { action: "booking_event", bookingId: booking.id, eventType: "updated" },
        });
        const statusMessage = integrationError || integrationResult?.warnings?.length
          ? "Booking updated, but one or more notifications or calendar updates did not complete."
          : "Booking updated.";
        await loadDashboard();
        showFeedback(dashboardFeedback, statusMessage, Boolean(integrationError || integrationResult?.warnings?.length));
      } catch (error) {
        showFeedback(dashboardFeedback, `Could not update booking: ${error.message}`, true);
      } finally {
        save.disabled = false;
      }
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-button danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Permanently delete the booking for ${booking.patient_name}?`)) return;
      remove.disabled = true;
      try {
        const { error: integrationError, data: integrationResult } = await adminClient.functions.invoke("dentalvibe-integrations", {
          body: { action: "booking_event", bookingId: booking.id, eventType: "deleted" },
        });
        if (integrationError) console.error("Booking was removed but cancellation integration may not have completed.", integrationError);
        const { error } = await adminClient.from("bookings").delete().eq("id", booking.id);
        if (error) throw error;
        await loadDashboard();
        const hasIntegrationWarning = Boolean(integrationError || integrationResult?.warnings?.length);
        showFeedback(dashboardFeedback, hasIntegrationWarning
          ? "Booking deleted, but cancellation notifications or Calendar removal did not complete."
          : "Booking deleted.", hasIntegrationWarning);
      } catch (error) {
        showFeedback(dashboardFeedback, `Could not delete booking: ${error.message}`, true);
      } finally {
        remove.disabled = false;
      }
    });
    actionGroup.append(save, remove);
    actions.append(actionGroup);
    bookingsBody.append(row);
  });
}

function renderPatients() {
  const patientsByEmail = new Map();
  bookings.forEach((booking) => {
    const key = booking.patient_email.toLowerCase();
    const patient = patientsByEmail.get(key) ?? {
      name: booking.patient_name,
      email: booking.patient_email,
      phone: booking.patient_phone ?? "",
      smsOptIn: booking.patient_sms_opt_in === true,
      count: 0,
      lastRequest: booking.created_at,
      contactUpdatedAt: booking.created_at,
    };
    patient.count += 1;
    if (booking.created_at >= patient.contactUpdatedAt) {
      patient.phone = booking.patient_phone ?? "";
      patient.smsOptIn = booking.patient_sms_opt_in === true;
      patient.contactUpdatedAt = booking.created_at;
    }
    if (booking.created_at > patient.lastRequest) patient.lastRequest = booking.created_at;
    patientsByEmail.set(key, patient);
  });
  const patients = [...patientsByEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (patients.length === 0) {
    appendTableMessage(patientsBody, 6, "Patient contacts appear here after booking requests are received.");
    return;
  }
  patientsBody.replaceChildren();
  patients.forEach((patient) => {
    const row = document.createElement("tr");
    createCell(row).textContent = patient.name;
    createCell(row).textContent = patient.email;
    createCell(row).textContent = patient.phone || "—";
    createCell(row).textContent = patient.smsOptIn ? "Opted in" : "No";
    createCell(row).textContent = patient.count;
    createCell(row).textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(patient.lastRequest));
    patientsBody.append(row);
  });
}

const integrationLabels = {
  google_calendar: { name: "Google Calendar", icon: "▦", description: "Confirmed appointments sync to the clinic calendar." },
  email: { name: "Email notifications", icon: "✉", description: "Booking confirmations and clinic messages." },
  sms: { name: "SMS notifications", icon: "▤", description: "Booking updates by text; patient messages require opt-in." },
  payments: { name: "Payments", icon: "₱", description: "Manual GCash arrangement; payments are not automatically verified." },
};

function renderIntegrations() {
  integrationGrid.replaceChildren();
  integrations.forEach((integration) => {
    const metadata = integrationLabels[integration.provider] ?? {
      name: integration.provider,
      icon: "↗",
      description: "Clinic integration.",
    };
    const card = document.createElement("article");
    card.className = "integration-card";
    const icon = document.createElement("span");
    icon.className = "integration-icon";
    icon.textContent = metadata.icon;
    const details = document.createElement("div");
    details.className = "integration-details";
    const name = document.createElement("strong");
    name.textContent = metadata.name;
    const description = document.createElement("span");
    description.textContent = metadata.description;
    details.append(name, description);
    const state = document.createElement("div");
    state.className = "integration-state";
    const connection = document.createElement("span");
    connection.textContent = integration.provider === "payments"
      ? "Manual only"
      : integration.configured
      ? integration.provider === "google_calendar" ? "Connected" : "Configured"
      : "Not configured";
    if (integration.provider === "google_calendar") {
      const calendarButton = document.createElement("button");
      calendarButton.type = "button";
      calendarButton.className = "integration-connect";
      calendarButton.textContent = integration.configured ? "Disconnect" : "Connect Google";
      calendarButton.disabled = integration.configuring === true;
      calendarButton.addEventListener("click", async () => {
        calendarButton.disabled = true;
        try {
          if (integration.configured) {
            const { data, error } = await adminClient.functions.invoke("dentalvibe-integrations", {
              body: { action: "google_disconnect" },
            });
            if (error) throw error;
            await refreshIntegrationStatus();
            showFeedback(integrationFeedback, data?.revokeWarning
              ? "Calendar disconnected in Dentalvibe. If access remains in Google, remove it from your Google Account's third-party connections."
              : "Google Calendar disconnected.");
          } else {
            const { data, error } = await adminClient.functions.invoke("dentalvibe-integrations", {
              body: { action: "google_oauth_start" },
            });
            if (error) throw error;
            if (!data?.authorizationUrl) throw new Error("The Calendar authorization link was not returned.");
            window.location.assign(data.authorizationUrl);
          }
        } catch (error) {
          showFeedback(integrationFeedback, `Google Calendar connection failed: ${error.message}`, true);
        } finally {
          calendarButton.disabled = false;
        }
      });
      state.append(calendarButton);
    }
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "integration-toggle";
    toggle.setAttribute("aria-pressed", String(integration.enabled));
    toggle.textContent = integration.enabled ? "Enabled" : "Disabled";
    toggle.disabled = integration.provider === "payments" || !integration.configured;
    toggle.addEventListener("click", async () => {
      toggle.disabled = true;
      try {
        const { error } = await adminClient
          .from("integration_settings")
          .update({ enabled: !integration.enabled })
          .eq("provider", integration.provider);
        if (error) throw error;
        showFeedback(dashboardFeedback, `${metadata.name} availability updated.`);
        await loadDashboard();
      } catch (error) {
        showFeedback(dashboardFeedback, `Could not update integration: ${error.message}`, true);
      } finally {
        toggle.disabled = false;
      }
    });
    state.append(connection, toggle);
    card.append(icon, details, state);
    integrationGrid.append(card);
  });
}

async function refreshIntegrationStatus() {
  try {
    const { data, error } = await adminClient.functions.invoke("dentalvibe-integrations", {
      body: { action: "status" },
    });
    if (error) throw error;
    integrations = integrations.map((integration) => ({
      ...integration,
      configured: data?.integrations?.[integration.provider]?.configured === true,
    }));
    renderIntegrations();
  } catch (error) {
    showFeedback(integrationFeedback, `Live provider status is unavailable. Check that the integrations Edge Function is deployed. ${error.message}`, true);
  }
}

async function enterAdminDashboard() {
  if (!adminClient) {
    showLoggedOut("Supabase could not be initialized. Check the client script, project URL, and publishable key.");
    return;
  }
  try {
    const isAdmin = await verifyAdministrator();
    if (!isAdmin) {
      const { error } = await adminClient.auth.signOut();
      if (error) throw error;
      showLoggedOut("This account does not have clinic administrator access.");
      return;
    }
    showLoggedIn();
    await loadDashboard();
    const calendarState = new URLSearchParams(window.location.search).get("calendar");
    if (calendarState) {
      showFeedback(
        integrationFeedback,
        calendarState === "connected"
          ? "Google Calendar connected. Enable the integration to sync confirmed appointments."
          : calendarState === "expired"
          ? "Google Calendar authorization expired. Please start the connection again."
          : calendarState === "wrong-account"
          ? "Choose the clinic Google account to connect Calendar."
          : "Google Calendar connection was not completed.",
        calendarState !== "connected",
      );
      window.history.replaceState({}, "", window.location.pathname);
    }
  } catch (error) {
    const message = `Could not verify admin access: ${error.message}`;
    try {
      const { error: signOutError } = await adminClient.auth.signOut();
      if (signOutError) throw signOutError;
    } catch (signOutError) {
      showLoggedOut(`${message} Sign-out also failed: ${signOutError.message}`);
      return;
    }
    showLoggedOut(message);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!adminClient) {
    showFeedback(loginFeedback, "Supabase is unavailable. Check your connection and client configuration.", true);
    return;
  }
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showFeedback(loginFeedback, "");
  const formData = new FormData(loginForm);
  try {
    const { error } = await adminClient.auth.signInWithPassword({
      email: String(formData.get("email")).trim().toLowerCase(),
      password: String(formData.get("password")),
    });
    if (error) throw error;
    loginForm.reset();
    await enterAdminDashboard();
  } catch (error) {
    showFeedback(loginFeedback, `Sign-in failed: ${error.message}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

signoutButton.addEventListener("click", async () => {
  signoutButton.disabled = true;
  try {
    const { error } = await adminClient.auth.signOut();
    if (error) throw error;
    showLoggedOut();
  } catch (error) {
    showFeedback(dashboardFeedback, `Could not sign out: ${error.message}`, true);
  } finally {
    signoutButton.disabled = false;
  }
});

document.querySelector("#refresh-bookings").addEventListener("click", loadDashboard);
document.querySelector("#booking-search").addEventListener("input", renderBookings);
document.querySelector("#booking-status-filter").addEventListener("change", renderBookings);

document.querySelectorAll(".admin-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((item) => {
      item.classList.toggle("active", item === tab);
      item.setAttribute("aria-selected", String(item === tab));
    });
    document.querySelectorAll(".admin-panel").forEach((panel) => {
      const active = panel.id === tab.dataset.panel;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
  });
});

document.querySelector("#clinic-settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const settingValue = {
    name: String(formData.get("name")).trim(),
    location: String(formData.get("location")).trim(),
    phone: String(formData.get("phone")).trim(),
  };
  try {
    const { error } = await adminClient.from("clinic_settings")
      .update({ setting_value: settingValue })
      .eq("setting_key", "clinic_profile");
    if (error) throw error;
  } catch (error) {
    showFeedback(dashboardFeedback, `Could not save clinic settings: ${error.message}`, true);
    return;
  }
  showFeedback(dashboardFeedback, "Clinic profile saved.");
});

const themeButton = document.querySelector("#admin-theme-toggle");
const themeLabel = document.querySelector("#admin-theme-label");
const themeIcon = document.querySelector("#admin-theme-icon");
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
let savedTheme = null;
try {
  savedTheme = localStorage.getItem("dentalvibe.theme.v1");
} catch (error) {
  console.error("Could not read the theme preference.", error);
}

function applyAdminTheme(theme) {
  const isDark = theme === "dark";
  document.body.dataset.theme = isDark ? "dark" : "light";
  themeButton.setAttribute("aria-pressed", String(isDark));
  themeButton.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
  themeLabel.textContent = `${isDark ? "Light" : "Dark"} mode`;
  themeIcon.textContent = isDark ? "☀" : "☾";
}

applyAdminTheme(savedTheme === "light" || savedTheme === "dark" ? savedTheme : systemTheme.matches ? "dark" : "light");
systemTheme.addEventListener("change", (event) => {
  if (savedTheme === null) applyAdminTheme(event.matches ? "dark" : "light");
});
themeButton.addEventListener("click", () => {
  savedTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyAdminTheme(savedTheme);
  try {
    localStorage.setItem("dentalvibe.theme.v1", savedTheme);
  } catch (error) {
    console.error("Could not save the theme preference.", error);
  }
});

if (!adminClient) {
  showLoggedOut("Supabase is not configured. Check supabase-config.js and your internet connection.");
} else {
  adminClient.auth.getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      if (data.session) return enterAdminDashboard();
      showLoggedOut();
      return undefined;
    })
    .catch((error) => showLoggedOut(`Could not restore the admin session: ${error.message}`));
}
