"""Gera o ícone do MusicGest (1024x1024 PNG).
Design: M chunky com serif suave em degradê roxo, com brilho de fundo
e um ponto laranja discreto (acento de identidade).

Regere todos os tamanhos com:
    npm run tauri icon scripts/musicgest-icon.png
"""
import math
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
RADIUS = 200

# Paleta
TOP = (124, 58, 237)      # violet-600
MID = (147, 51, 234)      # purple-600
BOT = (192, 132, 252)     # purple-400 (glow)
WHITE = (255, 255, 255)
ACCENT = (251, 146, 60)   # orange-400 — pingo discreto

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Fundo em degradê diagonal (canto sup-esq escuro → canto inf-dir claro)
for y in range(SIZE):
    for_band = y / SIZE
    # interpolação de 3 cores: TOP → MID → BOT
    if for_band < 0.5:
        t = for_band / 0.5
        r = int(TOP[0] * (1 - t) + MID[0] * t)
        g = int(TOP[1] * (1 - t) + MID[1] * t)
        b = int(TOP[2] * (1 - t) + MID[2] * t)
    else:
        t = (for_band - 0.5) / 0.5
        r = int(MID[0] * (1 - t) + BOT[0] * t)
        g = int(MID[1] * (1 - t) + BOT[1] * t)
        b = int(MID[2] * (1 - t) + BOT[2] * t)
    d.line([(0, y), (SIZE, y)], fill=(r, g, b))

# Brilho radial sutil no canto sup-esq (luz)
glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for r in range(SIZE // 2, 0, -8):
    alpha = max(0, int(30 * (1 - r / (SIZE // 2))))
    gd.ellipse(
        [SIZE * 0.15 - r, SIZE * 0.15 - r, SIZE * 0.15 + r, SIZE * 0.15 + r],
        fill=(255, 255, 255, alpha),
    )
glow = glow.filter(ImageFilter.GaussianBlur(40))
img = Image.alpha_composite(img, glow)
d = ImageDraw.Draw(img)

# Máscara de cantos arredondados
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    [(0, 0), (SIZE - 1, SIZE - 1)], radius=RADIUS, fill=255
)
img.putalpha(mask)
d = ImageDraw.Draw(img)


# ============================================================
# Letra M chunky — desenhada como polígono único
# ============================================================
# Pernas mais grossas, diagonais mais retas, base levemente alargada
left_x = SIZE * 0.22
right_x = SIZE * 0.78
top_y = SIZE * 0.24
bot_y = SIZE * 0.78
stroke = SIZE * 0.10
center_x = SIZE / 2
apex_y = SIZE * 0.52   # quão fundo a "V" desce no meio
inner_top_y = top_y + stroke * 0.6

# Polígono que descreve o M (vai por fora, depois pela "V" interna)
m_poly = [
    (left_x, bot_y),                                 # canto inf esquerdo
    (left_x, top_y),                                 # canto sup esquerdo
    (left_x + stroke * 1.2, top_y),                  # topo perna esq (entrada da diagonal)
    (center_x, apex_y),                              # vértice da "V" interna (esq → centro)
    (right_x - stroke * 1.2, top_y),                 # topo perna dir
    (right_x, top_y),                                # canto sup direito
    (right_x, bot_y),                                # canto inf direito
    (right_x - stroke, bot_y),                       # interno inf direito
    (right_x - stroke, inner_top_y + stroke * 0.8),  # subida interna direita
    (center_x, apex_y + stroke * 1.05),              # base interna do V
    (left_x + stroke, inner_top_y + stroke * 0.8),   # subida interna esquerda
    (left_x + stroke, bot_y),                        # interno inf esquerdo
]

# leve sombra abaixo do M
shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
shadow_poly = [(x, y + SIZE * 0.012) for (x, y) in m_poly]
sd.polygon(shadow_poly, fill=(0, 0, 0, 60))
shadow = shadow.filter(ImageFilter.GaussianBlur(8))
img = Image.alpha_composite(img, shadow)
d = ImageDraw.Draw(img)

# M em branco
d.polygon(m_poly, fill=WHITE)

# Pinguinho laranja discreto (acento) no ponto baixo da pata direita —
# evoca um pin/LED de equipamento
pin_x = right_x + SIZE * 0.02
pin_y = bot_y - SIZE * 0.015
pin_r = SIZE * 0.022
d.ellipse(
    [pin_x - pin_r, pin_y - pin_r, pin_x + pin_r, pin_y + pin_r],
    fill=ACCENT,
)

out = "/home/user/GM-/scripts/musicgest-icon.png"
img.save(out)
print(f"icone gerado: {out}")
