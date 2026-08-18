# Cairn

Panneau d'administration de serveurs de jeu, auto-hébergé. Chaque serveur est
un conteneur Docker que le panneau crée, surveille et met à jour : Minecraft
(avec modpacks Modrinth et CurseForge), Valheim, Palworld, Factorio,
7 Days to Die, et le reste via LinuxGSM.

Console en direct, gestionnaire de fichiers, sauvegardes, tâches planifiées,
diagnostic de panne et alertes Discord.

## Installation

Il faut Docker, et un dossier sur l'hôte où vivront les serveurs.

```bash
mkdir -p /srv/gameservers
curl -O https://raw.githubusercontent.com/Badyssblt/cairn/main/docker-compose.yml
docker compose up -d
```

Puis ouvre <http://127.0.0.1:3000> et crée le compte administrateur : le
premier écran ne propose que ça, et se ferme dès qu'un compte existe.

Sans compose :

```bash
docker run -d --name cairn --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /srv/gameservers:/srv/gameservers \
  -v cairn-data:/app/data \
  ghcr.io/badyssblt/cairn:latest
```

Rien d'autre à renseigner : le secret de session est généré au premier
démarrage et gardé dans le volume, et le groupe du socket Docker est détecté
à l'exécution.

### Les deux points d'attention

**Le chemin des données doit être identique des deux côtés du montage.** Le
panneau demande au démon Docker de monter `/srv/gameservers/<serveur>` dans
chaque conteneur de jeu, et le démon résout ce chemin sur l'hôte, pas dans le
panneau. Pour utiliser un autre emplacement, change-le partout :

```bash
-v /mnt/jeux:/mnt/jeux -e NUXT_DATA_ROOT=/mnt/jeux
```

**Ne publie pas le port 3000 sur l'extérieur.** Le panneau pilote le démon
Docker de l'hôte, ce qui équivaut à un accès root sur la machine. Le compose
le lie volontairement à `127.0.0.1` : mets un reverse-proxy en HTTPS devant,
ou garde-le derrière un VPN.

## Configuration

Tout se règle depuis `/settings` (adresse publique, webhook Discord, clé
CurseForge, RAM réservée au système). Les variables d'environnement ne servent
qu'aux chemins :

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `NUXT_DATA_ROOT` | `/srv/gameservers` | Racine des dossiers de serveurs, sur l'hôte |
| `NUXT_DB_PATH` | `/app/data/minemanager.db` | Base SQLite du panneau |
| `NUXT_DOCKER_SOCKET` | `/var/run/docker.sock` | Socket du démon Docker |
| `NUXT_SESSION_SECRET` | généré | Signature des sessions (32 caractères minimum) |

## Sauvegarde

Deux choses à copier : `/srv/gameservers` (les serveurs) et le volume
`cairn-data` (base et secret de session).

## Mise à jour

```bash
docker compose pull && docker compose up -d
```

Les migrations de schéma s'appliquent au démarrage. Les serveurs existants ne
sont pas recréés : leurs conteneurs continuent de tourner pendant la mise à
jour du panneau.

## Développement

```bash
npm install
npm run dev
```

Le panneau a besoin du socket Docker et d'une racine de données accessibles en
écriture — copie `.env.example` vers `.env` et ajuste les chemins.

Construire l'image localement :

```bash
docker build -t ghcr.io/badyssblt/cairn:latest .
```
