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

css, body, js = rd('app.css'), rd('body.html'), rd('app.js')
js = (js.replace('/*__STORE__*/', rd('store.js'))
        .replace('/*__CLOUD__*/', rd('cloud.js'))
        .replace('/*__EDITOR__*/', rd('editor.js'))
        .replace('__SONGS__', json.dumps(json.loads(rd('songs.json')), ensure_ascii=False, separators=(',', ':'))))
assert '/*__' not in js and '__SONGS__' not in js

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
