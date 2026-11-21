"""Hitster-style double-sided card generator.

Usage: python3 make_cards.py songs.csv out.pdf [BASE_URL]
QR codes point to BASE_URL/?t=<spotify_track_id> (the Trster web app).
Pages alternate: front sheet (artist / year / title), back sheet (QR).
Back sheets are mirrored horizontally for long-edge duplex printing.
"""
import csv, sys, math, colorsys
import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import Color, white, black
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit

F = "/usr/share/fonts/truetype/google-fonts/ofl/firasans/"
pdfmetrics.registerFont(TTFont("Black", F + "FiraSans-Black.ttf"))
pdfmetrics.registerFont(TTFont("Semi", F + "FiraSans-SemiBold.ttf"))
pdfmetrics.registerFont(TTFont("Ital", F + "FiraSans-MediumItalic.ttf"))

CARD = 65 * mm
COLS, ROWS = 3, 4
PW, PH = A4
MX = (PW - COLS * CARD) / 2
MY = (PH - ROWS * CARD) / 2

# year -> colour ramp (old = purple ... new = blue), similar to the original deck
STOPS = [
    (1965, "#6A2C91"), (1975, "#D6246E"), (1985, "#E8503A"),
    (1993, "#F4A23A"), (2000, "#F2C14E"), (2010, "#5BC0BE"),
    (2018, "#3FA7D6"), (2026, "#2F6FD1"),
]

def hex2rgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))

