# LiveKit Cloud builds & runs this — the agent runs on LiveKit's infra, NOT your PC.
FROM node:22-slim

# LiveKit agents / silero VAD need a few native bits.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build
# Pre-download model files (Silero VAD) into the image.
RUN node dist/agent.js download-files

# LiveKit dispatches jobs to this worker; it registers as agent "afiyetsesli".
CMD ["node", "dist/agent.js", "start"]
