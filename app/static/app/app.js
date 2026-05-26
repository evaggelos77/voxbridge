/* VoxBridge web app (vanilla JS)

  Modes:
  - Live interpreter (push-to-talk) -> /api/ptt
  - Online call (two participants) -> /api/call/ptt + /ws/{room}
  - Audio file translation -> /api/file
  - History -> /api/history

  Key UX requirements:
  - UI language (Greek/English) must switch 100% with no mixed strings.
  - Never show technical errors in the UI.
  - Audio/translation failures show ONLY: "Δεν άκουσα καθαρά — ξαναμίλησε."
*/

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const FRIENDLY_AUDIO_ERROR = "Δεν άκουσα καθαρά — ξαναμίλησε.";

const STORAGE = {
  uiLang: "voxbridge_ui_lang",
  clientId: "voxbridge_client_id",
  micDeviceId: "voxbridge_mic_device_id",
  camDeviceId: "voxbridge_cam_device_id",
  debugSave: "voxbridge_debug_save_recording",
};

const I18N = {
  el: {
    // Header / brand
    ui_language: "Γλώσσα εφαρμογής",
    tagline: "Ζωντανός Διερμηνέας Φωνής",

    // Nav
    nav_live: "Διερμηνέας",
    nav_call: "Online κλήση",
    nav_files: "Αρχεία",
    nav_history: "Ιστορικό",
    nav_settings: "Ρυθμίσεις",

    // Common
    ready: "Έτοιμο.",
    listening: "Ακούω…",
    translating: "Μεταφράζω…",
    playing: "Αναπαραγωγή…",
    done: "Έγινε.",
    loading: "Φόρτωση…",

    // Hold-to-talk
    hold_to_talk: "Κράτα πατημένο για να μιλήσεις",
    hold_to_talk_call: "Κράτα πατημένο για να μιλήσεις",

    // Languages
    i_speak: "Μιλάω:",
    they_hear: "Ακούει:",
    i_hear: "Ακούω:",
    auto: "Αυτόματα",
    other: "Άλλο…",
    type_language: "Γράψε γλώσσα…",
    you_said: "Είπες",
    translation: "Μετάφραση",
    transcript: "Κείμενο",

    // Live view
    live_title: "Live διερμηνεία",
    live_sub: "Push‑to‑talk για πραγματικές συζητήσεις (από κοντά).",
    live_hint_html: "Θες μετάφραση από αρχείο; → <a href=\"#files\" data-goto=\"files\">Αρχεία</a>",
    play_local_on: "🔊 Τοπική αναπαραγωγή: ΝΑΙ",
    play_local_off: "🔇 Τοπική αναπαραγωγή: ΟΧΙ",

    // Microphone
    microphone: "Μικρόφωνο",
    microphone_default: "Προεπιλογή",
    microphone_device_n: (n) => `Μικρόφωνο ${n}`,
    mic_permission_denied: "Δεν έχω πρόσβαση στο μικρόφωνο. Επίτρεψε την άδεια και δοκίμασε ξανά.",
    mic_not_found: "Δεν βρέθηκε μικρόφωνο. Έλεγξε τη συσκευή σου και δοκίμασε ξανά.",
    browser_recommend_chrome: "Για καλύτερη υποστήριξη μικροφώνου, προτείνεται Chrome ή Edge.",

    // Online call
    call_title: "Online κλήση",
    call_sub: "2 συμμετέχοντες · διερμηνεία push‑to‑talk σε πραγματικό χρόνο.",
    room: "Δωμάτιο",
    room_placeholder: "nexvo-1234",
    join: "Σύνδεση",
    new_room: "Νέο δωμάτιο",
    copy_link: "Αντιγραφή συνδέσμου",
    call_room_note: "Στείλε τον σύνδεσμο στον άλλον. Η κλήση μένει ενεργή μέχρι να την κλείσεις.",
    call_languages: "Γλώσσες",
    autoplay_incoming: "Αυτόματη αναπαραγωγή εισερχόμενων",
    preview_my_output: "Προεπισκόπηση της δικής μου εξόδου",
    call_return: "Επιστροφή στην κλήση",
    call_end: "Κλείσιμο κλήσης",
    connecting: "Σύνδεση…",
    connected: "Συνδεδεμένος",
    disconnected: "Αποσυνδεδεμένος",
    call_in_bar: (room) => `Σε κλήση: ${room}`,
    remote_prefs: (inLang, outLang) => `Ο άλλος: ακούει ${inLang} · στέλνει ${outLang}`,
    call_partner: "Συνομιλητής",
    call_you_to: (lang) => `Εσύ → ${lang}`,

    // Files
    files_title: "Μετάφραση αρχείου ήχου",
    files_sub: "Μεταφόρτωση → Μετάφραση → MP3",
    audio_file: "Αρχείο ήχου",
    target_language: "Γλώσσα στόχος",
    translate: "Μετάφραση",
    download: "⬇ Λήψη",
    share: "📤 Κοινοποίηση",

    // History
    history_title: "Ιστορικό",
    history_sub: "Αποθηκευμένα MP3 για λήψη/μοίρασμα",
    no_history: "Δεν υπάρχει ιστορικό ακόμα.",
    play: "▶ Αναπαραγωγή",
    delete: "🗑 Διαγραφή",
    confirm_delete: "Διαγραφή αυτού του στοιχείου;",
    deleted: "Διαγράφηκε.",
    no_transcript: "(χωρίς κείμενο)",
    mode_live: "Live",
    mode_call: "Κλήση",
    mode_file: "Αρχείο",

    // Settings
    settings_title: "Ρυθμίσεις",
    settings_sub: "Σύνδεση, πακέτα & χρεώσεις θα προστεθούν αργότερα. Αυτή η έκδοση τρέχει τοπικά.",
    mvp_status: "Κατάσταση MVP: Τοπική έκδοση",
    languages_note: "Υποστηρίζονται όλες οι γλώσσες που μπορείς να γράψεις. Διάλεξε από τη λίστα ή «Άλλο…» για να πληκτρολογήσεις γλώσσα/κωδικό.",
    debug_save_recording: "Αποθήκευση τελευταίας εγγραφής (debug)",
    debug_save_note: "Όταν είναι ενεργό, η τελευταία εγγραφή αποθηκεύεται στο /media/last_recording.*",

    // Clipboard / share
    copied: "Αντιγράφηκε.",
    copy_prompt: "Αντέγραψε αυτόν τον σύνδεσμο:",

    // Health
    server_on_key_ok: "Διακομιστής: ΕΝΕΡΓΟΣ · Κλειδί API: ΟΚ",
    server_on_key_missing: "Διακομιστής: ΕΝΕΡΓΟΣ · Κλειδί API: ΛΕΙΠΕΙ",
    server_off: "Διακομιστής: ΑΝΕΝΕΡΓΟΣ",
  },

  en: {
    // Header / brand
    ui_language: "UI language",
    tagline: "Live Voice Interpreter",

    // Nav
    nav_live: "Interpreter",
    nav_call: "Online Call",
    nav_files: "Files",
    nav_history: "History",
    nav_settings: "Settings",

    // Common
    ready: "Ready.",
    listening: "Listening…",
    translating: "Translating…",
    playing: "Playing…",
    done: "Done.",
    loading: "Loading…",

    // Hold-to-talk
    hold_to_talk: "Hold to talk",
    hold_to_talk_call: "Hold to talk",

    // Languages
    i_speak: "I speak:",
    they_hear: "They hear:",
    i_hear: "I hear:",
    auto: "Auto",
    other: "Other…",
    type_language: "Type language…",
    you_said: "You said",
    translation: "Translation",
    transcript: "Transcript",

    // Live view
    live_title: "Live interpreter",
    live_sub: "Push‑to‑talk for real conversations (in person).",
    live_hint_html: "Need to translate an audio file? → <a href=\"#files\" data-goto=\"files\">Files</a>",
    play_local_on: "🔊 Play local: ON",
    play_local_off: "🔇 Play local: OFF",

    // Microphone
    microphone: "Microphone",
    microphone_default: "Default",
    microphone_device_n: (n) => `Microphone ${n}`,
    mic_permission_denied: "Microphone access is denied. Please allow permission and try again.",
    mic_not_found: "No microphone found. Please check your device and try again.",
    browser_recommend_chrome: "For best microphone support, use Chrome or Edge.",

    // Online call
    call_title: "Online Call",
    call_sub: "Two participants · real‑time push‑to‑talk interpretation.",
    room: "Room",
    room_placeholder: "nexvo-1234",
    join: "Join",
    new_room: "New room",
    copy_link: "Copy link",
    call_room_note: "Share the link with the other person. The call stays active until you end it.",
    call_languages: "Languages",
    autoplay_incoming: "Auto‑play incoming",
    preview_my_output: "Preview my output",
    call_return: "Return to call",
    call_end: "End call",
    connecting: "Connecting…",
    connected: "Connected",
    disconnected: "Disconnected",
    call_in_bar: (room) => `In call: ${room}`,
    remote_prefs: (inLang, outLang) => `Partner: hears ${inLang} · sends ${outLang}`,
    call_partner: "Partner",
    call_you_to: (lang) => `You → ${lang}`,

    // Files
    files_title: "Audio file translation",
    files_sub: "Upload → Translate → MP3",
    audio_file: "Audio file",
    target_language: "Target language",
    translate: "Translate",
    download: "⬇ Download",
    share: "📤 Share",

    // History
    history_title: "History",
    history_sub: "Saved MP3s you can download/share",
    no_history: "No history yet.",
    play: "▶ Play",
    delete: "🗑 Delete",
    confirm_delete: "Delete this item?",
    deleted: "Deleted.",
    no_transcript: "(no transcript)",
    mode_live: "Live",
    mode_call: "Call",
    mode_file: "File",

    // Settings
    settings_title: "Settings",
    settings_sub: "Login, plans & billing will be added later. This build runs locally.",
    mvp_status: "MVP status: Local build",
    languages_note: "Translation supports any language you can type. Choose from the list or select “Other…” to type a language name/code.",
    debug_save_recording: "Save last recording (debug)",
    debug_save_note: "When enabled, the last recorded audio is saved to /media/last_recording.*",

    // Clipboard / share
    copied: "Copied.",
    copy_prompt: "Copy this link:",

    // Health
    server_on_key_ok: "Server: ON · API key: OK",
    server_on_key_missing: "Server: ON · API key: MISSING",
    server_off: "Server: OFF",
  }
};

