
import os, time, queue, threading, requests, tkinter as tk
from tkinter import messagebox, filedialog
import sounddevice as sd
import soundfile as sf
import numpy as np

SAMPLERATE = 16000
CHANNELS = 1
SUPPORTED = [("Auto",""), ("Αγγλικά","en"), ("Κινέζικα","zh"), ("Αραβικά","ar"), ("Ελληνικά","el")]

def open_interpreter_v2(parent, backend_url: str, history_cb, save_dir_getter, default_target_getter):
    voice_endpoint = f"{backend_url}/voice"
    out_fallback = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "outputs"))
    os.makedirs(out_fallback, exist_ok=True)

    audio_q = queue.Queue()
    state = {"rec": False}
    devs = []
    sel = {"idx": None}

    def load_devs():
        nonlocal devs
        devs = []
        try:
            all_devs = sd.query_devices()
            default_in = sd.default.device[0] if isinstance(sd.default.device, (list, tuple)) else None
            for i, d in enumerate(all_devs):
                if d.get("max_input_channels", 0) > 0:
                    devs.append((i, d.get("name", f"Device {i}")))
            if default_in is not None and any(i == default_in for i, _ in devs):
                sel["idx"] = default_in
            elif devs:
                sel["idx"] = devs[0][0]
        except Exception:
            devs = []
            sel["idx"] = None

    def cb(indata, frames, time_info, status):
        if status:
            pass
        audio_q.put(indata.copy())

    def analyze(audio):
        if audio.size == 0:
            return 0.0, 0.0, 0.0
        rms = float(np.sqrt(np.mean(np.square(audio))))
        peak = float(np.max(np.abs(audio)))
        dur = audio.shape[0] / float(SAMPLERATE)
        return dur, rms, peak

    def auto_gain(audio, peak):
        if peak <= 0:
            return audio
        if peak < 0.15:
            gain = min(0.9/peak, 10.0)
            return np.clip(audio*gain, -1.0, 1.0)
        return audio

    def start_stream():
        try:
            with sd.InputStream(samplerate=SAMPLERATE, channels=CHANNELS, device=sel["idx"], callback=cb):
                while state["rec"]:
                    time.sleep(0.03)
        except Exception as e:
            messagebox.showerror("Σφάλμα μικροφώνου", str(e))

    def start_rec(_event=None):
        if state["rec"]:
            return
        if sel["idx"] is None:
            messagebox.showerror("Μικρόφωνο", "Δεν βρέθηκε μικρόφωνο.")
            return
        while not audio_q.empty():
            try: audio_q.get_nowait()
            except: break
        state["rec"] = True
        info_lbl.config(text="🎤 Γράφω... (κράτα πατημένο)")
        threading.Thread(target=start_stream, daemon=True).start()

    def pick_save_dir():
        d = filedialog.askdirectory(title="Διάλεξε φάκελο αποθήκευσης MP3")
        if d:
            save_dir_var.set(d)

    def stop_rec(_event=None):
        if not state["rec"]:
            return
        state["rec"] = False
        time.sleep(0.15)

        frames = []
        while not audio_q.empty():
            frames.append(audio_q.get())
        if not frames:
            messagebox.showerror("Σφάλμα", "Δεν γράφτηκε ήχος.")
            return

        audio = np.concatenate(frames, axis=0)
        dur, rms, peak = analyze(audio)
        info_lbl.config(text=f"Εγγραφή: {dur:.1f}s | RMS:{rms:.4f} | Peak:{peak:.4f}")

        if dur < 0.4:
            return
        if peak < 0.01:
            messagebox.showerror("Χαμηλή ένταση", "Δεν ακούγεται σχεδόν τίποτα.")
            return

        audio = auto_gain(audio, peak)
        wav_path = os.path.join(out_fallback, "input.wav")
        sf.write(wav_path, audio, SAMPLERATE)

        tgt = target_var.get().strip().lower()

        try:
            with open(wav_path, "rb") as f:
                files = {"file": ("input.wav", f, "audio/wav")}
                data = {}
                if tgt:
                    data["target_lang"] = tgt
                resp = requests.post(voice_endpoint, files=files, data=data, timeout=300)
        except Exception as e:
            messagebox.showerror("Σφάλμα", f"Δεν μπόρεσα να μιλήσω με τον server.\n{e}")
            return

        if resp.status_code != 200:
            try: err = resp.json().get("error", resp.text)
            except Exception: err = resp.text[:300]
            messagebox.showerror("Σφάλμα μετάφρασης", f"Status {resp.status_code}\n{err}")
            return

        save_dir = save_dir_var.get().strip() or save_dir_getter() or out_fallback
        os.makedirs(save_dir, exist_ok=True)

        ts = time.strftime("%Y%m%d_%H%M%S")
        lang_tag = tgt or "auto"
        out_name = f"ev_translate_{lang_tag}_{ts}.mp3"
        out_path = os.path.join(save_dir, out_name)

        with open(out_path, "wb") as f:
            f.write(resp.content)

        history_cb(f"Διερμηνέας v2: {out_name}")
        try:
            os.startfile(out_path)
        except Exception:
            messagebox.showinfo("OK", f"Έτοιμο: {out_path}")

    def refresh_menu():
        load_devs()
        menu = mic_opt["menu"]
        menu.delete(0, "end")
        if not devs:
            mic_var.set("Δεν βρέθηκε μικρόφωνο")
            sel["idx"] = None
            return
        cur = next((name for i, name in devs if i == sel["idx"]), devs[0][1])
        mic_var.set(cur)

        def mkcmd(idx, name):
            def _():
                sel["idx"] = idx
                mic_var.set(name)
            return _
        for i, name in devs:
            menu.add_command(label=name, command=mkcmd(i, name))

    def listen_wav():
        wav_path = os.path.join(out_fallback, "input.wav")
        if os.path.exists(wav_path):
            os.startfile(wav_path)
        else:
            messagebox.showinfo("Info", "Δεν υπάρχει input.wav ακόμα.")

    win = tk.Toplevel(parent)
    win.title("Διερμηνέας v2 (Push-to-Talk)")
    win.geometry("920x600")

    tk.Label(win, text="Διερμηνέας v2 (Push-to-Talk)", font=("Segoe UI", 18, "bold")).pack(pady=10)
    tk.Label(win, text="Κράτα πατημένο «Μίλα». Όταν το αφήσεις, θα δημιουργηθεί MP3 και θα αποθηκευτεί στον φάκελο σου (για WhatsApp).",
             font=("Segoe UI", 10), justify="center").pack(pady=4)

    top = tk.Frame(win); top.pack(pady=10)

    tk.Label(top, text="Μικρόφωνο:", font=("Segoe UI", 11, "bold")).grid(row=0, column=0, padx=8, pady=4, sticky="e")
    mic_var = tk.StringVar(value="Φόρτωση...")
    mic_opt = tk.OptionMenu(top, mic_var, "Φόρτωση...")
    mic_opt.config(font=("Segoe UI", 11), width=52)
    mic_opt.grid(row=0, column=1, padx=8, pady=4)
    tk.Button(top, text="↻ Ανανέωση", font=("Segoe UI", 11), command=refresh_menu).grid(row=0, column=2, padx=8, pady=4)

    tk.Label(top, text="Γλώσσα εξόδου:", font=("Segoe UI", 11, "bold")).grid(row=1, column=0, padx=8, pady=4, sticky="e")
    target_var = tk.StringVar(value=default_target_getter() or "en")
    target_opt = tk.OptionMenu(top, target_var, "", "en", "zh", "ar", "el")
    target_opt.config(font=("Segoe UI", 11), width=10)
    target_opt.grid(row=1, column=1, padx=8, pady=4, sticky="w")
    tk.Label(top, text="Auto=''  en  zh  ar  el", font=("Segoe UI", 10)).grid(row=1, column=1, padx=160, pady=4, sticky="w")

    tk.Label(top, text="Φάκελος αποθήκευσης:", font=("Segoe UI", 11, "bold")).grid(row=2, column=0, padx=8, pady=4, sticky="e")
    save_dir_var = tk.StringVar(value=save_dir_getter() or "")
    tk.Entry(top, textvariable=save_dir_var, font=("Segoe UI", 11), width=44).grid(row=2, column=1, padx=8, pady=4, sticky="w")
    tk.Button(top, text="📁 Επιλογή", font=("Segoe UI", 11), command=pick_save_dir).grid(row=2, column=2, padx=8, pady=4)

    info_lbl = tk.Label(win, text="Έτοιμο.", font=("Segoe UI", 10))
    info_lbl.pack(pady=8)

    btn = tk.Button(win, text="🎤 Μίλα (κράτα πατημένο)", font=("Segoe UI", 16, "bold"), width=34, height=3)
    btn.pack(pady=16)
    btn.bind("<ButtonPress-1>", start_rec)
    btn.bind("<ButtonRelease-1>", stop_rec)

    tk.Button(win, text="🎧 Άκου την εγγραφή (input.wav)", font=("Segoe UI", 11), command=listen_wav).pack(pady=6)
    tk.Label(win, text=f"Server: {backend_url}", font=("Segoe UI", 10)).pack(pady=6)

    load_devs()
    refresh_menu()
