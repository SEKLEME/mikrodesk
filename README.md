# MikroDesk

Console de bureau pour administrer un routeur **MikroTik** via son **API RouterOS** :
hotspot, vouchers imprimables, PPP, interfaces, diagnostics réseau, audit de sécurité,
journaux et supervision temps réel.

Interface française, thème sombre animé, fenêtre sans bordure, mode démonstration intégré.

---

## 1. Lancer l'application

### Méthode la plus simple

Double-cliquez sur **`Lancer MikroDesk.cmd`** dans ce dossier.

### Avec un terminal

```powershell
cd "C:\Users\OK\Documents\Projet par défaut\mikrodesk"
npm install      # déjà fait une première fois
npm start
```

La fenêtre MikroDesk s'ouvre. Pour le développement, `npm run dev` ouvre la même fenêtre et
autorise F12 / Ctrl+Maj+I pour les outils de développement.

> Prérequis : Node.js 20+ (testé avec Node 24) et Windows 10/11.

---

## 2. Découvrir sans routeur (mode démo)

1. Sur l'écran de connexion, choisissez l'onglet **« Mode démo »**.
2. Cliquez sur **« Découvrir la démo »**.

Un routeur simulé (14 utilisateurs hotspot, sessions actives, profils, serveurs, hôtes,
liaisons IP, cookies, baux DHCP, secrets PPP, interfaces, journaux) permet de tester tous
les écrans, la génération de vouchers et d'utilisateurs, les diagnostics réseau, l'audit
de sécurité, les modifications et les impressions sans toucher à un vrai équipement.

---

## 3. Connecter un vrai routeur MikroTik

### Activer l'API sur RouterOS

Dans un terminal RouterOS (WinBox → New Terminal) :

```routeros
/ip service enable api
/ip service set api port=8728

# variante chiffrée TLS (recommandée)
/ip service enable api-ssl
/ip service set api-ssl port=8729
```

### Créer un utilisateur dédié

```routeros
/user group add name=mikrodesk policy=read,write,api,test,romon,sensitive
/user add name=mikrodesk group=mikrodesk password="UnMotDePasseFort!"
```

### Restreindre l'accès (recommandé)

```routeros
/ip firewall filter add chain=input protocol=tcp dst-port=8728,8729 \
  src-address=192.168.88.0/24 action=accept comment="API MikroDesk"
/ip firewall filter add chain=input protocol=tcp dst-port=8728,8729 action=drop \
  comment="Bloquer API hors LAN"
```

### Dans MikroDesk

| Champ | Valeur |
|---|---|
| Adresse du routeur | IP du routeur, ex. `192.168.88.1` |
| Utilisateur API | `mikrodesk` (ou `admin`) |
| Mot de passe | celui de l'utilisateur |
| Port API | `8728` (ou `8729` avec **API SSL** activé) |
| Nom du profil | libre, ex. « Bureau principal » |

Cochez **« Enregistrer ce routeur »** pour retrouver la connexion en un clic.
Le mot de passe est chiffré par le coffre Windows (`safeStorage` / DPAPI) et n'est
jamais renvoyé à l'interface.

---

## 4. Fonctionnalités

- **Tableau de bord** : identité, version, uptime, date et heure, jauges CPU / RAM / disque,
  débits temps réel, graphique de trafic (toutes interfaces ou une seule), interfaces,
  activité récente.
- **Hotspot** : création/modification/suppression d'utilisateurs, activation,
  recherche, filtres, pagination, sessions actives et déconnexion forcée, profils.
  Les profils et serveurs sont lus directement sur le routeur ; les valeurs sont validées
  en français avant l'envoi et seuls les champs modifiés sont transmis lors d'une édition.
- **Génération d'utilisateurs** : création séquentielle par lot (préfixe, numérotation,
  mot de passe aléatoire, identique au nom ou commun, profil, durée, quota).
- **Hôtes hotspot** : appareils détectés par le portail captif, trafic, autorisation,
  retrait d'un hôte.
- **Liaisons IP** : règles par adresse MAC (normal, contourné, bloqué), redirection,
  activation/désactivation, création, modification et suppression.
- **Cookies hotspot** : connexions mémorisées, expiration, suppression.
- **Vouchers** : génération par lot (1 à 200), préfixe, longueur identifiant/mot de passe,
  profil, durée, quota, prix, aperçu de tickets, copie, export **CSV** et **impression A4**
  (3 tickets par ligne).
- **Impression rapide** : sélection des comptes hotspot existants et réimpression de leurs
  tickets d'accès.
- **PPP** : secrets PPPoE / L2TP / PPTP / SSTP / OpenVPN, sessions actives, déconnexion.
- **Interfaces** : débits par port, activation/désactivation, MAC, MTU.
- **Baux DHCP** : baux dynamiques et statiques, statut, expiration, filtres, libération.
- **Moniteur de trafic** : débit descendant/montant et volume cumulé, graphique temps réel
  par interface, cartes de synthèse.
- **Rapport d'activité** : synthèse routeur, top consommateurs hotspot, état des interfaces,
  export imprimable A4.
