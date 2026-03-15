import customtkinter as ctk
import tkinter as tk
from tkinter import scrolledtext, messagebox
import subprocess
import threading
import queue
import time
import random
import os
import signal
import sys
import qrcode
import re
from PIL import Image, ImageTk

# --- PATH SAFE RESOLVE ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SKULL_PATH = os.path.join(BASE_DIR, "skull.txt")

# --- CONFIGURAÇÕES ---
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("green")

# Cores Hacker
BG_COLOR = "#000000"
FG_COLOR = "#00FF00"
GLITCH_COLORS = ["#00FFFF", "#FF00FF", "#FFFFFF", "#FF0000"]
GLITCH_CHARS = ["#", "%", "$", "?", "X", "/", "\\", "@", "&", "*"]

# Arte da Caveira
try:
    with open(SKULL_PATH, "r", encoding="utf-8") as f:
        SKULL_ART = f.read().strip().split("\n")
except FileNotFoundError:
    SKULL_ART = ["SKULL.TXT NOT FOUND"]

# ==================================================================
# LÓGICA DE CONFIGURAÇÃO (DEFINIÇÃO E CLASSE)
# ==================================================================

CONFIG_MAP = {
    "autonomous_hunter": {
        "file": "autonomous_agents.py",
        "title": "Autonomous Hunter",
        "params": {
            "META_WHATSAPP": {
                "label": "Meta de WhatsApps por Execução",
                "regex": r"^(META_WHATSAPP\s*=\s*)(\d+)",
                "default": "100",
            },
            "qnt_desejada": {
                "label": "Perfis a Buscar por Ciclo",
                "regex": r"^(qnt_desejada\s*=\s*)(\d+)",
                "default": "500",
            },
            "min_posts": {
                "label": "Mínimo de Posts para Qualificar",
                "regex": r"(if\s+p_count\s*>=\s*)(\d+)",
                "default": "40",
            },
            "min_followers": {
                "label": "Mínimo de Seguidores para Qualificar",
                "regex": r"(and\s+f_count\s*>=\s*)(\d+)",
                "default": "2000",
            },
            "cooldown": {
                "label": "Espera entre Ciclos (segundos)",
                "regex": r"(time\.sleep\()(\d+)",
                "default": "15",
            },
        },
    },
    "deep_wpp": {
        "file": "deep_wpp_hunter.py",
        "title": "Deep WPP",
        "params": {
            "min_search_delay": {
                "label": "Espera Mínima entre Buscas (s)",
                "regex": r"(time\.sleep\(random\.uniform\()([\d\.]+),\s*([\d\.]+)\) # Para buscas no mesmo lead",
                "default": "0.5",
                "group": 2,
            },
            "max_search_delay": {
                "label": "Espera Máxima entre Buscas (s)",
                "regex": r"(time\.sleep\(random\.uniform\()([\d\.]+),\s*([\d\.]+)\) # Para buscas no mesmo lead",
                "default": "1.0",
                "group": 3,
            },
            "min_lead_delay": {
                "label": "Espera Mínima entre Leads (s)",
                "regex": r"(# Delay para não ser bloqueado pelo Yahoo\s*\n\s*time\.sleep\(random\.uniform\()([\d\.]+),\s*([\d\.]+)\)",
                "default": "2.0",
                "group": 2,
            },
            "max_lead_delay": {
                "label": "Espera Máxima entre Leads (s)",
                "regex": r"(# Delay para não ser bloqueado pelo Yahoo\s*\n\s*time\.sleep\(random\.uniform\()([\d\.]+),\s*([\d\.]+)\)",
                "default": "5.0",
                "group": 3,
            },
        },
    },
    "closer": {
        "file": "whatsapp_closer/index.js",
        "title": "Closer",
        "params": {
            "HUMAN_CLOSER_NUMBER": {
                "label": "Número do Closer Humano",
                "regex": r"(const\s+HUMAN_CLOSER_NUMBER\s*=\s*')([^']+)'",
                "default": "5511980150905@c.us",
            },
            "start_hour": {
                "label": "Início do Expediente (hora)",
                "regex": r"(const\s+WORK_HOURS\s*=\s*{\s*start:\s*)(\d+)",
                "default": "9",
            },
            "end_hour": {
                "label": "Fim do Expediente (hora)",
                "regex": r"(end:\s*)(\d+)",
                "default": "18",
            },
            "DAILY_LIMIT_MAX": {
                "label": "Limite Diário de Envios",
                "regex": r"(const\s+DAILY_LIMIT_MAX\s*=\s*)(\d+)",
                "default": "50",
            },
            "min_prospect_interval": {
                "label": "Intervalo Mínimo Prospecção (min)",
                "regex": r"(const\s+OUTBOUND_INTERVAL\s*=\s*\(\)\s*=>\s*addJitter\(getRandomDelay\()(\d+)\s*\*",
                "default": "10",
            },
            "max_prospect_interval": {
                "label": "Intervalo Máximo Prospecção (min)",
                "regex": r"(,\s*)(\d+)\s*\*",
                "default": "25",
            },
        },
    },
    "hunter_loop": {
        "file": "run_hunter_loop.js",
        "title": "Hunter Loop Scheduler",
        "params": {
            "INTERVAL_MINUTES": {
                "label": "Intervalo do Agendador (minutos)",
                "regex": r"(const\s+INTERVAL_MINUTES\s*=\s*)(\d+)",
                "default": "20",
            }
        },
    },
}


