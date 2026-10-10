"""Deixa os PNGs do jogo leves para o celular: paleta de 256 cores (com alfa) e compressão máxima.

Uso: python3 scripts/art/optimize_png.py [--dry] arquivo.png [...]
     python3 scripts/art/optimize_png.py [--dry] --dir public/art/crops1

Só troca o arquivo se ficar pelo menos 25% menor (sprite já otimizado fica como está). Sem perda visível
nos sprites do jogo (conferido lado a lado na Evolução 10: casa, árvore, moldura, ícones); arte com degradê
muito longo pode criar faixas, então confira o lote novo antes de commitar.
"""
import os
import sys
from PIL import Image

args = sys.argv[1:]
dry = '--dry' in args
args = [a for a in args if a != '--dry']
files = []
if args[:1] == ['--dir']:
    for root, _, names in os.walk(args[1]):
        files += [os.path.join(root, n) for n in names if n.endswith('.png')]
else:
    files = args

before = after = changed = 0
for f in sorted(files):
    s0 = os.path.getsize(f)
    im = Image.open(f)
    if im.mode == 'P':  # já tem paleta
        before += s0
        after += s0
        continue
    q = im.convert('RGBA').quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    tmp = f + '.tmp.png'
    q.save(tmp, optimize=True)
    s1 = os.path.getsize(tmp)
    before += s0
    if s1 <= s0 * 0.75 and not dry:
        os.replace(tmp, f)
        after += s1
        changed += 1
    else:
        os.remove(tmp)
        after += s1 if s1 <= s0 * 0.75 else s0
print(f'{len(files)} arquivos, {changed} trocados: {before // 1024} KB -> {after // 1024} KB')
