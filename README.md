# tw-localllm-orchestrator

> **AplUSAndmINUS Local LLM Orchestration System** — A self-hosted, privacy-first AI inference platform routing requests across LM Studio, Ollama, XTTS, ONNX Runtime, and ChromaDB via an Express.js orchestrator on a private Tailscale mesh network.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Services & Runtimes](#services--runtimes)
  - [Express.js Orchestrator](#expressjs-orchestrator)
  - [LM Studio — Manual Heavy-Model Runtime](#lm-studio--manual-heavy-model-runtime)
  - [Ollama — Hot-Swap Runtime](#ollama--hot-swap-runtime)
  - [XTTS — Text-to-Speech Service](#xtts--text-to-speech-service)
  - [ONNX Runtime — Inference Service](#onnx-runtime--inference-service)
  - [ChromaDB — Vector Store](#chromadb--vector-store)
- [Tailscale Network & Endpoints](#tailscale-network--endpoints)
- [Routing Logic](#routing-logic)
- [Agent Profiles](#agent-profiles)
- [Configuration Files](#configuration-files)
- [Directory Structure](#directory-structure)
- [Setup & Installation](#setup--installation)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Overview

`tw-localllm-orchestrator` is the central intelligence hub for the **TW Local LLM Orchestration System** — a fully on-premises, air-gappable AI stack designed for privacy, low latency, and flexible model routing. All inference, speech synthesis, embedding, and retrieval-augmented generation (RAG) workloads run on your own hardware, reachable securely across a Tailscale private mesh.

**Key design principles:**

- **Zero cloud dependency** — no data leaves the TW mesh
- **Tiered model routing** — lightweight queries go to Ollama; heavy/complex tasks route to LM Studio
- **Hot-swap capable** — Ollama models can be pulled and swapped at runtime without service restart
- **Composable agents** — named agent profiles combine model, system prompt, voice, and retrieval context
- **Single entry point** — all clients speak to the Express.js orchestrator; backend topology is invisible to consumers

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        TW Tailscale Mesh                              │
│                                                                          │
│  Clients (Web UI, CLI, Automations)                                      │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────────────┐                                             │
│  │  Express.js Orchestrator │  ← tw-localllm-orchestrator (this repo)   │
│  │  (Node.js, port 3200)   │                                             │
│  └──────────┬──────────────┘                                             │
│             │                                                            │
│    ┌────────┼────────────────────────────────┐                           │
│    │        │                                │                           │
│    ▼        ▼                                ▼                           │
│  ┌──────┐ ┌────────────────┐  ┌─────────────────────────────────────┐   │
│  │Ollama│ │   LM Studio    │  │         Docker Services              │   │
│  │:11434│ │ (manual start) │  │  ┌──────────┐ ┌──────┐ ┌─────────┐ │   │
│  │      │ │   :1234        │  │  │  XTTS    │ │ ONNX │ │ChromaDB │ │   │
│  │ hot- │ │  heavy models  │  │  │  :5002   │ │:8001 │ │  :8000  │ │   │
│  │ swap │ │  (manual load) │  │  └──────────┘ └──────┘ └─────────┘ │   │
│  └──────┘ └────────────────┘  └─────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Client** sends a request to the orchestrator (`POST /v1/chat`, `/v1/tts`, `/v1/embed`, etc.)
2. **Orchestrator** resolves the agent profile and applies routing rules
3. Request is forwarded to the appropriate backend (Ollama, LM Studio, XTTS, ONNX, or ChromaDB)
4. If RAG is enabled for the agent, ChromaDB is queried first to inject relevant context
5. Response is normalized and returned to the client in a consistent schema

---

## Services & Runtimes

### Express.js Orchestrator

The orchestrator is the sole client-facing component. It handles:

| Responsibility | Details |
|---|---|
| Request intake | REST endpoints on port `3200` |
| Agent resolution | Looks up profile from `agents/` config |
| Route selection | Applies routing rules (model type, load, capability) |
| RAG injection | Queries ChromaDB and prepends context chunks |
| Response normalization | Unified response schema regardless of backend |
| Health aggregation | `/health` endpoint polls all backends |
| Streaming | Server-Sent Events (SSE) passthrough for streaming completions |

**Core dependencies:**

```json
{
  "express": "^4.x",
  "axios": "^1.x",
  "chromadb": "^1.x",
  "dotenv": "^16.x",
  "morgan": "^1.x",
  "express-rate-limit": "^7.x"
}
```

**Entry point:** `src/server.js`

**Primary API endpoints:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/chat` | Chat completion (streaming or blocking) |
| `POST` | `/v1/complete` | Raw text completion |
| `POST` | `/v1/embed` | Text embedding via ONNX or Ollama |
| `POST` | `/v1/tts` | Text-to-speech via XTTS |
| `POST` | `/v1/rag/query` | RAG-augmented query |
| `POST` | `/v1/rag/ingest` | Ingest document into ChromaDB |
| `GET` | `/health` | Aggregate health of all backends |
| `GET` | `/v1/models` | List available models across all runtimes |
| `GET` | `/v1/agents` | List configured agent profiles |

---

### LM Studio — Manual Heavy-Model Runtime

LM Studio handles **large, quantized models** (e.g., 70B+ parameter models, multimodal models) that require manual loading through its GUI or CLI. This is a **deliberate design choice** — these models consume significant VRAM and are loaded on demand, not always-on.

**Default endpoint:** `http://<tailscale-host>:1234`

**Characteristics:**

- Models are loaded manually via the LM Studio desktop app or `lms` CLI
- Exposes an OpenAI-compatible API (`/v1/chat/completions`, `/v1/completions`)
- The orchestrator polls `/v1/models` to detect when a model is active
- If no model is loaded, orchestrator returns a `503 Service Unavailable` with a descriptive message
- Suitable for: long-context reasoning, code generation, multimodal tasks

**Orchestrator behavior when LM Studio has no model loaded:**

```json
{
  "error": "lmstudio_unavailable",
  "message": "No model is currently loaded in LM Studio. Please load a model manually.",
  "fallback": "ollama"
}
```

If `routing.lmstudio.allow_fallback` is `true` in config, the orchestrator will automatically downgrade the request to Ollama.

**Supported model families (examples):**

- `Llama-3.3-70B-Instruct` (GGUF Q4/Q5)
- `Qwen2.5-72B-Instruct`
- `Mistral-Large`
- `LLaVA` / `BakLLaVA` (multimodal)

---

### Ollama — Hot-Swap Runtime

Ollama serves as the **always-on, hot-swap** inference backend for lightweight to mid-size models. It runs as a system service and supports pulling, running, and switching models at runtime via API.

**Default endpoint:** `http://<tailscale-host>:11434`

**Characteristics:**

- Always running; models are pulled on first use or pre-staged
- Exposes a native Ollama API and an OpenAI-compatible shim at `/v1/`
- Models are hot-swapped by specifying the model name in the request — no restart required
- GPU layers are automatically managed; CPU fallback is supported
- Suitable for: fast chat, summarization, classification, embeddings, always-on agents

**Managing models via orchestrator:**

```bash
# List available models
GET /v1/models?runtime=ollama

# Pull a new model (async, streamed progress)
POST /v1/runtime/ollama/pull
{ "model": "llama3.2:3b" }

# Delete a model
DELETE /v1/runtime/ollama/model/:name
```

**Recommended always-available models:**

| Model | Use Case | Size |
|---|---|---|
| `llama3.2:3b` | Fast chat; routing decisions | ~2 GB |
| `mistral:7b` | General reasoning; summarization | ~4 GB |
| `nomic-embed-text` | Text embeddings (RAG) | ~274 MB |
| `phi4:14b` | Code; structured output | ~9 GB |
| `qwen2.5-coder:7b` | Code completion | ~5 GB |

---

### XTTS — Text-to-Speech Service

XTTS (Coqui XTTS-v2) provides high-quality, cloneable neural text-to-speech. It runs as a **Docker container** on the TW host.

**Default endpoint:** `http://<tailscale-host>:5002`

**Docker service name:** `xtts`

**Capabilities:**

- Multi-lingual TTS (17+ languages)
- Speaker voice cloning from a short audio reference clip
- Streaming audio output (WAV chunks)
- Per-agent voice profiles stored in `config/voices/`

**Orchestrator TTS endpoint:**

```http
POST /v1/tts
Content-Type: application/json

{
  "text": "Hello, this is the TW assistant.",
  "agent": "aplus-assistant",
  "language": "en",
  "stream": true
}
```

**Voice reference files** are mapped at container startup:

```yaml
# docker-compose.yml excerpt
volumes:
  - ./config/voices:/app/voices:ro
```

**Speaker reference naming convention:**

```
config/voices/<agent-id>/<speaker-name>.wav
```

---

### ONNX Runtime — Inference Service

ONNX Runtime handles **specialized, optimized inference workloads** — primarily fast embedding generation and classification tasks — using exported ONNX model files.

**Default endpoint:** `http://<tailscale-host>:8001`

**Docker service name:** `onnx-runtime`

**Primary use cases:**

| Task | Model Example |
|---|---|
| Sentence embeddings | `all-MiniLM-L6-v2` (ONNX export) |
| Cross-encoder reranking | `ms-marco-MiniLM-L-6-v2` |
| NER / classification | Custom fine-tuned ONNX models |

**Orchestrator embedding endpoint:**

```http
POST /v1/embed
Content-Type: application/json

{
  "input": ["chunk of text to embed"],
  "model": "all-MiniLM-L6-v2",
  "runtime": "onnx"
}
```

ONNX models are stored in and served from `models/onnx/`. The container mounts this directory read-only at startup.

---

### ChromaDB — Vector Store

ChromaDB is the **persistent vector database** powering all RAG workflows. It stores document embeddings and metadata, and is queried by the orchestrator before each RAG-enabled agent response.

**Default endpoint:** `http://<tailscale-host>:8000`

**Docker service name:** `chromadb`

**Collections naming convention:**

```
<agent-id>_<namespace>
# Examples:
aplus-assistant_docs
aplus-coder_codebase
aplus-assistant_meetings
```

**Ingesting a document:**

```http
POST /v1/rag/ingest
Content-Type: application/json

{
  "agent": "aplus-assistant",
  "namespace": "docs",
  "source": "project-notes.pdf",
  "content": "...",
  "chunk_size": 512,
  "chunk_overlap": 64
}
```

**ChromaDB data persistence:** The Docker volume `chromadb_data` is mounted to `./data/chromadb` on the host for durable storage across container restarts.

---

## Tailscale Network & Endpoints

All services communicate over a **private Tailscale mesh network (aplus)**. No service port is exposed to the public internet. Tailscale MagicDNS provides stable hostnames.

| Host Alias | Tailscale Hostname | Role |
|---|---|---|
| `aplus-main` | `aplus-main.tail<id>.ts.net` | Primary GPU host; LM Studio + Ollama + Docker services |
| `aplus-relay` | `aplus-relay.tail<id>.ts.net` | Relay/secondary node; orchestrator can run here |
| `aplus-client` | `aplus-client.tail<id>.ts.net` | Client machines (UI, CLI tools) |

**Service endpoint map (resolved via Tailscale DNS):**

```
Orchestrator   →  http://aplus-main:3200
LM Studio      →  http://aplus-main:1234
Ollama         →  http://aplus-main:11434
XTTS           →  http://aplus-main:5002
ONNX Runtime   →  http://aplus-main:8001
ChromaDB       →  http://aplus-main:8000
```

**Firewall / ACL policy (Tailscale ACL excerpt):**

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:aplus-client"],
      "dst": ["tag:aplus-main:3200"]
    },
    {
      "action": "accept",
      "src": ["tag:aplus-main"],
      "dst": ["tag:aplus-main:1234", "tag:aplus-main:11434",
               "tag:aplus-main:5002", "tag:aplus-main:8000",
               "tag:aplus-main:8001"]
    }
  ]
}
```

> **Note:** Clients should only ever connect to port `3200` (the orchestrator). Direct access to backend ports is restricted to the orchestrator host via Tailscale ACLs.

---

## Routing Logic

The orchestrator applies a multi-pass routing decision tree to determine which backend handles each request.

### Decision Tree

```
Incoming Request
       │
       ▼
1. Resolve Agent Profile
       │
       ├─ Agent specifies `runtime: lmstudio`  ──► Check LM Studio health
       │                                             ├─ Model loaded? ──► Route to LM Studio
       │                                             └─ No model?  ──► fallback_to_ollama?
       │                                                                 ├─ yes ──► Route to Ollama
       │                                                                 └─ no  ──► 503
       │
       ├─ Agent specifies `runtime: ollama`    ──► Route to Ollama
       │
       ├─ Agent specifies `runtime: auto`      ──► Apply auto-routing rules (see below)
       │
       └─ No agent specified                  ──► Use default agent profile
```

### Auto-Routing Rules (`runtime: auto`)

| Condition | Selected Backend |
|---|---|
| `estimated_tokens > 8192` | LM Studio (if available) |
| `task_type: code` | LM Studio preferred; Ollama fallback |
| `task_type: embedding` | ONNX Runtime (fast); Ollama fallback |
| `task_type: tts` | XTTS |
| `rag_enabled: true` | ChromaDB query → then model backend |
| LM Studio unavailable | Ollama |
| Ollama model not pulled | Pull triggered async; queue request |

### Routing Configuration (`config/routing.yaml`)

```yaml
routing:
  default_runtime: auto
  lmstudio:
    host: http://aplus-main:1234
    allow_fallback: true
    health_poll_interval_ms: 10000
  ollama:
    host: http://aplus-main:11434
    default_model: mistral:7b
    pull_on_miss: true
  token_threshold_for_heavy: 8192
  task_routing:
    code: lmstudio
    embedding: onnx
    tts: xtts
    chat: auto
    summarize: ollama
```

---

## Agent Profiles

Agent profiles define the complete persona, capability set, and backend configuration for a named AI agent. They live in `config/agents/` as individual YAML files.

### Profile Schema

```yaml
# config/agents/<agent-id>.yaml
id: aplus-assistant
name: APlus Assistant
description: General-purpose assistant for the TW home network

model:
  runtime: auto                    # auto | ollama | lmstudio | onnx
  preferred: llama3.2:3b           # preferred model name
  fallback: mistral:7b             # fallback if preferred unavailable
  lmstudio_model: Llama-3.3-70B-Instruct-Q4_K_M.gguf

system_prompt: |
  You are the TW assistant — a helpful, concise AI running entirely
  on local hardware. You have access to network documentation, notes,
  and project files. Never fabricate facts; say "I don't know" if unsure.

context_window: 8192
temperature: 0.7
top_p: 0.9
max_tokens: 2048

rag:
  enabled: true
  collection: aplus-assistant_docs
  top_k: 5
  score_threshold: 0.72
  embed_runtime: onnx              # onnx | ollama

tts:
  enabled: true
  voice_ref: config/voices/aplus-assistant/default.wav
  language: en

stream: true
```

### Built-in Agent Profiles

| Agent ID | Purpose | Runtime | RAG | TTS |
|---|---|---|---|---|
| `aplus-assistant` | General home network assistant | auto | ✅ | ✅ |
| `aplus-coder` | Code generation and review | lmstudio | ✅ | ❌ |
| `aplus-summarizer` | Document and meeting summarization | ollama | ❌ | ❌ |
| `aplus-voice` | Voice-first conversational agent | auto | ✅ | ✅ |
| `aplus-rag-only` | Pure retrieval — no generation | onnx | ✅ | ❌ |

---

## Configuration Files

```
config/
├── routing.yaml          # Backend routing rules and thresholds
├── server.yaml           # Orchestrator server settings (port, rate limits, auth)
├── docker.yaml           # Docker service definitions reference
├── agents/               # One YAML file per agent profile
│   ├── aplus-assistant.yaml
│   ├── aplus-coder.yaml
│   ├── aplus-summarizer.yaml
│   ├── aplus-voice.yaml
│   └── aplus-rag-only.yaml
└── voices/               # XTTS speaker reference audio files
    └── aplus-assistant/
        └── default.wav
```

### `config/server.yaml`

```yaml
server:
  port: 3200
  host: 0.0.0.0
  log_level: info           # debug | info | warn | error
  request_timeout_ms: 120000

auth:
  enabled: true
  type: bearer              # bearer | none
  token_env: ORCHESTRATOR_API_KEY

rate_limit:
  enabled: true
  window_ms: 60000
  max_requests: 120

cors:
  enabled: true
  allowed_origins:
    - http://aplus-main:3200
    - http://aplus-client
```

### `.env`

```env
# Orchestrator
ORCHESTRATOR_API_KEY=your-secret-key-here
PORT=3200

# LM Studio
LMSTUDIO_HOST=http://aplus-main:1234

# Ollama
OLLAMA_HOST=http://aplus-main:11434
OLLAMA_DEFAULT_MODEL=mistral:7b

# XTTS
XTTS_HOST=http://aplus-main:5002

# ONNX Runtime
ONNX_HOST=http://aplus-main:8001

# ChromaDB
CHROMA_HOST=http://aplus-main:8000
CHROMA_TENANT=default_tenant
CHROMA_DATABASE=default_database

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

> **Security:** Never commit `.env` to version control. A `.env.example` is provided with all keys and empty values.

---

## Directory Structure

```text
tw-localllm-orchestrator/
├── src/
│   ├── server.js               # Express app entry point
│   ├── router.js               # Main request router
│   ├── middleware/
│   │   ├── auth.js             # Bearer token authentication
│   │   ├── rateLimiter.js      # Rate limiting middleware
│   │   └── logger.js           # Request logging (Morgan)
│   ├── services/
│   │   ├── lmstudio.js         # LM Studio API client
│   │   ├── ollama.js           # Ollama API client
│   │   ├── xtts.js             # XTTS API client
│   │   ├── onnx.js             # ONNX Runtime API client
│   │   └── chroma.js           # ChromaDB client (RAG)
│   ├── agents/
│   │   ├── loader.js           # Agent profile loader and validator
│   │   └── resolver.js         # Agent selection logic
│   ├── routing/
│   │   ├── rules.js            # Routing rule engine
│   │   └── health.js           # Backend health checker
│   └── utils/
│       ├── tokenEstimator.js   # Rough token count estimator
│       ├── chunker.js          # Text chunking for RAG ingestion
│       └── streamBridge.js     # SSE streaming passthrough
├── config/
│   ├── routing.yaml
│   ├── server.yaml
│   ├── agents/
│   └── voices/
├── models/
│   └── onnx/                   # ONNX model files (gitignored, large)
├── data/
│   └── chromadb/               # ChromaDB persistent volume (gitignored)
├── docker/
│   ├── docker-compose.yml      # ChromaDB, XTTS, ONNX Runtime
│   ├── xtts/
│   │   └── Dockerfile
│   └── onnx/
│       └── Dockerfile
├── scripts/
│   ├── pull-models.sh          # Pull recommended Ollama models
│   ├── healthcheck.sh          # Check all backend endpoints
│   └── ingest-docs.sh          # Batch ingest documents into ChromaDB
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

---

## Setup & Installation

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.x | LTS recommended |
| Docker + Docker Compose | ≥ 24.x | For XTTS, ONNX, ChromaDB |
| Ollama | Latest | Install from ollama.com |
| LM Studio | Latest | Install from lmstudio.ai |
| Tailscale | Latest | TW mesh must be active |

### Step 1 — Clone the Repository

```bash
git clone https://github.com/<your-org>/tw-localllm-orchestrator.git
cd tw-localllm-orchestrator
```

### Step 2 — Install Node.js Dependencies

```bash
npm install
```

### Step 3 — Configure Environment

```bash
cp .env.example .env
# Edit .env with your Tailscale hostnames, API keys, and preferred models
nano .env
```

### Step 4 — Start Docker Services (ChromaDB, XTTS, ONNX Runtime)

```bash
cd docker
docker compose up -d
cd ..

# Verify services are up
docker compose -f docker/docker-compose.yml ps
```

**`docker/docker-compose.yml`:**

```yaml
version: "3.9"

services:
  chromadb:
    image: chromadb/chroma:latest
    container_name: chromadb
    ports:
      - "8000:8000"
    volumes:
      - ../data/chromadb:/chroma/chroma
    environment:
      IS_PERSISTENT: "TRUE"
      ANONYMIZED_TELEMETRY: "FALSE"
    restart: unless-stopped

  xtts:
    build: ./xtts
    container_name: xtts
    ports:
      - "5002:5002"
    volumes:
      - ../config/voices:/app/voices:ro
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
    restart: unless-stopped

  onnx-runtime:
    build: ./onnx
    container_name: onnx-runtime
    ports:
      - "8001:8001"
    volumes:
      - ../models/onnx:/app/models:ro
    restart: unless-stopped

networks:
  default:
    name: aplus-local
```

### Step 5 — Start Ollama and Pull Models

```bash
# Ensure Ollama service is running
ollama serve &

# Pull recommended models
bash scripts/pull-models.sh
```

**`scripts/pull-models.sh`:**

```bash
#!/usr/bin/env bash
set -e
echo "Pulling recommended TW Ollama models..."
ollama pull llama3.2:3b
ollama pull mistral:7b
ollama pull nomic-embed-text
ollama pull phi4:14b
ollama pull qwen2.5-coder:7b
echo "Done."
```

### Step 6 — Start LM Studio (Manual)

1. Open LM Studio on the GPU host
2. Navigate to the **Local Server** tab
3. Select your preferred heavy model (e.g., `Llama-3.3-70B-Instruct-Q4_K_M`)
4. Click **Start Server** — LM Studio will listen on port `1234`

> LM Studio does **not** need to be running for the orchestrator to start. Requests requiring LM Studio will fall back to Ollama based on `routing.yaml` settings.

### Step 7 — Start the Orchestrator

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The orchestrator starts on port `3200` and performs an initial health check of all configured backends.

### Step 8 — Verify the Installation

```bash
bash scripts/healthcheck.sh
```

Expected output:

```
[✓] Orchestrator    http://aplus-main:3200  — OK
[✓] Ollama          http://aplus-main:11434 — OK (5 models loaded)
[~] LM Studio       http://aplus-main:1234  — No model loaded (optional)
[✓] XTTS            http://aplus-main:5002  — OK
[✓] ONNX Runtime    http://aplus-main:8001  — OK
[✓] ChromaDB        http://aplus-main:8000  — OK (3 collections)
```

### Step 9 — Ingest Documents (Optional)

```bash
bash scripts/ingest-docs.sh --agent aplus-assistant --namespace docs --dir ./my-docs/
```

---

## Usage Examples

### Chat with Default Agent

```bash
curl -s -X POST http://aplus-main:3200/v1/chat \
  -H "Authorization: Bearer $ORCHESTRATOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "aplus-assistant",
    "messages": [
      {"role": "user", "content": "Summarize our last network maintenance notes."}
    ],
    "stream": false
  }'
```

### Streaming Chat Response

```bash
curl -N -X POST http://aplus-main:3200/v1/chat \
  -H "Authorization: Bearer $ORCHESTRATOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "aplus-coder",
    "messages": [
      {"role": "user", "content": "Write a Python script to monitor disk usage."}
    ],
    "stream": true
  }'
```

### Text-to-Speech

```bash
curl -X POST http://aplus-main:3200/v1/tts \
  -H "Authorization: Bearer $ORCHESTRATOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "aplus-voice",
    "text": "All systems are operating normally.",
    "stream": false
  }' --output response.wav
```

### Generate Embeddings

```bash
curl -X POST http://aplus-main:3200/v1/embed \
  -H "Authorization: Bearer $ORCHESTRATOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": ["TW orchestrator setup guide"],
    "runtime": "onnx"
  }'
```

### RAG-Augmented Query

```bash
curl -X POST http://aplus-main:3200/v1/rag/query \
  -H "Authorization: Bearer $ORCHESTRATOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "aplus-assistant",
    "namespace": "docs",
    "query": "What is the Tailscale ACL policy for aplus-client?",
    "top_k": 5
  }'
```

### Check System Health

```bash
curl http://aplus-main:3200/health \
  -H "Authorization: Bearer $ORCHESTRATOR_API_KEY"
```

---

## Troubleshooting

### Orchestrator Cannot Reach Ollama

```
Error: connect ECONNREFUSED aplus-main:11434
```

- Verify Ollama is running: `ollama list`
- Check Tailscale connectivity: `tailscale ping aplus-main`
- Ensure `OLLAMA_HOST` in `.env` uses the correct Tailscale hostname

### LM Studio Returns 503

- LM Studio does not have a model loaded — open LM Studio and start the server with a model
- If `allow_fallback: true` is set in `config/routing.yaml`, requests will route to Ollama automatically

### XTTS Container Not Starting

```bash
docker logs xtts
```

- GPU passthrough may not be configured; remove the `deploy.resources` section in `docker-compose.yml` for CPU-only mode
- Voice reference file must exist at `config/voices/<agent-id>/default.wav`

### ChromaDB Collection Not Found

```
ValueError: Collection aplus-assistant_docs does not exist.
```

- Run the ingest script first: `bash scripts/ingest-docs.sh`
- Or trigger ingestion via API: `POST /v1/rag/ingest` with initial content

### Rate Limit Exceeded

```json
{ "error": "Too many requests", "retryAfter": 60 }
```

- Increase `rate_limit.max_requests` in `config/server.yaml`
- Implement client-side retry with exponential backoff

### Slow Response Times

- Confirm ONNX Runtime is handling embeddings — set `embed_runtime: onnx` in the agent profile
- Reduce `top_k` in RAG settings to retrieve fewer chunks
- Verify GPU acceleration is active for Ollama: `ollama ps`

---

## Contributing

This is an internal @AplUSAndmINUS project. To propose changes:

1. Create a feature branch: `git checkout -b feature/your-change`
2. Make your changes and test locally with `npm run dev`
3. Run the health check script to confirm no regressions: `bash scripts/healthcheck.sh`
4. Submit a pull request with a clear description of the change and any updated configuration schema

---

*AplUSAndmINUS Local LLM Orchestration System — all inference, all local, all the time.*
