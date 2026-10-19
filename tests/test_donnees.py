"""Réglages WeCraft : chemins, écritures atomiques, fichiers illisibles conservés (S5, S8)."""
import json
import os
import unittest
from pathlib import Path
from unittest import mock

from _harness import fresh_dir, load

wl = load()


class Chemins(unittest.TestCase):
    def test_seul_le_dernier_dossier_est_renomme(self):
        base = fresh_dir("minecraftfan")  # le nom du dossier parent contient « minecraft »
        mc = str(base / ".minecraft")
        self.assertEqual(Path(wl.sibling_dir(mc, "wecraft")), base / ".wecraft")
        self.assertEqual(Path(wl.sibling_dir(str(base / "minecraft"), "wecraft")), base / "wecraft")

    def test_reprise_des_reglages_depuis_un_ancien_dossier(self):
        d = fresh_dir("migr")
        new, buggy = d / ".wecraft", d / "ancien"
        buggy.mkdir()
        (buggy / "launcher_config.json").write_text('{"ram": 6}', encoding="utf-8")
        with mock.patch.object(wl, "MC_DIR", str(new)), mock.patch.object(wl, "_BUGGY_DIRS", [buggy]), \
                mock.patch.object(wl, "_OLD_DIR", d / "absent"):
            wl.migrate_old_settings()
        self.assertEqual(json.loads((new / "launcher_config.json").read_text(encoding="utf-8")), {"ram": 6})
        self.assertTrue((buggy / "launcher_config.json").exists(), "l'original ne doit pas être supprimé")


class EcrituresEtLectures(unittest.TestCase):
    def setUp(self):
        self.d = fresh_dir("io")
        wl.INVALID_FILES.clear()
        wl._QUARANTINED.clear()

    def test_ecriture_atomique_ne_laisse_pas_de_temporaire(self):
        f = self.d / "a.json"
        wl.atomic_write_text(f, '{"x": 1}')
        wl.atomic_write_text(f, '{"x": 2}')
        self.assertEqual(json.loads(f.read_text(encoding="utf-8")), {"x": 2})
        self.assertEqual([p.name for p in self.d.iterdir()], ["a.json"])

    def test_bom_accepte(self):
        f = self.d / "bom.json"
        f.write_bytes(b"\xef\xbb\xbf" + b'{"ok": true}')
        self.assertEqual(wl.read_json_file(f), {"ok": True})

    def test_encodage_non_utf8_mis_de_cote_sans_planter(self):
        """Constat B1 de la revue : un fichier en ANSI (Bloc-notes) ou abîmé ne doit jamais faire planter."""
        for raw in (b'{"nom": "\xe9t\xe9"}', b"\xff\xfe{\x00}\x00"):
            f = self.d / f"enc{len(raw)}.json"
            f.write_bytes(raw)
            self.assertIsNone(wl.read_json_file(f))
            self.assertEqual(len(list(self.d.glob(f.name + ".invalide-*"))), 1)

    def test_ecriture_reessaie_si_le_fichier_est_bloque(self):
        f = self.d / "verrou.json"
        real, calls = os.replace, []

        def flaky(src, dst):
            calls.append(1)
            if len(calls) < 3:
                raise PermissionError(32, "utilisé par un autre processus")
            real(src, dst)
        with mock.patch.object(wl.os, "replace", flaky), mock.patch.object(wl.time, "sleep"):
            wl.atomic_write_text(f, "{}")
        self.assertEqual(len(calls), 3)
        self.assertEqual(f.read_text(encoding="utf-8"), "{}")

    def test_fichier_illisible_conserve_une_seule_fois(self):
        f = self.d / "cassé.json"
        f.write_text('{"a": ', encoding="utf-8")
        for _ in range(5):  # le scan relit toutes les 3 s : une seule copie doit être faite
            self.assertIsNone(wl.read_json_file(f))
        copies = list(self.d.glob("cassé.json.invalide-*"))
        self.assertEqual(len(copies), 1)
        self.assertEqual(copies[0].read_text(encoding="utf-8"), '{"a": ')
        self.assertEqual(len(wl.INVALID_FILES), 1)


