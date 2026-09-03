# ---------------------------------------------------------------------------
# Multistage. The build toolchain — Node, pnpm, TypeScript, ~400 MB of
# node_modules — exists only in the first stage. What ships is static files and
# a web server, because a production image containing a compiler is a production
# image containing an attacker's toolchain.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS build

# corepack pins the package manager to the version in package.json, so the build
# does not silently change behaviour when a newer pnpm is released.
RUN corepack enable

WORKDIR /src

# Manifests first. Docker caches this layer, so editing a component does not
# reinstall every dependency — which is the difference between a 4-second
# rebuild and a 90-second one.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# Type errors fail the build. A frontend that compiles but does not typecheck is
# one where the types have quietly stopped meaning anything.
RUN pnpm build


FROM nginx:1.27-alpine AS runtime

# Runs as an existing unprivileged user. nginx's own directories have to be
# writable by it, and the stock image assumes root for those.
RUN adduser -u 64198 -D -H orbit \
 && mkdir -p /var/cache/nginx /var/run /etc/nginx/conf.d \
 && chown -R 64198:64198 /var/cache/nginx /var/run /etc/nginx/conf.d /usr/share/nginx/html

# A template, not a finished config. The stock nginx image runs envsubst over
# /etc/nginx/templates at startup, which is how the gateway URL gets in — nginx
# does not expand environment variables in a plain conf file, and a config that
# looks parameterised but is not proxies to the literal string "${VAR}".
COPY --chown=64198:64198 nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build --chown=64198:64198 /src/dist /usr/share/nginx/html

USER 64198

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

# The image's own entrypoint runs the template substitution before starting nginx.
# Only ORBIT_GATEWAY_URL is substituted. Without this list envsubst would also eat
# $host, $scheme and $uri, which are nginx's own runtime variables — the proxy would
# then forward an empty Host header to every upstream.
ENV NGINX_ENVSUBST_FILTER=ORBIT_GATEWAY_URL
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d

CMD ["nginx", "-g", "daemon off;"]
