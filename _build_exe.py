# -*- coding: utf-8 -*-
"""Build script to run PyInstaller"""
import subprocess
import sys
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

print("Starting PyInstaller build...")
result = subprocess.run([sys.executable, '-m', 'PyInstaller', 'Inkpad.spec', '--noconfirm'], capture_output=True, text=True)
print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)
print("Exit code:", result.returncode)
