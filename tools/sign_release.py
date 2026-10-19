"""Signature des releases de WeCraft (Ed25519). Nécessite : pip install cryptography

1) UNE SEULE FOIS, sur VOTRE PC (jamais dans le dépôt, jamais dans un chat) :
       python tools/sign_release.py generate C:\\chemin\\hors-depot\\wecraft_signing_key.txt
   -> écrit la clé PRIVÉE dans ce fichier et affiche la clé PUBLIQUE.
   - Collez la clé PUBLIQUE dans wecraft_launcher.py : UPDATE_PUBLIC_KEY = "..."
   - Ajoutez le contenu du fichier de clé PRIVÉE comme secret GitHub « UPDATE_SIGNING_KEY »
     (Settings > Secrets and variables > Actions) du dépôt privé, puis gardez une copie de
     sauvegarde hors ligne (clé USB, gestionnaire de mots de passe). Perdue = plus de mises à jour signées.

2) Signer (fait automatiquement par la CI ; possible aussi à la main) :
       python tools/sign_release.py sign dist/WeCraft.exe 1.2.1 > dist/WeCraft.exe.sig
   La clé privée est lue dans la variable d'environnement UPDATE_SIGNING_KEY, ou dans le fichier
   indiqué par --key.

3) Vérifier :
       python tools/sign_release.py verify dist/WeCraft.exe 1.2.1 dist/WeCraft.exe.sig <clé publique>
"""
import base64
import hashlib
import os
import sys
from pathlib import Path

CONTEXT = "WeCraft-update-v1"  # doit rester identique à SIGNATURE_CONTEXT dans wecraft_launcher.py


def message(version, sha256):
    return f"{CONTEXT}\n{version.strip().lstrip('vV')}\n{sha256.strip().lower()}\n".encode("utf-8")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(argv):
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
    from cryptography.hazmat.primitives import serialization as ser

    if len(argv) >= 2 and argv[0] == "generate":
        dest = Path(argv[1])
        if dest.exists():
            sys.exit(f"{dest} existe déjà : je ne l'écrase pas.")
        key = Ed25519PrivateKey.generate()
        raw = key.private_bytes(ser.Encoding.Raw, ser.PrivateFormat.Raw, ser.NoEncryption())
        pub = key.public_key().public_bytes(ser.Encoding.Raw, ser.PublicFormat.Raw)
        dest.write_text(base64.b64encode(raw).decode() + "\n", encoding="ascii")
        print("Clé PRIVÉE écrite dans :", dest)
        print("Clé PUBLIQUE (à mettre dans UPDATE_PUBLIC_KEY) :", base64.b64encode(pub).decode())
        return
    if len(argv) >= 3 and argv[0] == "sign":
        exe, version = argv[1], argv[2]
        secret = os.environ.get("UPDATE_SIGNING_KEY", "")
        if "--key" in argv:
            secret = Path(argv[argv.index("--key") + 1]).read_text(encoding="ascii")
        if not secret.strip():
            sys.exit("Clé privée absente (variable UPDATE_SIGNING_KEY ou --key).")
        key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(secret.strip(), validate=True))
        print(base64.b64encode(key.sign(message(version, sha256_file(exe)))).decode())
        return
    if len(argv) >= 5 and argv[0] == "verify":
        exe, version, sig_file, pub = argv[1:5]
        Ed25519PublicKey.from_public_bytes(base64.b64decode(pub, validate=True)).verify(
            base64.b64decode(Path(sig_file).read_text(encoding="ascii").strip(), validate=True), message(version, sha256_file(exe)))
        print("Signature valide.")
        return
    sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
