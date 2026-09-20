#!/usr/bin/env python3
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
fail=[]
for p in ROOT.rglob("*"):
    if p.is_file() and ".git" not in p.parts and p.suffix.lower() in {".md",".txt",".js",".json",".html",".css",".yml",".yaml"}:
        s=p.read_text(encoding="utf-8",errors="ignore")
        if re.search(r"zpd",s,re.I):
            fail.append(str(p.relative_to(ROOT)))
app=(ROOT/"src"/"app.js").read_text(encoding="utf-8")
if "name:'Hide & Seek'" not in app: fail.append("HIDE_SEEK_APP_ENTRY_MISSING")
if "https://hide-seek-taky.netlify.app" not in app: fail.append("HIDE_SEEK_URL_NOT_CURRENT")
if fail:
    print("FAIL")
    for x in fail: print(x)
    raise SystemExit(1)
print("PASS: TAKY-MOBILE has only current Hide & Seek identity")
