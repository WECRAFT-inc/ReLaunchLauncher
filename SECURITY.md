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

## Vérifier l'exe

Chaque release contient `WeCraft.exe.sha256`. Comparez cette empreinte avec celle
de votre fichier téléchargé (`Get-FileHash WeCraft.exe -Algorithm SHA256` dans PowerShell).
