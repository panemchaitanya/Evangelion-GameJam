"""Drive the web build in real Chrome: load, play with keys, screenshot, collect console errors.
Usage: python3 tests/browser_test.py [url] [outprefix]"""
import sys, time
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/index.html"
out = sys.argv[2] if len(sys.argv) > 2 else "/tmp/bt"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True,
        args=["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width":1280,"height":720})
    logs = []
    pg.on("console", lambda m: logs.append(m.type+": "+m.text))
    pg.on("pageerror", lambda e: logs.append("PAGEERROR: "+str(e)))
    pg.goto(url)
    time.sleep(12)
    pg.screenshot(path=out+"_0.png")
    pg.mouse.click(640,360)
    def hold(key, s):
        pg.keyboard.down(key); time.sleep(s); pg.keyboard.up(key)
    hold("d", 2.0); pg.screenshot(path=out+"_1.png")
    pg.keyboard.press("Tab"); time.sleep(0.3); hold("d", 1.0)
    pg.keyboard.press("Space"); time.sleep(0.5); pg.screenshot(path=out+"_2.png")
    print("\n".join(l for l in logs if "error" in l.lower() or "ERROR" in l)[:3000] or "no console errors")
    b.close()
