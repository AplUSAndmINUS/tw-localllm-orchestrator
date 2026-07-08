# tw-localllm-orchestrator

> A personal, self-hosted LLM orchestrator. A TypeScript/Express server that classifies each request and routes it to the right backend — local (Ollama, LM Studio) or cloud (Azure, Anthropic) — with GPU-aware fallback and on-demand Docker container lifecycle management.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Runtimes](#runtimes)
  - [Ollama — hot-swap local models](#ollama--hot-swap-local-models)
  - [LM Studio — manual heavy models](#lm-studio--manual-heavy-models)
  - [XTTS — text-to-speech / voice cloning](#xtts--text-to-speech--voice-cloning)
  - [ONNX runtime — text embeddings](#onnx-runtime--text-embeddings)
  - [ChromaDB — vector store](#chromadb--vector-store)
  - [Azure AI Speech — advanced TTS/STT + Custom Neural Voice](#azure-ai-speech--advanced-ttsstt--custom-neural-voice)
- [Cloud routing](#cloud-routing)
- [Intent classification and routing](#intent-classification-and-routing)
- [GPU saturation handling](#gpu-saturation-handling)
- [Container lifecycle](#container-lifecycle)
- [Agent & model configuration](#agent--model-configuration)
- [API reference](#api-reference)
- [Directory structure](#directory-structure)
- [Setup](#setup)
- [Usage examples](#usage-examples)
- [Troubleshooting](#troubleshooting)

---

## Overview

This orchestrator sits in front of a mix of local and cloud LLM backends and gives you a single, stable API surface regardless of what's actually serving the request. It runs entirely on one machine (no Tailscale mesh, no multi-node topology) and is designed to be lightweight: the server itself just classifies, routes, and normalizes responses — actual inference always happens in Ollama, LM Studio, a Docker container, or a cloud provider.

**Design principles:**

- **Local-first, cloud when it makes sense** — an entry model classifies every `/v1/chat` request and routes it to a local specialist agent; cloud is only used when explicitly requested or when the local GPU is genuinely saturated
- **Ollama does the hot-swapping** — the orchestrator just calls `ollama.chat(model, ...)` with the right model name; Ollama's own scheduler handles loading/evicting models in VRAM
- **Docker containers start on demand, stop when idle** — XTTS, the embeddings service, and ChromaDB spin up on first use and shut down automatically after a period of inactivity (in-flight requests are protected from being stopped mid-job)
- **Config-driven agent identity** — every agent's model, runtime, and capabilities are read from `src/config/agentProfiles.json`, not hardcoded per-file

---

## Architecture

```
Client
  │
  ▼
Express orchestrator (src/server.ts, port 3200 by default)
  │
  ├─ POST /v1/chat  → entryAgent classifies intent (phi4-mini via Ollama)
  │                     │
  │                     ├─ local agent (reasoning/stats/rag/coding/math/general)
  │                     │     └─ GPU saturated? → try freeing headroom → else escalate to cloud
  │                     └─ image_high / image_low / vision (LM Studio, falls back to Ollama)
  │
  ├─ POST /v1/tts   → XTTS (Docker, local voice synthesis + cloning)
  ├─ POST /v1/stt   → Azure (gpt-4o-transcribe-diarize) — no working local STT exists
  ├─ POST /v1/rag   → ChromaDB query + Ollama generation
  ├─ POST /v1/image → Ollama (imageAgentHigh / imageAgentLow)
  ├─ POST /v1/code  → Ollama (codingAgent)
  ├─ POST /v1/vision→ LM Studio, falls back to Ollama
  └─ POST /v1/cloud → direct dispatch to Azure or Anthropic by cloudIntent
```

Every route follows the same shape: validate input → ensure the required backend/container is running → execute the agent → return a normalized `AgentResponse` (`{ agent, model, intent, runtime, content, tokens, latency_ms, cached }`).

---

## Runtimes

### Ollama — hot-swap local models

Runs as a Docker container (`docker/docker-compose.yml`, service `ollama`), GPU-enabled by default. Handles: intent classification (`phi4-mini:latest`), reasoning fallback, stats fallback, RAG, coding, math, image description, and the LM Studio fallback path for reasoning/vision.

Models are expected to already be pulled locally (`docker exec aplus-ollama ollama pull <model>`) — the orchestrator does **not** pull models on demand; it just calls `ollama.chat(model, ...)` and lets Ollama's own scheduler load/evict models in VRAM as needed.

### LM Studio — manual heavy models

Runs **outside Docker** as a regular desktop app — the orchestrator only talks to its OpenAI-compatible API (`config.endpoints.lmstudio`). Used for `reasoning_heavy`, `stats`, and `vision` when a matching model is loaded. If LM Studio is offline or has the wrong model loaded, these agents automatically fall back to Ollama (using the entry model) — controlled by `APLUS_LMSTUDIO_ALLOW_FALLBACK`.

### XTTS — text-to-speech / voice cloning

Docker container (`ghcr.io/coqui-ai/xtts-streaming-server`), CPU or CUDA image depending on your GPU. Used for local, iterative TTS — including cloning your own voice from a short reference clip.

- Drop a reference clip at `docker/config/voices/<name>.wav`
- Pass `"voiceRef": "<name>"` to `/v1/tts` — the first call clones it via XTTS's `/clone_speaker` and caches the resulting embedding as `<name>.json`; every call after reuses the cache
- Falls back to one of XTTS's 58 built-in studio speakers if no matching local voice is found
- See `docker/config/voices/README.md`

This is the **draft/iteration** voice path. Final-quality narration (e.g. for a finished audiobook) is intended to go through Azure's Custom Neural Voice instead — see [Cloud routing](#cloud-routing).

### ONNX runtime — text embeddings

Docker container, service name `onnx-runtime` (the name predates the current image — it's not literally ONNX Runtime Server, which was discontinued after v1.8 in 2020). Runs [Hugging Face Text Embeddings Inference](https://github.com/huggingface/text-embeddings-inference) serving `sentence-transformers/all-MiniLM-L6-v2`, exposing `POST /embed` and `GET /health`.

### ChromaDB — vector store

Docker container, backs the `/v1/rag` endpoint. Collections are named `<agentId>_<namespace>` (defaults to `default_default` if neither is given). Embeddings are generated by calling the ONNX/TEI service directly (`onnx.embed()`) rather than relying on the ChromaDB client's own embedding function — the JS client wants a separate `chromadb-default-embed` package (which bundles its own local model) to do that automatically, and there's no reason to duplicate an embedding model we already run.

### Azure AI Speech — advanced TTS/STT + Custom Neural Voice

A classic Cognitive Services Speech resource (`src/cloud/azureSpeech.ts`), separate from the Azure OpenAI/Foundry resource above and reached over its own region-keyed REST API (`https://{region}.tts.speech.microsoft.com`, `.stt.speech.microsoft.com`, etc.) rather than the Foundry endpoint style. This is the advanced tier beyond XTTS/gpt-4o-transcribe-diarize — long-form transcription, 725 standard neural voices, and Custom Neural Voice (train a model on your own voice, deploy it, synthesize with it).

Three dedicated routes, separate from `/v1/tts` and `/v1/stt` since those names were already taken by XTTS and the Azure OpenAI transcription deployment respectively:

- `POST /v1/speech/tts` — synthesize with a standard neural voice (`AzureSpeechTTS` agent)
- `POST /v1/speech/stt` — transcribe audio (`AzureSpeechSTT` agent)
- `GET /v1/speech/cnv` — list your Custom Neural Voice projects
- `POST /v1/speech/cnv` — synthesize with a *trained and deployed* custom voice (`{text, deploymentId, voiceName}`) — custom voice synthesis uses a different subdomain (`voice.speech.microsoft.com`, not `tts.`) with the deployment passed as a `?deploymentId=` query param, per Microsoft's docs. This one hasn't been exercised against a real deployment yet since none exists — everything else on this resource has been verified live.

---

## Cloud routing

Cloud is reached two ways: automatically, when the local GPU is saturated and headroom can't be freed (see below), or explicitly via `POST /v1/cloud` with a `cloudIntent`. Both paths go through `cloudAgent.ts`, which resolves a `cloudIntent` to a `{provider, model}` pair:

| `cloudIntent` | Provider | Model | Used for |
|---|---|---|---|
| `mid_reasoning` | Azure | `Phi-4-reasoning` | Mid-tier cloud reasoning |
| `heavy_reasoning` | Azure | `claude-opus-4-8` | High-end cloud reasoning |
| `major_code` | Azure | `claude-opus-4-8` | Heavy coding tasks |
| `cowork` | Azure | `claude-opus-4-8` | Collaborative/agentic work |
| `stt` | Azure | `gpt-4o-transcribe-diarize` | Speech-to-text with speaker diarization |
| `vision` | Azure | `gpt-4o` | Cloud vision |
| `fallback_reasoning` | Azure | `gpt-4.1` | Secondary reasoning fallback |
| `tts` | Azure | `gpt-4o-mini-tts` | Cloud TTS fallback |
| `design` | Anthropic (direct) | `claude-3-sonnet-20250514` | Only reachable via explicit `/v1/cloud` call |
| `creative` | Anthropic (direct) | `claude-3-haiku-20250307` | Only reachable via explicit `/v1/cloud` call |

All three Azure-hosted models (`gpt-4o-transcribe-diarize`, `Phi-4-reasoning`, `claude-opus-4-8`) share one Azure OpenAI/Foundry resource (`AZURE_OPENAI_ENDPOINT`/`AZURE_OPENAI_API_KEY`) — but not one wire protocol. `azure.chat()` calls the unified `{endpoint}/chat/completions` route (model name in the body) for OpenAI and Foundry-catalog models like Phi-4-reasoning. Claude models are detected by name (`isClaudeModel()` in `cloudAgent.ts`) and instead routed to `azure.chatClaude()`, which speaks the *native Anthropic Messages API* on a completely different host (`.services.ai.azure.com/anthropic/v1/messages`, not `.openai.azure.com`) with its own auth header (`x-api-key`) and response shape. Audio (`gpt-4o-transcribe-diarize`) needs yet another shape — the classic per-deployment path on the plain resource root (`/openai/deployments/{model}/audio/transcriptions`) with a specific `api-version`. None of this is guessable from the endpoint URL alone; see [Troubleshooting](#troubleshooting) if you add another Azure model and it 404s.

**Direct Anthropic API access is intentionally not a default path.** The orchestrator never auto-selects it — `design` and `creative` are the only routes that use it, and both are only reached if a caller explicitly asks for that `cloudIntent`. Nothing in intent classification or GPU-saturation fallback resolves to Anthropic.

A **separate** Azure AI Speech resource (classic Cognitive Services Speech, region-keyed REST API — nothing to do with the Foundry endpoint above) handles advanced voice work beyond XTTS: heavy/long-form transcription, 725 standard neural voices, and Custom Neural Voice. See [Azure AI Speech](#azure-ai-speech--advanced-ttsstt--custom-neural-voice) below.

---

## Intent classification and routing

`POST /v1/chat` is the only route that classifies — every other route (`/v1/tts`, `/v1/rag`, `/v1/image`, etc.) is hit directly because the caller already knows what it wants.

1. `entryAgent.classify()` sends the conversation to `phi4-mini:latest` via Ollama with a system prompt listing 12 intents, and gets back `{intent, confidence, reasoning}`.
2. `chat.ts` looks up the matching agent (`reasoningAgent`, `statsAgent`, `ragAgent`, `codingAgent`, `mathAgent`, `imageAgentHigh/Low`, `visionAgent`, `cloudAgent`, or `entryAgent` itself for `general`).
3. For agents that need Ollama (`reasoning_heavy`, `stats`, `rag`, `coding`, `math`, `general`), the orchestrator checks GPU saturation first — see below.
4. The selected agent executes and returns a normalized response, with the classification metadata attached.

Callers can skip classification entirely by passing `agent` or `intent` directly in the request body.

---

## GPU saturation handling

`containerManager.checkGpuStatus()` reads `nvidia-smi` and treats the GPU as saturated if **either** compute utilization **or** VRAM usage crosses `APLUS_GPU_SATURATION_THRESHOLD` (default 90%).

When a chat request needs Ollama and the GPU looks saturated, the orchestrator doesn't immediately give up and go to cloud — it first calls `freeGpuHeadroom()`, which stops the XTTS container **if it's idle** (XTTS is the only other Docker service that competes for GPU memory; the embeddings service and ChromaDB are CPU-only). Only if that isn't enough does the request escalate to cloud, mapped through `INTENT_TO_CLOUD_ROUTE` (e.g. `reasoning_heavy` → `heavy_reasoning`, `coding` → `major_code`, everything else → `mid_reasoning`).

XTTS won't be stopped mid-synthesis — an in-flight request counter (`beginRequest`/`endRequest`) protects long-running jobs (like narrating a full audiobook chapter) from being killed by either this recovery logic or the idle-timeout auto-stop below.

---

## Container lifecycle

`containerManager.ts` manages the four Docker services (`ollama`, `xtts`, `onnx-runtime`, `chromadb`) via `docker compose`:

- **Auto-start**: any route that needs a container calls `ensureRunning(service)`, which starts it if it's not already up and healthy, and waits (`APLUS_CONTAINER_STARTUP_TIMEOUT_MS` / `APLUS_CONTAINER_HEALTH_RETRIES`) for its healthcheck to pass.
- **Auto-stop**: an idle-polling loop stops any container that hasn't been used in `APLUS_CONTAINER_IDLE_TIMEOUT_MS` (default 10 minutes) — skipped for any container with an in-flight request.
- Both are controlled by `APLUS_CONTAINER_AUTO_START` / `APLUS_CONTAINER_AUTO_STOP`.

`GET /v1/containers` and `GET /v1/gpu` expose current state; `POST /v1/containers/:service/{start,stop,restart}` let you manage them manually.

---

## Agent & model configuration

Every agent's identity — model, runtime, capabilities — is read from **`src/config/agentProfiles.json`** at module load time via `src/config/agentRegistry.ts`. This is the single source of truth: change a model there and every agent, the `GET /v1/agents` listing, and response metadata all follow automatically. `src/config/modelRegistry.json` backs `GET /v1/models` (merged with live Ollama models and whatever's currently loaded in LM Studio).

Older, now-unused copies of these config files (and a `routingTable.json` that was never actually read by any code) live under `requirements/archive/` for reference.

---

## API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/health` | Aggregate health of Ollama, LM Studio, XTTS, embeddings, ChromaDB (`?full=true` forces a fresh check) |
| `GET` | `/v1/models` | Live Ollama models + LM Studio's loaded model + the static model catalog |
| `GET` | `/v1/agents` | Configured agent profiles from `agentProfiles.json` |
| `POST` | `/v1/chat` | Classifies intent (or honors `agent`/`intent` override) and routes accordingly |
| `POST` | `/v1/rag` | `{action: 'query'}` (default) or `{action: 'ingest'}` against ChromaDB |
| `POST` | `/v1/stt` | Speech-to-text via Azure (`{audio: <base64>}`) |
| `POST` | `/v1/tts` | Text-to-speech via XTTS (`{text, voiceRef?, language?}`) |
| `POST` | `/v1/image` | Image description via Ollama (`{quality: 'high' \| 'low'}`) |
| `POST` | `/v1/code` | Coding tasks via Ollama |
| `POST` | `/v1/vision` | Image understanding via LM Studio (falls back to Ollama) |
| `POST` | `/v1/cloud` | Direct cloud dispatch by `cloudIntent` (see [Cloud routing](#cloud-routing)) |
| `POST` | `/v1/speech/tts` | Advanced TTS via Azure AI Speech (`{text, voice?}`) |
| `POST` | `/v1/speech/stt` | Advanced STT via Azure AI Speech (`{audio: <base64>, language?}`) |
| `GET` | `/v1/speech/cnv` | List Custom Neural Voice projects |
| `POST` | `/v1/speech/cnv` | Synthesize with a deployed custom voice (`{text, deploymentId, voiceName}`) |
| `GET` | `/v1/containers` | Status of all managed Docker containers |
| `POST` | `/v1/containers/:service/start` `/stop` `/restart` | Manual container control (`service` ∈ `ollama`, `xtts`, `onnx-runtime`, `chromadb`) |
| `GET` | `/v1/gpu` | Current GPU utilization/VRAM/saturation status |

All `/v1/*` routes pass through rate limiting (`express-rate-limit`, configurable via `APLUS_RATE_LIMIT_REQUESTS`/`APLUS_RATE_LIMIT_WINDOW_MS`) and an optional bearer-token auth middleware — auth is a no-op if `ORCHESTRATOR_API_KEY` isn't set.

---

## Directory structure

```text
tw-localllm-orchestrator/
├── src/
│   ├── server.ts               # Express app, middleware, route wiring, graceful shutdown
│   ├── config/
│   │   ├── index.ts            # Env-driven runtime config
│   │   ├── agentRegistry.ts    # getAgentProfile() loader over agentProfiles.json
│   │   ├── agentProfiles.json  # Source of truth: agent name → model/runtime/capabilities
│   │   └── modelRegistry.json  # Descriptive model catalog for GET /v1/models
│   ├── agents/                 # One file per agent: entry, reasoning, stats, rag, coding,
│   │                           #   math, imageHigh/Low, vision, speech, tts, cloud,
│   │                           #   azureSpeechTts, azureSpeechStt
│   ├── models/                 # Thin HTTP clients: ollama, lmstudio, xtts, onnx
│   ├── cloud/                  # azure.ts, azureSpeech.ts, anthropic.ts clients
│   ├── routes/                 # One file per HTTP endpoint (speech.ts covers all three /v1/speech/* routes)
│   ├── tools/                  # containerManager, health polling, rag (ChromaDB), logger
│   ├── middleware/              # auth, rateLimit, errorHandler
│   └── types/                  # Shared TypeScript interfaces
├── docker/
│   ├── docker-compose.yml           # All four services together
│   ├── docker-compose.{ollama,xtts,onnx,chromadb}.yml   # Run one service standalone
│   └── config/voices/                # XTTS voice reference clips (gitignored)
├── docs/
│   └── DOCKER-HOWTO.md          # Beginner-friendly Docker walkthrough for this project
├── requirements/
│   ├── markdown/                # Original design/spec documents
│   └── archive/                 # Superseded JSON configs, kept for reference
├── .env.example
└── package.json
```

---

## Setup

### Prerequisites

- Node.js ≥ 20
- Docker Desktop (with WSL2 GPU passthrough on Windows, if you want GPU acceleration)
- [Ollama](https://ollama.com) models pulled locally for whatever `agentProfiles.json` expects
- LM Studio (optional — only needed for `reasoning_heavy`/`stats`/`vision` without cloud fallback)
- An NVIDIA GPU is optional but expected for XTTS/Ollama performance; CPU-only works, just slower

### Steps

```bash
npm install
cp .env.example .env
# Edit .env — at minimum, review APLUS_* ports and, if you want cloud routing,
# AZURE_OPENAI_* / ANTHROPIC_API_KEY / AZURE_SPEECH_*

cd docker
docker compose up -d
cd ..

npm run dev     # ts-node with watch, for development
# or
npm run build && npm start   # compiled production run
```

The server starts on `APLUS_ORCHESTRATOR_PORT` (default `3200`), and begins polling backend health and idle containers immediately.

See `docs/DOCKER-HOWTO.md` for a from-scratch Docker walkthrough, including GPU troubleshooting and how to manage Ollama models inside the container.

---

## Usage examples

### Chat (auto-classified)

```bash
curl -s -X POST http://localhost:3200/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Write a function to reverse a linked list"}]}'
```

### Chat (explicit agent, skips classification)

```bash
curl -s -X POST http://localhost:3200/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"agent": "coding", "messages": [{"role": "user", "content": "..."}]}'
```

### Text-to-speech with your cloned voice

```bash
curl -s -X POST http://localhost:3200/v1/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Chapter one.", "voiceRef": "terence"}' \
  --output chapter1.wav
```

### Advanced TTS via Azure AI Speech

```bash
curl -s -X POST http://localhost:3200/v1/speech/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Chapter one.", "voice": "en-US-GuyNeural"}' \
  --output chapter1-azure.wav
```

### Explicit cloud call

```bash
curl -s -X POST http://localhost:3200/v1/cloud \
  -H "Content-Type: application/json" \
  -d '{"cloudIntent": "heavy_reasoning", "messages": [{"role": "user", "content": "..."}]}'
```

### Health and container status

```bash
curl -s http://localhost:3200/v1/health
curl -s http://localhost:3200/v1/containers
curl -s http://localhost:3200/v1/gpu
```

---

## Troubleshooting

**"Cannot connect to the Docker daemon"** — Docker Desktop isn't running. See `docs/DOCKER-HOWTO.md`.

**A container reports unhealthy right after starting** — `docker inspect` needs a moment for the healthcheck to run at least once; `ensureRunning` polls for this, but very slow-booting images (XTTS on first cold start, downloading the model) may need `APLUS_CONTAINER_HEALTH_RETRIES` raised. Also: recent `chromadb/chroma` and `ollama/ollama` images both dropped `curl` entirely, and Chroma deprecated its `/api/v1` routes server-side — if you rebuild these healthchecks from scratch, `chromadb`'s uses bash's `/dev/tcp` against `/api/v2/heartbeat` (its default shell is dash, which doesn't support `/dev/tcp` — the healthcheck explicitly invokes `bash -c`), and `ollama`'s just runs `ollama list`.

**GPU passthrough issues with Ollama or XTTS** — remove the `deploy.resources.reservations.devices: [gpu]` block from the relevant service in `docker/docker-compose.yml` to force CPU mode.

**`/v1/stt` fails immediately** — Azure isn't configured yet (`AZURE_OPENAI_API_KEY` missing), or the deployment name doesn't match what's actually deployed. There is no working local STT fallback.

**Cloud calls fail with a 401/404, especially after adding a new Azure model** — don't assume the endpoint shape. In this project alone, three genuinely different wire protocols turned up on `AZURE_OPENAI_ENDPOINT` depending on the model: the unified `{endpoint}/chat/completions` route for OpenAI/Foundry-catalog models, a completely different host and the native Anthropic Messages API for Claude models, and the classic per-deployment `/openai/deployments/{model}/...` path (with its own required `api-version`) for audio. The Azure AI Speech resource is a fourth, unrelated shape again (region-based hosts, `Ocp-Apim-Subscription-Key` header, no relation to the Foundry `/models` endpoint the portal shows you). When in doubt, test directly against the endpoint with curl/axios before wiring anything into the client code — every integration in this project was verified live before being trusted.

---

*Personal local LLM orchestration — local by default, cloud when it's worth it.*
