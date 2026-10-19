"""Mises à jour : versions, signature Ed25519, téléchargement, retour arrière (S1, S6)."""
import base64
import hashlib
import importlib.util
import io
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

from _harness import ROOT, fresh_dir, load

wl = load()
HAS_CRYPTO = importlib.util.find_spec("cryptography") is not None

_spec = importlib.util.spec_from_file_location("sign_release", ROOT / "tools" / "sign_release.py")
sign_tool = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sign_tool)


class Versions(unittest.TestCase):
    def test_ordre(self):
        self.assertTrue(wl.is_newer("1.10.0", "1.9.9"))
        self.assertTrue(wl.is_newer("1.2.1", "1.2.0"))
        self.assertTrue(wl.is_newer("1.2.1", "1.2.1-rc1"))
        self.assertFalse(wl.is_newer("1.2.1-rc1", "1.2.1"))
        self.assertFalse(wl.is_newer("1.2.0-rc1", "1.2.0"))
        self.assertTrue(wl.is_newer("1.2.1-rc2", "1.2.1-rc1"))
        self.assertFalse(wl.is_newer("v1.2.0", "1.2.0"))


def _keypair():
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization as ser
    k = Ed25519PrivateKey.generate()
    pub = k.public_key().public_bytes(ser.Encoding.Raw, ser.PublicFormat.Raw)
    return k, base64.b64encode(pub).decode()


@unittest.skipUnless(HAS_CRYPTO, "cryptography absent")
class Signature(unittest.TestCase):
    def setUp(self):
        self.key, self.pub = _keypair()
        self.sha = hashlib.sha256(b"exe").hexdigest()

    def sign(self, version, sha):
        return base64.b64encode(self.key.sign(wl.update_signed_message(version, sha))).decode()

    def test_meme_message_que_l_outil_de_signature(self):
        self.assertEqual(wl.update_signed_message("1.2.1", self.sha.upper()), sign_tool.message("v1.2.1", self.sha))

    def test_valide_et_invalides(self):
        sig = self.sign("1.2.1", self.sha)
        self.assertTrue(wl.verify_update_signature("1.2.1", self.sha, sig, self.pub))
        self.assertFalse(wl.verify_update_signature("1.2.2", self.sha, sig, self.pub), "autre version")
        self.assertFalse(wl.verify_update_signature("1.2.1", "0" * 64, sig, self.pub), "autre fichier")
        _, other_pub = _keypair()
        self.assertFalse(wl.verify_update_signature("1.2.1", self.sha, sig, other_pub), "autre clé")
        self.assertFalse(wl.verify_update_signature("1.2.1", self.sha, "pas du base64!", self.pub))

    def test_cle_publique_integree_valide(self):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        key = base64.b64decode(wl.UPDATE_PUBLIC_KEY, validate=True)
        self.assertEqual(len(key), 32)
        Ed25519PublicKey.from_public_bytes(key)  # lève une erreur si la clé est abîmée

    def test_politique(self):
        info = {"version": "1.2.1", "signature": self.sign("1.2.1", self.sha)}
        with mock.patch.object(wl, "UPDATE_PUBLIC_KEY", ""):
            self.assertEqual(wl.check_update_signature({"version": "1.2.1"}, self.sha), "")
        with mock.patch.object(wl, "UPDATE_PUBLIC_KEY", self.pub):
            self.assertEqual(wl.check_update_signature(info, self.sha), "signature vérifiée")
            with self.assertRaises(RuntimeError):
                wl.check_update_signature(dict(info, signature=self.sign("9.9.9", self.sha)), self.sha)
            with mock.patch.object(wl, "UPDATE_SIGNATURE_REQUIRED", False):
                self.assertIn("transition", wl.check_update_signature({"version": "1.2.1"}, self.sha))
            with mock.patch.object(wl, "UPDATE_SIGNATURE_REQUIRED", True), self.assertRaises(RuntimeError):
                wl.check_update_signature({"version": "1.2.1"}, self.sha)


