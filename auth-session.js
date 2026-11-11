(() => {
  const config = window.DENTALVIBE_SUPABASE_CONFIG;
  const supabase = window.supabase;
  if (!config || !supabase?.createClient) return;

  const preferenceKey = "dentalvibe.auth.remember.v1";
  const storageKey = `sb-${new URL(config.url).hostname.split(".")[0]}-auth-token`;
  let rememberSession = true;
  try {
    rememberSession = localStorage.getItem(preferenceKey) !== "false";
  } catch (error) {
    console.error("Could not read the saved sign-in preference.", error);
  }

  const rememberCheckboxes = [...document.querySelectorAll('input[name="remember"]')];
  const syncCheckboxes = () => {
    rememberCheckboxes.forEach((checkbox) => {
      checkbox.checked = rememberSession;
    });
  };
  const storage = {
    async getItem(key) {
      return (rememberSession ? localStorage : sessionStorage).getItem(key);
    },
    async setItem(key, value) {
      (rememberSession ? localStorage : sessionStorage).setItem(key, value);
    },
    async removeItem(key) {
      (rememberSession ? localStorage : sessionStorage).removeItem(key);
    },
  };
  const createClient = supabase.createClient;
  supabase.createClient = (url, key, options = {}) => {
    if (url !== config.url) return createClient(url, key, options);
    return createClient(url, key, {
      ...options,
      auth: { ...options.auth, storageKey, storage },
    });
  };

  syncCheckboxes();
  rememberCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const nextValue = checkbox.checked;
      try {
        (nextValue ? sessionStorage : localStorage).removeItem(storageKey);
        localStorage.setItem(preferenceKey, String(nextValue));
        rememberSession = nextValue;
        syncCheckboxes();
      } catch (error) {
        syncCheckboxes();
        const feedback = document.querySelector("#signin-feedback");
        if (feedback) {
          feedback.textContent = `Could not save the sign-in preference: ${error.message}`;
          feedback.classList.add("feedback-error");
        }
      }
    });
  });
  document.querySelector("#register-form")?.addEventListener("reset", () => {
    window.setTimeout(syncCheckboxes, 0);
  });
})();
