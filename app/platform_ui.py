
import os, json, time, threading, tkinter as tk
from tkinter import filedialog, messagebox
import requests

APP_DIR = os.path.dirname(__file__)
OUT_DIR = os.path.join(APP_DIR, "outputs")
os.makedirs(OUT_DIR, exist_ok=True)
HISTORY_PATH = os.path.join(APP_DIR, "history.log")

def load_cfg():
    return json.load(open(os.path.join(APP_DIR, "config", "app.json"), "r", encoding="utf-8"))

def save_cfg(cfg):
    json.dump(cfg, open(os.path.join(APP_DIR, "config", "app.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)

def log_history(line: str):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(HISTORY_PATH, "a", encoding="utf-8") as f:
        f.write(f"[{ts}] {line}\n")

CFG = load_cfg()
BACKEND_HOST = CFG.get("backend_host", "127.0.0.1")
BACKEND_PORT = int(CFG.get("backend_port", 8000))
# Bind host (server listens). Keep client URL on 127.0.0.1 by default.
# This allows another device on the same LAN to open the web app using the PC's LAN IP.
BIND_HOST = CFG.get("bind_host") or ("0.0.0.0" if BACKEND_HOST in ("127.0.0.1", "localhost") else BACKEND_HOST)
BACKEND_URL = f"http://{BACKEND_HOST}:{BACKEND_PORT}"
VOICE_ENDPOINT = f"{BACKEND_URL}/voice"
HEALTH_ENDPOINT = f"{BACKEND_URL}/health"
ONLINE_URL = f"{BACKEND_URL}/online"

# Dark theme
BG = "#0b1220"; CARD="#0f172a"; ACCENT="#3b82f6"; ACCENT2="#60a5fa"; TEXT="#e5e7eb"; MUTED="#94a3b8"

def has_key():
    env_path = os.path.join(APP_DIR, ".env")
    if not os.path.exists(env_path):
        return False
    txt = open(env_path, "r", encoding="utf-8").read()
    return "OPENAI_API_KEY=" in txt and "PASTE_YOUR_KEY_HERE" not in txt

def get_save_dir():
    return (load_cfg().get("save_dir") or "").strip()

def set_save_dir(d):
    cfg = load_cfg(); cfg["save_dir"]=d; save_cfg(cfg)

def get_default_target():
    return (load_cfg().get("default_target_lang") or "en").strip()

def set_default_target(t):
    cfg = load_cfg(); cfg["default_target_lang"]=t; save_cfg(cfg)

def start_backend():
    try:
        import uvicorn
        from api.server import app
    except Exception as e:
        messagebox.showerror("Backend Error", f"Δεν μπορώ να φορτώσω τον server.\n{e}")
        return
    cfg = uvicorn.Config(app, host=BIND_HOST, port=BACKEND_PORT, log_level="warning")
    server = uvicorn.Server(cfg)
    threading.Thread(target=server.run, daemon=True).start()

def wait_server(timeout=6.0):
    t0=time.time()
    while time.time()-t0<timeout:
        try:
            r=requests.get(HEALTH_ENDPOINT, timeout=0.5)
            if r.status_code==200: return True
        except Exception:
            time.sleep(0.1)
    return False

def save_mp3_bytes(mp3_bytes: bytes, prefix: str, lang_tag: str):
    save_dir = get_save_dir() or OUT_DIR
    os.makedirs(save_dir, exist_ok=True)
    ts=time.strftime("%Y%m%d_%H%M%S")
    name=f"{prefix}_{lang_tag or 'auto'}_{ts}.mp3"
    path=os.path.join(save_dir, name)
    with open(path, "wb") as f: f.write(mp3_bytes)
    return path, name

def translate_file():
    path = filedialog.askopenfilename(title="Διάλεξε αρχείο ήχου", filetypes=[("Audio","*.wav *.mp3 *.m4a *.mp4"),("All files","*.*")])
    if not path: return
    tgt = get_default_target()
    try:
        with open(path, "rb") as f:
            resp = requests.post(VOICE_ENDPOINT, files={"file": (os.path.basename(path), f)}, data={"target_lang": tgt} if tgt else {}, timeout=900)
    except Exception as e:
        messagebox.showerror("Σφάλμα", f"Δεν μπόρεσα να στείλω το αρχείο.\n{e}")
        return
    if resp.status_code!=200:
        try: err = resp.json().get("error", resp.text)
        except Exception: err = resp.text[:400]
        messagebox.showerror("Σφάλμα μετάφρασης", f"Status {resp.status_code}\n{err}")
        return
    out_path, out_name = save_mp3_bytes(resp.content, "file_translate", tgt)
    log_history(f"Μετάφραση αρχείου: {os.path.basename(path)} -> {out_name}")
    try: os.startfile(out_path)
    except Exception: messagebox.showinfo("Έτοιμο", f"Αποθηκεύτηκε:\n{out_path}")

def open_interpreter_v2():
    from modules.interpreter_v2 import open_interpreter_v2 as _open
    _open(root, BACKEND_URL, log_history, get_save_dir, get_default_target)

def open_history():
    win=tk.Toplevel(root); win.title("Ιστορικό"); win.geometry("880x560"); win.configure(bg=BG)
    txt=tk.Text(win, font=("Consolas",10), bg=CARD, fg=TEXT, insertbackground=TEXT, relief="flat")
    txt.pack(fill="both", expand=True, padx=12, pady=12)
    txt.insert("1.0", open(HISTORY_PATH,"r",encoding="utf-8").read() if os.path.exists(HISTORY_PATH) else "Δεν υπάρχει ιστορικό ακόμα.\n")
    txt.config(state="disabled")

def open_settings():
    win=tk.Toplevel(root); win.title("Ρυθμίσεις"); win.geometry("680x380"); win.configure(bg=BG)
    tk.Label(win, text="Ρυθμίσεις πλατφόρμας", font=("Segoe UI",16,"bold"), bg=BG, fg=TEXT).pack(pady=12)

    frm=tk.Frame(win, bg=BG); frm.pack(pady=10)
    tk.Label(frm, text="Φάκελος αποθήκευσης MP3:", font=("Segoe UI",11,"bold"), bg=BG, fg=TEXT).grid(row=0,column=0,padx=8,sticky="e")
    folder_var=tk.StringVar(value=get_save_dir())
    tk.Entry(frm, textvariable=folder_var, font=("Segoe UI",11), width=46, bg=CARD, fg=TEXT, insertbackground=TEXT, relief="flat").grid(row=0,column=1,padx=8)
    def pick():
        d=filedialog.askdirectory(title="Διάλεξε φάκελο αποθήκευσης MP3")
        if d: folder_var.set(d)
    tk.Button(frm, text="📁 Επιλογή", font=("Segoe UI",11), bg=ACCENT2, fg="white", relief="flat", command=pick).grid(row=0,column=2,padx=8)

    tk.Label(win, text="Προεπιλεγμένη γλώσσα εξόδου:", font=("Segoe UI",11,"bold"), bg=BG, fg=TEXT).pack(pady=8)
    target_var=tk.StringVar(value=get_default_target())
    opt=tk.OptionMenu(win, target_var, "","en","zh","ar","el")
    opt.config(font=("Segoe UI",11), width=10, bg=CARD, fg=TEXT, relief="flat", highlightthickness=0)
    opt["menu"].config(bg=CARD, fg=TEXT)
    opt.pack(pady=6)
    tk.Label(win, text="Auto=''  en=Αγγλικά  zh=Κινέζικα  ar=Αραβικά  el=Ελληνικά", font=("Segoe UI",10), bg=BG, fg=MUTED).pack(pady=2)

    def save():
        set_save_dir(folder_var.get().strip())
        set_default_target(target_var.get().strip())
        messagebox.showinfo("OK","Αποθηκεύτηκε.")
    tk.Button(win, text="Αποθήκευση", font=("Segoe UI",12,"bold"), bg=ACCENT, fg="white", relief="flat", command=save).pack(pady=14)

def run_check():
    msg=[f"Backend URL: {BACKEND_URL}", f".env / API Key: {'OK' if has_key() else 'MISSING'}", f"Save folder: {get_save_dir() or OUT_DIR}", f"Default target: {get_default_target() or 'auto'}"]
    try:
        r=requests.get(HEALTH_ENDPOINT, timeout=1.0)
        msg.append(f"Server: {'ON' if r.status_code==200 else 'OFF'}")
        if r.status_code==200:
            j=r.json(); msg.append(f"Has Key (server): {j.get('has_key')}"); msg.append(f"Voice: {j.get('tts_voice')}")
    except Exception as e:
        msg.append(f"Server: OFF ({e})")
    messagebox.showinfo("Έλεγχος", "\n".join(msg))

def open_online():
    import webbrowser
    webbrowser.open(ONLINE_URL)

def quit_app():
    root.destroy()

root=tk.Tk()
root.title("VoxBridge — Πλατφόρμα v5 (Dark)")
root.geometry("1120x720")
root.configure(bg=BG)

tk.Label(root, text="VoxBridge", font=("Segoe UI",28,"bold"), bg=BG, fg=TEXT).pack(pady=18)
tk.Label(root, text="Επίλεξε λειτουργία:", font=("Segoe UI",14), bg=BG, fg=MUTED).pack(pady=4)

cards=tk.Frame(root, bg=BG); cards.pack(pady=18)
def big(text, cmd):
    return tk.Button(cards, text=text, font=("Segoe UI",18,"bold"), width=30, height=9, bg=ACCENT, fg="white", activebackground="#2563eb", relief="flat", command=cmd)

big("🎧  Μετάφραση (Αρχείο ήχου)\n(Αποθήκευση MP3)", translate_file).grid(row=0,column=0,padx=18,pady=10)
big("🗣️  Διερμηνέας v2 (Κουμπί)\n(Αποθήκευση MP3)", open_interpreter_v2).grid(row=0,column=1,padx=18,pady=10)

bar=tk.Frame(root, bg=BG); bar.pack(pady=18)
def small(text, cmd):
    return tk.Button(bar, text=text, font=("Segoe UI",12,"bold"), width=18, height=2, bg="#475569", fg="white", activebackground=ACCENT, relief="flat", command=cmd)

small("⚙ Ρυθμίσεις", open_settings).grid(row=0,column=0,padx=10,pady=6)
small("🧪 Έλεγχος", run_check).grid(row=0,column=1,padx=10,pady=6)
small("📄 Ιστορικό", open_history).grid(row=0,column=2,padx=10,pady=6)
small("🌐 Online Κλήση", open_online).grid(row=0,column=3,padx=10,pady=6)
small("⛔ Έξοδος", quit_app).grid(row=0,column=4,padx=10,pady=6)

status_var=tk.StringVar(value="Server: ... | ... | API Key: ...")
tk.Label(root, textvariable=status_var, font=("Segoe UI",10), bg=BG, fg=MUTED).pack(side="bottom", pady=12)

start_backend(); wait_server()
def refresh():
    try:
        r=requests.get(HEALTH_ENDPOINT, timeout=0.8)
        server_on=(r.status_code==200)
        j=r.json() if server_on else {}
        api_ok=bool(j.get("has_key")) and has_key()
    except Exception:
        server_on=False; api_ok=has_key()
    status_var.set(f"Server: {'ON' if server_on else 'OFF'}  |  {BACKEND_URL}  |  API Key: {'OK' if api_ok else 'MISSING'}")
    root.after(1500, refresh)

refresh()
root.mainloop()