class _Resp(io.BytesIO):
    headers = {}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


class Telechargement(unittest.TestCase):
    def setUp(self):
        self.d = fresh_dir("dl")
        self.p = mock.patch.object(wl, "MC_DIR", str(self.d))
        self.p.start()

    def tearDown(self):
        self.p.stop()

    def run_dl(self, info, data=b"nouvel exe"):
        dest = self.d / "WeCraft_update.exe"
        with mock.patch.object(wl, "_http", lambda url, timeout=10: _Resp(data)):
            return dest, wl.download_update(info, dest)

    @unittest.skipUnless(HAS_CRYPTO, "cryptography absent")
    def test_empreinte_et_signature_correctes(self):
        key, pub = _keypair()
        sha = hashlib.sha256(b"nouvel exe").hexdigest()
        sig = base64.b64encode(key.sign(wl.update_signed_message("1.2.1", sha))).decode()
        with mock.patch.object(wl, "UPDATE_PUBLIC_KEY", pub):
            dest, _ = self.run_dl({"url": "u", "version": "1.2.1", "sha256": sha, "signature": sig})
        self.assertEqual(dest.read_bytes(), b"nouvel exe")

    def test_release_non_signee_refusee_par_defaut(self):
        self.assertTrue(wl.UPDATE_SIGNATURE_REQUIRED)
        with self.assertRaises(RuntimeError):
            self.run_dl({"url": "u", "version": "1.2.1", "sha256": hashlib.sha256(b"nouvel exe").hexdigest()})
        self.assertFalse((self.d / "WeCraft_update.exe").exists())

    def test_module_de_verification_absent_message_clair(self):
        with mock.patch.object(wl, "signature_support_available", lambda: False), \
                self.assertRaises(RuntimeError) as ctx:
            wl.check_update_signature({"version": "1.2.1", "signature": "abc"}, "0" * 64)
        self.assertIn("module de vérification", str(ctx.exception))

    def test_empreinte_fausse_fichier_supprime(self):
        with self.assertRaises(RuntimeError):
            self.run_dl({"url": "u", "version": "1.2.1", "sha256": "0" * 64})
        self.assertFalse((self.d / "WeCraft_update.exe").exists())
        self.assertIn("refusée", (self.d / "update.log").read_text(encoding="utf-8"))

    @unittest.skipUnless(HAS_CRYPTO, "cryptography absent")
    def test_signature_fausse_fichier_supprime(self):
        _, pub = _keypair()
        other, _ = _keypair()
        sha = hashlib.sha256(b"nouvel exe").hexdigest()
        bad = base64.b64encode(other.sign(wl.update_signed_message("1.2.1", sha))).decode()
        with mock.patch.object(wl, "UPDATE_PUBLIC_KEY", pub), self.assertRaises(RuntimeError):
            self.run_dl({"url": "u", "version": "1.2.1", "sha256": sha, "signature": bad})
        self.assertFalse((self.d / "WeCraft_update.exe").exists())


