const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CLIENT_SETTINGS_KEY = "dentalvibe.client-settings.v1";
function defaultClientSettings() {
  return {
    defaultSmsOptIn: false,
    preferredContact: "email",
    emailReminders: true,
    smsReminders: false,
    reminderTiming: "24h",
    preferredDay: "",
    preferredTime: "",
    language: "en",
    savePhoneForBooking: true,
    calendarPrompt: true,
    specialRequests: "",
    textSize: "default",
    reducedMotion: false,
    highContrast: false,
    dateFormat: "locale",
  };
}
function getClientSettings() {
  try {
    const raw = localStorage.getItem(CLIENT_SETTINGS_KEY);
    return { ...defaultClientSettings(), ...(raw ? JSON.parse(raw) : {}) };
  } catch (error) {
    console.error("Could not read client settings.", error);
    return defaultClientSettings();
  }
}
function saveClientSettings(settings) {
  try {
    localStorage.setItem(CLIENT_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Could not save client settings.", error);
  }
  return settings;
}
function applyClientSettings(settings) {
  const s = settings || getClientSettings();
  const sizeMap = { default: "100%", large: "112%", xlarge: "125%" };
  document.documentElement.style.fontSize = sizeMap[s.textSize] || "100%";
  document.body.classList.toggle("reduced-motion", Boolean(s.reducedMotion));
  document.body.classList.toggle("high-contrast", Boolean(s.highContrast));
  document.documentElement.lang = s.language === "fil" ? "fil" : s.language === "ceb" ? "ceb" : "en";
}
applyClientSettings(getClientSettings());


const THEME_STORAGE_KEY = "dentalvibe.theme.v1";
const supabaseConfig = window.DENTALVIBE_SUPABASE_CONFIG;
const supabaseClient = supabaseConfig && window.supabase?.createClient
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey)
  : null;
const now = new Date();
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const themeToggle = document.querySelector("#theme-toggle");
const themeLabel = document.querySelector("#theme-label");
const themeColor = document.querySelector('meta[name="theme-color"]');
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
let savedTheme = null;
try {
  savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
} catch (error) {
  console.error("Could not read the saved theme preference.", error);
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.dataset.theme = isDark ? "dark" : "light";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
  themeLabel.textContent = `${isDark ? "Light" : "Dark"} mode`;
  themeColor.content = isDark ? "#17231e" : "#f7f8f2";
}

applyTheme(savedTheme === "light" || savedTheme === "dark" ? savedTheme : systemTheme.matches ? "dark" : "light");
systemTheme.addEventListener("change", (event) => {
  if (savedTheme === null) applyTheme(event.matches ? "dark" : "light");
});
themeToggle.addEventListener("click", () => {
  const theme = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  savedTheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.error("Could not save the theme preference.", error);
  }
});

let currentAccount = null;
let currentAppointments = [];
let pendingMfa = null;
let pendingTotpFactorId = null;
let passwordRecoveryPending = false;

function setFeedback(message, isError = false) {
  const feedback = document.querySelector("#signin-feedback");
  feedback.textContent = message;
  feedback.classList.toggle("feedback-error", isError);
}

function hidePasswordFields() {
  document.querySelectorAll("[data-toggle-password]").forEach((toggle) => {
    const input = document.getElementById(toggle.dataset.togglePassword);
    input.type = "password";
    toggle.textContent = "Show";
    toggle.setAttribute("aria-label", "Show password");
    toggle.setAttribute("aria-pressed", "false");
  });
}

const monthLabel = document.querySelector("#calendar-month");
const calendarGrid = document.querySelector("#calendar-grid");
const visitList = document.querySelector("#visit-list");
const visitHeading = document.querySelector("#visit-date-heading");
const visitCount = document.querySelector("#visit-count");
const bookingFeedback = document.querySelector("#booking-feedback");
const serviceSelect = document.querySelector("#service-select");
const bookingPhone = document.querySelector("#booking-phone");
const bookingSmsOptIn = document.querySelector("#booking-sms-opt-in");
let displayedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
let selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

function normalizePhilippinePhone(value) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (!compact) return "";
  const normalized = compact.startsWith("09")
    ? `+63${compact.slice(1)}`
    : compact.startsWith("639")
    ? `+${compact}`
    : compact;
  return /^\+639\d{9}$/.test(normalized) ? normalized : null;
}

function accountVisits() {
  if (!currentAccount) return [];
  return currentAppointments.map((appointment) => ({
    ...appointment,
    date: new Date(`${appointment.date}T00:00:00`),
  }));
}

