from __future__ import annotations

import os
import subprocess
import threading
import time
from pathlib import Path


class PipelineRunner:
    def __init__(self, project_dir: str | None = None):
        self._dir = project_dir or str(Path(__file__).resolve().parent.parent)
        self._on_output: list[callable] = []
        self._on_done: list[callable] = []
        self._process: subprocess.Popen | None = None
        self._running = False
        self._lock = threading.Lock()

    @property
    def running(self) -> bool:
        return self._running

    def on_output(self, fn: callable):
        self._on_output.append(fn)

    def on_done(self, fn: callable):
        self._on_done.append(fn)

    def _emit(self, text: str):
        for fn in self._on_output:
            try:
                fn(text)
            except Exception:
                pass

    def _finished(self, success: bool, msg: str = ""):
        self._running = False
        for fn in self._on_done:
            try:
                fn(success, msg)
            except Exception:
                pass

    def run(self, *args: str) -> bool:
        with self._lock:
            if self._running:
                self._emit("PIP: A pipeline step is already running")
                return False
            self._running = True

        cmd = ["npx", "tsx", "src/index.ts", *args]

        def _worker():
            self._emit(f"PIP: $ {' '.join(cmd)}")
            try:
                self._process = subprocess.Popen(
                    cmd,
                    cwd=self._dir,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                for line in iter(self._process.stdout.readline, ""):
                    if line:
                        self._emit(line.rstrip())
                self._process.wait()
                ok = self._process.returncode == 0
                self._finished(ok, "Completed" if ok else f"Failed (rc={self._process.returncode})")
            except FileNotFoundError:
                self._emit("PIP: ERROR — npx not found. Is Node.js installed?")
                self._finished(False, "npx not found")
            except Exception as e:
                self._emit(f"PIP: ERROR — {e}")
                self._finished(False, str(e))

        threading.Thread(target=_worker, daemon=True).start()
        return True

    def run_script(self, prompt: str, brand: str = "", style: str = ""):
        args = ["script", prompt]
        if brand:
            args += ["-b", brand]
        if style:
            args += ["-s", style]
        return self.run(*args)

    def run_images(self, script_file: str):
        return self.run("images", script_file)

    def run_video(self, images_dir: str, script_file: str, audio: str = ""):
        args = ["video", images_dir, script_file]
        if audio:
            args += ["--audio", audio]
        return self.run(*args)

    def run_upload(self, video_path: str, caption: str = "", method: str = "auto"):
        args = ["upload", video_path, "-c", caption, "-m", method]
        return self.run(*args)

    def run_pipeline(self, prompt: str, brand: str = "", style: str = "", upload: str = "", audio: str = ""):
        args = ["run", prompt]
        if brand:
            args += ["-b", brand]
        if style:
            args += ["-s", style]
        if upload:
            args += ["-u", upload]
        elif not upload:
            args += ["--no-upload"]
        if audio:
            args += ["--audio", audio]
        return self.run(*args)

    def stop(self):
        if self._process and self._running:
            self._process.terminate()
            self._emit("PIP: Process terminated")
            self._running = False
