"""Gera o ícone do MusicGest (1024x1024 PNG).
Visual minimalista: degradê roxo + monograma 'M' em branco.

Depois de rodar, regenere todos os tamanhos com:
    npm run tauri icon scripts/musicgest-icon.png
"""
from PIL import Image, ImageDraw

SIZE = 1024
RADIUS = 220   # cantos arredondados (macOS aplica máscara própria, mas faz bem)

# paleta — mesma do app (--primary e --primary-glow no tema dark)
TOP = (118, 71, 233)       # roxo principal
BOTTOM = (172, 102, 245)   # roxo glow
WHITE = (255, 255, 255)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Fundo em degradê vertical (top -> bottom)
for y in range(SIZE):
    t = y / SIZE
    r = int(TOP[0] * (1 - t) + BOTTOM[0] * t)
    g = int(TOP[1] * (1 - t) + BOTTOM[1] * t)
    b = int(TOP[2] * (1 - t) + BOTTOM[2] * t)
    d.line([(0, y), (SIZE, y)], fill=(r, g, b))

# máscara de cantos arredondados — opcional já que o macOS arredonda por cima
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    [(0, 0), (SIZE - 1, SIZE - 1)],
    radius=RADIUS,
    fill=255,
)
img.putalpha(mask)

# Monograma M — desenhado com retângulos pra garantir traço uniforme.
# Estrutura:
#   - duas pernas verticais
#   - duas diagonais que se encontram no centro-superior
d2 = ImageDraw.Draw(img)

# proporções relativas ao quadrado
m_left   = int(SIZE * 0.24)
m_right  = int(SIZE * 0.76)
m_top    = int(SIZE * 0.26)
m_bottom = int(SIZE * 0.74)
stroke   = int(SIZE * 0.075)
center_x = SIZE // 2

# pernas
d2.rectangle([m_left, m_top, m_left + stroke, m_bottom], fill=WHITE)
d2.rectangle([m_right - stroke, m_top, m_right, m_bottom], fill=WHITE)

# diagonais (polígonos espessos)
def thick_line(p1, p2, width):
    # vetor perpendicular
    import math
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return
    nx = -dy / length * width / 2
    ny = dx / length * width / 2
    d2.polygon([
        (p1[0] + nx, p1[1] + ny),
        (p1[0] - nx, p1[1] - ny),
        (p2[0] - nx, p2[1] - ny),
        (p2[0] + nx, p2[1] + ny),
    ], fill=WHITE)

apex_y = int(SIZE * 0.50)
thick_line((m_left + stroke // 2, m_top),  (center_x, apex_y), stroke)
thick_line((m_right - stroke // 2, m_top), (center_x, apex_y), stroke)

out = "/home/user/GM-/scripts/musicgest-icon.png"
img.save(out)
print(f"ícone gerado: {out}")