function renderCalendar() {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  monthLabel.textContent = `${monthNames[month]} ${year}`;
  calendarGrid.replaceChildren();

  weekdayNames.forEach((day) => {
    const heading = document.createElement("span");
    heading.className = "calendar-weekday";
    heading.setAttribute("role", "columnheader");
    heading.textContent = day;
    calendarGrid.append(heading);
  });

  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstDay.getDay());
  const todayKey = dateKey(now);
  const visits = accountVisits();

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = dateKey(date);
    const dayVisits = visits.filter((visit) => dateKey(visit.date) === key);
    const dayButton = document.createElement("button");
    dayButton.type = "button";
    dayButton.className = "calendar-day";
    dayButton.setAttribute("role", "gridcell");
    dayButton.setAttribute("aria-label", `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}${dayVisits.length ? `, ${dayVisits.length} appointment${dayVisits.length > 1 ? "s" : ""}` : ""}`);
    dayButton.textContent = date.getDate();
    if (date.getMonth() !== month) dayButton.classList.add("outside");
    if (dayVisits.some((visit) => visit.status === "Completed")) dayButton.classList.add("has-visit");
    if (dayVisits.some((visit) => visit.status !== "Completed")) dayButton.classList.add("has-upcoming");
    if (key === todayKey) dayButton.classList.add("today");
    if (key === dateKey(selectedDate)) {
      dayButton.classList.add("selected");
      dayButton.setAttribute("aria-selected", "true");
    }
    dayButton.addEventListener("click", () => {
      selectedDate = date;
      bookingFeedback.textContent = "";
      renderCalendar();
      renderVisits();
    });
    calendarGrid.append(dayButton);
  }
}

