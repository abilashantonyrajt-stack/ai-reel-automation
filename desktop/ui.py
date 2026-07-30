from __future__ import annotations

import platform
import threading
import time

import psutil
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QColor, QFont, QPalette, QTextCursor
from PyQt6.QtWidgets import (
    QApplication, QComboBox, QFrame, QHBoxLayout, QLabel,
    QLineEdit, QMainWindow, QProgressBar, QPushButton, QScrollArea,
    QSizePolicy, QTextEdit, QVBoxLayout, QWidget, QFileDialog,
)


class C:
    BG = "#00060a"
    PANEL = "#010d14"
    PANEL2 = "#010f18"
    BORDER = "#0d3347"
    PRI = "#00d4ff"
    PRI_DIM = "#007a99"
    ACC = "#ff6b00"
    GREEN = "#00ff88"
    RED = "#ff3355"
    TEXT = "#8ffcff"
    TEXT_DIM = "#3a8a9a"
    TEXT_MED = "#5ab8cc"
    WHITE = "#d8f8ff"
    DARK = "#000d14"


def qcol(h: str, a: int = 255):
    c = QColor(h)
    c.setAlpha(a)
    return c


class _SysMetrics:
    def __init__(self):
        self.cpu = 0.0
        self.mem = 0.0
        self.net = 0.0
        self._running = True
        self._last_net = psutil.net_io_counters()
        self._last_net_t = time.time()
        t = threading.Thread(target=self._loop, daemon=True)
        t.start()

    def _loop(self):
        while self._running:
            try:
                self._update()
            except Exception:
                pass
            time.sleep(1.5)

    def _update(self):
        self.cpu = psutil.cpu_percent(interval=None)
        self.mem = psutil.virtual_memory().percent
        nc = psutil.net_io_counters()
        now = time.time()
        dt = now - self._last_net_t
        if dt > 0:
            s = (nc.bytes_sent - self._last_net.bytes_sent) / dt
            r = (nc.bytes_recv - self._last_net.bytes_recv) / dt
            self.net = (s + r) / (1024 * 1024)
        self._last_net = nc
        self._last_net_t = now