// --- VoxBridge copy additions / overrides ---
I18N.el.tagline = "Ζωντανός Διερμηνέας Φωνής σε πραγματικό χρόνο";
I18N.en.tagline = "Real-time Voice Interpreter";

// Online Call convenience: paste link -> auto-extract room
I18N.el.paste_invite_link = "Επικόλληση συνδέσμου ή κωδικού";
I18N.en.paste_invite_link = "Paste invite link or room code";
I18N.el.paste_invite_placeholder = "Κάνε επικόλληση συνδέσμου (ή /app?room=…#call) ή κωδικού";
I18N.en.paste_invite_placeholder = "Paste a link (or /app?room=…#call) or a room code";

// Copy labels
I18N.el.copy_code = "Αντιγραφή κωδικού";
I18N.en.copy_code = "Copy code";

// Invite preview (what the user should send)
I18N.el.invite_preview = "Σύνδεσμος / κωδικός πρόσκλησης";
I18N.en.invite_preview = "Invite link / code";
I18N.el.invite_preview_note_link = "Στείλε αυτόν τον σύνδεσμο στον άλλον.";
I18N.en.invite_preview_note_link = "Send this link to the other person.";
I18N.el.invite_preview_note_lan = "Στείλε αυτόν τον σύνδεσμο (ίδιο Wi‑Fi/LAN).";
I18N.en.invite_preview_note_lan = "Send this link (same Wi‑Fi/LAN).";
I18N.el.copy_manual = "Δεν μπόρεσα να αντιγράψω αυτόματα. Επίλεξε το κείμενο και πάτα Ctrl+C.";
I18N.en.copy_manual = "Couldn't copy automatically. Select the text and press Ctrl+C.";

// Invite link behavior when no PUBLIC_BASE_URL is configured
I18N.el.room_code_share_instruction = "Στείλε αυτόν τον κωδικό δωματίου στον άλλον και θα τον εισάγει στο πεδίο «Δωμάτιο».";
I18N.en.room_code_share_instruction = "Send this room code to the other person and they can enter it in the Room field.";

// Permission retry actions
I18N.el.retry_mic = "Ζήτα ξανά άδεια μικροφώνου";
I18N.en.retry_mic = "Retry microphone permission";
I18N.el.retry_cam = "Ζήτα ξανά άδεια κάμερας";
I18N.en.retry_cam = "Retry camera permission";

I18N.el.how_panel_html = ""+
  '<div class="how-title">Οδηγίες Χρήσης</div>'+
  '<ol>'+
    '<li>Ρύθμισε τις γλώσσες: Διάλεξε τη γλώσσα σου (<b>Μιλάω</b>) και ποια θα βλέπει ο συνομιλητής (<b>Ακούει</b>).</li>'+
    '<li>Κράτα πατημένο για να μιλήσεις.</li>'+
    '<li>Δες/άκου τη μετάφραση.</li>'+
  '</ol>'+
  '<div class="use-cases"><b>Χρήσεις:</b> Ταξίδια, Τουρισμός, Επαγγελματικές συναντήσεις, Συνεντεύξεις.</div>';

I18N.en.how_panel_html = ""+
  '<div class="how-title">How it works</div>'+
  '<ol>'+
    '<li>Choose languages (<b>I speak</b> / <b>They hear</b>).</li>'+
    '<li>Hold to talk.</li>'+
    '<li>See/hear translation.</li>'+
  '</ol>'+
  '<div class="use-cases"><b>Use cases:</b> Travel, Tourism, Business meetings, Interviews.</div>';

I18N.el.camera = "Κάμερα";
I18N.en.camera = "Camera";
I18N.el.camera_default = "Προεπιλογή";
I18N.en.camera_default = "Default";
I18N.el.camera_device_n = (n) => `Κάμερα ${n}`;
I18N.en.camera_device_n = (n) => `Camera ${n}`;
I18N.el.camera_not_found = "Δεν βρέθηκε κάμερα.";
I18N.en.camera_not_found = "No camera found.";
I18N.el.camera_permission_denied = "Δεν έχω πρόσβαση στην κάμερα. Επίτρεψε την άδεια και δοκίμασε ξανά.";
I18N.en.camera_permission_denied = "Camera access is denied. Please allow permission and try again.";
I18N.el.camera_on = "📷 Κάμερα: ON";
I18N.en.camera_on = "📷 Camera: ON";
I18N.el.camera_off = "📷 Κάμερα: OFF";
I18N.en.camera_off = "📷 Camera: OFF";

I18N.el.captions = "Υπότιτλοι";
I18N.en.captions = "Captions";
I18N.el.show_my_captions = "Δείξε τους δικούς μου";
I18N.en.show_my_captions = "Show mine";

I18N.el.video_you = "Εσύ";
I18N.en.video_you = "You";
I18N.el.video_partner = "Συνομιλητής";
I18N.en.video_partner = "Partner";

I18N.el.partner_speaking = "Μιλάει ο άλλος…";
I18N.en.partner_speaking = "The other person is speaking…";

I18N.el.auth_required = "Χρειάζεται σύνδεση για να συνεχίσεις.";
I18N.en.auth_required = "Please sign in to continue.";
I18N.el.signed_in_as = "Συνδεδεμένος ως";
I18N.en.signed_in_as = "Signed in as";
I18N.el.logout = "Αποσύνδεση";
I18N.en.logout = "Logout";

I18N.el.call_sub = "Δύο συμμετέχοντες · WebRTC βίντεο + ζωντανοί υπότιτλοι μετάφρασης (push‑to‑talk).";
I18N.en.call_sub = "Two participants · WebRTC video + live translated captions (push‑to‑talk).";

I18N.el.room_placeholder = "vox-1234";
I18N.en.room_placeholder = "vox-1234";

I18N.el.settings_sub = "Σύνδεση, λογαριασμός και επιλογές εφαρμογής.";
I18N.en.settings_sub = "Sign-in, account and app preferences.";



const state = {
  view: "live",
  uiLang: "el",
  playLocal: true,
  debugSaveRecording: false,

  // Client config (from /api/config)
  publicBaseUrl: "",
  lanBaseUrl: "",

  // Languages for selects
  langs: [],

  // Media recorder
  rec: null,
  stream: null,
  chunks: [],
  vuStopper: null,

  // Mic device selection
  micDeviceId: "",

  // Camera device selection (call)
  camDeviceId: "",

  // Stable id for call peer messages
  clientId: null,

  // Cache
  lastHistoryItems: null,

  // (do not add duplicate keys here)
};

const call = {
  room: "",
  ws: null,
  connected: false,
  remotePrefs: { inLang: "", outLang: "" },

  // WebRTC + captions
  pc: null,
  remoteId: "",
  isOfferer: false,
  remoteStream: null,

  micStream: null,
  rtcAudioTrack: null,
  rtcAudioSender: null,

  camStream: null,
  rtcVideoSender: null,
  cameraOn: false,

  remoteSpeaking: false,
};

function t(key, ...args){
  const dict = I18N[state.uiLang] || I18N.el;
  const v = dict[key];
  if(typeof v === "function") return v(...args);
  return v ?? (I18N.el[key] ?? key);
}

function applyI18n(){
  // text nodes
  $$("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  // html blocks (safe, controlled)
  $$("[data-i18n-html]").forEach(el => {
    const key = el.dataset.i18nHtml;
    const html = (I18N[state.uiLang] && I18N[state.uiLang][key]) || I18N.el[key];
    if(typeof html === "string") el.innerHTML = html;
  });

  // placeholders
  $$("[data-i18n-placeholder]").forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    el.placeholder = t(key);
  });

  // Update document language + title
  try{ document.documentElement.lang = state.uiLang; }catch{}
  try{ document.title = `VoxBridge — ${t("tagline")}`; }catch{}

  // Dynamic labels
  updatePlayLocalBtn();
  updateAllLangLabels();
  updateCallBar();
  setRemotePrefsText();
  updateInvitePreview();

  // Re-render history in the new UI language (to update button labels)
  if(state.lastHistoryItems){
    renderHistory(state.lastHistoryItems);
  }

  // Refresh mic selects for localized “Default”
  renderMicSelects();

  // Refresh camera select + button labels
  try{ renderCamSelect(); }catch{}
  try{ updateCamToggle(); }catch{}

  // Ensure status placeholders are not mixed language
  if(state.view === "live" && $("#status")?.dataset?.i18n === "ready"){
    // applyI18n already set it
  }
}

