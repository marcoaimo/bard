#!/usr/bin/env python3
"""Costruisce Fiati tascabili dai sorgenti in src/.

   docs/          il sito pubblicato da GitHub Pages. Qui restano fissi suoni,
                  icone, lettore ABC e config.js; lo script rigenera solo
                  index.html, app.css, app.js, sw.js e il manifest.
   artifact.html  file unico con i suoni incorporati, per l'anteprima su claude.ai
                  (non va nel repository).

   Uso: python3 build.py   (nessuna dipendenza oltre a Python 3)"""
import hashlib, json, os, shutil
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, DOCS = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'docs')
rd = lambda p: open(os.path.join(SRC, p), encoding='utf-8').read()
rdd = lambda p: open(os.path.join(DOCS, p), encoding='utf-8').read()

def beffe_json():
    """Legge src/beffe.txt (facile da modificare a mano) e lo converte nei dati dell'app."""
    ST = {'S': 'standup', 'R': 'roast', 'A': 'assurdo', 'C': 'crowd', 'D': 'autore'}
    TP = {'a': 'aspetto', 'p': 'puzza', 'i': 'incompetenza', 's': 'stupidita', 'e': 'ego', 'f': 'famiglia',
          'm': 'morte', 'd': 'meta', 'x': 'fortuna', 't': 'atteggiamento', 'z': 'fiabe', 'g': 'any'}
    out, seen, cat, mom = [], set(), 'any', 'any'
    for n, line in enumerate(rd('beffe.txt').splitlines(), 1):
        if not line.strip() or line.startswith('#'):
            continue
        if line.startswith('@'):
            cat, mom = line[1:].split()
            continue
        code, text = line[:3], line[4:]
        assert code[0] in ST and code[1] in '012' and code[2] in TP, f'beffe.txt riga {n}: codice non valido'
        src = None
        if ' ~ ' in text:
            text, src = text.split(' ~ ', 1)
        assert text not in seen, f'beffe.txt riga {n}: beffa duplicata'
        seen.add(text)
        j = {'cat': cat, 'moment': mom, 'style': ST[code[0]], 'heat': int(code[1]), 'topic': TP[code[2]], 'text': text}
        if src:
            j['src'] = src
        out.append(j)
    return out

css, body, js = rd('app.css'), rd('body.html'), rd('app.js')
js = (js.replace('/*__STORE__*/', rd('store.js'))
        .replace('/*__CLOUD__*/', rd('cloud.js'))
        .replace('/*__EDITOR__*/', rd('editor.js'))
        .replace('/*__MOCK__*/', rd('beffe.js'))
        .replace('__SONGS__', json.dumps(json.loads(rd('songs.json')), ensure_ascii=False, separators=(',', ':')))
        .replace('__BEFFE__', json.dumps(beffe_json(), ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')))
assert '/*__' not in js and '__SONGS__' not in js and '__BEFFE__' not in js

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap" rel="stylesheet">\n')
HEAD = ('<!doctype html>\n<html lang="it" data-inst="flute">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<title>Fiati tascabili</title>\n')

version = hashlib.sha1((css + body + js).encode()).hexdigest()[:10]
index = (HEAD +
         '<meta name="description" content="Flauto di bambù, flauto dolce, cornamusa e tamburello da suonare sul telefono.">\n'
         '<meta name="theme-color" content="#1C2820">\n<meta name="apple-mobile-web-app-capable" content="yes">\n'
         '<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="Fiati">\n'
         '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icons/icon-192.png">\n'
         '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n' + FONTS +
         f'<link rel="stylesheet" href="app.css?v={version}">\n</head>\n<body>\n' + body +
         '<script>window.FIATI_STANDALONE=true;window.FIATI_ABCJS="vendor/abcjs-basic-min.js";</script>\n'
         f'<script src="config.js?v={version}"></script>\n<script src="app.js?v={version}"></script>\n</body>\n</html>\n')
w = lambda p, s: open(os.path.join(DOCS, p), 'w', encoding='utf-8').write(s)
w('index.html', index)
w('app.css', css)
w('app.js', js)
w('sw.js', rd('sw.js').replace('__VERSION__', version))
w('.nojekyll', '')
shutil.copy(os.path.join(SRC, 'manifest.webmanifest'), os.path.join(DOCS, 'manifest.webmanifest'))

banks = ''.join(f'<script type="application/json" id="snd-{k}">{rdd(f"sounds/{k}.json")}</script>\n' for k in ['tamb', 'oca', 'rec', 'pipes'])
artifact = (HEAD + FONTS + '<style>\n' + css + '</style>\n</head>\n<body>\n' + body + banks +
            '<script>\n' + js + '</script>\n</body>\n</html>\n')
open(os.path.join(ROOT, 'artifact.html'), 'w', encoding='utf-8').write(artifact)
print('versione', version, '| artifact', round(len(artifact) / 1e6, 2), 'MB')