function formatVisitDate(date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function renderVisits() {
  const visits = accountVisits();
  const selectedVisits = visits
    .filter((visit) => dateKey(visit.date) === dateKey(selectedDate))
    .sort((a, b) => a.date - b.date);
  const isToday = dateKey(selectedDate) === dateKey(now);
  const isPast = selectedDate < new Date(now.getFullYear(), now.getMonth(), now.getDate());
  visitHeading.textContent = isToday ? "Your recent visits" : formatVisitDate(selectedDate);
  visitCount.textContent = selectedVisits.length;
  visitList.replaceChildren();

  if (!currentAccount) {
    const empty = document.createElement("p");
    empty.className = "empty-visits";
    empty.textContent = "Sign in or create an account to see your saved appointment requests.";
    visitList.append(empty);
    return;
  }

  if (selectedVisits.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-visits";
    empty.textContent = isPast
      ? "No appointments saved for this day. Select a highlighted date to see an appointment."
      : "No appointments on this day yet. Choose a service below to request a visit.";
    visitList.append(empty);
    return;
  }

  selectedVisits.forEach((visit) => {
    const item = document.createElement("div");
    item.className = "visit-item";
    const dateIcon = document.createElement("div");
    dateIcon.className = "visit-date-icon";
    const month = document.createElement("span");
    month.textContent = monthNames[visit.date.getMonth()].slice(0, 3).toUpperCase();
    const day = document.createElement("strong");
    day.textContent = visit.date.getDate();
    dateIcon.append(month, day);
    const description = document.createElement("div");
    description.className = "visit-description";
    const service = document.createElement("strong");
    service.textContent = visit.service;
    const time = document.createElement("span");
    time.textContent = visit.time;
    description.append(service, time);
    const status = document.createElement("span");
    status.className = `visit-status${visit.status === "Completed" ? "" : " status-upcoming"}`;
    status.textContent = visit.status;
    item.append(dateIcon, description, status);
    visitList.append(item);
  });
}

function updateAuthControls() {
  document.querySelectorAll("[data-open-auth]").forEach((button) => {
    const label = currentAccount ? "My account" : button.dataset.signedOutLabel;
    button.textContent = label;
  });
}

function setAuthMode(mode) {
  const signinForm = document.querySelector("#signin-form");
  const forgotPasswordForm = document.querySelector("#forgot-password-form");
  const resetPasswordForm = document.querySelector("#reset-password-form");
  const totpLoginForm = document.querySelector("#totp-login-form");
  const registerForm = document.querySelector("#register-form");
  const accountPanel = document.querySelector("#account-panel");
  const signupNote = document.querySelector("#signup-note");
  const registerBackButton = document.querySelector("#back-from-register");
  const closeButton = document.querySelector("[data-close-signin]");
  const title = document.querySelector("#signin-title");
  const intro = document.querySelector(".modal-intro");

  signinForm.hidden = mode !== "signin";
  forgotPasswordForm.hidden = mode !== "forgot-password";
  resetPasswordForm.hidden = mode !== "update-password";
  totpLoginForm.hidden = mode !== "totp-login";
  registerForm.hidden = mode !== "register";
  accountPanel.hidden = mode !== "account";
  signupNote.hidden = mode !== "signin";
  registerBackButton.hidden = mode !== "register";
  closeButton.hidden = mode === "register";
  title.textContent = mode === "register"
    ? "Create your account."
    : mode === "account" ? "Your Dentalvibe account."
      : mode === "forgot-password" ? "Reset your password."
        : mode === "update-password" ? "Choose a new password."
          : mode === "totp-login" ? "Verify itâ€™s you."
            : "Your smile, your schedule.";
  intro.hidden = mode === "account";
  intro.textContent = mode === "register"
    ? "Create an account to save your details and keep your appointment requests together."
    : mode === "forgot-password"
      ? "Enter the email address on your account and weâ€™ll send you a password reset link."
      : mode === "update-password"
        ? "Choose a new password for your Dentalvibe account."
        : mode === "totp-login"
          ? "Two-factor authentication is on. Enter a current code from your authenticator app to finish signing in."
          : "Sign in to see your saved visits and keep your next appointment on track.";
  hidePasswordFields();
  setFeedback("");
  if (mode === "account") void showAccountOverview();

  if (mode === "account" && currentAccount) {
    document.querySelector("#account-name").textContent = currentAccount.name;
    document.querySelector("#account-email").textContent = currentAccount.email;
    document.querySelector("#account-avatar").textContent = currentAccount.name.trim().charAt(0).toUpperCase();
  }
}

async function getTotpFactors() {
  if (!supabaseClient) throw new Error("Supabase is not configured for this site.");
  const { data, error } = await supabaseClient.auth.mfa.listFactors();
  if (error) throw error;
  return data.totp ?? [];
}

async function showAccountOverview() {
  document.querySelector("#account-overview").hidden = false;
  document.querySelector("#account-settings").hidden = true;
  document.querySelector("#two-factor-setup").hidden = true;
  document.querySelector("#disable-two-factor-form").hidden = true;
  document.querySelector("#enable-two-factor").hidden = true;
  document.querySelector("#disable-two-factor").hidden = true;
  if (!currentAccount) return;
  try {
    const factors = await getTotpFactors();
    const enabled = factors.some((factor) => factor.status === "verified");
    document.querySelector("#two-factor-status").textContent = enabled
      ? "Two-factor authentication is on"
      : "Two-factor authentication is off";
    document.querySelector("#enable-two-factor").hidden = enabled;
    document.querySelector("#disable-two-factor").hidden = !enabled;
  } catch (error) {
    document.querySelector("#two-factor-status").textContent = "Could not check two-factor authentication.";
    setFeedback(`Could not load security settings: ${error.message}`, true);
  }
}

function switchClientSettingsPanel(panelId) {
  document.querySelectorAll(".client-settings-tab").forEach((tab) => {
    const active = tab.dataset.settingsPanel === panelId;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".client-settings-panel").forEach((panel) => {
    const active = panel.id === panelId;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function populateClientSettingsForms() {
  if (!currentAccount) return;
  const profile = currentAccount.profile || {};
  const setVal = (id, val) => { const el = document.querySelector(`#${id}`); if (el) el.value = val ?? ""; };
  const setChk = (id, val) => { const el = document.querySelector(`#${id}`); if (el) el.checked = Boolean(val); };
  const setSel = (id, val) => { const el = document.querySelector(`#${id}`); if (el && val !== undefined && val !== null) el.value = String(val); };

  setVal("client-full-name", profile.fullName || currentAccount.name || "");
  setVal("client-email", currentAccount.email || "");
  setVal("client-phone", profile.phone || "");
  setVal("client-birthdate", profile.birthdate || "");
  setVal("client-address", profile.address || "");
  setVal("client-emergency-name", profile.emergencyName || "");
  setVal("client-emergency-phone", profile.emergencyPhone || "");
  setVal("client-medical-notes", profile.medicalNotes || "");

  const prefs = getClientSettings();
  setChk("pref-default-sms-opt-in", prefs.defaultSmsOptIn);
  setSel("pref-preferred-contact", prefs.preferredContact || "email");
  setChk("pref-email-reminders", prefs.emailReminders !== false);
  setChk("pref-sms-reminders", prefs.smsReminders);
  setSel("pref-reminder-timing", prefs.reminderTiming || "24h");
  setSel("pref-preferred-day", prefs.preferredDay || "");
  setSel("pref-preferred-time", prefs.preferredTime || "");
  setSel("pref-language", prefs.language || "en");
  setChk("pref-save-phone", prefs.savePhoneForBooking !== false);
  setChk("pref-calendar-add", prefs.calendarPrompt !== false);
  setVal("pref-special-requests", prefs.specialRequests || "");

  const isDark = document.body.dataset.theme === "dark";
  setChk("client-dark-mode", isDark);
  setSel("pref-text-size", prefs.textSize || "default");
  setChk("pref-reduced-motion", prefs.reducedMotion);
  setChk("pref-high-contrast", prefs.highContrast);
  setSel("pref-date-format", prefs.dateFormat || "locale");

  try {
    const remember = localStorage.getItem("dentalvibe.auth.remember.v1") !== "false";
    setChk("client-remember-device", remember);
  } catch (e) { setChk("client-remember-device", true); }
}


function openAccountSettings() {
  if (!currentAccount) return;
  document.querySelector("#account-overview").hidden = true;
  document.querySelector("#account-settings").hidden = false;
  document.querySelector("#two-factor-setup").hidden = true;
  document.querySelector("#disable-two-factor-form").hidden = true;
  document.querySelector("#two-factor-qr").hidden = true;
  populateClientSettingsForms();
  switchClientSettingsPanel("settings-profile");
  setFeedback("");
  document.querySelector("#back-to-account").focus();
}

async function startTotpSetup() {
  try {
    const factors = await getTotpFactors();
    if (factors.some((factor) => factor.status === "verified")) {
      await showAccountOverview();
      return;
    }
    for (const factor of factors.filter((item) => item.status !== "verified")) {
      const { error } = await supabaseClient.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
    }
    const { data, error } = await supabaseClient.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Dentalvibe",
      issuer: "Dentalvibe",
    });
    if (error) throw error;
    if (!data.totp?.secret || !data.totp.qr_code) {
      throw new Error("Supabase did not return authenticator setup details.");
    }
    pendingTotpFactorId = data.id;
    document.querySelector("#two-factor-secret").value = data.totp.secret;
    document.querySelector("#two-factor-qr").src = data.totp.qr_code;
    document.querySelector("#two-factor-qr").hidden = false;
    document.querySelector("#enable-two-factor-code").value = "";
    document.querySelector("#two-factor-setup").hidden = false;
    document.querySelector("#enable-two-factor-code").focus();
    setFeedback("");
  } catch (error) {
    setFeedback(`Could not start authenticator setup: ${error.message}`, true);
  }
}

async function cancelTotpSetup() {
  const factorId = pendingTotpFactorId;
  pendingTotpFactorId = null;
  document.querySelector("#two-factor-setup").hidden = true;
  document.querySelector("#enable-two-factor-form").reset();
  document.querySelector("#two-factor-secret").value = "";
  document.querySelector("#two-factor-qr").removeAttribute("src");
  document.querySelector("#two-factor-qr").hidden = true;
  if (factorId && supabaseClient) {
    try {
      const { error } = await supabaseClient.auth.mfa.unenroll({ factorId });
      if (error) throw error;
    } catch (error) {
      setFeedback(`Authenticator setup was cancelled, but its pending factor could not be removed: ${error.message}`, true);
      return;
    }
  }
  setFeedback("");
}

const signinModal = document.querySelector("#signin-modal");
function openAuth() {
  signinModal.hidden = false;
  document.body.classList.add("modal-open");
  setAuthMode(currentAccount ? "account" : pendingMfa ? "totp-login" : "signin");
  const focusTarget = currentAccount
    ? document.querySelector("#signout-button")
    : pendingMfa
      ? document.querySelector("#totp-login-code")
      : document.querySelector("#signin-email");
  focusTarget.focus();
}

function closeAuth() {
  if (!document.querySelector("#register-form").hidden) return;
  hidePasswordFields();
  if (pendingTotpFactorId) void cancelTotpSetup();
  signinModal.hidden = true;
  document.body.classList.remove("modal-open");
}

document.querySelectorAll("[data-open-auth]").forEach((button) => {
  button.dataset.signedOutLabel = button.textContent.trim().replace(/\s*[â†—]$/, "");
  button.addEventListener("click", openAuth);
});
document.querySelector("[data-close-signin]").addEventListener("click", closeAuth);
signinModal.addEventListener("click", (event) => {
  if (event.target === signinModal) closeAuth();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !signinModal.hidden) closeAuth();
});

document.querySelector("#create-account").addEventListener("click", () => {
  setAuthMode("register");
  document.querySelector("#register-name").focus();
});
document.querySelector("#back-from-register").addEventListener("click", () => {
  setAuthMode("signin");
  document.querySelector("#signin-email").focus();
});
document.querySelector("#forgot-password").addEventListener("click", () => {
  const email = document.querySelector("#signin-email").value.trim();
  document.querySelector("#forgot-password-email").value = email;
  setAuthMode("forgot-password");
  document.querySelector("#forgot-password-email").focus();
});
document.querySelector("#back-from-forgot-password").addEventListener("click", () => {
  setAuthMode("signin");
  document.querySelector("#signin-email").focus();
});
document.querySelector("#back-from-reset-password").addEventListener("click", () => {
  passwordRecoveryPending = false;
  setAuthMode("signin");
  document.querySelector("#signin-email").focus();
});
document.querySelector("#cancel-totp-login").addEventListener("click", async () => {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    pendingMfa = null;
    document.querySelector("#totp-login-form").reset();
    setAuthMode("signin");
    document.querySelector("#signin-email").focus();
  } catch (error) {
    setFeedback(`Could not cancel sign-in: ${error.message}`, true);
  }
});
document.querySelectorAll(".client-settings-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchClientSettingsPanel(tab.dataset.settingsPanel));
});

