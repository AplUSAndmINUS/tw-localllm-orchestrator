You are Claude Code. Build the full aplus AI Orchestration System.

This system has two major parts:

1. EXPRESS.JS ORCHESTRATOR (primary deliverable)
2. DOCKER INFRASTRUCTURE (secondary deliverable)

Both must be generated cleanly, modularly, and production-ready.

===========================================================
PART 1 — EXPRESS.JS ORCHESTRATOR (PRIMARY)
===========================================================

## GOAL
Create a local-first AI orchestration server that:
- Accepts all requests from the aplus Control Plane UI
- Uses phi-4-mini-reasoning (Ollama) as the entry model for intent classification
- Routes requests to local agents or cloud agents
- Supports model override (user specifies which model to use)
- Supports RAG, STT, TTS, image generation, coding, and cloud escalation
- Automatically hot-swaps local models using Ollama
- Uses LM Studio only when manually opened and correct heavy model is loaded
- Returns structured JSON responses
- Uses Tailscale URL for all local endpoints:
  your-tailscale-domain-here.net

===========================================================
RUNTIMES
===========================================================

### LM Studio (manual heavy-model runtime)
- Must be manually opened by the user
- Must manually load heavy models:
  - phi-4-reasoning-plus
  - deepseek-r1-14b
  - qwen-2.5-14b-instruct
  - phi-4-reasoning-plus-vision
- Orchestrator detects LM Studio availability via /health
- If LM Studio is offline or wrong model is loaded → fallback to Ollama or cloud

### Ollama (dynamic hot-swap runtime)
- Orchestrator can:
  - pull models
  - unload models
  - switch models
  - check loaded models
- Used for:
  - phi-4-mini-reasoning (dispatcher)
  - phi-3-mini-128k
  - llama-3.1-8b
  - dolphin-nemo-12b
  - deepseek-coder
  - deepseek-math
  - whisper-large

### XTTS (local TTS)
### ONNX Runtime (light inference)
### ChromaDB (vector store)

===========================================================
ENDPOINTS
===========================================================

POST /chat
POST /rag
POST /stt
POST /tts
POST /image
POST /code
POST /cloud
POST /vision

===========================================================
ROUTING LOGIC
===========================================================

1. Run intent classification using phi-4-mini-reasoning (Ollama).
2. If the user specifies a model override, bypass intent routing.
3. Otherwise, route based on intent:

- reasoning_heavy → Phi-4 Reasoning Plus (LM Studio, manual)
- stats → DeepSeek R1 14B (LM Studio, manual)
- rag → Phi-3-Mini-128k (Ollama) or Qwen 2.5 14B (LM Studio)
- coding → DeepSeek Coder v2 Lite (Ollama)
- math → DeepSeek Math 7B (Ollama)
- image_high → Llama 3.1 8B (Ollama)
- image_low → Dolphin Nemo 12B (Ollama)
- speech_to_text → Whisper Large v3 Turbo (Ollama)
- text_to_speech → XTTS (local)
- vision → Phi-4 Reasoning Plus Vision (LM Studio, manual)
- cloud → cloud routing table below

===========================================================
CLOUD ROUTING TABLE
===========================================================

- heavy_reasoning → Claude Opus 4.8 (Azure)
- fallback_reasoning → Phi-4 Reasoning (Azure)
- design → Claude Design (Anthropic)
- cowork → Claude Cowork (Anthropic)
- major_code → Claude Code (Anthropic)
- creative → Fable 5 (Anthropic)
- mid_reasoning → Claude Sonnet 5 (Anthropic API)

===========================================================
HOT-SWAP LOGIC (MANDATORY)
===========================================================

- If LM Studio is offline → use Ollama or cloud
- If LM Studio is online but wrong model is loaded → use Ollama or cloud
- If Ollama does not have the required model → pull it dynamically
- If GPU is saturated → fall back to cloud
- Always prefer LM Studio for heavy models when available

===========================================================
OUTPUT FORMAT
===========================================================

All responses must be structured JSON:
{
  "agent": "ReasoningAgent",
  "model": "phi-4-reasoning-plus",
  "intent": "reasoning_heavy",
  "content": "...",
  "tokens": { ... },
  "latency_ms": your-lmstudio-port
}

===========================================================
DELIVERABLES (MANDATORY)
===========================================================

Generate:

### Core
- server.js (Express.js orchestrator)
- /routes directory (endpoints)
- /agents directory (one file per agent)
- /models directory (local model clients)
- /cloud directory (cloud model clients)
- /tools directory (RAG, STT, TTS, image)

### Config
- config/modelRegistry.json
- config/routingTable.json
- config/agentProfiles.json

### Infrastructure
- docker-compose.yml
- docker-compose.ollama.yml
- docker-compose.xtts.yml
- docker-compose.onnx.yml
- docker-compose.chromadb.yml

Build everything cleanly, modularly, and ready for deployment.

===========================================================
PART 2 — DOCKER INFRASTRUCTURE (SECONDARY)
===========================================================

Generate Docker Compose files for:

1. Ollama
2. XTTS
3. ONNX Runtime
4. ChromaDB

LM Studio is NOT in Docker.

All containers must expose ports via Tailscale:
your-tailscale-domain-here.net

===========================================================
END OF SPEC
===========================================================
