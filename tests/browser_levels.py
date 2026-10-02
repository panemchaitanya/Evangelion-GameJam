"""Load each level in real Chrome via ?level=, screenshot, report console errors.
Usage: python3 tests/browser_levels.py [base_url]"""
import sys, time
from playwright.sync_api import sync_playwright
base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/index.html"
levels = sys.argv[2].split(",") if len(sys.argv) > 2 else ["title","act1","act2_gate","act2_day2","act2_night2","finale","credits"]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True,
        args=["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    for lv in levels:
        pg = b.new_page(viewport={"width":1280,"height":720})
        logs = []
        pg.on("console", lambda m: logs.append(m.type+": "+m.text))
        pg.on("pageerror", lambda e: logs.append("PAGEERROR: "+str(e)))
        pg.goto(base + "?level=" + lv)
        time.sleep(9)
        pg.mouse.click(640,360)
        pg.keyboard.press("e"); time.sleep(0.3); pg.keyboard.press("e"); time.sleep(0.3)
        pg.keyboard.press("e"); time.sleep(0.3); pg.keyboard.press("e"); time.sleep(0.3)
        pg.keyboard.down("d"); time.sleep(1.0); pg.keyboard.up("d")
        pg.screenshot(path=f"/tmp/lv_{lv}.png")
        errs = [l for l in logs if l.lower().startswith(("error","pageerror")) or "SCRIPT ERROR" in l]
        print(lv, "->", ("ERRORS: " + " | ".join(errs)[:600]) if errs else "ok")
        pg.close()
    b.close()
