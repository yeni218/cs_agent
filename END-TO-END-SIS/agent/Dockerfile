# AfiyetSesli agent image — built and run by LiveKit Cloud (`lk agent deploy`).
# Node 24 runs TypeScript directly, so there is no compile step.
FROM node:24-slim AS build
WORKDIR /app

# Install dependencies first so Docker caches them across code changes.
COPY package.json package-lock.json ./
RUN npm ci

# Fetch the Silero VAD model at build time — otherwise the first caller waits
# for the download while the phone is already ringing.
RUN npm run download-files

COPY src ./src
COPY tsconfig.json ./

RUN npm prune --omit=dev

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# TLS root certificates. node:*-slim ships WITHOUT them, which makes
# @livekit/rtc-node fail to connect to the room ("no native root CA
# certificates found") and breaks HTTPS to Supabase/Groq/Inworld. Install them.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Run unprivileged.
RUN useradd --create-home --uid 10001 afiyet
COPY --from=build --chown=afiyet:afiyet /app /app
USER afiyet

# `start` connects out to LiveKit Cloud and waits for calls — no inbound port.
CMD ["npm", "start"]
