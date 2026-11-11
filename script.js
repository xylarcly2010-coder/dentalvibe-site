const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
let displayedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
let selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
    button.replaceChildren(document.createTextNode(label));
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = currentAccount ? "●" : "↗";
    button.append(arrow);
  });
}

function setAuthMode(mode) {
  const signinForm = document.querySelector("#signin-form");
  const totpLoginForm = document.querySelector("#totp-login-form");
  const registerForm = document.querySelector("#register-form");
  const accountPanel = document.querySelector("#account-panel");
  const signupNote = document.querySelector("#signup-note");
  const signinNote = document.querySelector("#signin-note");
  const title = document.querySelector("#signin-title");
  const intro = document.querySelector(".modal-intro");

  signinForm.hidden = mode !== "signin";
  totpLoginForm.hidden = mode !== "totp-login";
  registerForm.hidden = mode !== "register";
  accountPanel.hidden = mode !== "account";
  signupNote.hidden = mode !== "signin";
  signinNote.hidden = mode !== "register";
  title.textContent = mode === "register"
    ? "Create your account."
    : mode === "account" ? "Your Dentalvibe account."
      : mode === "totp-login" ? "Verify it’s you."
        : "Your smile, your schedule.";
  intro.hidden = mode === "account";
  intro.textContent = mode === "register"
    ? "Create an account to save your details and keep your appointment requests together."
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

function openAccountSettings() {
  if (!currentAccount) return;
  document.querySelector("#account-overview").hidden = true;
  document.querySelector("#account-settings").hidden = false;
  document.querySelector("#two-factor-setup").hidden = true;
  document.querySelector("#disable-two-factor-form").hidden = true;
  document.querySelector("#two-factor-qr").hidden = true;
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
  hidePasswordFields();
  if (pendingTotpFactorId) void cancelTotpSetup();
  signinModal.hidden = true;
  document.body.classList.remove("modal-open");
}

document.querySelectorAll("[data-open-auth]").forEach((button) => {
  button.dataset.signedOutLabel = button.textContent.trim().replace(/\s*[↗]$/, "");
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
document.querySelector("#switch-to-signin").addEventListener("click", () => {
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

async function completeSignIn(user) {
  if (!user?.id) throw new Error("Supabase did not return a signed-in user.");
  currentAccount = {
    id: user.id,
    name: getAccountName(user),
    email: user.email ?? "",
  };
  currentAppointments = [];
  pendingMfa = null;
  selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  updateAuthControls();
  renderCalendar();
  renderVisits();
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
    if (data.session?.user) await continueSignedInUser(data.session.user);
  } catch (error) {
    openAuth();
    setFeedback(`Could not restore your Supabase session: ${error.message}`, true);
  }
}

supabaseClient?.auth.onAuthStateChange((event) => {
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
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: String(formData.get("email")).trim().toLowerCase(),
      password: String(formData.get("password")),
    });
    if (error) throw error;
    await continueSignedInUser(data.user);
  } catch (error) {
    if (error.message === "Invalid login credentials") {       setFeedback("Invalid email or password. If you’re new, create an account first.", true);     } else {       setFeedback(`Sign-in failed: ${error.message}`, true);     }
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
    setFeedback("The passwords don’t match. Please try again.", true);
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
  if (!currentAccount) {
    bookingFeedback.textContent = "Sign in or create an account to save your appointment request.";
    openAuth();
    return;
  }
  if (!supabaseClient) {
    bookingFeedback.textContent = "Bookings cannot be sent to the clinic right now. Supabase is unavailable; please try again later.";
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
    bookingFeedback.textContent = `Your ${appointment.service.toLowerCase()} request for ${formatVisitDate(bookingDate)} was sent to the clinic. The clinic still needs to confirm it.`;
    renderCalendar();
    renderVisits();
  } catch (error) {
    bookingFeedback.textContent = `Booking request could not be sent: ${error.message}`;
  } finally {
    submitButton.disabled = false;
  }
});

updateAuthControls();
renderCalendar();
renderVisits();
void initializeAuth();
