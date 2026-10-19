"""Profils du launcher officiel (S3) : uniquement dans un faux .minecraft temporaire."""
import json
import unittest
from unittest import mock

from _harness import fresh_dir, load

wl = load()


class Profils(unittest.TestCase):
    def setUp(self):
        self.mc = fresh_dir("mc")
        self.wc = fresh_dir("wc")
        self.lp = self.mc / "launcher_profiles.json"
        self.patches = [mock.patch.object(wl, "PROFILE_IDS_FILE", self.wc / "managed_profiles.json"),
                        mock.patch.object(wl, "PROFILE_BACKUP_DIR", self.wc / "backups")]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def write(self, profiles, raw_prefix=b""):
        self.lp.write_bytes(raw_prefix + json.dumps({"profiles": profiles, "version": 3}).encode("utf-8"))

    def profiles(self):
        return json.loads(self.lp.read_text(encoding="utf-8"))["profiles"]

    def test_creation_et_sauvegardes(self):
        self.write({"perso": {"name": "Mon profil", "lastVersionId": "1.21"}})
        wl.set_profile(self.mc, "WECRAFT - Create", "fabric-loader-0.16-1.20.1", "C:/inst/Create", 6)
        p = self.profiles()
        ours = [v for k, v in p.items() if k != "perso"]
        self.assertEqual(len(ours), 1)
        self.assertEqual((ours[0]["name"], ours[0]["gameDir"], ours[0]["javaArgs"]),
                         ("WECRAFT - Create", "C:/inst/Create", "-Xmx6G"))
        self.assertEqual(p["perso"], {"name": "Mon profil", "lastVersionId": "1.21"})
        self.assertTrue((self.mc / "launcher_profiles.json.bak_wecraft").exists())
        self.assertEqual(len(list((self.wc / "backups").glob("*.json"))), 1)
        self.assertEqual(json.loads(self.lp.read_text(encoding="utf-8"))["version"], 3, "les autres clés sont conservées")

    def test_profil_utilisateur_au_nom_proche_jamais_touche(self):
        user = {"name": "WeCraft Survie (perso)", "gameDir": "D:/MesMondes", "lastVersionId": "1.21.1"}
        self.write({"abc": dict(user)})
        wl.set_profile(self.mc, "WECRAFT - Create", "1.20.1", "C:/inst/Create", 4)
        p = self.profiles()
        self.assertEqual(p["abc"], user)
        self.assertEqual(len(p), 2)

    def test_reprise_d_un_profil_cree_par_une_ancienne_version(self):
        self.write({"vieux": {"name": "WECRAFT - Ancien", "lastUsed": "2026-01-01", "javaArgs": "-Xmx4G"}})
        wl.set_profile(self.mc, "WECRAFT - Nouveau", "1.20.1", "C:/n", 8)
        p = self.profiles()
        self.assertEqual(list(p), ["vieux"])
        self.assertEqual((p["vieux"]["name"], p["vieux"]["javaArgs"]), ("WECRAFT - Nouveau", "-Xmx8G"))

    def test_identifiant_memorise_reutilise(self):
        self.write({})
        wl.set_profile(self.mc, "WECRAFT - A", "1.20.1", "C:/a", 4)
        key = list(self.profiles())[0]
        wl.set_profile(self.mc, "WECRAFT - B", "1.19.2", "C:/b", 4)
        p = self.profiles()
        self.assertEqual(list(p), [key])
        self.assertEqual(p[key]["gameDir"], "C:/b")

    def test_arguments_java_personnalises_conserves(self):
        self.write({"k": {"name": "WECRAFT - A", "javaArgs": "-Xmx6G -XX:+UseG1GC"}})
        wl.set_profile(self.mc, "WECRAFT - A", "1.20.1", "C:/a", 10)
        self.assertEqual(self.profiles()["k"]["javaArgs"], "-Xmx6G -XX:+UseG1GC")

    def test_fichier_avec_bom_accepte(self):
        self.write({}, raw_prefix=b"\xef\xbb\xbf")
        wl.set_profile(self.mc, "WECRAFT - A", "1.20.1", "C:/a", 4)
        self.assertEqual(len(self.profiles()), 1)

    def test_fichier_illisible_jamais_reecrit(self):
        self.lp.write_text('{"profiles": {', encoding="utf-8")
        with self.assertRaises(RuntimeError):
            wl.set_profile(self.mc, "WECRAFT - A", "1.20.1", "C:/a", 4)
        self.assertEqual(self.lp.read_text(encoding="utf-8"), '{"profiles": {')

    def test_rotation_des_sauvegardes(self):
        self.write({})
        for n in range(wl.PROFILE_BACKUPS_KEPT + 5):
            wl.set_profile(self.mc, f"WECRAFT - {n}", "1.20.1", f"C:/{n}", 4)
        self.assertEqual(len(list((self.wc / "backups").glob("*.json"))), wl.PROFILE_BACKUPS_KEPT)

    def test_sauvegardes_sans_jetons_de_connexion(self):
        self.lp.write_text(json.dumps({"profiles": {}, "authenticationDatabase": {"x": {"accessToken": "SECRET"}},
                                       "clientToken": "SECRET"}))
        wl.set_profile(self.mc, "WECRAFT - A", "1.20.1", "C:/a", 4)
        backup = next((self.wc / "backups").glob("*.json")).read_text(encoding="utf-8")
        self.assertNotIn("SECRET", backup)
        self.assertIn("SECRET", self.lp.read_text(encoding="utf-8"), "le vrai fichier n'est pas modifié sur ce point")

    def test_fichier_absent(self):
        with self.assertRaises(RuntimeError):
            wl.set_profile(fresh_dir("vide"), "WECRAFT - A", "1.20.1", "C:/a", 4)


if __name__ == "__main__":
    unittest.main()