class RetourArriere(unittest.TestCase):
    """Deux processus : l'ANCIENNE version (1.2.0) installe la mise à jour puis se ferme ; la NOUVELLE
    (1.2.1) démarre ensuite depuis le même chemin d'exe."""

    def setUp(self):
        self.d = fresh_dir("rollback")
        self.exe = self.d / "WeCraft.exe"
        self.exe.write_bytes(b"v1.2.0")
        new = self.d / "WeCraft_update.exe"
        new.write_bytes(b"v1.2.1")
        self.patches = [mock.patch.object(wl, "FROZEN", True),
                        mock.patch.object(sys, "executable", str(self.exe)),
                        mock.patch.object(wl, "MC_DIR", str(self.d)),
                        mock.patch.object(wl, "UPDATE_PENDING_FILE", self.d / "update_pending.json"),
                        mock.patch.object(wl, "UPDATE_SKIP_FILE", self.d / "update_skip.json"),
                        mock.patch.object(wl, "APP_VERSION", "1.2.0"),
                        mock.patch.object(wl, "_UPDATE_HANDED_OFF", False),
                        mock.patch.object(wl.subprocess, "Popen")]
        for p in self.patches:
            p.start()
        wl.apply_update(new, "1.2.1")  # dans l'ancien processus

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def nouveau_processus(self):
        wl._UPDATE_HANDED_OFF = False
        wl.APP_VERSION = "1.2.1"

    def pending(self):
        return json.loads((self.d / "update_pending.json").read_text(encoding="utf-8"))

    def test_installation(self):
        self.assertEqual(self.exe.read_bytes(), b"v1.2.1")
        self.assertEqual((self.d / "WeCraft.exe.old").read_bytes(), b"v1.2.0")
        self.assertEqual(self.pending()["to"], "1.2.1")
        wl.subprocess.Popen.assert_called_once()

    def test_l_ancien_processus_ne_valide_rien_en_se_fermant(self):
        """Constat B2 de la revue : la fin de mainloop de l'ancienne version ne doit pas valider."""
        with mock.patch.object(wl, "cleanup_update_leftovers") as c:
            wl.mark_update_healthy()
            c.assert_not_called()
        self.assertTrue((self.d / "update_pending.json").exists())
        self.assertTrue((self.d / "WeCraft.exe.old").exists())

    def test_ancienne_version_gardee_tant_que_non_validee(self):
        self.nouveau_processus()
        wl.update_startup_check()
        with mock.patch.object(wl.threading, "Thread") as th:
            wl.cleanup_update_leftovers()
            th.assert_not_called()

    def test_premier_demarrage_puis_validation(self):
        self.nouveau_processus()
        self.assertIsNone(wl.update_startup_check())  # 1er démarrage : rien à proposer
        with mock.patch.object(wl, "cleanup_update_leftovers") as c:
            wl.mark_update_healthy()
            c.assert_called_once()
        self.assertFalse((self.d / "update_pending.json").exists())

    def test_echec_puis_retour_a_l_ancienne_version(self):
        self.nouveau_processus()
        self.assertIsNone(wl.update_startup_check())       # 1er démarrage : plante avant validation
        data = self.pending()
        data["last_start"] -= 60                            # 2e démarrage, une minute plus tard
        (self.d / "update_pending.json").write_text(json.dumps(data))
        failed = wl.update_startup_check()
        self.assertIsNotNone(failed)
        wl.restore_previous_version(failed)
        self.assertEqual(self.exe.read_bytes(), b"v1.2.0")
        self.assertFalse((self.d / "WeCraft.exe.old").exists())
        self.assertEqual(len(list(self.d.glob("WeCraft.exe.*.echec"))), 1)
        self.assertFalse((self.d / "update_pending.json").exists())
        self.assertEqual(wl.skipped_update_version(), "1.2.1")  # plus reproposée automatiquement

    def test_double_clic_ne_declenche_pas_de_retour_arriere(self):
        self.nouveau_processus()
        self.assertIsNone(wl.update_startup_check())
        self.assertIsNone(wl.update_startup_check())  # 2e démarrage immédiat
        self.assertEqual(self.pending()["starts"], 1)

    def test_fichier_de_suivi_mal_forme_ignore(self):
        self.nouveau_processus()
        for bad in ({"exe": str(self.exe), "to": "1.2.1", "old": None, "starts": 1},
                    {"exe": str(self.exe), "to": "1.2.1", "old": "x", "starts": "1x"},
                    ["liste"]):
            (self.d / "update_pending.json").write_text(json.dumps(bad))
            self.assertIsNone(wl.update_startup_check())
            wl.mark_update_healthy()  # ne doit pas lever d'erreur

    def test_rien_hors_exe(self):
        with mock.patch.object(wl, "FROZEN", False):
            self.assertIsNone(wl.update_startup_check())


if __name__ == "__main__":
    unittest.main()