const clientProfileForm = document.querySelector("#client-profile-form");
if (clientProfileForm) {
  clientProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentAccount || !supabaseClient) return;
    const submitButton = clientProfileForm.querySelector('button[type="submit"]');
    const formData = new FormData(clientProfileForm);
    const fullName = String(formData.get("fullName") ?? "").trim();
    if (!fullName) { setFeedback("Enter your full name to save your profile.", true); return; }
    if (submitButton) submitButton.disabled = true;
    try {
      const { data, error } = await supabaseClient.auth.updateUser({
        data: {
          full_name: fullName,
          phone: String(formData.get("phone") ?? "").trim(),
          birthdate: String(formData.get("birthdate") ?? "").trim(),
          address: String(formData.get("address") ?? "").trim(),
          emergency_name: String(formData.get("emergencyName") ?? "").trim(),
          emergency_phone: String(formData.get("emergencyPhone") ?? "").trim(),
          medical_notes: String(formData.get("medicalNotes") ?? "").trim(),
        },
      });
      if (error) throw error;
      const user = data?.user || (await supabaseClient.auth.getUser()).data?.user;
      if (user) {
        currentAccount.name = getAccountName(user);
        currentAccount.profile = getAccountProfile(user);
      } else {
        currentAccount.name = fullName;
      }
      document.querySelector("#account-name").textContent = currentAccount.name;
      document.querySelector("#account-avatar").textContent = currentAccount.name.trim().charAt(0).toUpperCase();
      setFeedback("Profile saved to your account.");
    } catch (error) {
      setFeedback(`Could not save profile: ${error.message}`, true);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

const clientPreferencesForm = document.querySelector("#client-preferences-form");
if (clientPreferencesForm) {
  clientPreferencesForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const fd = new FormData(clientPreferencesForm);
    const checked = (name) => fd.get(name) === "on";
    const val = (name) => String(fd.get(name) ?? "");
    const settings = {
      ...getClientSettings(),
      defaultSmsOptIn: checked("defaultSmsOptIn"),
      preferredContact: val("preferredContact") || "email",
      emailReminders: checked("emailReminders"),
      smsReminders: checked("smsReminders"),
      reminderTiming: val("reminderTiming") || "24h",
      preferredDay: val("preferredDay"),
      preferredTime: val("preferredTime"),
      language: val("language") || "en",
      savePhoneForBooking: checked("savePhoneForBooking"),
      calendarPrompt: checked("calendarPrompt"),
      specialRequests: String(fd.get("specialRequests") ?? "").trim(),
    };
    saveClientSettings(settings);
    applyClientSettings(settings);
    setFeedback("Preferences saved on this device.");
  });
}