def year_color(y):
    y = max(STOPS[0][0], min(STOPS[-1][0], y))
    for (y0, c0), (y1, c1) in zip(STOPS, STOPS[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0)
            a, b = hex2rgb(c0), hex2rgb(c1)
            return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def shade(rgb, dl):
    h, l, s = colorsys.rgb_to_hls(*rgb)
    return colorsys.hls_to_rgb(h, max(0, min(1, l + dl)), s)

def fit_lines(text, font, size, width, max_lines, min_size):
    while size >= min_size:
        lines = simpleSplit(text, font, size, width)
        if len(lines) <= max_lines:
            return lines, size
        size -= 0.5
    return simpleSplit(text, font, min_size, width)[:max_lines], min_size

def draw_front(c, x, y, s):
    rgb = year_color(int(s["year"]))
    top, bot = Color(*shade(rgb, 0.08)), Color(*shade(rgb, -0.06))
    c.saveState()
    p = c.beginPath(); p.rect(x, y, CARD, CARD); c.clipPath(p, stroke=0)
    c.linearGradient(x, y + CARD, x, y, (top, bot), extend=True)
    c.restoreState()
    lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    ink = Color(1, 1, 1) if lum < 0.42 else Color(0.08, 0.08, 0.1)
    c.setFillColor(ink)
    cx, w = x + CARD / 2, CARD - 10 * mm
    # artist (top)
    lines, sz = fit_lines(s["artist"], "Semi", 10, w, 2, 7)
    yy = y + CARD - 9 * mm
    for ln in lines:
        c.setFont("Semi", sz); c.drawCentredString(cx, yy, ln); yy -= sz * 1.15
    # year (centre)
    c.setFont("Black", 40)
    c.drawCentredString(cx, y + CARD / 2 - 14, s["year"])
    # title (bottom)
    lines, sz = fit_lines(s["title"], "Ital", 10, w, 2, 7)
    yy = y + 9 * mm + (len(lines) - 1) * sz * 1.15
    for ln in lines:
        c.setFont("Ital", sz); c.drawCentredString(cx, yy, ln); yy -= sz * 1.15

RING_COLORS = ["#2EC4F1", "#FFD23F", "#FF7A2E", "#B14AED", "#FF2E88", "#FFD23F", "#2EC4F1", "#FF2E88"]
BASE_URL = "https://oyun.uxhocam.com"

QR_STYLE = "inverted"   # "inverted": siyah zemin üstüne beyaz QR (orijinal gibi) | "boxed": beyaz kutuda siyah QR
QR_MM = 34

def draw_back(c, x, y, s, idx):
    c.setFillColor(Color(0.05, 0.05, 0.07))
    c.rect(x, y, CARD, CARD, stroke=0, fill=1)
    cx, cy = x + CARD / 2, y + CARD / 2
    size = QR_MM * mm
    boxed = QR_STYLE == "boxed"
    pad = 2.0 * mm if boxed else 0
    # halkalar QR'ın köşesinin + sessiz alanın dışında başlar
    r0 = (size / 2 + pad) * 1.4142 + (1.5 * mm if boxed else 2.2 * mm)
    c.saveState()
    p = c.beginPath(); p.rect(x, y, CARD, CARD); c.clipPath(p, stroke=0)
    c.setLineCap(1)
    i = 0
    while True:
        r = r0 + i * (1.05 * mm if boxed else 1.35 * mm)
        if r > CARD / 2 - 0.8 * mm: break
        col = RING_COLORS[i % len(RING_COLORS)]
        start = (idx * 47 + i * 83) % 360
        extent = 200 + (i * 37 + idx * 13) % 130
        c.setStrokeColor(Color(*hex2rgb(col)))
        c.setLineWidth(0.5 * mm)
        c.arc(cx - r, cy - r, cx + r, cy + r, start, extent)
        i += 1
    c.restoreState()
    url = f"{BASE_URL}/?t={s['spotify_id']}"
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
    qr.add_data(url); qr.make(fit=True)
    m = qr.get_matrix(); n = len(m)
    cell = size / n
    ox, oy = cx - size / 2, cy + size / 2
    if boxed:
        c.setFillColor(white)
        c.roundRect(ox - pad, oy - size - pad, size + 2 * pad, size + 2 * pad, 1.6 * mm, stroke=0, fill=1)
        c.setFillColor(black)
    else:
        c.setFillColor(white)
    # her satırdaki bitişik kareleri tek dikdörtgen olarak çiz (baskıda ince boşluk kalmasın)
    for r, row in enumerate(m):
        col = 0
        while col < n:
            if row[col]:
                start = col
                while col < n and row[col]: col += 1
                c.rect(ox + start * cell, oy - (r + 1) * cell - 0.02, (col - start) * cell, cell + 0.04, stroke=0, fill=1)
            else:
                col += 1

def cut_marks(c):
    c.setStrokeColor(Color(0.6, 0.6, 0.6)); c.setLineWidth(0.3)
    L = 5 * mm
    for i in range(COLS + 1):
        X = MX + i * CARD
        c.line(X, MY - L - 1 * mm, X, MY - 1 * mm)
        c.line(X, PH - MY + 1 * mm, X, PH - MY + L + 1 * mm)
    for j in range(ROWS + 1):
        Y = MY + j * CARD
        c.line(MX - L - 1 * mm, Y, MX - 1 * mm, Y)
        c.line(PW - MX + 1 * mm, Y, PW - MX + L + 1 * mm, Y)

def main(src, out, base=None, style=None):
    global BASE_URL, QR_STYLE
    if style: QR_STYLE = style
    if base: BASE_URL = base.rstrip("/")
    songs = list(csv.DictReader(open(src, encoding="utf-8")))
    c = canvas.Canvas(out, pagesize=A4)
    c.setTitle("Hitster TR kartları")
    per = COLS * ROWS
    for p in range(0, len(songs), per):
        batch = songs[p:p + per]
        for k, s in enumerate(batch):
            col, row = k % COLS, k // COLS
            draw_front(c, MX + col * CARD, PH - MY - (row + 1) * CARD, s)
        cut_marks(c); c.showPage()
        for k, s in enumerate(batch):
            col, row = COLS - 1 - (k % COLS), k // COLS   # mirrored
            draw_back(c, MX + col * CARD, PH - MY - (row + 1) * CARD, s, p + k)
        c.showPage()
    c.save()
    print(f"{len(songs)} kart, {math.ceil(len(songs)/per)*2} sayfa -> {out}")

if __name__ == "__main__":
    main(*sys.argv[1:5])
