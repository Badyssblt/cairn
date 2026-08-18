#!/bin/sh
set -e

# Trois choses ne peuvent pas être décidées au moment du build : le secret de
# session, le GID du groupe `docker` de l'hôte, et le propriétaire des volumes.
# Les laisser à l'utilisateur, c'est trois variables à renseigner avant le
# premier démarrage. On les résout ici, pour qu'un `docker run` nu suffise.
#
# Ce script tourne en root et rend la main à `node` : rien de ce qui suit ne
# doit être fait par l'application elle-même.

DATA_DIR=/app/data
DATA_ROOT="${NUXT_DATA_ROOT:-/srv/gameservers}"
SOCKET="${NUXT_DOCKER_SOCKET:-/var/run/docker.sock}"

# --- Secret de session -------------------------------------------------------
# Généré une fois et gardé dans le volume de données. Le régénérer à chaque
# démarrage déconnecterait tout le monde à chaque redéploiement ; le mettre
# dans l'image le rendrait identique chez tous ceux qui la téléchargent.
if [ -z "$NUXT_SESSION_SECRET" ]; then
  secret_file="$DATA_DIR/session-secret"
  mkdir -p "$DATA_DIR"

  if [ ! -s "$secret_file" ]; then
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$secret_file"
    chmod 600 "$secret_file"
    echo "[cairn] Secret de session généré dans $secret_file"
  fi

  NUXT_SESSION_SECRET=$(cat "$secret_file")
  export NUXT_SESSION_SECRET
fi

# --- Accès au démon Docker ---------------------------------------------------
# Le socket appartient au groupe `docker` de l'hôte, dont le GID varie d'une
# machine à l'autre (999 sur Debian, 998 sur Arch, 1001 ailleurs). On lit le
# GID réel du socket monté plutôt que de le faire deviner à l'utilisateur.
if [ -S "$SOCKET" ]; then
  sock_gid=$(stat -c '%g' "$SOCKET")
  group=$(getent group "$sock_gid" | cut -d: -f1)

  if [ -z "$group" ]; then
    group=dockerhost
    groupadd -g "$sock_gid" "$group"
  fi

  usermod -aG "$group" node
  echo "[cairn] Socket Docker accessible via le groupe $group ($sock_gid)"
else
  echo "[cairn] ATTENTION : $SOCKET absent. Le panneau ne pourra piloter aucun"
  echo "                   serveur. Monte le socket : -v $SOCKET:$SOCKET"
fi

# --- Volumes -----------------------------------------------------------------
# Un volume créé par Docker appartient à root. `node` doit pouvoir y écrire la
# base, et créer un sous-dossier par serveur sous la racine de données.
chown -R node:node "$DATA_DIR"

mkdir -p "$DATA_ROOT"
# Non récursif, volontairement : les dossiers de serveurs déjà présents
# appartiennent aux conteneurs de jeu qui les ont écrits, et les leur reprendre
# casserait les serveurs existants. Seule la racine doit être traversable.
chown node:node "$DATA_ROOT" 2>/dev/null || true

if ! su node -s /bin/sh -c "test -w '$DATA_ROOT'"; then
  echo "[cairn] ATTENTION : $DATA_ROOT n'est pas accessible en écriture pour"
  echo "                   l'utilisateur du panneau. La création de serveurs échouera."
fi

exec gosu node "$@"