const saveAppearanceButton = document.querySelector("#save-appearance-settings");
if (saveAppearanceButton) {
  saveAppearanceButton.addEventListener("click", () => {
    const darkMode = Boolean(document.querySelector("#client-dark-mode")?.checked);
    const textSize = String(document.querySelector("#pref-text-size")?.value || "default");
    const reducedMotion = Boolean(document.querySelector("#pref-reduced-motion")?.checked);
    const highContrast = Boolean(document.querySelector("#pref-high-contrast")?.checked);
    const dateFormat = String(document.querySelector("#pref-date-format")?.value || "locale");
    applyTheme(darkMode ? "dark" : "light");
    savedTheme = darkMode ? "dark" : "light";
    try { localStorage.setItem(THEME_STORAGE_KEY, savedTheme); } catch (e) { console.error(e); }
    const settings = { ...getClientSettings(), textSize, reducedMotion, highContrast, dateFormat };
    saveClientSettings(settings);
    applyClientSettings(settings);
    setFeedback("Appearance settings saved on this device.");
  });
}

const clientDarkMode = document.querySelector("#client-dark-mode");
if (clientDarkMode) {
  clientDarkMode.addEventListener("change", () => {
    const dark = clientDarkMode.checked;
    applyTheme(dark ? "dark" : "light");
    savedTheme = dark ? "dark" : "light";
    try { localStorage.setItem(THEME_STORAGE_KEY, savedTheme); } catch (e) { console.error(e); }
  });
}

const clientChangePasswordForm = document.querySelector("#client-change-password-form");
if (clientChangePasswordForm) {
  clientChangePasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabaseClient) return;
    const submitButton = clientChangePasswordForm.querySelector('button[type="submit"]');
    const password = String(document.querySelector("#client-new-password")?.value || "");
    const confirm = String(document.querySelector("#client-confirm-new-password")?.value || "");
    if (password.length < 8) { setFeedback("Use at least 8 characters for your new password.", true); return; }
    if (password !== confirm) { setFeedback("The passwords do not match. Please try again.", true); return; }
    if (submitButton) submitButton.disabled = true;
    try {
      const { error } = await supabaseClient.auth.updateUser({ password });
      if (error) throw error;
      clientChangePasswordForm.reset();
      setFeedback("Your password has been updated.");
    } catch (error) {
      setFeedback(`Could not update password: ${error.message}`, true);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

const clientSendResetLink = document.querySelector("#client-send-reset-link");
if (clientSendResetLink) {
  clientSendResetLink.addEventListener("click", async () => {
    if (!currentAccount?.email || !supabaseClient) return;
    try {
      const redirectUrl = window.DENTALVIBE_SUPABASE_CONFIG?.resetRedirectUrl || new URL("reset-password.html", window.location.href).href;
      const { error } = await supabaseClient.auth.resetPasswordForEmail(currentAccount.email, { redirectTo: redirectUrl });
      if (error) throw error;
      setFeedback("Password reset email sent. Open it to continue on the secure reset page.");
    } catch (error) {
      setFeedback(`Could not send reset email: ${error.message}`, true);
    }
  });
}

const clientSignoutDevice = document.querySelector("#client-signout-device");
if (clientSignoutDevice) clientSignoutDevice.addEventListener("click", () => document.querySelector("#signout-button")?.click());
const clientSignoutAll = document.querySelector("#client-signout-all");
if (clientSignoutAll) {
  clientSignoutAll.addEventListener("click", async () => {
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient.auth.signOut({ scope: "global" });
      if (error) throw error;
      closeAuth();
    } catch (error) {
      setFeedback(`Could not sign out of all devices: ${error.message}`, true);
    }
  });
}