class MetaInstances(unittest.TestCase):
    def setUp(self):
        self.d = fresh_dir("meta")
        self.meta = self.d / "instances_meta.json"
        self.p = mock.patch.object(wl, "META_FILE", self.meta)
        self.p.start()
        wl._QUARANTINED.clear()

    def tearDown(self):
        self.p.stop()

    def test_meta_invalide_conservee_avant_reecriture(self):
        original = '{"C:/a": {"name": "Ma super instance", "fav": true},'
        self.meta.write_text(original, encoding="utf-8")
        wl.update_meta("C:/c", set={"hidden": True})
        self.assertEqual(json.loads(self.meta.read_text(encoding="utf-8")), {os.path.normcase("C:/c"): {"hidden": True}})
        copies = list(self.d.glob("instances_meta.json.invalide-*"))
        self.assertEqual(len(copies), 1)
        self.assertEqual(copies[0].read_text(encoding="utf-8"), original)

    def test_valeurs_abimees_n_effacent_pas_la_liste(self):
        a, b, c = str(self.d / "a"), str(self.d / "b"), str(self.d / "c")
        self.meta.write_text(json.dumps({wl.meta_key(a): {"ram": "huit", "name": 12},
                                         wl.meta_key(b): "pas un objet",
                                         wl.meta_key(c): {"ram": 6, "name": "Créa", "fav": True}}))
        insts = [{"name": n, "folder": Path(f), "path": Path(f), "version": "1.20.1", "loader": None,
                  "loader_version": None, "ram": None, "source": "WeCraft"} for n, f in (("a", a), ("b", b), ("c", c))]
        out = wl.apply_meta(insts)
        self.assertEqual([i["display"] for i in out], ["12", "b", "Créa"])
        self.assertEqual([i["ram"] for i in out], [None, None, 6])
        self.assertTrue(out[2]["fav"])

    def test_meta_impossible_a_lire_jamais_reecrite(self):
        """Constat I6 de la revue : un fichier verrouillé ne doit pas être remplacé par des réglages vides."""
        self.meta.write_text('{"C:/a": {"name": "Gardé"}}', encoding="utf-8")
        real_read = Path.read_bytes

        def locked(path):
            if path == self.meta:
                raise PermissionError(13, "accès refusé")
            return real_read(path)
        with mock.patch.object(Path, "read_bytes", locked), self.assertRaises(wl.SettingsUnreadable):
            wl.update_meta("C:/c", set={"hidden": True})
        self.assertEqual(json.loads(self.meta.read_text(encoding="utf-8")), {"C:/a": {"name": "Gardé"}})

    def test_parse_ram(self):
        self.assertEqual([wl.parse_ram(v) for v in (6, "8", "huit", None, 0, 999, 4.0)],
                         [6, 8, None, None, None, None, 4])

    def test_update_puis_forget(self):
        wl.update_meta("X", set={"name": "n", "fav": True})
        wl.update_meta("X", remove=["fav"])
        self.assertEqual(wl.load_meta(), {wl.meta_key("X"): {"name": "n"}})
        wl.forget_meta("X")
        self.assertEqual(wl.load_meta(), {})


class InstanceLocale(unittest.TestCase):
    """Comportement existant à préserver : lecture de wecraft.json et des formats connus."""

    def test_wecraft_json_prioritaire_et_ram_invalide_ignoree(self):
        d = fresh_dir("inst")
        (d / "manifest.json").write_text(json.dumps({"minecraft": {"version": "1.19.2", "modLoaders": [
            {"id": "forge-43.2.0", "primary": True}]}}))
        (d / "wecraft.json").write_text(json.dumps({"name": "Mon pack", "ram": "beaucoup"}))
        i = wl.read_local_instance(d)
        self.assertEqual((i["name"], i["version"], i["loader"], i["loader_version"], i["ram"]),
                         ("Mon pack", "1.19.2", "Forge", "43.2.0", None))

    def test_parse_loader(self):
        self.assertEqual(wl.parse_loader("fabric-0.15.7-1.20.1", "1.20.1"), ("Fabric", "0.15.7"))
        self.assertEqual(wl.parse_loader("neoforge-20.4.1"), ("NeoForge", "20.4.1"))
        self.assertEqual(wl.parse_loader("rien"), (None, None))


if __name__ == "__main__":
    unittest.main()