class ConfigManager:
    def __init__(self, base_dir, config_map):
        self.base_dir = base_dir
        self.config_map = config_map

    def get_config_value(self, file_path, regex_pattern, group=2):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            match = re.search(regex_pattern, content, re.MULTILINE | re.DOTALL)
            if match:
                return match.group(group)
            print(f"WARN: Pattern not found for {file_path} with regex {regex_pattern}")
            return None
        except FileNotFoundError:
            return None

    def set_config_value(self, file_path, regex_pattern, new_value, group=2):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            def replacer(m):
                groups = list(m.groups())
                groups[group - 1] = str(new_value)
                # Reconstroi a string a partir dos grupos capturados.
                # Regex deve capturar (prefixo)(valor)(sufixo)
                # Ex: (const FOO = ')(bar)(')
                # O ideal é que o regex capture o que vem antes, e não a linha toda.
                # A abordagem atual de capturar (prefixo)(valor) é mais segura.
                return "".join(groups)

            new_content, count = re.subn(
                regex_pattern, replacer, content, 1, re.MULTILINE | re.DOTALL
            )

            if count == 0:
                return False, "Padrão regex não encontrado."

            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            return True, "Salvo com sucesso!"

        except FileNotFoundError:
            return False, "Arquivo não encontrado."
        except Exception as e:
            return False, f"Erro: {e}"