function toast(msg, ms=1600){
  // Keep toast for lightweight confirmations (copy, etc.).
  const el = $("#toast");
  if(!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

function setStatus(text){
  const el = $("#status");
  if(el) el.textContent = text;
}
function setFileStatus(text){
  const el = $("#fileStatus");
  if(el) el.textContent = text;
}
function setCallConnectionStatus(text){
  const el = $("#callStatus");
  if(el) el.textContent = text;
}
function setCallMainStatus(text){
  const el = $("#callMainStatus");
  if(el) el.textContent = text;
}

// ---------- Permission retry actions ----------
function updateCallPermActionsVisibility(){
  const wrap = $("#callPermActions");
  if(!wrap) return;
  const micBtn = $("#retryMicCall");
  const camBtn = $("#retryCamCall");
  const show = (micBtn && !micBtn.hidden) || (camBtn && !camBtn.hidden);
  wrap.hidden = !show;
}

function setLiveMicRetry(show){
  const wrap = $("#livePermActions");
  const btn = $("#retryMicLive");
  if(btn) btn.hidden = !show;
  if(wrap) wrap.hidden = !show;
}

function setCallMicRetry(show){
  const btn = $("#retryMicCall");
  if(btn) btn.hidden = !show;
  updateCallPermActionsVisibility();
}

function setCallCamRetry(show){
  const btn = $("#retryCamCall");
  if(btn) btn.hidden = !show;
  updateCallPermActionsVisibility();
}

function setView(view){
  state.view = view;
  $$(".view").forEach(v => v.classList.remove("active"));
  $(`#view-${view}`)?.classList.add("active");
  $$(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  location.hash = view;

  if(view === "history") refreshHistory();
}

function updatePlayLocalBtn(){
  const btn = $("#togglePlay");
  if(!btn) return;
  btn.textContent = state.playLocal ? t("play_local_on") : t("play_local_off");
}

function safeJsonParse(text){
  try{ return JSON.parse(text); }catch{ return null; }
}

function escapeHtml(s){
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fmtWhen(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString();
  }catch{ return iso; }
}

function fileNameFromUrl(url){
  const p = url.split("/").pop() || "audio.mp3";
  return p.includes(".") ? p : `${p}.mp3`;
}

async function copyToClipboard(text, {focusEl=null, onFail=null}={}){
  const value = String(text || "");
  if(!value) return false;

  // 1) Clipboard API (best when available)
  try{
    await navigator.clipboard.writeText(value);
    toast(t("copied"));
    return true;
  }catch{}

  // 2) execCommand fallback (works on HTTP and older browsers)
  try{
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if(ok){
      toast(t("copied"));
      return true;
    }
  }catch{}

  // 3) Final fallback: select a visible input for manual copy
  try{
    if(focusEl){
      focusEl.focus();
      focusEl.select?.();
    }
  }catch{}

  try{ if(typeof onFail === "function") onFail(); }catch{}
  toast(t("copy_manual"));
  return false;
}

async function shareLink(title, url){
  if(navigator.share){
    try{ await navigator.share({title, url}); return; }catch{}
  }
  await copyToClipboard(url);
}

async function downloadUrl(url){
  const a = document.createElement("a");
  a.href = url;
  a.download = fileNameFromUrl(url);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function postForm(endpoint, fileBlob, filename, fields={}){
  const fd = new FormData();
  fd.append("file", fileBlob, filename);

  for(const [k,v] of Object.entries(fields || {})){
    if(v === undefined || v === null) continue;
    const val = String(v).trim();
    if(val !== "") fd.append(k, val);
  }

  let resp;
  try{
    resp = await fetch(endpoint, {method:"POST", body: fd});
  }catch{
    throw new Error(FRIENDLY_AUDIO_ERROR);
  }

  const data = await resp.json().catch(() => null);

  if(!resp.ok){
    if(resp.status === 401){
      throw new Error("AUTH_REQUIRED");
    }
    // Never surface technical details to end users.
    throw new Error(FRIENDLY_AUDIO_ERROR);
  }
  return data;
}

// ---------- Languages ----------
function langDisplay(codeOrName){
  const v = (codeOrName || "").trim();
  if(!v) return t("auto");
  const match = state.langs.find(x => (x.code || "").toLowerCase() === v.toLowerCase());
  if(match){
    return state.uiLang === "el" ? (match.el || match.en || v) : (match.en || match.el || v);
  }
  return v;
}

function fillLangSelect(selectEl, {includeAuto=true, includeOther=true}={}){
  if(!selectEl) return;

  const current = selectEl.value || "";
  selectEl.innerHTML = "";

  const addOpt = (value, label) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    selectEl.appendChild(opt);
  };

  if(includeAuto) addOpt("", t("auto"));

  // Keep a small pinned group on top for convenience (does not restrict the list)
  const pinned = ["el","en","zh","zh-Hans","zh-Hant","ar","fr","de","es","it","pt","ru","tr","ja","ko","hi"];
  const byCode = new Map(state.langs.map(l => [l.code, l]));
  for(const code of pinned){
    const item = byCode.get(code);
    if(item) addOpt(item.code, langDisplay(item.code));
  }

  // Remaining languages (sorted)
  const pinnedSet = new Set(pinned);
  const rest = state.langs
    .filter(l => l && l.code && !pinnedSet.has(l.code))
    .slice()
    .sort((a,b) => {
      const la = (state.uiLang === "el" ? (a.el || a.en || a.code) : (a.en || a.el || a.code)).toLowerCase();
      const lb = (state.uiLang === "el" ? (b.el || b.en || b.code) : (b.en || b.el || b.code)).toLowerCase();
      return la.localeCompare(lb);
    });

  for(const item of rest) addOpt(item.code, langDisplay(item.code));

  if(includeOther) addOpt("__other__", t("other"));

  // restore selection if still possible
  if(current && Array.from(selectEl.options).some(o => o.value === current)){
    selectEl.value = current;
  }else if(current && current !== "" && current !== "__other__"){
    // typed value
    selectEl.value = "__other__";
  }
}

function langPicker(selectId, otherId, labelId, defaultValue=""){
  const sel = $(selectId);
  const other = $(otherId);
  const lbl = labelId ? $(labelId) : null;

  const get = () => {
    const v = sel?.value || "";
    if(v === "__other__") return (other?.value || "").trim();
    return v;
  };

  const set = (val) => {
    const v = (val || "").trim();
    if(!sel) return;
    const hasOption = (x) => Array.from(sel.options).some(o => o.value === x);

    if(v === "" || hasOption(v)){
      sel.value = v;
      if(other) other.value = "";
    }else{
      sel.value = "__other__";
      if(other) other.value = v;
    }
    update();
  };

  const update = () => {
    if(!sel) return;
    const isOther = sel.value === "__other__";
    if(other) other.hidden = !isOther;
    if(lbl) lbl.textContent = langDisplay(get());
  };

  sel?.addEventListener("change", update);
  other?.addEventListener("input", update);

  set(defaultValue);
  return {get, set, update};
}

let liveSpeak, liveHear, callSpeak, callOut, callIn, fileTarget;

function updateAllLangLabels(){
  $("#speakLangLabel") && ($("#speakLangLabel").textContent = langDisplay(liveSpeak?.get?.() || ""));
  $("#hearLangLabel") && ($("#hearLangLabel").textContent = langDisplay(liveHear?.get?.() || ""));
  $("#callSpeakLabel") && ($("#callSpeakLabel").textContent = langDisplay(callSpeak?.get?.() || ""));
  $("#callOutLabel") && ($("#callOutLabel").textContent = langDisplay(callOut?.get?.() || ""));
  $("#callInLabel") && ($("#callInLabel").textContent = langDisplay(callIn?.get?.() || ""));
}

async function loadLanguages(){
  try{
    const r = await fetch("/static/app/langs.json");
    const j = await r.json();
    state.langs = (j.languages || []).filter(x => x && x.code);
  }catch{
    state.langs = [
      {code:"el", en:"Greek", el:"Ελληνικά"},
      {code:"en", en:"English", el:"Αγγλικά"},
      {code:"zh", en:"Chinese", el:"Κινέζικα"},
      {code:"zh-Hans", en:"Chinese (Simplified)", el:"Κινέζικα (Απλοποιημένα)"},
      {code:"zh-Hant", en:"Chinese (Traditional)", el:"Κινέζικα (Παραδοσιακά)"},
    ];
  }

  // Fill selects
  fillLangSelect($("#speakLang"));
  fillLangSelect($("#hearLang"));
  fillLangSelect($("#callSpeakLang"));
  fillLangSelect($("#callOutLang"));
  fillLangSelect($("#callInLang"));
  fillLangSelect($("#fileTarget"));

  // Create pickers (after options exist)
  // Simplified defaults:
  // - If UI is Greek → default "I speak" = Greek and "They hear" = English
  // - If UI is English → default "I speak" = English and "They hear" = Greek
  const defaultSpeak = (state.uiLang === "el") ? "el" : "en";
  const defaultOther = (state.uiLang === "el") ? "en" : "el";

  liveSpeak = langPicker("#speakLang", "#speakLangOther", "#speakLangLabel", defaultSpeak);
  liveHear = langPicker("#hearLang", "#hearLangOther", "#hearLangLabel", defaultOther);

  callSpeak = langPicker("#callSpeakLang", "#callSpeakOther", "#callSpeakLabel", defaultSpeak);
  callOut = langPicker("#callOutLang", "#callOutOther", "#callOutLabel", defaultOther);
  callIn = langPicker("#callInLang", "#callInOther", "#callInLabel", defaultSpeak);

  fileTarget = langPicker("#fileTarget", "#fileTargetOther", null, "en");
}

// ---------- Microphone device selector ----------
function selectedMicConstraint(){
  const id = (state.micDeviceId || "").trim();
  if(!id) return {audio: true};
  return {audio: {deviceId: {exact: id}}};
}

async function ensureMicAccess(){
  // Request permission once so device labels appear (if user allows).
  const stream = await navigator.mediaDevices.getUserMedia(selectedMicConstraint());
  stream.getTracks().forEach(t => t.stop());
}

async function requestMicPermissionAgain(where){
  const set = (where === "call") ? setCallMainStatus : setStatus;
  try{
    const s = await navigator.mediaDevices.getUserMedia({audio:true});
    try{ s.getTracks().forEach(t => t.stop()); }catch{}
    await loadMicDevices();
    set(t("ready"));
    if(where === "call"){
      setCallMicRetry(false);
      // If already connected, refresh the call audio sender to use the now-allowed device
      try{ await refreshCallAudioSender(); }catch{}
    }else{
      setLiveMicRetry(false);
    }
  }catch(err){
    set(micErrorToMessage(err));
    const name = (err && err.name) ? String(err.name) : "";
    if(name === "NotAllowedError" || name === "PermissionDeniedError"){
      if(where === "call") setCallMicRetry(true);
      else setLiveMicRetry(true);
    }
  }
}

async function loadMicDevices(){
  let devices = [];
  try{
    devices = await navigator.mediaDevices.enumerateDevices();
  }catch{
    devices = [];
  }
  const mics = devices.filter(d => d.kind === "audioinput");
  state._micList = mics;
  renderMicSelects();
}

function renderMicSelects(){
  const liveSel = $("#micSelectLive");
  const callSel = $("#micSelectCall");
  if(!liveSel && !callSel) return;

  const mics = state._micList || [];
  const build = (sel) => {
    if(!sel) return;
    const current = state.micDeviceId || "";
    sel.innerHTML = "";

    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.textContent = t("microphone_default");
    sel.appendChild(optDefault);

    if(mics.length === 0){
      const opt = document.createElement("option");
      opt.value = "__none__";
      opt.disabled = true;
      opt.textContent = t("mic_not_found");
      sel.appendChild(opt);
      sel.value = "";
      return;
    }

    mics.forEach((d, idx) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      // If labels are hidden (no permission), show a stable friendly label
      opt.textContent = d.label ? d.label : t("microphone_device_n", idx + 1);
      sel.appendChild(opt);
    });

    // Restore selection if present
    const has = Array.from(sel.options).some(o => o.value === current);
    sel.value = has ? current : "";
  };

  build(liveSel);
  build(callSel);
}

function setMicDeviceId(id){
  state.micDeviceId = (id || "").trim();
  localStorage.setItem(STORAGE.micDeviceId, state.micDeviceId);
  // Keep both selects synced
  if($("#micSelectLive")) $("#micSelectLive").value = state.micDeviceId;
  if($("#micSelectCall")) $("#micSelectCall").value = state.micDeviceId;
  // If a call is active, update the outgoing WebRTC audio track to the new device.
  if(call.connected){
    try{ refreshCallAudioSender(); }catch{}
  }
}

function wireMicSelectors(){
  $("#micSelectLive")?.addEventListener("change", () => setMicDeviceId($("#micSelectLive").value || ""));
  $("#micSelectCall")?.addEventListener("change", () => setMicDeviceId($("#micSelectCall").value || ""));
  // React to device changes (plug/unplug)
  try{
    navigator.mediaDevices.addEventListener("devicechange", loadMicDevices);
  }catch{}
}

// ---------- VU meter ----------
function startVuMeter(stream, vuFillEl){
  if(!vuFillEl) return () => {};
  let raf = 0;
  let audioCtx = null;
  let analyser = null;
  let data = null;

  const setLevel = (v) => {
    const pct = Math.max(0, Math.min(100, Math.round(v * 100)));
    vuFillEl.style.width = `${pct}%`;
  };

  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    data = new Uint8Array(analyser.frequencyBinCount);

    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);

    const tick = () => {
      try{
        analyser.getByteFrequencyData(data);
        // Simple average magnitude -> 0..1
        let sum = 0;
        for(let i=0;i<data.length;i++) sum += data[i];
        const avg = sum / (data.length * 255);
        // slight curve for nicer feel
        const level = Math.pow(avg, 0.6);
        setLevel(level);
      }catch{
        setLevel(0);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  }catch{
    setLevel(0);
  }

  return () => {
    try{ cancelAnimationFrame(raf); }catch{}
    try{ setLevel(0); }catch{}
    try{ audioCtx?.close?.(); }catch{}
  };
}

// ---------- Online Call (v2: WebRTC video + translated captions) ----------
function createRoomId(){
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map(b => (b % 36).toString(36)).join("");
  return `vox-${code}`;
}

function wsUrlForRoom(room){
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws/${encodeURIComponent(room)}`;
}

function callLink(room){
  const u = new URL(location.href);
  u.pathname = "/app";
  u.searchParams.set("room", room);
  u.hash = "#call";
  return u.toString();
}

function _safeUrlFromBase(base){
  if(!base) return null;
  try{ return new URL(base); }catch{}
  try{ return new URL(base, location.origin); }catch{}
  return null;
}

function callInviteLink(room){
  // 1) If already running on a real (non-localhost) origin, the current origin is
  //    ALWAYS the correct address to share — use it. This also ignores any stale/wrong
  //    PUBLIC_BASE_URL configured on the server (e.g. pointing to a different app).
  const h = String(location.hostname || "").toLowerCase();
  const isLocal = (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]");
  if(!isLocal){
    return callLink(room);
  }

  // 2) Localhost only: prefer a configured public URL for link sharing (prevents localhost links).
  const base = (state.publicBaseUrl || "").trim();
  if(base){
    const u = _safeUrlFromBase(base);
    if(!u) return "";
    let p = (u.pathname || "").replace(/\/+$/g, "");
    if(!p.endsWith("/app")) p = (p ? p : "") + "/app";
    if(!p.startsWith("/")) p = "/" + p;
    u.pathname = p;
    u.search = "";
    u.searchParams.set("room", room);
    u.hash = "#call";
    return u.toString();
  }

  // 3) Localhost origin: best-effort LAN link (same Wi‑Fi/LAN) if the server provides it.
  const lanBase = (state.lanBaseUrl || "").trim();
  if(lanBase){
    const u = _safeUrlFromBase(lanBase);
    if(!u) return "";
    let p = (u.pathname || "").replace(/\/+$/g, "");
    if(!p.endsWith("/app")) p = (p ? p : "") + "/app";
    if(!p.startsWith("/")) p = "/" + p;
    u.pathname = p;
    u.search = "";
    u.searchParams.set("room", room);
    u.hash = "#call";
    return u.toString();
  }

  // 4) Final fallback: no shareable link available.
  return "";
}

function extractRoomFromInvite(text){
  const s = String(text || "").trim();
  if(!s) return "";

  // Try URL parsing first (works for full and partial URLs)
  try{
    const u = new URL(s, location.origin);
    const room = String(u.searchParams.get("room") || "").trim();
    if(room) return room;
  }catch{}

  // Fallback regex
  try{
    const m = s.match(/[?&]room=([^&#]+)/i);
    if(m && m[1]) return decodeURIComponent(m[1]).trim();
  }catch{}

  // Accept direct room codes (e.g. vox-abc)
  const m2 = s.match(/\bvox-[a-z0-9]+\b/i);
  if(m2) return m2[0];

  if(/^vox-[a-z0-9]{2,}$/i.test(s)) return s;
  return "";
}

function updateInvitePreview(){
  const preview = $("#invitePreview");
  const note = $("#invitePreviewNote");
  if(!preview) return;

  const rawRoom = String($("#callRoom")?.value || "").trim();
  const rawPaste = String($("#pasteInvite")?.value || "").trim();

  const parsed = extractRoomFromInvite(rawRoom) || extractRoomFromInvite(rawPaste) || rawRoom;
  const room = String(parsed || "").trim();

  if(!room){
    preview.value = "";
    if(note) note.textContent = "—";
    return;
  }

  const link = callInviteLink(room);
  if(link){
    preview.value = link;

    const h = String(location.hostname || "").toLowerCase();
    const isLocal = (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]");
    const usingLan = (!state.publicBaseUrl && isLocal && !!state.lanBaseUrl);
    if(note) note.textContent = usingLan ? t("invite_preview_note_lan") : t("invite_preview_note_link");
  }else{
    // No shareable link available → show room code
    preview.value = room;
    if(note) note.textContent = t("room_code_share_instruction");
  }

  // Make the copy button label match what we are sharing (link vs code)
  const btn = $("#callCopyLink");
  if(btn){
    const v = String(preview.value || "");
    btn.textContent = v.startsWith("http") ? t("copy_link") : t("copy_code");
  }
}

function updateCallBar(){
  const bar = $("#callBar");
  if(!bar) return;

  if(call.connected && call.room){
    bar.classList.remove("hidden");
    $("#callBarText").textContent = t("call_in_bar", call.room);
  }else{
    bar.classList.add("hidden");
  }
}

function setRemotePrefsText(){
  const el = $("#remotePrefs");
  if(!el) return;

  if(!call.connected){
    el.textContent = "—";
    return;
  }
  const inLang = langDisplay(call.remotePrefs.inLang || "");
  const outLang = langDisplay(call.remotePrefs.outLang || "");
  if(!call.remotePrefs.inLang && !call.remotePrefs.outLang){
    el.textContent = "—";
    return;
  }
  el.textContent = t("remote_prefs", inLang, outLang);
}

function sendCallPrefs(){
  if(!call.ws || call.ws.readyState !== 1) return;
  const msg = {
    type: "prefs",
    from: state.clientId,
    inLang: callIn.get(),
    outLang: callOut.get(),
    speakLang: callSpeak.get(),
    ts: Date.now(),
  };
  try{ call.ws.send(JSON.stringify(msg)); }catch{}
}

function addCallLog({title, text, when}){
  const list = $("#callLog");
  if(!list) return;

  const el = document.createElement("div");
  el.className = "log-item";
  el.innerHTML = `
    <div class="meta">${escapeHtml(title)} · ${escapeHtml(when)}</div>
    <div class="text">${escapeHtml(text || "—")}</div>
  `;
  list.prepend(el);
}

// ----- Captions (overlay) -----
function setCaption(which, text){
  const on = !!$("#callCaptionsOn")?.checked;
  const showMine = !!$("#callShowMyCaptions")?.checked;

  const el = which === "self" ? $("#selfCaption") : $("#remoteCaption");
  if(!el) return;

  const shouldShow = on && (which === "remote" || showMine);

  if(!shouldShow || !text){
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }

  el.textContent = text;
  el.classList.remove("hidden");

  clearTimeout(setCaption._t);
  setCaption._t = setTimeout(() => {
    try{ el.classList.add("hidden"); }catch{}
  }, 9000);
}

function clearCaptions(){
  setCaption("self", "");
  setCaption("remote", "");
}

// ----- Camera device selector -----
async function loadCamDevices(){
  let devices = [];
  try{ devices = await navigator.mediaDevices.enumerateDevices(); }catch{ devices = []; }
  const cams = devices.filter(d => d.kind === "videoinput");
  state._camList = cams;
  renderCamSelect();
}

function renderCamSelect(){
  const sel = $("#camSelectCall");
  if(!sel) return;

  const cams = state._camList || [];
  const current = state.camDeviceId || "";
  sel.innerHTML = "";

  const optDefault = document.createElement("option");
  optDefault.value = "";
  optDefault.textContent = t("camera_default");
  sel.appendChild(optDefault);

  if(cams.length === 0){
    const opt = document.createElement("option");
    opt.value = "__none__";
    opt.disabled = true;
    opt.textContent = t("camera_not_found");
    sel.appendChild(opt);
    sel.value = "";
    return;
  }

  cams.forEach((d, idx) => {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label ? d.label : t("camera_device_n", idx + 1);
    sel.appendChild(opt);
  });

  const has = Array.from(sel.options).some(o => o.value === current);
  sel.value = has ? current : "";
}

function setCamDeviceId(id){
  state.camDeviceId = (id || "").trim();
  try{ localStorage.setItem(STORAGE.camDeviceId, state.camDeviceId); }catch{}
  if($("#camSelectCall")) $("#camSelectCall").value = state.camDeviceId;
}

function updateCamToggle(){
  const b = $("#camToggle");
  if(!b) return;
  b.textContent = call.cameraOn ? t("camera_on") : t("camera_off");
}

async function startCamera(){
  try{
    const id = (state.camDeviceId || "").trim();
    const constraints = id ? {video: {deviceId: {exact: id}}} : {video: true};
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    call.camStream = stream;
    call.cameraOn = true;

    const video = $("#selfVideo");
    if(video) video.srcObject = stream;

    await ensurePeerConnection();
    const track = stream.getVideoTracks()[0];

    if(call.rtcVideoSender){
      try{ await call.rtcVideoSender.replaceTrack(track); }catch{}
    }else if(call.pc){
      try{ call.rtcVideoSender = call.pc.addTrack(track, stream); }catch{}
    }

    updateCamToggle();
    // Hide retry UI if camera is now working
    setCallCamRetry(false);
    requestRenegotiate();
  }catch(err){
    call.cameraOn = false;
    call.camStream = null;
    updateCamToggle();
    setCallMainStatus(t("camera_permission_denied"));
    setCallCamRetry(true);
  }
}

function stopCamera(){
  try{ call.camStream?.getTracks()?.forEach(t => t.stop()); }catch{}
  call.camStream = null;
  call.cameraOn = false;
  const video = $("#selfVideo");
  if(video) video.srcObject = null;
  try{ call.rtcVideoSender?.replaceTrack(null); }catch{}
  updateCamToggle();
}

// ----- WebRTC (2 participants) -----
function _isOffererFor(remoteId){
  return String(state.clientId) > String(remoteId);
}

async function getCallMicStream(){
  if(call.micStream && call.micStream.getTracks().length){
    return call.micStream;
  }
  const stream = await navigator.mediaDevices.getUserMedia(selectedMicConstraint());
  call.micStream = stream;
  return stream;
}

async function ensurePeerConnection(){
  if(call.pc) return call.pc;

  const pc = new RTCPeerConnection({
    iceServers: [{urls: "stun:stun.l.google.com:19302"}],
  });
  call.pc = pc;

  call.remoteStream = new MediaStream();
  const remoteVideo = $("#remoteVideo");
  if(remoteVideo) remoteVideo.srcObject = call.remoteStream;

  pc.ontrack = (e) => {
    try{
      (e.streams[0].getTracks() || []).forEach(tk => call.remoteStream.addTrack(tk));
    }catch{
      try{ call.remoteStream.addTrack(e.track); }catch{}
    }
  };

  pc.onicecandidate = (e) => {
    if(!e.candidate) return;
    if(!call.ws || call.ws.readyState !== 1) return;
    try{ call.ws.send(JSON.stringify({type:"ice", from: state.clientId, candidate: e.candidate})); }catch{}
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if(s === "failed" || s === "disconnected"){
      setCallMainStatus(t("disconnected"));
    }
  };

  pc.onnegotiationneeded = async () => {
    if(call.remoteId && call.isOfferer){
      try{ await makeOffer(); }catch{}
    }else if(call.remoteId){
      requestRenegotiate();
    }
  };

  try{
    const mic = await getCallMicStream();
    const at = mic.getAudioTracks()[0];
    if(at){
      call.rtcAudioTrack = at.clone();
      call.rtcAudioTrack.enabled = false;
      call.rtcAudioSender = pc.addTrack(call.rtcAudioTrack, new MediaStream([call.rtcAudioTrack]));
    }
  }catch(err){
    // mic might be denied; captions/video can still work
  }

  return pc;
}

async function refreshCallAudioSender(){
  if(!call.pc || !call.connected) return;
  try{
    try{ call.micStream?.getTracks()?.forEach(t => t.stop()); }catch{}
    call.micStream = null;

    const mic = await getCallMicStream();
    const at = mic.getAudioTracks()[0];
    if(!at) return;

    const clone = at.clone();
    clone.enabled = false;

    if(call.rtcAudioSender){
      try{ await call.rtcAudioSender.replaceTrack(clone); }catch{}
      try{ call.rtcAudioTrack?.stop?.(); }catch{}
      call.rtcAudioTrack = clone;
    }else{
      call.rtcAudioTrack = clone;
      call.rtcAudioSender = call.pc.addTrack(clone, new MediaStream([clone]));
      requestRenegotiate();
    }
  }catch(err){
    setCallMainStatus(micErrorToMessage(err));
  }
}

async function makeOffer(){
  if(!call.pc || !call.remoteId) return;
  const offer = await call.pc.createOffer();
  await call.pc.setLocalDescription(offer);
  if(call.ws && call.ws.readyState === 1){
    call.ws.send(JSON.stringify({type:"offer", from: state.clientId, sdp: call.pc.localDescription}));
  }
}

async function handleOffer(msg){
  await ensurePeerConnection();
  call.isOfferer = false;
  try{
    await call.pc.setRemoteDescription(msg.sdp);
    const answer = await call.pc.createAnswer();
    await call.pc.setLocalDescription(answer);
    call.ws?.send(JSON.stringify({type:"answer", from: state.clientId, sdp: call.pc.localDescription}));
  }catch{}
}

async function handleAnswer(msg){
  if(!call.pc) return;
  try{ await call.pc.setRemoteDescription(msg.sdp); }catch{}
}

async function handleIce(msg){
  if(!call.pc) return;
  try{ await call.pc.addIceCandidate(msg.candidate); }catch{}
}

function requestRenegotiate(){
  if(!call.ws || call.ws.readyState !== 1) return;
  try{ call.ws.send(JSON.stringify({type:"renegotiate", from: state.clientId})); }catch{}
}

function teardownWebRTC(){
  try{ call.pc?.close?.(); }catch{}
  call.pc = null;
  call.remoteStream = null;

  try{ call.rtcAudioTrack?.stop?.(); }catch{}
  call.rtcAudioTrack = null;
  call.rtcAudioSender = null;

  try{ call.micStream?.getTracks()?.forEach(t => t.stop()); }catch{}
  call.micStream = null;

  stopCamera();

  const remoteVideo = $("#remoteVideo");
  if(remoteVideo) remoteVideo.srcObject = null;
}

function connectCall(room){
  room = (room || "").trim();
  if(!room) return;

  if(call.ws && call.room === room && (call.ws.readyState === 0 || call.ws.readyState === 1)){
    setCallConnectionStatus(call.connected ? t("connected") : t("connecting"));
    setCallMainStatus(call.connected ? t("ready") : t("connecting"));
    updateCallBar();
    return;
  }

  if(call.ws){
    try{ call.ws.close(); }catch{}
    call.ws = null;
  }
  teardownWebRTC();
  clearCaptions();

  call.room = room;
  call.connected = false;
  call.remotePrefs = { inLang:"", outLang:"" };
  call.remoteId = "";
  call.isOfferer = false;
  call.remoteSpeaking = false;

  setRemotePrefsText();

  $("#callPttBtn").disabled = true;
  setCallConnectionStatus(t("connecting"));
  setCallMainStatus(t("connecting"));
  updateCallBar();

  const ws = new WebSocket(wsUrlForRoom(room));
  call.ws = ws;

  ws.onopen = async () => {
    call.connected = true;
    $("#callPttBtn").disabled = false;
    setCallConnectionStatus(t("connected"));
    setCallMainStatus(t("ready"));
    updateCallBar();
    setRemotePrefsText();
    sendCallPrefs();

    try{ await ensurePeerConnection(); }catch{}
    try{ ws.send(JSON.stringify({type:"hello", from: state.clientId, ts: Date.now()})); }catch{}
  };

  ws.onclose = () => {
    call.connected = false;
    $("#callPttBtn").disabled = true;
    setCallConnectionStatus(t("disconnected"));
    setCallMainStatus(t("disconnected"));
    updateCallBar();
    setRemotePrefsText();
    teardownWebRTC();
    clearCaptions();
  };

  ws.onerror = () => {
    setCallConnectionStatus(t("disconnected"));
    setCallMainStatus(t("disconnected"));
  };

  ws.onmessage = async (ev) => {
    const msg = safeJsonParse(ev.data);
    if(!msg || !msg.type) return;
    if(msg.type === "info") return;

    if(msg.type === "prefs" && msg.from !== state.clientId){
      call.remotePrefs.inLang = (msg.inLang || "").trim();
      call.remotePrefs.outLang = (msg.outLang || "").trim();
      setRemotePrefsText();
      return;
    }

    if(msg.type === "hello" && msg.from !== state.clientId){
      call.remoteId = String(msg.from || "");
      call.isOfferer = _isOffererFor(call.remoteId);
      if(call.isOfferer){
        try{ await makeOffer(); }catch{}
      }
      return;
    }

    if(msg.type === "offer" && msg.from !== state.clientId){
      call.remoteId = String(msg.from || "");
      call.isOfferer = false;
      await handleOffer(msg);
      return;
    }

    if(msg.type === "answer" && msg.from !== state.clientId){
      await handleAnswer(msg);
      return;
    }

    if(msg.type === "ice" && msg.from !== state.clientId){
      await handleIce(msg);
      return;
    }

    if(msg.type === "renegotiate" && msg.from !== state.clientId){
      if(call.isOfferer){
        try{ await makeOffer(); }catch{}
      }
      return;
    }

    if(msg.type === "ptt" && msg.from !== state.clientId){
      const st = (msg.state || "").toLowerCase();
      if(st === "start"){
        call.remoteSpeaking = true;
        $("#callPttBtn").disabled = true;
        setCallMainStatus(t("partner_speaking"));
      }else if(st === "stop"){
        call.remoteSpeaking = false;
        $("#callPttBtn").disabled = !call.connected;
        setCallMainStatus(t("ready"));
      }
      return;
    }

    if(msg.type === "caption" && msg.from !== state.clientId){
      const text = String(msg.text || "");
      const when = new Date(msg.ts || Date.now()).toLocaleTimeString();
      addCallLog({title: t("call_partner"), text: text || t("no_transcript"), when});
      setCaption("remote", text);
      return;
    }
  };

  try{
    const u = new URL(location.href);
    u.pathname = "/app";
    u.searchParams.set("room", room);
    u.hash = "#call";
    history.replaceState({}, "", u.toString());
  }catch{}
}

function endCall(){
  if(call.ws){
    try{ call.ws.close(); }catch{}
  }
  call.ws = null;
  call.connected = false;
  call.room = "";
  call.remotePrefs = { inLang:"", outLang:"" };
  call.remoteId = "";
  call.isOfferer = false;
  call.remoteSpeaking = false;

  $("#callPttBtn").disabled = true;
  setCallConnectionStatus(t("disconnected"));
  setCallMainStatus("—");
  updateCallBar();
  setRemotePrefsText();
  teardownWebRTC();
  clearCaptions();

  try{
    const u = new URL(location.href);
    u.searchParams.delete("room");
    history.replaceState({}, "", u.toString());
  }catch{}
}



// ---------- Recording / push-to-talk ----------
function micErrorToMessage(err){
  const name = (err && err.name) ? String(err.name) : "";
  if(name === "NotAllowedError" || name === "PermissionDeniedError"){
    return t("mic_permission_denied");
  }
  if(name === "NotFoundError" || name === "DevicesNotFoundError"){
    return t("mic_not_found");
  }
  // Any other device issue: keep generic and non-technical
  return t("mic_not_found");
}

function isFirefox(){
  const ua = (navigator.userAgent || "").toLowerCase();
  return ua.includes("firefox");
}

function pickRecorderMimeType(){
  if(!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
  // Prefer WebM Opus first (best compatibility with the backend/STT), then Ogg Opus.
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for(const t of candidates){
    try{ if(MediaRecorder.isTypeSupported(t)) return t; }catch{}
  }
  return "";
}

function fileExtFromMime(mime){
  const m = (mime || "").toLowerCase();
  if(m.includes("ogg")) return ".ogg";
  if(m.includes("webm")) return ".webm";
  if(m.includes("wav")) return ".wav";
  return ".webm";
}

async function startRecording(context){
  if(state.rec && state.rec.state === "recording") return;

  state.chunks = [];

  // Try to get microphone stream using selected device
  let stream = null;
  try{
    context.button?.classList.add("recording");
    context.setStatus(t("listening"));

    stream = context.getStream ? await context.getStream() : await navigator.mediaDevices.getUserMedia(selectedMicConstraint());
    state.stream = stream;

    // If mic is working, hide any previously shown retry buttons.
    if(context.where === "live") setLiveMicRetry(false);
    if(context.where === "call") setCallMicRetry(false);

    // VU meter
    try{ state.vuStopper?.(); }catch{}
    state.vuStopper = startVuMeter(stream, context.vuFillEl);

    // MediaRecorder codec compatibility:
    // - Chrome/Edge: audio/webm;codecs=opus
    // - Firefox: prefers audio/webm if supported, otherwise audio/ogg
    const pickedMime = pickRecorderMimeType();
    try{
      state.rec = pickedMime ? new MediaRecorder(stream, {mimeType: pickedMime}) : new MediaRecorder(stream);
    }catch(err){
      // If the browser cannot start a recorder, show a clear recommendation.
      context.setStatus(t("browser_recommend_chrome"));
      try{ context.button?.classList.remove("recording"); }catch{}
      try{ state.vuStopper?.(); }catch{}
      state.vuStopper = null;
      if(!context.keepStream){
        try{ stream?.getTracks()?.forEach(t => t.stop()); }catch{}
      }
      state.stream = null;
      return;
    }
    state.rec.ondataavailable = (e) => {
      if(e.data && e.data.size > 0) state.chunks.push(e.data);
    };

    state.rec.onstop = async () => {
      // stop VU
      try{ state.vuStopper?.(); }catch{}
      state.vuStopper = null;
      // Optionally stop mic tracks (call view keeps a persistent stream)
      if(!context.keepStream){
        try{ state.stream?.getTracks().forEach(t => t.stop()); }catch{}
      }
      state.stream = null;

      const mime = state.rec.mimeType || pickedMime || "audio/webm";
      const blob = new Blob(state.chunks, {type: mime});
      // Guard: if the recording is empty (rare browser issue), don't send it.
      if(blob.size < 512){
        context.setStatus(FRIENDLY_AUDIO_ERROR);
        try{ context.button?.classList.remove("recording"); }catch{}
        return;
      }
      context.setStatus(t("translating"));

      try{
        const filename = `ptt${fileExtFromMime(mime)}`;
        const meta = await postForm(context.endpoint, blob, filename, context.fields());
        await context.onSuccess(meta);
      }catch(err){
        if(String(err?.message || '') === 'AUTH_REQUIRED'){
          context.setStatus(t('auth_required'));
        }else{
          // Always the same friendly message for audio/translation failures.
          context.setStatus(FRIENDLY_AUDIO_ERROR);
        }
      }finally{
        try{ context.button?.classList.remove("recording"); }catch{}
      }
    };

    state.rec.start();
  }catch(err){
    // Permission / device errors -> clear user message in status area (no tech).
    context.setStatus(micErrorToMessage(err));
    const name = (err && err.name) ? String(err.name) : "";
    if(name === "NotAllowedError" || name === "PermissionDeniedError"){
      if(context.where === "live") setLiveMicRetry(true);
      if(context.where === "call") setCallMicRetry(true);
    }
    try{ context.button?.classList.remove("recording"); }catch{}
    try{ state.vuStopper?.(); }catch{}
    state.vuStopper = null
    if(!context.keepStream){
      try{ stream?.getTracks()?.forEach(t => t.stop()); }catch{}
    }
    state.stream = null;
  }
}

function stopRecording(){
  if(state.rec && state.rec.state === "recording"){
    // Some browsers (notably Firefox) may delay the final chunk unless we request it.
    try{ state.rec.requestData?.(); }catch{}
    try{ state.rec.stop(); }catch{}
  }
}

// ---------- File translation ----------
async function translateFile(){
  const input = $("#fileInput");
  if(!input.files || !input.files[0]) return;

  const f = input.files[0];
  const target = fileTarget.get();
  const btn = $("#fileTranslateBtn");
  btn.disabled = true;

  setFileStatus(t("translating"));
  $("#fileTranscript").textContent = "—";
  $("#fileTranslated").textContent = "—";

  try{
    const meta = await postForm("/api/file", f, f.name, {target_lang: target});
    const url = meta.mp3_url;

    const player = $("#filePlayer");
    player.src = url;
    player.hidden = false;

    $("#fileTranscript").textContent = (meta.transcript || "—");
    $("#fileTranslated").textContent = (meta.translated_text || "—");

    setFileStatus(t("done"));

    $("#fileDownload").onclick = () => downloadUrl(url);
    $("#fileDownload").disabled = false;

    $("#fileShare").onclick = () => shareLink("VoxBridge", location.origin + url);
    $("#fileShare").disabled = false;
  }catch{
    setFileStatus(FRIENDLY_AUDIO_ERROR);
  }finally{
    btn.disabled = false;
  }
}

// ---------- History ----------
function renderHistory(items){
  const list = $("#historyList");
  list.innerHTML = "";

  if(!items.length){
    list.innerHTML = `<div class="small">${escapeHtml(t("no_history"))}</div>`;
    return;
  }

  const modeLabel = (mode) => {
    if(mode === "file") return t("mode_file");
    if(mode === "call") return t("mode_call");
    return t("mode_live");
  };

  for(const it of items){
    const url = it.mp3_url;
    const abs = location.origin + url;

    const title = `${modeLabel(it.mode)} · ${langDisplay(it.src_lang)} → ${langDisplay(it.target_lang)}`;
    const transcript = (it.transcript || "").trim();
    const preview = transcript.length > 140 ? transcript.slice(0,140) + "…" : transcript;

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="item-top">
        <div class="meta">${escapeHtml(title)}</div>
        <div class="pill">${escapeHtml(fmtWhen(it.created_at))}</div>
      </div>
      <div class="sub">${escapeHtml(preview || t("no_transcript"))}</div>
      <div class="item-actions">
        <button class="btn secondary" data-act="play">${escapeHtml(t("play"))}</button>
        <button class="btn secondary" data-act="download">⬇</button>
        <button class="btn secondary" data-act="share">📤</button>
        <button class="btn danger" data-act="delete">${escapeHtml(t("delete"))}</button>
      </div>
    `;

    el.querySelector('[data-act="play"]').onclick = async () => {
      const p = $("#historyPlayer");
      p.src = url;
      p.hidden = false;
      try{ await p.play(); }catch{}
    };
    el.querySelector('[data-act="download"]').onclick = () => downloadUrl(url);
    el.querySelector('[data-act="share"]').onclick = () => shareLink("VoxBridge", abs);
    el.querySelector('[data-act="delete"]').onclick = async () => {
      if(!confirm(t("confirm_delete"))) return;
      try{
        const resp = await fetch(`/api/history/${it.id}`, {method:"DELETE"});
        if(resp.ok){
          toast(t("deleted"));
          refreshHistory();
        }else{
          // no technical details, keep generic
          toast(FRIENDLY_AUDIO_ERROR);
        }
      }catch{
        toast(FRIENDLY_AUDIO_ERROR);
      }
    };

    list.appendChild(el);
  }
}

async function refreshHistory(){
  const list = $("#historyList");
  list.innerHTML = `<div class="small">${escapeHtml(t("loading"))}</div>`;
  try{
    const r = await fetch("/api/history");
    const j = await r.json();
    const items = (j.items || []);
    state.lastHistoryItems = items;
    renderHistory(items);
  }catch{
    list.innerHTML = `<div class="small">${escapeHtml(t("server_off"))}</div>`;
  }
}

// ---------- Health ----------
async function refreshHealth(){
  try{
    const r = await fetch("/health");
    const j = await r.json();
    $("#healthPill").textContent = j.has_key ? t("server_on_key_ok") : t("server_on_key_missing");
  }catch{
    $("#healthPill").textContent = t("server_off");
  }
}

// ---------- Client config ----------
async function loadClientConfig(){
  try{
    const r = await fetch('/api/config');
    if(!r.ok) return;
    const j = await r.json().catch(() => ({}));
    state.publicBaseUrl = String(j.public_base_url || '').trim();
    state.lanBaseUrl = String(j.lan_base_url || '').trim();
  }catch{
    state.publicBaseUrl = "";
    state.lanBaseUrl = "";
  }
}

// ---------- Wiring ----------
function wire(){
  // Navigation (safe even when i18n updates innerHTML)
  document.addEventListener("click", (e) => {
    const navBtn = e.target.closest(".nav-btn");
    if(navBtn){
      setView(navBtn.dataset.view);
      return;
    }
    const goto = e.target.closest("[data-goto]");
    if(goto){
      e.preventDefault();
      setView(goto.dataset.goto);
      return;
    }
  });

  // UI language selector
  $("#uiLang")?.addEventListener("change", () => {
    state.uiLang = $("#uiLang").value || "el";
    localStorage.setItem(STORAGE.uiLang, state.uiLang);

    // Rebuild language selects in the new UI language (labels change)
    ["#speakLang","#hearLang","#callSpeakLang","#callOutLang","#callInLang","#fileTarget"].forEach(id => fillLangSelect($(id)));

    // Keep callIn default aligned to UI language only if user hasn't set it explicitly
    // (We do not overwrite user's choice.)

    applyI18n();
  });

  // Toggle local playback
  $("#togglePlay")?.addEventListener("click", () => {
    state.playLocal = !state.playLocal;
    updatePlayLocalBtn();
  });

  // Logout
  $("#logoutBtn")?.addEventListener("click", async () => {
    try{ await fetch('/api/auth/logout', {method:'POST'}); }catch{}
    location.href = '/login';
  });

  // Files
  $("#fileTranslateBtn")?.addEventListener("click", translateFile);

  // Call actions
  $("#callNew")?.addEventListener("click", () => {
    const rid = createRoomId();
    $("#callRoom").value = rid;
    // Clear invite field to avoid confusion
    try{ $("#pasteInvite").value = ""; }catch{}
    updateInvitePreview();
    toast(rid);
  });

  // If user pastes a full URL into the Room field, auto-extract the room code
  $("#callRoom")?.addEventListener("input", () => {
    const raw = $("#callRoom").value || "";
    const room = extractRoomFromInvite(raw);
    if(room && room !== raw.trim()){
      $("#callRoom").value = room;
    }
    updateInvitePreview();
  });

  // Enter-to-join for faster, simpler UX
  $("#callRoom")?.addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      e.preventDefault();
      $("#callJoin")?.click();
    }
  });

  // Paste invite link -> extract room and fill the room input
  $("#pasteInvite")?.addEventListener("input", () => {
    const raw = $("#pasteInvite").value || "";
    const room = extractRoomFromInvite(raw);
    if(room){
      $("#callRoom").value = room;
    }
    updateInvitePreview();
  });

  $("#pasteInvite")?.addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      e.preventDefault();
      $("#callJoin")?.click();
    }
  });

  $("#callCopyLink")?.addEventListener("click", async () => {
    updateInvitePreview();
    const preview = $("#invitePreview");
    const note = $("#invitePreviewNote");
    const value = String(preview?.value || "").trim();
    if(!value) return;

    await copyToClipboard(value, {
      focusEl: preview,
      onFail: () => {
        // Keep the key info in the status area for accessibility
        setCallMainStatus(t("copy_manual"));
      }
    });

    // Also mirror the share instruction in the main status area (helps users who missed it)
    if(note && note.textContent && note.textContent !== "—"){
      setCallMainStatus(note.textContent);
    }
  });

  $("#callJoin")?.addEventListener("click", () => {
    // Accept: room code, full URL, or partial URL
    const raw = String($("#callRoom")?.value || "").trim() || String($("#pasteInvite")?.value || "").trim();
    const room = extractRoomFromInvite(raw);
    if(!room) return;
    $("#callRoom").value = room;
    updateInvitePreview();
    connectCall(room);
  });

  $("#callEndBtn")?.addEventListener("click", endCall);
  $("#callBarEnd")?.addEventListener("click", endCall);
  $("#callBarGo")?.addEventListener("click", () => setView("call"));

  // Permission retry buttons (messages stay in the status areas)
  $("#retryMicLive")?.addEventListener("click", () => requestMicPermissionAgain("live"));
  $("#retryMicCall")?.addEventListener("click", () => requestMicPermissionAgain("call"));
  $("#retryCamCall")?.addEventListener("click", async () => {
    await startCamera();
    if(call.cameraOn) setCallCamRetry(false);
  });


  // Captions toggles
  $("#callCaptionsOn")?.addEventListener("change", () => {
    if(!$("#callCaptionsOn")?.checked){
      clearCaptions();
    }
  });
  $("#callShowMyCaptions")?.addEventListener("change", () => {
    if(!$("#callShowMyCaptions")?.checked){
      setCaption("self", "");
    }
  });

  // Camera controls (Call)
  $("#camSelectCall")?.addEventListener("change", () => {
    setCamDeviceId($("#camSelectCall").value || "");
    if(call.cameraOn){
      stopCamera();
      startCamera();
    }
  });
  $("#camToggle")?.addEventListener("click", async () => {
    if(call.cameraOn){
      stopCamera();
    }else{
      await startCamera();
    }
  });

  // Send prefs when call language settings change
  ["#callSpeakLang","#callSpeakOther","#callOutLang","#callOutOther","#callInLang","#callInOther"].forEach(id => {
    $(id)?.addEventListener("change", () => { updateAllLangLabels(); sendCallPrefs(); });
    $(id)?.addEventListener("input", () => { updateAllLangLabels(); sendCallPrefs(); });
  });

  // Live PTT
  const liveBtn = $("#pttBtn");
  const liveContext = {
    button: liveBtn,
    setStatus: setStatus,
    where: "live",
    endpoint: "/api/ptt",
    vuFillEl: $("#vuLive"),
    fields: () => ({
      target_lang: liveHear.get(),
      speak_lang: liveSpeak.get(),
      debug_save: state.debugSaveRecording ? "1" : "",
    }),
    onSuccess: async (meta) => {
      const url = meta.mp3_url;
      const player = $("#player");
      player.src = url;
      player.hidden = false;

      $("#liveTranscript").textContent = (meta.transcript || "—");
      $("#liveTranslated").textContent = (meta.translated_text || "—");

      if(state.playLocal) {
        setStatus(t("playing"));
        try{ await player.play(); }catch{}
      }
      setStatus(t("done"));
    }
  };

  const startLive = () => startRecording(liveContext);
  const stopAny = () => stopRecording();

  liveBtn?.addEventListener("mousedown", startLive);
  liveBtn?.addEventListener("mouseup", stopAny);
  liveBtn?.addEventListener("mouseleave", stopAny);
  liveBtn?.addEventListener("touchstart", (e) => {e.preventDefault(); startLive();}, {passive:false});
  liveBtn?.addEventListener("touchend", (e) => {e.preventDefault(); stopAny();}, {passive:false});

  // Call PTT (captions only; no TTS in-call)
  const callBtn = $("#callPttBtn");
  const callContext = {
    button: callBtn,
    setStatus: setCallMainStatus, // important feedback under the call button
    where: "call",
    endpoint: "/api/call/captions",
    vuFillEl: $("#vuCall"),
    // Keep a persistent call mic stream for reliability (WebRTC + recorder)
    keepStream: true,
    getStream: getCallMicStream,
    fields: () => ({
      target_lang: callOut.get(),
      speak_lang: callSpeak.get(),
      room: call.room,
      debug_save: state.debugSaveRecording ? "1" : "",
    }),
    onSuccess: async (meta) => {
      const when = new Date().toLocaleTimeString();
      const text = (meta.translated_text || meta.transcript || "").trim();

      addCallLog({
        title: t("call_you_to", langDisplay(meta.target_lang)),
        text: text || t("no_transcript"),
        when
      });

      // Optional: show what I'm sending as an overlay (controlled by "Show mine")
      setCaption("self", text);

      // Broadcast translated captions to partner
      if(call.ws && call.ws.readyState === 1){
        const msg = {
          type: "caption",
          from: state.clientId,
          room: call.room,
          ts: Date.now(),
          text,
        };
        try{ call.ws.send(JSON.stringify(msg)); }catch{}
      }

      setCallMainStatus(t("done"));
    }
  };

  const startCall = async () => {
    if(!call.connected) return;
    if(call.remoteSpeaking){
      setCallMainStatus(t("partner_speaking"));
      return;
    }

    // Enable outgoing WebRTC audio only while holding the button
    try{ await ensurePeerConnection(); }catch{}
    try{ if(call.rtcAudioTrack) call.rtcAudioTrack.enabled = true; }catch{}

    // Notify partner to disable their push-to-talk (one speaker at a time)
    try{
      if(call.ws && call.ws.readyState === 1){
        call.ws.send(JSON.stringify({type:"ptt", from: state.clientId, state:"start", ts: Date.now()}));
      }
    }catch{}

    await startRecording(callContext);
  };

  const stopCall = () => {
    // Immediately stop sending audio + release the floor
    try{ if(call.rtcAudioTrack) call.rtcAudioTrack.enabled = false; }catch{}
    try{
      if(call.ws && call.ws.readyState === 1){
        call.ws.send(JSON.stringify({type:"ptt", from: state.clientId, state:"stop", ts: Date.now()}));
      }
    }catch{}
    stopRecording();
  };

  callBtn?.addEventListener("mousedown", () => { startCall(); });
  callBtn?.addEventListener("mouseup", stopCall);
  callBtn?.addEventListener("mouseleave", stopCall);
  callBtn?.addEventListener("touchstart", (e) => {e.preventDefault(); startCall();}, {passive:false});
  callBtn?.addEventListener("touchend", (e) => {e.preventDefault(); stopCall();}, {passive:false});


  // Mic selectors
  wireMicSelectors();
}

