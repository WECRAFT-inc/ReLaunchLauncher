"""Import du prototype « Prototype ReLaunch × WeCraft » (artifact Claude) dans l'interface Electron.

Copie quasi à l'identique : seules les modifications listées ci-dessous sont faites, chacune pour une
règle du prompt maître (sécurité Electron §4.4, honnêteté de l'interface §10.4) ou parce que l'élément
n'existe pas dans une vraie fenêtre (outils de la page de démonstration).

Usage : python scripts/import-prototype.py <prototype.html>
(écrit src/renderer/prototype.css, prototype.js et index.html, à relire avant de les versionner)
"""
import re
import sys
from pathlib import Path

src = Path(sys.argv[1]).read_text(encoding="utf-8")
out = Path(__file__).resolve().parent.parent / "src" / "renderer"
lines = src.split("\n")


def between(start_pat, end_pat, after=0):
    i = next(k for k in range(after, len(lines)) if re.search(start_pat, lines[k]))
    j = next(k for k in range(i + 1, len(lines)) if re.search(end_pat, lines[k]))
    return i, j


def must_replace(text, old, new, count=1):
    assert text.count(old) == count, (old[:80], text.count(old))
    return text.replace(old, new)


# ------------------------------------------------------------------ CSS (identique + fin d'ajustements)
i, j = between(r"^<style>$", r"^</style>$")
css = "\n".join(lines[i + 1 : j])
css = (
    "/* Copié du prototype « Prototype ReLaunch × WeCraft » (scripts/import-prototype.py).\n"
    "   Polices : fichiers locaux (pas de Google Fonts) ; Manrope absente -> Inter. */\n"
    + css
)

# ------------------------------------------------------------------ Corps : uniquement la fenêtre de l'appli
k0, k1 = between(r'<div class="app" id="appRoot">', r'^      <div class="layer" id="layer"')
body = "\n".join(lines[k0:k1]).rstrip()
assert body.count('id="appRoot"') == 1 and body.count("<div") == body.count("</div>"), "div non équilibrés"

# ------------------------------------------------------------------ Script
s0, s1 = between(r"^<script>$", r"^</script>$")
js = "\n".join(lines[s0 + 1 : s1])

# 1. Mode développeur (annotations stockées dans la base de l'artifact) et boutons « Vue premium /
#    staff » de la page : outils de la maquette, absents d'une vraie fenêtre.
a = js.index("  /* =====================================================\n     MODE DÉVELOPPEUR")
b = js.index("  /* ---------- Démarrage ---------- */")
js = js[:a] + (
    "  /* [WeCraft] Mode développeur, annotations et boutons « Vue premium / staff » de la page de\n"
    "     démonstration retirés (outils de la maquette). */\n"
    "  var dev=false;\n"
    "  function refresh(){}\n"
    "  window.addEventListener('resize',function(){renderBars()});\n\n"
) + js[b:]
c = js.index("  loadLocal();afterChange();")
d = js.index("  stBtn.setAttribute('aria-pressed',String(STAFF));")
js = js[:c] + js[d:]
js = must_replace(js, "  stBtn.setAttribute('aria-pressed',String(STAFF)); appRoot.classList.toggle('staffon',STAFF);\n",
                  "  appRoot.classList.toggle('staffon',STAFF);\n")
js = must_replace(js, "  prBtn.setAttribute('aria-pressed',String(PREM)); applyBg();\n", "  applyBg();\n")
e = js.index("  var dv='0';try{dv=localStorage.getItem('proto-dev')||'0'}catch(e){}")
f = js.index("})();", e)
js = js[:e] + js[f:]
js = must_replace(js, ", win=document.getElementById('win');", ";")
assert "window.claude" not in js and "win." not in js

# 2. Lancement : la maquette simulait une progression puis « En jeu ». Interdit (§10.4 : jamais de
#    progression fictive). Remplacé par un message honnête jusqu'au lot E4.
g = js.index("  function launch(id){")
h = js.index("  $('lClose').addEventListener", g)
js = js[:g] + (
    "  /* [WeCraft] Pas de progression simulée (prompt maître §10.4) : le lancement réel arrive au lot E4. */\n"
    "  function launch(id){\n"
    "    var x=byId(id); if(!x) return;\n"
    "    toast('Lancement pas encore disponible dans cette version. Pour jouer, utilise WeCraft habituel.');\n"
    "  }\n"
) + js[h:]

# 3. Thème : les 4 thèmes de base sont aussi ceux de launcher_config.json (clé « theme »). La maquette
#    prévient l'appli quand le joueur en choisit un, et l'appli peut lui imposer le thème enregistré.
js = must_replace(js, "    store('proto-pref2',PREF);\n  }\n  function applyBg()",
                  "    store('proto-pref2',PREF);\n"
                  "    try{document.dispatchEvent(new CustomEvent('wecraft:skin-changed',{detail:s}))}catch(_){}\n"
                  "  }\n"
                  "  document.addEventListener('wecraft:apply-skin',function(e){var k=e.detail;if(['phenix','relink','aurore','glace'].indexOf(k)<0)return;setSkin(k);if(S.view==='settings')RENDER.settings()});\n"
                  "  function applyBg()")

js = "/* Copié du prototype « Prototype ReLaunch × WeCraft » (scripts/import-prototype.py).\n   Modifications : voir les commentaires [WeCraft]. Données d'exemple fictives. */\n" + js + "\n"

(out / "prototype.css").write_text(css + "\n", encoding="utf-8")
(out / "prototype.js").write_text(js, encoding="utf-8")
CSP = ("default-src 'none'; script-src app://wecraft; style-src-elem app://wecraft; style-src-attr 'unsafe-inline'; "
       "img-src app://wecraft data:; font-src app://wecraft; connect-src 'none'; object-src 'none'; frame-src 'none'; "
       "form-action 'none'; base-uri 'none'")
index = f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <!-- Doublon de l'en-tête envoyé par le processus principal (défense en profondeur) -->
  <meta http-equiv="Content-Security-Policy" content="{CSP}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WeCraft</title>
  <link rel="stylesheet" href="fonts.css">
  <link rel="stylesheet" href="prototype.css">
  <link rel="stylesheet" href="wecraft.css">
  <script src="prototype.js" defer></script>
  <script type="module" src="app.js"></script>
</head>
<body>
  <div class="wc-demo" role="note" title="Instances, serveurs, amis et actualités sont des exemples : rien n'est lancé ni envoyé.">Aperçu · contenus fictifs</div>
  <div class="wc-notice" id="wc-notice" role="alert" hidden>
    <p id="wc-notice-text"></p>
    <button class="btn sm" type="button" id="wc-notice-close">Compris</button>
  </div>
{body}
</body>
</html>
"""
(out / "index.html").write_text(index, encoding="utf-8")
print("css", len(css), "js", len(js), "body", len(body))