class PirateTerminal(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Pirate Terminal")
        self.geometry("1200x800")
        self.configure(fg_color="#000000")
        self.is_fullscreen = False
        self.bind("<F11>", self.toggle_fullscreen)
        self.bind("<Escape>", self.exit_fullscreen)
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=1)

        self.processes = {}
        self.log_queue = queue.Queue()
        self.is_glitching = False
        self.skull_color = FG_COLOR
        self.config_widgets = {}

        self._build_ui()
        self.config_manager = ConfigManager(BASE_DIR, CONFIG_MAP)
        self.load_all_configs()
        self._start_log_processor()
        self._start_glitch_controller()

    def toggle_fullscreen(self, event=None):
        self.is_fullscreen = not self.is_fullscreen
        self.attributes("-fullscreen", self.is_fullscreen)

    def exit_fullscreen(self, event=None):
        self.is_fullscreen = False
        self.attributes("-fullscreen", False)

    def _build_ui(self):
        self.tab_view = ctk.CTkTabview(self, fg_color="#000000", segmented_button_selected_color="#00FF00", segmented_button_unselected_color="#111111")
        self.tab_view.pack(expand=True, fill="both", padx=10, pady=10)
        self.terminal_tab = self.tab_view.add("Terminal")
        self.config_tab = self.tab_view.add("Configurações")
        self._build_terminal_tab()
        self._build_config_tab()

    def _build_terminal_tab(self):
        self.terminal_tab.grid_rowconfigure(0, weight=1)
        self.terminal_tab.grid_rowconfigure(1, weight=0)
        self.terminal_tab.grid_rowconfigure(2, weight=2)
        self.terminal_tab.grid_columnconfigure(0, weight=1)

        self.skull_frame = ctk.CTkFrame(self.terminal_tab, fg_color="#000000")
        self.skull_frame.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)
        self.skull_frame.grid_columnconfigure(0, weight=1)
        self.skull_frame.grid_rowconfigure(0, weight=1)
        self.skull_label = tk.Label(
            self.skull_frame,
            text="\n".join(SKULL_ART),
            font=("Consolas", 6),
            bg="#000000",
            fg=self.skull_color,
            justify="center",
            anchor="center",
        )
        self.skull_label.grid(row=0, column=0, sticky="nsew")

        control_frame = ctk.CTkFrame(
            self.terminal_tab,
            fg_color="#000000",
            border_width=1,
            border_color="#222222",
        )
        control_frame.grid(row=1, column=0, sticky="ew", padx=20, pady=10)
        control_frame.grid_columnconfigure((0, 1, 2, 3), weight=2)
        control_frame.grid_columnconfigure(4, weight=1)

        self.buttons = {}
        self.status_labels = {}
        self.buttons["hunter_scheduler"] = self._create_control_button(
            control_frame,
            0,
            "[ START HUNTER SCHEDULER ]",
            "node run_hunter_loop.js",
            "hunter_scheduler",
        )
        self.buttons["deep_wpp"] = self._create_control_button(
            control_frame,
            1,
            "[ DEEP WPP SCAN ]",
            "python deep_wpp_hunter.py",
            "deep_wpp",
        )
        self.buttons["closer1"] = self._create_control_button(
            control_frame,
            2,
            "[ CLOSER ALPHA ]",
            "node whatsapp_closer/index.js closer_alpha",
            "closer1",
        )
        self.buttons["closer2"] = self._create_control_button(
            control_frame,
            3,
            "[ CLOSER BETA ]",
            "node whatsapp_closer/index.js closer_beta",
            "closer2",
        )

        self.btn_stop_all = ctk.CTkButton(
            control_frame,
            text="[ PARAR TUDO ]",
            command=self.stop_all_processes,
            fg_color="transparent",
            border_width=1,
            text_color="#FF4444",
            hover_color="#550000",
        )
        self.btn_stop_all.grid(
            row=0, column=4, rowspan=2, padx=10, pady=15, sticky="ns"
        )

        self.log_console = scrolledtext.ScrolledText(
            self.terminal_tab,
            bg="#000000",
            fg=FG_COLOR,
            font=("Consolas", 10),
            state="disabled",
            bd=0,
            highlightthickness=0,
            relief="flat",
        )
        self.log_console.grid(row=2, column=0, sticky="nsew", padx=20, pady=(0, 20))

    def _create_control_button(self, parent, col, text, command, pid):
        frame = ctk.CTkFrame(parent, fg_color="transparent")
        frame.grid(row=0, column=col, rowspan=2, padx=10, pady=15, sticky="ew")
        frame.grid_columnconfigure(0, weight=1)
        btn = ctk.CTkButton(
            frame,
            text=text,
            command=lambda p=pid, c=command: self.toggle_process(p, c),
            fg_color="transparent",
            border_width=1,
            text_color=FG_COLOR,
            hover_color="#222222",
        )
        btn.grid(row=0, column=0, sticky="ew")
        lbl = ctk.CTkLabel(
            frame, text="INATIVO", text_color="#AAAAAA", font=("Consolas", 10)
        )
        lbl.grid(row=1, column=0, pady=(5, 0))
        self.status_labels[pid] = lbl
        return btn

    def _build_config_tab(self):
        config_tab_view = ctk.CTkTabview(self.config_tab, fg_color="#000000")
        config_tab_view.pack(expand=True, fill="both", padx=5, pady=5)
        for script_id, script_config in CONFIG_MAP.items():
            tab = config_tab_view.add(script_config["title"])
            self.config_widgets[script_id] = {}
            frame = ctk.CTkFrame(tab, fg_color="transparent")
            frame.pack(expand=True, fill="both", padx=20, pady=10)
            for i, (param_id, param_config) in enumerate(
                script_config["params"].items()
            ):
                label = ctk.CTkLabel(frame, text=param_config["label"], anchor="w")
                label.grid(row=i, column=0, sticky="ew", pady=(10, 0), padx=(0, 20))
                entry = ctk.CTkEntry(frame, font=("Consolas", 12))
                entry.grid(row=i, column=1, sticky="ew", pady=(10, 0))
                self.config_widgets[script_id][param_id] = entry
            frame.grid_columnconfigure(0, weight=1)
            frame.grid_columnconfigure(1, weight=1)
            btn_frame = ctk.CTkFrame(frame, fg_color="transparent")
            btn_frame.grid(
                row=len(script_config["params"]), column=0, columnspan=2, pady=20
            )
            save_btn = ctk.CTkButton(
                btn_frame,
                text="Salvar Alterações",
                command=lambda s=script_id: self.save_config_for_script(s),
            )
            save_btn.pack(side="left", padx=10)
            restore_btn = ctk.CTkButton(
                btn_frame,
                text="Restaurar Padrões",
                fg_color="#555555",
                hover_color="#777777",
                command=lambda s=script_id: self.restore_defaults_for_script(s),
            )
            restore_btn.pack(side="left", padx=10)

    def load_all_configs(self):
        for script_id, script_config in CONFIG_MAP.items():
            file_path = os.path.join(BASE_DIR, script_config["file"])
            for param_id, param_config in script_config["params"].items():
                entry = self.config_widgets[script_id][param_id]
                value = self.config_manager.get_config_value(
                    file_path, param_config["regex"], param_config.get("group", 2)
                )
                entry.delete(0, tk.END)
                entry.insert(0, value if value is not None else "ERRO: Não encontrado")

    def save_config_for_script(self, script_id):
        script_config = CONFIG_MAP[script_id]
        file_path = os.path.join(BASE_DIR, script_config["file"])
        all_ok = True
        for param_id, param_config in script_config["params"].items():
            entry = self.config_widgets[script_id][param_id]
            new_value = entry.get()
            ok, msg = self.config_manager.set_config_value(
                file_path,
                param_config["regex"],
                new_value,
                param_config.get("group", 2),
            )
            if not ok:
                messagebox.showerror(f"Erro ao Salvar {param_id}", msg)
                all_ok = False
                break
        if all_ok:
            messagebox.showinfo(
                "Sucesso",
                f"Configurações para {script_config['title']} salvas com sucesso!",
            )

    def restore_defaults_for_script(self, script_id):
        script_config = CONFIG_MAP[script_id]
        for param_id, param_config in script_config["params"].items():
            entry = self.config_widgets[script_id][param_id]
            entry.delete(0, tk.END)
            entry.insert(0, param_config["default"])

    def log(self, source, message):
        self.log_queue.put(f"[{source.upper()}] {message}")

    def _start_log_processor(self):
        try:
            while True:
                msg = self.log_queue.get_nowait()
                self.log_console.config(state="normal")
                self.log_console.insert(tk.END, msg + "\n")
                self.log_console.see(tk.END)
                self.log_console.config(state="disabled")
                if "[QR_CODE_RAW]" in msg:
                    self.show_qr_popup(msg.split("[QR_CODE_RAW]")[1].strip())
        except queue.Empty:
            pass
        self.after(100, self._start_log_processor)

    def _is_any_process_running(self):
        return any(proc.poll() is None for proc in self.processes.values())

    def _start_glitch_controller(self):
        if self._is_any_process_running():
            self.trigger_glitch()
            self.after(500, self._start_glitch_controller)
        else:
            if not self.is_glitching:
                self.skull_label.configure(fg=FG_COLOR)
            self.after(2000, self._start_glitch_controller)

    def toggle_process(self, pid, command):
        if pid in self.processes and self.processes[pid].poll() is None:
            self.stop_process(pid)
        else:
            self.start_process(pid, command)

    def start_process(self, pid, command):
        self.log("SYSTEM", f"Starting {pid}...")
        script_file = command.split(" ")[1]  # Ajustado para pegar o segundo elemento
        if not os.path.exists(os.path.join(BASE_DIR, script_file)):
            self.log("ERROR", f"Script not found: {script_file}")
            messagebox.showerror("Erro", f"Script não encontrado: {script_file}")
            return
        kwargs = {}
        if os.name != "nt":
            kwargs["preexec_fn"] = os.setsid
        proc = subprocess.Popen(
            command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            cwd=BASE_DIR,
            **kwargs,
        )
        self.processes[pid] = proc
        threading.Thread(
            target=self._read_process_output, args=(pid, proc), daemon=True
        ).start()
        self._update_ui_for_process(pid, True)

    def stop_process(self, pid):
        if pid in self.processes and self.processes[pid].poll() is None:
            proc = self.processes[pid]
            try:
                if os.name == "nt":
                    subprocess.call(["taskkill", "/F", "/T", "/PID", str(proc.pid)])
                else:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                self.log("SYSTEM", f"Process {pid} stopped.")
            except Exception as e:
                self.log("ERROR", f"Failed to stop {pid}: {e}")
            self._update_ui_for_process(pid, False)

    def stop_all_processes(self):
        self.log("SYSTEM", "Stopping all processes...")
        for pid in list(self.processes.keys()):
            self.stop_process(pid)

    def _read_process_output(self, pid, proc):
        for line in iter(proc.stdout.readline, ""):
            if line:
                self.log(pid, line.strip())
        proc.stdout.close()
        proc.wait()
        self.log("SYSTEM", f"Process {pid} exited.")
        self.after(0, lambda: self._update_ui_for_process(pid, False))

    def _update_ui_for_process(self, pid, is_running):
        btn = self.buttons.get(pid)
        lbl = self.status_labels.get(pid)
        if is_running:
            if btn:
                btn.configure(fg_color="#005500")
            if lbl:
                lbl.configure(text="ATIVO", text_color="#00FF00")
        else:
            if btn:
                btn.configure(fg_color="transparent")
            if lbl:
                lbl.configure(text="INATIVO", text_color="#AAAAAA")
            if pid in self.processes:
                del self.processes[pid]

    def trigger_glitch(self):
        if self.is_glitching:
            return
        self.is_glitching = True
        self._glitch_step(0)

    def _glitch_step(self, step):
        if step > 5:
            self.skull_label.configure(text="\n".join(SKULL_ART), fg=FG_COLOR)
            self.is_glitching = False
            return
        glitched_art = list(SKULL_ART)
        for _ in range(random.randint(2, 5)):
            idx = random.randint(0, len(glitched_art) - 1)
            offset = "  " * random.randint(1, 3)
            glitched_art[idx] = offset + glitched_art[idx][: -len(offset)]
        for i in range(len(glitched_art)):
            line = list(glitched_art[i])
            for _ in range(random.randint(0, 3)):
                if not line:
                    continue
                char_idx = random.randint(0, len(line) - 1)
                line[char_idx] = random.choice(GLITCH_CHARS)
            glitched_art[i] = "".join(line)
        self.skull_label.configure(
            text="\n".join(glitched_art), fg=random.choice(GLITCH_COLORS)
        )
        self.after(50, lambda: self._glitch_step(step + 1))

    def show_qr_popup(self, qr_data):
        popup = ctk.CTkToplevel(self)
        popup.title("Authentication Required")
        popup.geometry("350x400")
        popup.configure(fg_color="#111111")
        popup.transient(self)
        popup.grab_set()
        ctk.CTkLabel(
            popup,
            text="SCAN WITH WHATSAPP",
            font=("Consolas", 14, "bold"),
            text_color="#00FF00",
        ).pack(pady=10)
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(qr_data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="white", back_color="#111111").convert("RGB")
        photo = ImageTk.PhotoImage(img)
        lbl_img = tk.Label(popup, image=photo, bg="#111111")
        lbl_img.image = photo
        lbl_img.pack(pady=10, padx=10)
        ctk.CTkButton(
            popup,
            text="FECHAR",
            command=popup.destroy,
            fg_color="#330000",
            hover_color="#550000",
        ).pack(pady=10)
        popup.after(45000, popup.destroy)


if __name__ == "__main__":
    os.chdir(BASE_DIR)
    app = PirateTerminal()
    app.mainloop()
