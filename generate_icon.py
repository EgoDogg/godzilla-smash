"""Generate the Godzilla Smash app icon (procedural, matches the game art)."""
import os
from PIL import Image, ImageDraw, ImageFilter

S = 512
D = os.path.dirname(os.path.abspath(__file__))
def P(x, y): return (x * S, y * S)

base = Image.new('RGBA', (S, S), (0, 0, 0, 255))
d = ImageDraw.Draw(base)
# night-sky gradient (navy -> purple), matching the game
for y in range(S):
    t = y / S
    r = int(12 + (46 - 12) * t); g = int(18 + (26 - 18) * t); b = int(44 + (68 - 44) * t)
    d.line([(0, y), (S, y)], fill=(r, g, b, 255))

# soft atomic glow
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([S*0.24, S*0.12, S*0.74, S*0.60], fill=(70, 175, 255, 120))
base = Image.alpha_composite(base, glow.filter(ImageFilter.GaussianBlur(50)))

# moon
ImageDraw.Draw(base).ellipse([S*0.70, S*0.09, S*0.85, S*0.24], fill=(255, 243, 205, 235))

# Godzilla silhouette (side profile facing right)
sil = [P(0.10,0.94), P(0.14,0.64), P(0.25,0.49), P(0.40,0.42), P(0.52,0.40),
       P(0.63,0.39), P(0.76,0.44), P(0.78,0.49), P(0.65,0.50), P(0.595,0.55),
       P(0.58,0.68), P(0.565,0.84), P(0.61,0.94)]
ImageDraw.Draw(base).polygon(sil, fill=(13, 14, 20, 255))
ImageDraw.Draw(base).polygon([P(0.14,0.74), P(0.02,0.91), P(0.08,0.94), P(0.21,0.83)], fill=(13, 14, 20, 255))

# glowing dorsal plates along the back ridge
ridge = [(0.165,0.605),(0.235,0.535),(0.305,0.485),(0.375,0.452),(0.445,0.428),(0.515,0.412)]
pl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
pd = ImageDraw.Draw(pl)
for i, (x, y) in enumerate(ridge):
    sz = 0.105 if i in (2, 3) else 0.08
    pd.polygon([P(x+0.04, y+0.025), P(x-0.012, y-sz), P(x-0.062, y+0.025)], fill=(150, 226, 255, 255))
base = Image.alpha_composite(base, pl.filter(ImageFilter.GaussianBlur(11)))
base = Image.alpha_composite(base, pl.filter(ImageFilter.GaussianBlur(11)))
base = Image.alpha_composite(base, pl)

# glowing eye
eg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(eg).ellipse([S*0.66, S*0.42, S*0.705, S*0.465], fill=(255, 200, 70, 255))
base = Image.alpha_composite(base, eg.filter(ImageFilter.GaussianBlur(7)))
ImageDraw.Draw(base).ellipse([S*0.668, S*0.428, S*0.700, S*0.460], fill=(255, 208, 90, 255))

out = base.convert('RGB')
out.save(os.path.join(D, 'icon-512.png'))
out.resize((192, 192), Image.LANCZOS).save(os.path.join(D, 'icon-192.png'))
print('icons written', out.size)
