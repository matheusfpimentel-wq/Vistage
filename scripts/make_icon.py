"""Gera um ícone placeholder 1024x1024 PNG para o MusicGest.
Depois de rodar, use:
    npm run tauri icon scripts/musicgest-icon.png
para gerar todos os tamanhos/formatos em src-tauri/icons/.
"""
from PIL import Image, ImageDraw

SIZE = 1024
BG = (18, 17, 36)            # roxo bem escuro
FG = (240, 240, 245)         # branco quase puro
ACCENT = (139, 92, 246)      # roxo vibrante (acento)

img = Image.new("RGBA", (SIZE, SIZE), BG)
d = ImageDraw.Draw(img)

# leve gradiente: bloco de acento no canto inferior-direito (efeito decorativo)
for i in range(SIZE):
    alpha = int(60 * (i / SIZE))
    d.line(
        [(SIZE - i, SIZE - 1), (SIZE - 1, SIZE - 1 - i)],
        fill=(ACCENT[0], ACCENT[1], ACCENT[2], alpha),
        width=1,
    )

# nota musical estilizada (♪)
# duas cabeças (oval) + haste vertical + bandeira
head_w, head_h = 220, 160
left_head = (300, 720)
d.ellipse(
    [left_head[0], left_head[1], left_head[0] + head_w, left_head[1] + head_h],
    fill=FG,
)

# haste da nota
stem_x = left_head[0] + head_w - 30
d.rectangle([stem_x, 240, stem_x + 40, 800], fill=FG)

# bandeira da nota (faixa curva à direita do topo da haste)
flag_pts = [
    (stem_x + 40, 240),
    (stem_x + 280, 320),
    (stem_x + 280, 460),
    (stem_x + 40, 380),
]
d.polygon(flag_pts, fill=FG)

# segunda cabeça (menor, acompanhando a bandeira) — opcional para estética
d.ellipse(
    [stem_x + 220, 380, stem_x + 220 + 180, 380 + 130],
    fill=FG,
)

out = "/home/user/GM-/scripts/musicgest-icon.png"
img.save(out)
print(f"icone gerado: {out}")