- **Journaux** : filtres par thème (hotspot, PPP, système, interfaces) et recherche.
- **Diagnostic réseau** : ping (latence min/moy/max, perte de paquets) et traceroute
  exécutés **depuis le routeur**, avec validation des cibles (IP ou nom d'hôte).
- **Audit sécurité** : analyse en lecture seule de la version RouterOS, des comptes
  administrateurs, des services exposés (telnet/ftp/www, api/winbox/ssh), du pare-feu
  input, de DNS, SNMP, NTP, de la découverte de voisins, du DDNS cloud, du serveur MAC
  et des sauvegardes. Score sur 100, note A–E et recommandations en français.
- **Sauvegardes** : instantané de configuration `.rsc` capturé depuis le routeur,
  téléchargement, comparaison ligne à ligne avec la configuration active (diff coloré),
  restauration avec instantané de sécurité automatique et sauvegarde `.backup` sur le
  routeur. Conservation des 30 derniers instantanés.
- **Journal d'audit** : historique local des actions sensibles (création, modification,
  suppression, restauration, redémarrage, bascule de routeur, commandes du terminal),
  filtres par statut et export **CSV**.
- **Pare-feu & réseau** : règles filter / NAT / mangle / raw, files d'attente simples,
  VLAN et table de routage — recherche, compteurs de paquets, activation/désactivation
  et suppression, avec validation et journalisation.
- **Alertes** : seuils CPU, mémoire, stockage, température, perte de paquets et
  fréquentation hotspot, cooldown par règle, notifications Windows natives, cloche avec
  compteur de non-lues, historique filtrable et acquittement.
- **Parc multi-routeurs** : liste des routeurs enregistrés, test individuel ou global
  (latence, version, modèle, charge), bascule de session en un clic, comparaison de deux
  routeurs et gestion des erreurs de connexion.
- **Terminal RouterOS** : console sécurisée avec historique local (120 commandes),
  suggestions, rappel clavier ; les commandes `print` / `export` s'exécutent directement,
  toute écriture exige une confirmation explicite et les actions destructives sont
  signalées et auditées. Une seule commande simple par ligne.
- **Paramètres** : intervalle d'actualisation, couleur d'accent, profils enregistrés,
  informations système, redémarrage du routeur.

---

## 5. Construire un exécutable Windows

```powershell
cd "C:\Users\OK\Documents\Projet par défaut\mikrodesk"
npm run dist
```

Les fichiers sont générés dans `release/` :

- `MikroDesk 1.1.0.exe` — version **portable** (aucune installation) ;
- `MikroDesk Setup 1.1.0.exe` — installateur **NSIS** avec raccourci bureau.

Pour un simple dossier décompressé : `npm run pack` → `release/win-unpacked/MikroDesk.exe`.

---

## 6. Données et sécurité

- Profils et préférences : `%APPDATA%\MikroDesk\mikrodesk.json`
- Instantanés de configuration : `%APPDATA%\MikroDesk\backups.json` (30 max)
- Journal d'audit : `%APPDATA%\MikroDesk\audit.json` (800 entrées max)
- Alertes : `%APPDATA%\MikroDesk\alerts.json` (300 max)
- Historique du terminal : `%APPDATA%\MikroDesk\terminal.json` (120 commandes max)
- Mots de passe : préfixe `enc:` (chiffrés Windows). Si le chiffrement système est
  indisponible, repli en `b64:` — visible dans l'interface des paramètres.
- Aucune donnée n'est envoyée vers Internet : tout passe par l'API locale du routeur.
- L'interface tourne avec `contextIsolation` et sans `nodeIntegration` ; seul le pont
  `preload.js` expose les actions autorisées.

---

## 7. Dépannage

| Message | Solution |
|---|---|
| Connexion refusée (ECONNREFUSED) | L'API n'est pas activée ou le port est faux : `IP > Services > api`. |
| Le routeur ne répond pas | Vérifiez l'IP, le pare-feu et que le poste est sur le même réseau. |
| Identifiants refusés | Vérifiez l'utilisateur/mot de passe et le groupe (`read`, `write`, `api`). |
| `input does not match any value of profile` | Le profil ou le serveur n'existe pas sur le routeur. Actualisez la liste puis choisissez une valeur proposée. |
| `input does not match any value of server` | Le serveur hotspot a été supprimé ou renommé. Rechargez l'écran puis sélectionnez « Tous les serveurs » ou un serveur existant. |
| Durée / quota refusé | Utilisez `1d`, `12h`, `1h30m` ou `00:10:00` pour le temps, et `500M`, `1G` ou un nombre d'octets pour les données. |
| Ping ou traceroute indisponible | Ajoutez la stratégie `test` (et `read`) à l'utilisateur API ; certains menus `/tool` sont absents des routeurs anciens. |
| Droits insuffisants | Ajoutez la stratégie `write` (et `sensitive` pour certains champs). |
| Erreur TLS | Utilisez le port 8728 sans SSL, ou 8729 avec SSL. |
| Fenêtre blanche | Lancez `npm start` dans un terminal pour lire l'erreur ; F12 ouvre la console. |

---

MikroDesk 1.1.0 — VTECHGROUP · Electron 45 · node-routeros
"# mikrodesk" 
