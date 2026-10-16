from pathlib import Path
src=Path(r"D:\Git PWA\TAKY-MOBILE\tests\learning-loop-multi-specialist-roundtrip-e2e.cjs")
out=Path(r"D:\Git PWA\TAKY-MOBILE\artifacts\device-mock-audit-20261011\path-migration-e2e\multi-specialist-navigation-probe.cjs")
s=src.read_text(encoding="utf-8")
assert "waitUntil:'domcontentloaded',timeout:12000" in s
assert "const outDir='D:/Git PWA/TAKY-MOBILE/artifacts/learning-loop-multi-specialist-roundtrip-20261010'" in s
s=s.replace("waitUntil:'domcontentloaded',timeout:12000","waitUntil:'commit',timeout:20000",1)
s=s.replace("const outDir='D:/Git PWA/TAKY-MOBILE/artifacts/learning-loop-multi-specialist-roundtrip-20261010'","const outDir='D:/Git PWA/TAKY-MOBILE/artifacts/device-mock-audit-20261011/path-migration-e2e'")
s=s.replace("executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'","executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-extensions','--disable-background-networking']")
out.write_text(s,encoding="utf-8")
wrapper=Path(r"D:\Git PWA\TAKY-MOBILE\artifacts\device-mock-audit-20261011\run-all-play-camp-current.ps1")
w=wrapper.read_text(encoding="utf-8")
assert "learning-loop-multi-specialist-roundtrip-e2e.cjs" in w
w=w.replace("TAKY-MOBILE\\tests\\learning-loop-multi-specialist-roundtrip-e2e.cjs","TAKY-MOBILE\\artifacts\\device-mock-audit-20261011\\path-migration-e2e\\multi-specialist-navigation-probe.cjs",1)
w=w.replace("TAKY-MOBILE\\tests\\learning-loop-roundtrip-e2e.cjs","TAKY-MOBILE\\artifacts\\device-mock-audit-20261011\\path-migration-e2e\\multi-specialist-navigation-probe.cjs",1)
w=w.replace("multi-specialist.log","multi-specialist-commit-navigation.log")
w=w.replace("single-hide.log","multi-specialist-commit-navigation-secondary.log")
output=wrapper.with_name("run-all-play-camp-commit-navigation.ps1")
output.write_text(w,encoding="utf-8")
print("TEST_PROBE",out)
print("RUNNER",output)
