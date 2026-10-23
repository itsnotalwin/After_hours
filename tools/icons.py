from playwright.sync_api import sync_playwright
import pathlib
root = pathlib.Path('/home/claude/afterhours')
svg = (root/'icon.svg').read_text()
mask = svg.replace('<rect width="512" height="512" rx="112" fill="#F1F1F1"/>', '<rect width="512" height="512" fill="#F1F1F1"/>').replace('<g transform="translate(256 168)">','<g transform="translate(256 168) translate(0 20) scale(.86) translate(0 0)">')
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, s, size in [('icon-192.png', svg, 192), ('icon-512.png', svg, 512), ('icon-180.png', svg.replace('rx="112"','rx="0"'), 180), ('icon-maskable-512.png', mask, 512)]:
        pg = b.new_page(viewport={'width': size, 'height': size})
        pg.set_content('<body style="margin:0;background:transparent">' + s.replace('<svg ', '<svg width="%d" height="%d" ' % (size, size), 1) + '</body>')
        pg.screenshot(path=str(root/name), omit_background=True, clip={'x':0,'y':0,'width':size,'height':size})
        pg.close()
    b.close()
print('icons ok')
