# syntax=docker/dockerfile:1

# --- Construction ------------------------------------------------------------
# better-sqlite3 et @node-rs/argon2 sont natifs : l'image de construction a
# besoin d'une chaîne de compilation, l'image finale non.
FROM node:24-bookworm-slim AS build

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Exécution ---------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

# gosu abandonne les privilèges proprement : l'entrypoint a besoin de root pour
# ajuster GID et volumes, l'application ne doit jamais l'être. `su` laisserait
# un processus intermédiaire et casserait la propagation des signaux, donc
# `docker stop` n'arriverait pas jusqu'à Node.
RUN apt-get update \
 && apt-get install -y --no-install-recommends gosu \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NITRO_PORT=3000 \
    NITRO_HOST=0.0.0.0 \
    NUXT_DATA_ROOT=/srv/gameservers \
    NUXT_DB_PATH=/app/data/minemanager.db \
    NUXT_DOCKER_SOCKET=/var/run/docker.sock

WORKDIR /app

# Nitro trace les modules natifs dans .output : ils sont déjà compilés pour
# cette même base, inutile de réinstaller quoi que ce soit ici.
COPY --from=build /app/.output ./.output
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /app/data && chown -R node:node /app

VOLUME ["/app/data"]
EXPOSE 3000

# L'état d'authentification est la seule route publique : elle touche la base
# sans exiger de session, donc elle échoue si SQLite est inaccessible.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/auth/state').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# L'entrypoint tourne en root le temps de régler le GID du socket Docker et les
# droits des volumes, puis passe la main à `node` via gosu.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
