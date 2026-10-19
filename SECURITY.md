# Security Policy
# Politique de sécurité

## Versions supportées

Seule la **dernière release** de WeCraft reçoit les correctifs de sécurité.
Mettez à jour depuis l'onglet « Releases » (ou via la mise à jour intégrée au launcher).

| Version              | Supportée          |
| -------------------- | ------------------ |
| Dernière release     | :white_check_mark: |
| Versions précédentes | :x:                |

## Signaler une vulnérabilité

Merci de **ne pas ouvrir d'issue publique** pour un problème de sécurité.

Utilisez le signalement privé de GitHub : onglet **Security** du dépôt,
puis **Report a vulnerability**.

Je répondrai dès que possible. Si la faille est confirmée, un correctif sera
publié dans une nouvelle release et vous serez crédité si vous le souhaitez.
Si elle n'est pas retenue, je vous expliquerai pourquoi.

## Ce que vérifie la mise à jour intégrée

1. **Empreinte SHA-256** : le fichier téléchargé doit correspondre exactement à celui de la release.
   Cela détecte un fichier abîmé, mais **ne prouve pas à lui seul** qui l'a publié (l'empreinte vient
   de la même release).
2. **Signature Ed25519** (`WeCraft.exe.sig`), à partir des versions qui contiennent la clé publique
   de WeCraft : elle prouve que l'exe a été signé par l'auteur de WeCraft. Une mise à jour non signée
   ou mal signée est refusée.
3. **Retour arrière** : l'ancienne version est conservée jusqu'à ce que la nouvelle ait démarré
   correctement ; sinon, WeCraft propose de revenir à l'ancienne au démarrage suivant.

## Vérifier l'exe à la main

Empreinte (PowerShell) :

    Get-FileHash WeCraft.exe -Algorithm SHA256

à comparer avec `WeCraft.exe.sha256`. Pour vérifier aussi la signature (Python + `cryptography`) :

    python tools/sign_release.py verify WeCraft.exe <version> WeCraft.exe.sig <clé publique>

La clé publique est la valeur `UPDATE_PUBLIC_KEY` de `wecraft_launcher.py`.

## Données

WeCraft ne demande, ne lit ni ne stocke jamais vos identifiants Microsoft : la connexion reste
gérée par le launcher officiel. Le statut Discord est désactivé par défaut.
