const $ = (s) => document.querySelector(s);

const STORAGE = {
  uiLang: "voxbridge_ui_lang",
};

const I18N = {
  el: {
    ui_language: "Γλώσσα εφαρμογής",
    tagline: "Ζωντανός Διερμηνέας Φωνής σε πραγματικό χρόνο",

    login_title: "Σύνδεση",
    login_sub: "Συνδέσου για να χρησιμοποιήσεις το VoxBridge.",

    email_label: "Email",
    password_label: "Κωδικός",
    email_placeholder: "name@example.com",
    password_placeholder: "••••••••",

    sign_in: "Σύνδεση",
    create_account: "Δημιουργία λογαριασμού",
    continue_google: "Συνέχεια με Google",

    status_ready: "—",
    status_working: "Γίνεται σύνδεση…",
    status_invalid: "Λάθος email ή κωδικός.",
    status_exists: "Υπάρχει ήδη λογαριασμός με αυτό το email.",
    status_weak: "Βάλε έναν πιο δυνατό κωδικό (τουλάχιστον 6 χαρακτήρες).",
    status_generic: "Κάτι πήγε στραβά — δοκίμασε ξανά.",

    note: "Συνεχίζοντας, συμφωνείς να χρησιμοποιείς το VoxBridge υπεύθυνα.",
  },
  en: {
    ui_language: "UI language",
    tagline: "Real-time Voice Interpreter",

    login_title: "Sign in",
    login_sub: "Sign in to use VoxBridge.",

    email_label: "Email",
    password_label: "Password",
    email_placeholder: "name@example.com",
    password_placeholder: "••••••••",

    sign_in: "Sign in",
    create_account: "Create account",
    continue_google: "Continue with Google",

    status_ready: "—",
    status_working: "Signing in…",
    status_invalid: "Invalid email or password.",
    status_exists: "An account with this email already exists.",
    status_weak: "Please choose a stronger password (at least 6 characters).",
    status_generic: "Something went wrong — please try again.",

    note: "By continuing you agree to use VoxBridge responsibly.",
  }
};

const state = {
  uiLang: "el",
};

function t(key){
  const dict = I18N[state.uiLang] || I18N.el;
  return dict[key] ?? (I18N.el[key] ?? key);
}

function apply(){
  document.documentElement.lang = state.uiLang;
  document.title = `VoxBridge — ${t('tagline')}`;

  $('#uiLangLabel').textContent = t('ui_language');
  $('#brandTagline').textContent = t('tagline');

  $('#loginTitle').textContent = t('login_title');
  $('#loginSub').textContent = t('login_sub');
  $('#emailLabel').textContent = t('email_label');
  $('#passwordLabel').textContent = t('password_label');
  $('#email').placeholder = t('email_placeholder');
  $('#password').placeholder = t('password_placeholder');

  $('#btnLogin').textContent = t('sign_in');
  $('#btnRegister').textContent = t('create_account');
  $('#btnGoogle').textContent = t('continue_google');
  $('#loginNote').textContent = t('note');
}

function getNext(){
  try{
    const u = new URL(location.href);
    const n = u.searchParams.get('next') || '';
    if(!n) return '/app';
    if(n.startsWith('http://') || n.startsWith('https://')) return '/app';
    return n;
  }catch{
    return '/app';
  }
}

function statusKey(key){
  $('#loginStatus').textContent = t(key);
}

async function post(endpoint, body){
  const fd = new FormData();
  Object.entries(body || {}).forEach(([k,v]) => fd.append(k, String(v || '')));
  const r = await fetch(endpoint, {method:'POST', body: fd, credentials:'same-origin'});
  const j = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(j?.error || 'generic');
  return j;
}

async function onLogin(){
  statusKey('status_working');
  const email = ($('#email').value || '').trim();
  const password = ($('#password').value || '').trim();
  try{
    await post('/api/auth/login', {email, password});
    location.href = getNext();
  }catch(err){
    const code = String(err?.message || '').toLowerCase();
    if(code.includes('invalid')) statusKey('status_invalid');
    else statusKey('status_generic');
  }
}

async function onRegister(){
  statusKey('status_working');
  const email = ($('#email').value || '').trim();
  const password = ($('#password').value || '').trim();
  try{
    await post('/api/auth/register', {email, password});
    location.href = getNext();
  }catch(err){
    const code = String(err?.message || '').toLowerCase();
    if(code.includes('exists')) statusKey('status_exists');
    else if(code.includes('weak')) statusKey('status_weak');
    else statusKey('status_generic');
  }
}

function init(){
  state.uiLang = localStorage.getItem(STORAGE.uiLang) || 'el';
  $('#uiLang').value = state.uiLang;
  $('#uiLang').addEventListener('change', () => {
    state.uiLang = $('#uiLang').value || 'el';
    localStorage.setItem(STORAGE.uiLang, state.uiLang);
    apply();
  });

  $('#btnLogin').addEventListener('click', onLogin);
  $('#btnRegister').addEventListener('click', onRegister);

  const next = encodeURIComponent(getNext());
  $('#btnGoogle').href = `/auth/google/login?next=${next}`;

  statusKey('status_ready');
  apply();
}

window.addEventListener('load', init);
