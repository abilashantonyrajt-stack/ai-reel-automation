from __future__ import annotations

import os
import sys
import threading
from pathlib import Path

from client import OmniRouteClient
from pipeline import PipelineRunner
from ui import ReelAutomationUI
from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import Qt


def _style_app(app: QApplication):
    app.setStyle("Fusion")
    palette = app.palette()
    palette.setColor(palette.ColorRole.Window, Qt.GlobalColor.black)
    app.setPalette(palette)


SCRIPT_SYSTEM = """You are an AI assistant for a Reel Automation tool.
Your job is to help the user create Instagram Reels by generating scripts, answering questions, and guiding them through the pipeline.

When the user asks to create a reel, generate a complete script in JSON format with:
- hook: attention-grabbing opening (under 10 words)
- scenes: array of {description, imagePrompt, textOverlay, duration}
- callToAction: CTA text
- captions: full caption with emojis
- hashtags: array of 8-15 relevant tags

Be creative and concise. If the user specifies a brand or style, incorporate it."""


class Controller:
    def __init__(self):
        self._app = QApplication(sys.argv)
        _style_app(self._app)
        self._ui = ReelAutomationUI()

        self._client = OmniRouteClient()
        self._pipeline = PipelineRunner()

        self._conversation: list[dict] = []
        self._working = False

        # Wire UI events
        self._ui.on_send = self._on_send
        self._ui.on_generate = self._on_generate
        self._ui.on_pipeline = self._on_pipeline
        self._ui.on_upload = self._on_upload
        self._ui.on_stop = self._on_stop

        # Wire pipeline events
        self._pipeline.on_output(self._on_pipeline_output)
        self._pipeline.on_done(self._on_pipeline_done)

        self._ui.write_log("SYS: AI Reel Automation starting...")
        self._check_connection()

    def _check_connection(self):
        def check():
            ok = self._client.check_connection()
            if ok:
                self._ui.write_log("SYS: OmniRoute connected (big-pickle)")
                self._ui.set_status("ONLINE", online=True)
                self._conversation.append({
                    "role": "system",
                    "content": SCRIPT_SYSTEM + "\n\nOmniRoute is connected and ready."
                })
            else:
                self._ui.write_log("SYS: OmniRoute not reachable — starting in offline mode")
                self._ui.set_status("OFFLINE")
                self._conversation.append({
                    "role": "system",
                    "content": SCRIPT_SYSTEM + "\n\nOmniRoute is NOT connected. Pipeline will still work via CLI."
                })
        threading.Thread(target=check, daemon=True).start()

    def _on_send(self, text: str):
        self._ui.write_log(f"You: {text}")
        self._conversation.append({"role": "user", "content": text})
        self._ui.set_working(True)
        threading.Thread(target=self._chat_response, daemon=True).start()

    def _chat_response(self):
        try:
            max_ctx = self._conversation[-10:]
            messages = [{"role": "system", "content": SCRIPT_SYSTEM}] + max_ctx
            reply = self._client.chat(messages)
            self._conversation.append({"role": "assistant", "content": reply})
            self._ui.write_log(f"AI: {reply}")
        except Exception as e:
            self._ui.write_log(f"ERR: {e}")
        finally:
            self._ui.set_working(False)

    def _on_generate(self, mode: str):
        cfg = self._ui.get_config()
        prompt = self._ui._input.text().strip() or "luxury handmade jewelry collection"

        if mode == "script":
            self._ui.write_log(f"PIP: Generating script for: {prompt}")
            self._ui.set_working(True)
            self._pipeline.run_script(prompt, cfg["brand"], cfg["style"])

    def _on_pipeline(self):
        cfg = self._ui.get_config()
        prompt = self._ui._input.text().strip() or "luxury handmade jewelry collection"
        self._ui.write_log(f"PIP: Running full pipeline for: {prompt}")
        self._ui.set_working(True)
        upload = cfg["upload"] if cfg["upload"] != "none" else ""
        self._pipeline.run_pipeline(
            prompt,
            brand=cfg["brand"],
            style=cfg["style"],
            upload=upload,
            audio=cfg["audio"],
        )

    def _on_upload(self):
        cfg = self._ui.get_config()
        # Look for the latest video in output/videos/
        video_dir = Path(self._pipeline._dir) / "output" / "videos"
        if not video_dir.exists():
            self._ui.write_log("ERR: No output/videos/ directory found")
            return
        videos = sorted(video_dir.glob("*.mp4"), key=os.path.getmtime, reverse=True)
        if not videos:
            self._ui.write_log("ERR: No video files found in output/videos/")
            return
        video_path = str(videos[0])
        self._ui.write_log(f"PIP: Uploading {video_path}")
        self._ui.set_working(True)
        self._pipeline.run_upload(video_path, method=cfg["upload"] if cfg["upload"] != "none" else "auto")

    def _on_stop(self):
        self._pipeline.stop()
        self._ui.write_log("PIP: Stop requested")
        self._ui.set_working(False)

    def _on_pipeline_output(self, text: str):
        self._ui.write_log(text)

    def _on_pipeline_done(self, success: bool, msg: str):
        self._ui.write_log(f"PIP: {msg}")
        self._ui.set_working(False)

    def run(self):
        self._ui.show()
        sys.exit(self._app.exec())


def main():
    controller = Controller()
    controller.run()


if __name__ == "__main__":
    main()
