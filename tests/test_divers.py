"""Loaders hors ligne, noms de mods, suppression, détection du jeu, modpacks (S7, S9, S10, S12)."""
import json
import unittest
from pathlib import Path
from unittest import mock

from _harness import fresh_dir, load

wl = load()


class LoaderHorsLigne(unittest.TestCase):
    INSTALLED = {"fabric-loader-0.16.5-1.20.1", "fabric-loader-0.16.9-1.20.10", "1.20.1-forge-47.2.0",
                 "neoforge-20.1.0-1.20.1", "1.20.1", "quilt-loader-0.26-1.20.1"}

    def test_version_exacte(self):
        self.assertEqual(wl.installed_loader_ids(self.INSTALLED, "fabric", "1.20.1"), ["fabric-loader-0.16.5-1.20.1"])
        self.assertEqual(wl.installed_loader_ids(self.INSTALLED, "fabric", "1.20.10"), ["fabric-loader-0.16.9-1.20.10"])

    def test_forge_n_est_pas_neoforge(self):
        self.assertEqual(wl.installed_loader_ids(self.INSTALLED, "forge", "1.20.1"), ["1.20.1-forge-47.2.0"])
        self.assertEqual(wl.installed_loader_ids(self.INSTALLED, "neoforge", "1.20.1"), ["neoforge-20.1.0-1.20.1"])


class NomsDeMods(unittest.TestCase):
    def test_noms(self):
        ok = ["sodium-fabric-0.5.8+mc1.20.1.jar", "Create 1.0.JAR"]
        ko = ["a.jar:flux", "..\\x.jar", "../x.jar", "x.exe", "NUL.jar", "", None, "mod.jar."]
        self.assertTrue(all(wl.safe_mod_filename(n) for n in ok))
        self.assertFalse(any(wl.safe_mod_filename(n) for n in ko))

    def test_resolution_ignore_un_fichier_douteux(self):
        cdn = wl.MODRINTH_CDN

        def fetch(path, params=None):
            if path == "/project/bon/version":
                return [{"id": "v1", "version_type": "release", "date_published": "1", "dependencies": [],
                         "files": [{"primary": True, "filename": "bon.jar", "url": cdn + "bon.jar",
                                    "hashes": {"sha512": "a" * 128}}]}]
            if path == "/project/douteux/version":
                return [{"id": "v2", "version_type": "release", "date_published": "1", "dependencies": [],
                         "files": [{"primary": True, "filename": "x.jar:flux", "url": cdn + "x",
                                    "hashes": {"sha512": "b" * 128}}]}]
            if path == "/project/sans512/version":
                return [{"id": "v3", "version_type": "release", "date_published": "1", "dependencies": [],
                         "files": [{"primary": True, "filename": "s.jar", "url": cdn + "s.jar",
                                    "hashes": {"sha1": "c" * 40}}]}]
            return []

        plan, warnings = wl.resolve_modpack("1.20.1", "Fabric", [
            {"project_id": "bon", "title": "Bon"}, {"project_id": "douteux", "title": "Douteux"},
            {"project_id": "sans512", "title": "Sans512"}], fetch)
        self.assertEqual([i["filename"] for i in plan], ["bon.jar"])
        self.assertEqual(len(warnings), 2)


class Suppression(unittest.TestCase):
    def test_seulement_dans_un_dossier_d_instances(self):
        root = fresh_dir("roots")
        inst_root = root / "a" / "b" / "instances"
        (inst_root / "MonPack").mkdir(parents=True)
        (root / "a" / "b" / "Documents").mkdir()
        with mock.patch.object(wl, "instance_roots", lambda: [inst_root]):
            self.assertTrue(wl.safe_to_delete(inst_root / "MonPack"))
            self.assertFalse(wl.safe_to_delete(inst_root), "le dossier racine lui-même")
            self.assertFalse(wl.safe_to_delete(root / "a" / "b" / "Documents"), "hors des dossiers d'instances")
            self.assertFalse(wl.safe_to_delete(inst_root / "MonPack" / ".." / ".."), "remontée par ..")


class DetectionDuJeu(unittest.TestCase):
    def test_powershell_ne_renvoie_qu_un_nombre(self):
        script = wl._PS_COUNT_MINECRAFT
        self.assertIn("Where-Object", script)
        self.assertTrue(script.rstrip().endswith(".Count"))
        self.assertNotIn("ForEach-Object", script)

    def test_interpretation(self):
        out = mock.Mock(stdout="2\n", returncode=0)
        with mock.patch.object(wl.os, "name", "nt"), mock.patch.object(wl.subprocess, "run", return_value=out):
            self.assertTrue(wl.minecraft_running())
        out.stdout = "0"
        with mock.patch.object(wl.os, "name", "nt"), mock.patch.object(wl.subprocess, "run", return_value=out):
            self.assertFalse(wl.minecraft_running())


class ModificationDeModpack(unittest.TestCase):
    """Comportement existant à préserver : en cas d'échec de téléchargement, rien ne change."""

    def test_echec_ne_modifie_rien(self):
        folder = fresh_dir("pack")
        (folder / "mods").mkdir()
        (folder / "mods" / "ancien.jar").write_text("x")
        meta = {"minecraft": "1.20.1", "loader": "Fabric",
                "mods": [{"project_id": "ancien", "filename": "ancien.jar", "title": "Ancien", "dependency": False}]}
        (folder / "wecraft_modpack.json").write_text(json.dumps(meta))

        def fetch(path, params=None):
            return [{"id": "v", "version_type": "release", "date_published": "1", "dependencies": [],
                     "files": [{"primary": True, "filename": "nouveau.jar", "url": wl.MODRINTH_CDN + "n.jar",
                                "hashes": {"sha512": "a" * 128}}]}] if path.startswith("/project/") else []

        def download(*a, **k):
            raise RuntimeError("réseau coupé")

        with self.assertRaises(RuntimeError):
            wl.apply_modpack_edit(folder, meta, [{"project_id": "nouveau", "title": "Nouveau"}],
                                  fetch=fetch, download=download)
        self.assertEqual(sorted(p.name for p in (folder / "mods").iterdir()), ["ancien.jar"])
        self.assertEqual(json.loads((folder / "wecraft_modpack.json").read_text(encoding="utf-8")), meta)


if __name__ == "__main__":
    unittest.main()
