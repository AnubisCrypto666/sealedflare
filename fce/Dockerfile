# SealedFlare FCE module image.
#
# Reproducibility note: this multi-stage build is deterministic on a given
# machine/Node version, matching the same best-effort guarantee the official
# fce-sign example gives for its Python/TypeScript variants (see
# https://github.com/flare-foundation/fce-sign/blob/main/REPRODUCIBILITY.md) -
# bit-for-bit cross-machine reproducibility would need pinned base image
# digests and normalized file timestamps (SOURCE_DATE_EPOCH), which matters
# for a real FCC deployment's attested code hash but not for SIMULATION mode.
# See README.md "Path to production FCC".

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

ENV FCE_MODE=SIMULATION
ENV FCE_PERSIST_KEY=true
ENV FCE_KEY_PATH=/data/tee-identity.json
ENV PORT=8787

VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "dist/index.js"]