const clientExportData = document.querySelector("#client-export-data");
if (clientExportData) {
  clientExportData.addEventListener("click", async () => {
    if (!currentAccount || !supabaseClient) return;
    try {
      const { data: userData } = await supabaseClient.auth.getUser();
      const payload = {
        exportedAt: new Date().toISOString(),
        account: { id: currentAccount.id, email: currentAccount.email, name: currentAccount.name, profile: currentAccount.profile || {}, metadata: userData?.user?.user_metadata || {} },
        appointments: currentAppointments,
        clientPreferences: getClientSettings(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dentalvibe-my-data.json";
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setFeedback("Your data export has been downloaded.");
    } catch (error) {
      setFeedback(`Could not export data: ${error.message}`, true);
    }
  });
}

const clientClearPreferences = document.querySelector("#client-clear-preferences");
if (clientClearPreferences) {
  clientClearPreferences.addEventListener("click", () => {
    try { localStorage.removeItem(CLIENT_SETTINGS_KEY); } catch (e) {}
    applyClientSettings(defaultClientSettings());
    populateClientSettingsForms();
    setFeedback("Local preferences cleared on this device. Account and clinic records were not changed.");
  });
}


document.querySelector("#open-account-settings").addEventListener("click", openAccountSettings);
document.querySelector("#back-to-account").addEventListener("click", () => {
  void showAccountOverview();
  document.querySelector("#signout-button").focus();
});
document.querySelector("#enable-two-factor").addEventListener("click", () => void startTotpSetup());
document.querySelector("#cancel-two-factor-setup").addEventListener("click", () => void cancelTotpSetup());
document.querySelector("#disable-two-factor").addEventListener("click", () => {
  document.querySelector("#disable-two-factor-form").hidden = false;
  document.querySelector("#disable-two-factor-code").focus();
});
document.querySelector("#cancel-disable-two-factor").addEventListener("click", () => {
  document.querySelector("#disable-two-factor-form").reset();
  document.querySelector("#disable-two-factor-form").hidden = true;
  setFeedback("");
});
document.querySelector("#copy-two-factor-secret").addEventListener("click", async () => {
  const secretInput = document.querySelector("#two-factor-secret");
  try {
    await navigator.clipboard.writeText(secretInput.value.replace(/\s/g, ""));
    setFeedback("Setup key copied. Keep it private.");
  } catch (error) {
    secretInput.focus();
    secretInput.select();
    setFeedback("Clipboard unavailable. The setup key is selected so you can copy it manually.", true);
  }
});

document.querySelectorAll("[data-toggle-password]").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const input = document.getElementById(toggle.dataset.togglePassword);
    const willShow = input.type === "password";
    input.type = willShow ? "text" : "password";
    toggle.textContent = willShow ? "Hide" : "Show";
    toggle.setAttribute("aria-label", `${willShow ? "Hide" : "Show"} password`);
    toggle.setAttribute("aria-pressed", String(willShow));
  });
});

function requireSupabaseClient() {
  if (!supabaseClient) throw new Error("Supabase is not configured for this site.");
}

function getAccountName(user) {
  return String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Dentalvibe patient");
}

function getAccountProfile(user) {
  const meta = user?.user_metadata || {};
  return {
    fullName: String(meta.full_name || meta.name || ""),
    phone: String(meta.phone || ""),
    birthdate: String(meta.birthdate || ""),
    address: String(meta.address || ""),
    emergencyName: String(meta.emergency_name || ""),
    emergencyPhone: String(meta.emergency_phone || ""),
    medicalNotes: String(meta.medical_notes || ""),
  };
}

async function loadAppointments(userId) {
  requireSupabaseClient();
  const { data, error } = await supabaseClient
    .from("bookings")
    .select("id, service, appointment_date, appointment_time, status")
    .eq("patient_id", userId)
    .order("appointment_date", { ascending: true });
  if (error) throw error;
  currentAppointments = (data ?? []).map((appointment) => ({
    id: appointment.id,
    date: appointment.appointment_date,
    service: appointment.service,
    time: appointment.appointment_time,
    status: appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1),
  }));
  renderCalendar();
  renderVisits();
}

function applyBookingDefaultsFromSettings() {
  const settings = getClientSettings();
  if (settings.savePhoneForBooking && currentAccount?.profile?.phone && bookingPhone && !bookingPhone.value.trim()) {
    bookingPhone.value = currentAccount.profile.phone;
  }
  if (settings.defaultSmsOptIn && bookingSmsOptIn) {
    bookingSmsOptIn.checked = true;
  }
}

async function completeSignIn(user) {
  if (!user?.id) throw new Error("Supabase did not return a signed-in user.");
  currentAccount = {
    id: user.id,
    name: getAccountName(user),
    email: user.email ?? "",
    profile: getAccountProfile(user),
  };
  currentAppointments = [];
  pendingMfa = null;
  selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  updateAuthControls();
  renderCalendar();
  renderVisits();
  applyBookingDefaultsFromSettings();
  setAuthMode("account");
  try {
    await loadAppointments(user.id);
  } catch (error) {
    setFeedback(`Signed in, but appointment history could not be loaded: ${error.message}`, true);
  }
}

async function continueSignedInUser(user) {
  requireSupabaseClient();
  const { data: assurance, error: assuranceError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
    const factors = await getTotpFactors();
    const factor = factors.find((item) => item.status === "verified");
    if (!factor) throw new Error("Two-factor authentication is required, but no verified authenticator is available.");
    const { data: challenge, error: challengeError } = await supabaseClient.auth.mfa.challenge({ factorId: factor.id });
    if (challengeError) throw challengeError;
    pendingMfa = { factorId: factor.id, challengeId: challenge.id };
    signinModal.hidden = false;
    document.body.classList.add("modal-open");
    setAuthMode("totp-login");
    document.querySelector("#totp-login-code").focus();
    return;
  }
  await completeSignIn(user);
}

async function initializeAuth() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (data.session?.user && !passwordRecoveryPending) await continueSignedInUser(data.session.user);
  } catch (error) {
    openAuth();
    setFeedback(`Could not restore your Supabase session: ${error.message}`, true);
  }
}