class ReelAutomationUI(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("AI Reel Automation")
        self.setMinimumSize(960, 680)
        self.resize(1100, 740)

        self.on_send: callable | None = None
        self.on_generate: callable | None = None
        self.on_pipeline: callable | None = None
        self.on_upload: callable | None = None
        self.on_stop: callable | None = None
        self.on_browse_audio: callable | None = None

        self._metrics = _SysMetrics()
        self._build_ui()
        self._setup_styles()
        self._start_metric_timer()

    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        root = QHBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # ── Left sidebar ──
        left = QFrame()
        left.setObjectName("sidebar")
        left.setFixedWidth(200)
        lv = QVBoxLayout(left)
        lv.setContentsMargins(10, 12, 10, 12)
        lv.setSpacing(10)

        title = QLabel("AI REEL\nAUTOMATION")
        title.setObjectName("title")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lv.addWidget(title)

        # Status indicator
        self._status_label = QLabel("● OFFLINE")
        self._status_label.setObjectName("status")
        self._status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lv.addWidget(self._status_label)

        # Metrics
        lv.addWidget(QLabel("SYSTEM"))
        self._cpu_label = QLabel("CPU: --%")
        self._mem_label = QLabel("MEM: --%")
        self._net_label = QLabel("NET: -- MB/s")
        for w in (self._cpu_label, self._mem_label, self._net_label):
            w.setObjectName("metric")
            lv.addWidget(w)

        lv.addSpacing(16)

        # Config section
        lv.addWidget(QLabel("CONFIG"))

        lv.addWidget(QLabel("Brand"))
        self._brand_input = QLineEdit()
        self._brand_input.setPlaceholderText("e.g. Pascal & Pearls")
        self._brand_input.setObjectName("configInput")
        lv.addWidget(self._brand_input)

        lv.addWidget(QLabel("Style"))
        self._style_input = QLineEdit()
        self._style_input.setPlaceholderText("e.g. luxury, vintage")
        self._style_input.setObjectName("configInput")
        lv.addWidget(self._style_input)

        lv.addWidget(QLabel("Upload"))
        self._upload_combo = QComboBox()
        self._upload_combo.addItems(["auto", "browser", "api", "none"])
        self._upload_combo.setObjectName("configInput")
        lv.addWidget(self._upload_combo)

        lv.addWidget(QLabel("Audio"))
        audio_row = QHBoxLayout()
        self._audio_path = QLineEdit()
        self._audio_path.setPlaceholderText("Path to music file...")
        self._audio_path.setObjectName("configInput")
        audio_row.addWidget(self._audio_path)
        browse_btn = QPushButton("...")
        browse_btn.setFixedWidth(32)
        browse_btn.clicked.connect(self._browse_audio)
        browse_btn.setObjectName("smallBtn")
        audio_row.addWidget(browse_btn)
        lv.addLayout(audio_row)

        lv.addStretch()

        # Action buttons
        self._script_btn = QPushButton("Generate Script")
        self._script_btn.clicked.connect(lambda: self._emit_generate("script"))
        self._script_btn.setObjectName("actionBtn")
        lv.addWidget(self._script_btn)

        self._pipeline_btn = QPushButton("Full Pipeline")
        self._pipeline_btn.clicked.connect(lambda: self._emit_pipeline())
        self._pipeline_btn.setObjectName("actionBtn")
        lv.addWidget(self._pipeline_btn)

        self._upload_btn = QPushButton("Upload Only")
        self._upload_btn.clicked.connect(lambda: self._emit_upload())
        self._upload_btn.setObjectName("actionBtn")
        lv.addWidget(self._upload_btn)

        self._stop_btn = QPushButton("Stop")
        self._stop_btn.clicked.connect(lambda: self.on_stop and self.on_stop())
        self._stop_btn.setObjectName("stopBtn")
        self._stop_btn.setEnabled(False)
        lv.addWidget(self._stop_btn)

        # ── Right main area ──
        right = QFrame()
        right.setObjectName("mainArea")
        rv = QVBoxLayout(right)
        rv.setContentsMargins(14, 12, 14, 12)
        rv.setSpacing(10)

        # Progress bar
        self._progress = QProgressBar()
        self._progress.setObjectName("progressBar")
        self._progress.setVisible(False)
        self._progress.setTextVisible(False)
        self._progress.setMaximum(0)
        rv.addWidget(self._progress)

        # Log area
        self._log = QTextEdit()
        self._log.setReadOnly(True)
        self._log.setObjectName("logArea")
        self._log.setStyleSheet("background: #000d14; color: #8ffcff; border: 1px solid #0d3347; border-radius: 6px; padding: 8px; font-family: 'Cascadia Code', 'Consolas', monospace; font-size: 13px;")
        rv.addWidget(self._log)

        # Input row
        input_row = QHBoxLayout()
        self._input = QLineEdit()
        self._input.setPlaceholderText("Type a prompt or command...")
        self._input.setObjectName("chatInput")
        self._input.returnPressed.connect(self._send)
        input_row.addWidget(self._input)

        send_btn = QPushButton("Send")
        send_btn.clicked.connect(self._send)
        send_btn.setObjectName("sendBtn")
        send_btn.setFixedWidth(80)
        input_row.addWidget(send_btn)
        rv.addLayout(input_row)

        root.addWidget(left)
        root.addWidget(right)

    def _setup_styles(self):
        self.setStyleSheet(f"""
            QMainWindow, QWidget {{
                background-color: {C.BG};
                color: {C.TEXT};
                font-family: 'Segoe UI', 'Arial', sans-serif;
                font-size: 13px;
            }}
            QFrame#sidebar {{
                background-color: {C.PANEL};
                border-right: 1px solid {C.BORDER};
            }}
            QFrame#mainArea {{
                background-color: {C.BG};
            }}
            QLabel#title {{
                font-size: 16px;
                font-weight: bold;
                color: {C.PRI};
                letter-spacing: 2px;
                padding: 8px 0;
            }}
            QLabel#status {{
                font-size: 12px;
                color: {C.RED};
                padding: 2px 0;
            }}
            QLabel#metric {{
                font-size: 11px;
                color: {C.TEXT_DIM};
                padding: 1px 0;
            }}
            QLineEdit#configInput {{
                background: {C.DARK};
                border: 1px solid {C.BORDER};
                border-radius: 4px;
                padding: 4px 8px;
                color: {C.TEXT};
                font-size: 12px;
            }}
            QLineEdit#chatInput {{
                background: {C.PANEL2};
                border: 1px solid {C.BORDER};
                border-radius: 6px;
                padding: 8px 12px;
                color: {C.TEXT};
                font-size: 13px;
            }}
            QPushButton#actionBtn {{
                background: {C.PANEL2};
                border: 1px solid {C.BORDER};
                border-radius: 4px;
                padding: 6px 12px;
                color: {C.TEXT_MED};
                font-size: 12px;
                text-align: left;
            }}
            QPushButton#actionBtn:hover {{
                background: #0a2030;
                border-color: {C.PRI_DIM};
                color: {C.PRI};
            }}
            QPushButton#stopBtn {{
                background: #1a0a0a;
                border: 1px solid {C.RED};
                border-radius: 4px;
                padding: 6px 12px;
                color: {C.RED};
                font-size: 12px;
            }}
            QPushButton#stopBtn:hover {{
                background: #2a0a0a;
            }}
            QPushButton#sendBtn {{
                background: {C.PRI_DIM};
                border: none;
                border-radius: 6px;
                padding: 8px;
                color: {C.BG};
                font-weight: bold;
                font-size: 13px;
            }}
            QPushButton#sendBtn:hover {{
                background: {C.PRI};
            }}
            QPushButton#smallBtn {{
                background: {C.DARK};
                border: 1px solid {C.BORDER};
                border-radius: 4px;
                color: {C.TEXT_MED};
                font-size: 14px;
                padding: 2px;
            }}
            QPushButton#smallBtn:hover {{
                border-color: {C.PRI_DIM};
            }}
            QComboBox#configInput {{
                background: {C.DARK};
                border: 1px solid {C.BORDER};
                border-radius: 4px;
                padding: 4px 8px;
                color: {C.TEXT};
                font-size: 12px;
                min-height: 20px;
            }}
            QComboBox#configInput::drop-down {{
                border: none;
                width: 20px;
            }}
            QComboBox#configInput QAbstractItemView {{
                background: {C.PANEL};
                color: {C.TEXT};
                border: 1px solid {C.BORDER};
                selection-background-color: {C.PRI_DIM};
            }}
            QProgressBar#progressBar {{
                background: {C.DARK};
                border: 1px solid {C.BORDER};
                border-radius: 4px;
                height: 6px;
                text-align: center;
            }}
            QProgressBar#progressBar::chunk {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 {C.PRI_DIM}, stop:1 {C.PRI});
                border-radius: 3px;
            }}
        """)

    def _start_metric_timer(self):
        def update():
            self._cpu_label.setText(f"CPU: {self._metrics.cpu:.0f}%")
            self._mem_label.setText(f"MEM: {self._metrics.mem:.0f}%")
            self._net_label.setText(f"NET: {self._metrics.net:.1f} MB/s")
        timer = QTimer()
        timer.timeout.connect(update)
        timer.start(2000)

    def _browse_audio(self):
        path, _ = QFileDialog.getOpenFileName(self, "Select Audio File", "", "Audio Files (*.mp3 *.wav *.m4a *.ogg)")
        if path:
            self._audio_path.setText(path)

    def _send(self):
        text = self._input.text().strip()
        if not text:
            return
        self._input.clear()
        if self.on_send:
            self.on_send(text)

    def _emit_generate(self, mode: str):
        fn = self.on_generate
        if fn:
            fn(mode)

    def _emit_pipeline(self):
        if self.on_pipeline:
            self.on_pipeline()

    def _emit_upload(self):
        if self.on_upload:
            self.on_upload()

    # ── Public API for the controller ──

    def write_log(self, text: str):
        self._log.append(text)
        cursor = self._log.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.End)
        self._log.setTextCursor(cursor)

    def set_status(self, status: str, online: bool = False):
        color = C.GREEN if online else C.RED
        self._status_label.setText(f"● {status}")
        self._status_label.setStyleSheet(f"color: {color}; font-size: 12px; padding: 2px 0;")

    def set_working(self, working: bool):
        self._progress.setVisible(working)
        self._script_btn.setEnabled(not working)
        self._pipeline_btn.setEnabled(not working)
        self._upload_btn.setEnabled(not working)
        self._stop_btn.setEnabled(working)
        self._input.setEnabled(not working)

    def get_config(self) -> dict:
        return {
            "brand": self._brand_input.text().strip(),
            "style": self._style_input.text().strip(),
            "upload": self._upload_combo.currentText(),
            "audio": self._audio_path.text().strip(),
        }
