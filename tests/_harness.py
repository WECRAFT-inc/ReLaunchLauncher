"""Chargement de wecraft_launcher.py pour les tests, sans jamais toucher de vraies données.

- minecraft_launcher_lib est TOUJOURS remplacé par un substitut : le « .minecraft » vu par le module
  est un dossier temporaire, même sur un PC où la vraie bibliothèque est installée.
- tkinter est utilisé s'il existe, sinon un substitut minimal (les tests ne créent aucune fenêtre).
"""
import importlib
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SANDBOX = Path(tempfile.mkdtemp(prefix="wecraft-tests-"))
FAKE_MC = SANDBOX / "AppData" / "Roaming" / ".minecraft"


def _stub_mll():
    mll = types.ModuleType("minecraft_launcher_lib")
    utils = types.SimpleNamespace(
        get_minecraft_directory=lambda: str(FAKE_MC),
        get_installed_versions=lambda d: [],
        get_version_list=lambda: [],
    )
    mll.utils = utils
    mll.mod_loader = types.SimpleNamespace(get_mod_loader=lambda k: None)
    mll.install = types.SimpleNamespace(install_minecraft_version=lambda *a, **k: None)
    mll.runtime = types.SimpleNamespace()
    sys.modules["minecraft_launcher_lib"] = mll


def _stub_tk():
    try:
        import tkinter  # noqa: F401
        import tkinter.ttk  # noqa: F401
        return
    except Exception:
        pass
    tk = types.ModuleType("tkinter")

    class _W:
        def __init__(self, *a, **k):
            pass

    for name in ("Tk", "Toplevel", "Canvas", "Frame", "Label", "Listbox", "Menu", "PhotoImage",
                 "StringVar", "IntVar", "BooleanVar"):
        setattr(tk, name, type(name, (_W,), {}))
    tk.TclError = type("TclError", (Exception,), {})
    sub = {n: types.ModuleType("tkinter." + n) for n in ("font", "filedialog", "messagebox", "ttk")}
    for n, m in sub.items():
        setattr(tk, n, m)
        sys.modules["tkinter." + n] = m
    sys.modules["tkinter"] = tk


def load():
    """Importe (ou réimporte) le launcher dans le bac à sable."""
    _stub_mll()
    _stub_tk()
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    if "wecraft_launcher" in sys.modules:
        return importlib.reload(sys.modules["wecraft_launcher"])
    return importlib.import_module("wecraft_launcher")


def fresh_dir(name):
    d = Path(tempfile.mkdtemp(prefix=f"{name}-", dir=SANDBOX))
    return d