supabaseClient?.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    passwordRecoveryPending = true;
    signinModal.hidden = false;
    document.body.classList.add("modal-open");
    setAuthMode("update-password");
    document.querySelector("#reset-password").focus();
    return;
  }
  if (event === "SIGNED_OUT") {
    currentAccount = null;
    currentAppointments = [];
    pendingMfa = null;
    updateAuthControls();
    renderCalendar();
    renderVisits();
  }
});

document.querySelector("#signin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    requireSupabaseClient();
    const formData = new FormData(form);
    const email = String(formData.get("email")).trim().toLowerCase();
    const password = String(formData.get("password"));
    form.elements.email.value = "";
    form.elements.password.value = "";
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    await continueSignedInUser(data.user);
  } catch (error) {
    if (error.message === "Invalid login credentials") {
      setFeedback("Invalid email or password. If youâ€™re new, create an account first.", true);
    } else {
      setFeedback(`Sign-in failed: ${error.message}`, true);
    }
  } finally {
    form.elements.email.value = "";
    form.elements.password.value = "";
    submitButton.disabled = false;
  }
});

document.querySelector("#forgot-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const email = String(new FormData(form).get("email")).trim().toLowerCase();
  submitButton.disabled = true;
  try {
    requireSupabaseClient();
    const redirectUrl = window.DENTALVIBE_SUPABASE_CONFIG?.resetRedirectUrl || new URL("reset-password.html", window.location.href).href;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
    if (error) throw error;
    setFeedback("If an account exists for that email, a password reset link will be sent. Open that email to continue on the secure reset page.");
  } catch (error) {
    setFeedback(`Could not send the password reset email: ${error.message}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#reset-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const password = String(formData.get("password"));
  const confirmPassword = String(formData.get("confirm-password"));
  if (password !== confirmPassword) {
    setFeedback("The passwords donâ€™t match. Please try again.", true);
    return;
  }

  submitButton.disabled = true;
  try {
    requireSupabaseClient();
    const { data, error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;
    if (!data.user) throw new Error("Supabase did not return the updated account.");
    passwordRecoveryPending = false;
    form.reset();
    try {
      await continueSignedInUser(data.user);
      setFeedback("Your password has been updated.");
    } catch (error) {
      setAuthMode("signin");
      setFeedback(`Your password was updated, but sign-in could not be completed: ${error.message}`, true);
    }
  } catch (error) {
    setFeedback(`Could not update your password: ${error.message}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#totp-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingMfa || !supabaseClient) {
    pendingMfa = null;
    setAuthMode("signin");
    setFeedback("Your sign-in attempt expired. Please sign in again.", true);
    return;
  }
  const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
  try {
    const { error } = await supabaseClient.auth.mfa.verify({
      factorId: pendingMfa.factorId,
      challengeId: pendingMfa.challengeId,
      code,
    });
    if (error) throw error;
    const { data, error: userError } = await supabaseClient.auth.getUser();
    if (userError) throw userError;
    await completeSignIn(data.user);
  } catch (error) {
    setFeedback(`Could not verify the authenticator code: ${error.message}`, true);
  }
});

document.querySelector("#enable-two-factor-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentAccount || !pendingTotpFactorId || !supabaseClient) {
    setFeedback("Authenticator setup expired. Start setup again.", true);
    await cancelTotpSetup();
    return;
  }
  const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
  try {
    const { data: challenge, error: challengeError } = await supabaseClient.auth.mfa.challenge({
      factorId: pendingTotpFactorId,
    });
    if (challengeError) throw challengeError;
    const { error } = await supabaseClient.auth.mfa.verify({
      factorId: pendingTotpFactorId,
      challengeId: challenge.id,
      code,
    });
    if (error) throw error;
    pendingTotpFactorId = null;
    document.querySelector("#two-factor-setup").hidden = true;
    document.querySelector("#enable-two-factor-form").reset();
    document.querySelector("#two-factor-secret").value = "";
    document.querySelector("#two-factor-qr").removeAttribute("src");
    document.querySelector("#two-factor-qr").hidden = true;
    document.querySelector("#account-overview").hidden = true;
    document.querySelector("#account-settings").hidden = false;
    await showAccountOverview();
    document.querySelector("#account-overview").hidden = true;
    document.querySelector("#account-settings").hidden = false;
    setFeedback("Two-factor authentication is enabled for your Supabase account.");
  } catch (error) {
    setFeedback(`Could not enable two-factor authentication: ${error.message}`, true);
  }
});

document.querySelector("#disable-two-factor-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentAccount || !supabaseClient) {
    setFeedback("Sign in again before changing two-factor authentication.", true);
    return;
  }
  const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
  try {
    const factors = await getTotpFactors();
    const factor = factors.find((item) => item.status === "verified");
    if (!factor) {
      await showAccountOverview();
      setFeedback("Two-factor authentication is already off.");
      return;
    }
    const { data: challenge, error: challengeError } = await supabaseClient.auth.mfa.challenge({
      factorId: factor.id,
    });
    if (challengeError) throw challengeError;
    const { error: verifyError } = await supabaseClient.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) throw verifyError;
    const { error: unenrollError } = await supabaseClient.auth.mfa.unenroll({ factorId: factor.id });
    if (unenrollError) throw unenrollError;
    document.querySelector("#disable-two-factor-form").reset();
    document.querySelector("#disable-two-factor-form").hidden = true;
    await showAccountOverview();
    document.querySelector("#account-overview").hidden = true;
    document.querySelector("#account-settings").hidden = false;
    setFeedback("Two-factor authentication is turned off for your Supabase account.");
  } catch (error) {
    setFeedback(`Could not turn off two-factor authentication: ${error.message}`, true);
  }
});