async function init(){
  // Session check (redirect to /login if needed)
  try{
    const r = await fetch('/api/me');
    if(r.status === 401){
      const next = encodeURIComponent(location.pathname + location.search + location.hash);
      location.href = `/login?next=${next}`;
      return;
    }
    const me = await r.json().catch(() => ({}));
    const email = (me && me.email) ? String(me.email) : '';
    if($('#userEmail')) $('#userEmail').textContent = email || '—';
    if($('#userEmailTop')){
      if(email){
        $('#userEmailTop').textContent = email;
        $('#userEmailTop').title = email;
        $('#userEmailTop').hidden = false;
      }else{
        $('#userEmailTop').hidden = true;
      }
    }
  }catch{
    if($('#userEmail')) $('#userEmail').textContent = '—';
    if($('#userEmailTop')) $('#userEmailTop').hidden = true;
  }

  // UI language
  state.uiLang = localStorage.getItem(STORAGE.uiLang) || "el";
  $("#uiLang").value = state.uiLang;

  // Mic device selection
  state.micDeviceId = localStorage.getItem(STORAGE.micDeviceId) || "";

  // Camera device selection (call)
  state.camDeviceId = localStorage.getItem(STORAGE.camDeviceId) || "";

  // Debug: save last recording
  state.debugSaveRecording = (localStorage.getItem(STORAGE.debugSave) || "0") === "1";

  // stable client id (for call)
  state.clientId = localStorage.getItem(STORAGE.clientId);
  if(!state.clientId){
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    state.clientId = Array.from(bytes).map(b => b.toString(16).padStart(2,"0")).join("");
    localStorage.setItem(STORAGE.clientId, state.clientId);
  }

  // Load non-sensitive server config (e.g., PUBLIC_BASE_URL for invite links)
  await loadClientConfig();

  await loadLanguages();
  applyI18n();

  // default view: hash or "live"
  const hash = (location.hash || "#live").replace("#", "");
  const allowed = ["live","call","files","history","account"];
  setView(allowed.includes(hash) ? hash : "live");

  // Wire UI events
  wire();

  // Debug toggle (settings)
  const dbg = $("#debugSaveRecording");
  if(dbg){
    dbg.checked = !!state.debugSaveRecording;
    dbg.addEventListener("change", () => {
      state.debugSaveRecording = !!dbg.checked;
      try{ localStorage.setItem(STORAGE.debugSave, state.debugSaveRecording ? "1" : "0"); }catch{}
    });
  }

  // Initialize statuses (in status areas)
  setStatus(t("ready"));
  setFileStatus(t("ready"));
  setCallConnectionStatus("—");
  setCallMainStatus("—");
  setLiveMicRetry(false);
  setCallMicRetry(false);
  setCallCamRetry(false);
  updatePlayLocalBtn();

  await refreshHealth();

  // Preflight mic access: if denied, show message in Live status area (not toast)
  try{
    await ensureMicAccess();
  }catch(err){
    // Show clear permission message in the main status area (as requested)
    setStatus(micErrorToMessage(err));
    // Also mirror on call status area if user is in call view
    setCallMainStatus(micErrorToMessage(err));
    const name = (err && err.name) ? String(err.name) : "";
    if(name === "NotAllowedError" || name === "PermissionDeniedError"){
      setLiveMicRetry(true);
      setCallMicRetry(true);
    }
  }

  // Populate mic devices (works even without permission; labels may be generic)
  await loadMicDevices();

  // Populate camera devices (call)
  await loadCamDevices();
  updateCamToggle();

  // Auto-join call if a room is provided in URL
  try{
    const u = new URL(location.href);
    const room = (u.searchParams.get("room") || "").trim();
    if(room){
      $("#callRoom").value = room;
      setView("call");
      connectCall(room);
    }
  }catch{}
}

window.addEventListener("load", init);