document.querySelector("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const name = String(formData.get("name")).trim();
  const email = String(formData.get("email")).trim().toLowerCase();
  const password = String(formData.get("password"));
  const confirmPassword = String(formData.get("confirm-password"));
  if (!name) {
    setFeedback("Enter your name to create an account.", true);
    return;
  }
  if (password !== confirmPassword) {
    setFeedback("The passwords donâ€™t match. Please try again.", true);
    return;
  }

  submitButton.disabled = true;
  try {
    requireSupabaseClient();
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw error;
    form.reset();
    if (!data.session || !data.user) {
      setAuthMode("signin");
      setFeedback("Account created. Check your email to confirm the address, then sign in.");
      return;
    }
    await continueSignedInUser(data.user);
  } catch (error) {
    setFeedback(`Account could not be created: ${error.message}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#signout-button").addEventListener("click", async () => {
  if (!supabaseClient) {
    setFeedback("Supabase is not configured for this site.", true);
    return;
  }
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    currentAccount = null;
    currentAppointments = [];
    selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    updateAuthControls();
    renderCalendar();
    renderVisits();
    closeAuth();
  } catch (error) {
    setFeedback(`Could not sign out: ${error.message}`, true);
  }
});

document.querySelector("#prev-month").addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
  renderCalendar();
});
document.querySelector("#next-month").addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
  renderCalendar();
});

document.querySelectorAll(".book-service").forEach((button) => {
  button.addEventListener("click", () => {
    serviceSelect.value = button.dataset.service;
    document.querySelector("#appointments").scrollIntoView({ behavior: "smooth" });
    serviceSelect.focus({ preventScroll: true });
  });
});

document.querySelector("#booking-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  bookingFeedback.classList.remove("feedback-error");
  if (!currentAccount) {
    bookingFeedback.textContent = "Sign in or create an account to save your appointment request.";
    openAuth();
    return;
  }
  if (!supabaseClient) {
    bookingFeedback.textContent = "Bookings cannot be sent to the clinic right now. Supabase is unavailable; please try again later.";
    return;
  }

  const phone = normalizePhilippinePhone(bookingPhone.value);
  if (phone === null || (bookingSmsOptIn.checked && !phone)) {
    bookingFeedback.textContent = bookingSmsOptIn.checked && !bookingPhone.value.trim()
      ? "Enter a mobile number to receive appointment-related SMS messages."
      : "Enter a valid Philippine mobile number, such as +63 9XX XXX XXXX.";
    bookingFeedback.classList.add("feedback-error");
    bookingPhone.focus();
    return;
  }

  const bookingDate = new Date(selectedDate);
  if (bookingDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    bookingDate.setTime(now.getTime());
    bookingDate.setDate(now.getDate() + 1);
    selectedDate = new Date(bookingDate);
    displayedMonth = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), 1);
  }
  bookingDate.setHours(0, 0, 0, 0);
  const appointment = {
    date: dateKey(bookingDate),
    service: serviceSelect.value,
    status: "Requested",
    time: "To be confirmed",
  };
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const { data, error } = await supabaseClient.from("bookings").insert({
      patient_id: currentAccount.id,
      patient_name: currentAccount.name,
      patient_email: currentAccount.email,
      patient_phone: phone || null,
      patient_sms_opt_in: bookingSmsOptIn.checked,
      service: appointment.service,
      appointment_date: appointment.date,
    }).select("id, service, appointment_date, appointment_time, status").single();
    if (error) throw error;
    currentAppointments.push({
      id: data.id,
      date: data.appointment_date,
      service: data.service,
      status: data.status.charAt(0).toUpperCase() + data.status.slice(1),
      time: data.appointment_time,
    });
    let delivery = null;
    try {
      const { data: result, error: notificationError } = await supabaseClient.functions.invoke("dentalvibe-integrations", {
        body: { action: "booking_event", bookingId: data.id, eventType: "requested" },
      });
      if (notificationError) throw notificationError;
      delivery = result;
    } catch (error) {
      console.error("The booking was saved, but its notification request failed.", error);
    }
    if (!delivery || delivery.warnings?.length) {
      bookingFeedback.textContent = `Your ${appointment.service.toLowerCase()} request for ${formatVisitDate(bookingDate)} was saved. The clinic still needs to confirm it; automated messages may not be configured yet.`;
    } else if (delivery.sent?.length) {
      bookingFeedback.textContent = `Your ${appointment.service.toLowerCase()} request for ${formatVisitDate(bookingDate)} was sent to the clinic. The clinic still needs to confirm it.`;
    } else {
      bookingFeedback.textContent = `Your ${appointment.service.toLowerCase()} request for ${formatVisitDate(bookingDate)} was saved. The clinic still needs to confirm it.`;
    }
    renderCalendar();
    renderVisits();
  } catch (error) {
    bookingFeedback.textContent = `Booking request could not be sent: ${error.message}`;
    bookingFeedback.classList.add("feedback-error");
  } finally {
    submitButton.disabled = false;
  }
});

updateAuthControls();
renderCalendar();
renderVisits();
void initializeAuth();



