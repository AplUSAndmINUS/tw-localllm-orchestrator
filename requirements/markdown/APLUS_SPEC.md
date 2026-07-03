# 🧭 **APlus Orchestrator — Canonical Specification**

**Project Name (GitHub):** `tw-localllm-orchestrator`  
**Project Name (Internal):** `APlus`  
**Specification Version:** 1.0  
**Last Updated:** 2026-07-02

---

## 📋 **Quick Reference**

| Component | Port | Host | Env Variable |
|-----------|------|------|--------------|
| Express.js Orchestrator | `APLUS_ORCHESTRATOR_PORT` | localhost | `APLUS_ORCHESTRATOR_PORT` |
| Ollama | `APLUS_OLLAMA_PORT` | Tailscale | `APLUS_OLLAMA_ENDPOINT` |
| LM Studio | `APLUS_LMSTUDIO_PORT` | Tailscale | `APLUS_LMSTUDIO_ENDPOINT` |
| XTTS | `APLUS_XTTS_PORT` | Tailscale | `APLUS_XTTS_ENDPOINT` |
| ONNX Runtime | `APLUS_ONNX_PORT` | Tailscale | `APLUS_ONNX_ENDPOINT` |
| ChromaDB | `APLUS_CHROMADB_PORT` | Tailscale | `APLUS_CHROMADB_ENDPOINT` |

---

## 🌐 **Environment Variables**

```bash
# Tailscale Mesh Host (see .env.example for setup)
APLUS_TAILSCALE_HOST=your-device.tail5c19eb.ts.net

# Service Port Configuration (see .env.example)
APLUS_ORCHESTRATOR_PORT=3200
APLUS_OLLAMA_PORT=your-ollama-port
APLUS_LMSTUDIO_PORT=your-lmstudio-port
APLUS_XTTS_PORT=your-xtts-port
APLUS_ONNX_PORT=your-onnx-port
APLUS_CHROMADB_PORT=your-chromadb-port

# Service Endpoints (constructed from APLUS_TAILSCALE_HOST + port vars)
APLUS_OLLAMA_ENDPOINT=http://${APLUS_TAILSCALE_HOST}:${APLUS_OLLAMA_PORT}
APLUS_LMSTUDIO_ENDPOINT=http://${APLUS_TAILSCALE_HOST}:${APLUS_LMSTUDIO_PORT}
APLUS_XTTS_ENDPOINT=http://${APLUS_TAILSCALE_HOST}:${APLUS_XTTS_PORT}
APLUS_ONNX_ENDPOINT=http://${APLUS_TAILSCALE_HOST}:${APLUS_ONNX_PORT}
APLUS_CHROMADB_ENDPOINT=http://${APLUS_TAILSCALE_HOST}:${APLUS_CHROMADB_PORT}

# Cloud Credentials (from .env, do NOT commit)
AZURE_OPENAI_ENDPOINT=<your-azure-endpoint>
AZURE_OPENAI_KEY=<your-key>
ANTHROPIC_API_KEY=<your-key>
```

---

## 🎯 **Entry Model**

**Primary Dispatcher (Intent Classifier):**
```
Runtime: Ollama
Model: phi4-mini:latest
Port: your-ollama-port
Purpose: Fast intent classification, routing, quick answers
```

---

## 🤖 **Local Agents**

### Reasoning
| Agent | Runtime | Model | Port | Quantization |
|-------|---------|-------|------|--------------|
| **ReasoningAgent** | LM Studio | phi-4-reasoning-plus | your-lmstudio-port | Q4_K_M |
| **StatsAgent** | LM Studio | deepseek-r1-14b | your-lmstudio-port | Q4_K_M |
| **RagAgent** | Ollama | phi-3-mini-128k | your-ollama-port | — |
| **VisionAgent** | LM Studio | phi-4-reasoning-plus-vision | your-lmstudio-port | Q4_K_M |

### General Purpose
| Agent | Runtime | Model | Port |
|-------|---------|-------|------|
| **CodingAgent** | Ollama | deepseek-coder:latest | your-ollama-port |
| **MathAgent** | Ollama | deepseek-math:7b | your-ollama-port |

### Content Generation
| Agent | Runtime | Model | Port |
|-------|---------|-------|------|
| **ImageAgentHigh** | Ollama | llama3.1:8b | your-ollama-port |
| **ImageAgentLow** | Ollama | dolphin-nemo:12b | your-ollama-port |

### Voice & Inference
| Agent | Runtime | Model | Port |
|-------|---------|-------|------|
| **SpeechAgent** | Ollama | whisper-large:latest | your-ollama-port |
| **TTSAgent** | XTTS | xtts-v2 | your-xtts-port |

---

## ☁️ **Cloud Routing Table**

### Azure (Foundry / OpenAI-compatible)
```json
{
  "heavy_reasoning": "claude-3-opus",
  "fallback_reasoning": "gpt-4.1",
  "vision": "gpt-4o",
  "stt": "whisper-1",
  "tts": "gpt-4o-mini-tts"
}
```

### Anthropic (Claude API)
```json
{
  "mid_reasoning": "claude-3-sonnet",
  "creative": "claude-3-haiku",
  "design": "claude-3-sonnet",
  "cowork": "claude-3-opus",
  "major_code": "claude-3-opus"
}
```

---

## 📡 **API Endpoints (Express.js Orchestrator)**

### Base URL
```
http://localhost:3200/v1
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/chat` | Chat completion (streaming or blocking) |
| `POST` | `/v1/rag` | RAG-augmented query |
| `POST` | `/v1/stt` | Speech-to-text transcription |
| `POST` | `/v1/tts` | Text-to-speech synthesis |
| `POST` | `/v1/image` | Image generation |
| `POST` | `/v1/code` | Code generation / analysis |
| `POST` | `/v1/vision` | Image understanding / analysis |
| `POST` | `/v1/cloud` | Cloud escalation routing |
| `GET` | `/v1/health` | Aggregate health of all backends |
| `GET` | `/v1/models` | List available models across all runtimes |
| `GET` | `/v1/agents` | List configured agent profiles |

---

## 🔄 **Routing Logic**

### 1. Intent Classification
Request enters → Express.js Orchestrator → `phi4-mini:latest` (Ollama) → classify intent

### 2. Intent → Agent Mapping

| Intent | Agent | Runtime | Model | Port |
|--------|-------|---------|-------|------|
| `reasoning_heavy` | ReasoningAgent | LM Studio | phi-4-reasoning-plus | your-lmstudio-port |
| `stats` | StatsAgent | LM Studio | deepseek-r1-14b | your-lmstudio-port |
| `rag` | RagAgent | Ollama | phi-3-mini-128k | your-ollama-port |
| `coding` | CodingAgent | Ollama | deepseek-coder | your-ollama-port |
| `math` | MathAgent | Ollama | deepseek-math | your-ollama-port |
| `image_high` | ImageAgentHigh | Ollama | llama3.1:8b | your-ollama-port |
| `image_low` | ImageAgentLow | Ollama | dolphin-nemo:12b | your-ollama-port |
| `speech_to_text` | SpeechAgent | Ollama | whisper-large | your-ollama-port |
| `text_to_speech` | TTSAgent | XTTS | xtts-v2 | your-xtts-port |
| `vision` | VisionAgent | LM Studio | phi-4-reasoning-plus-vision | your-lmstudio-port |
| `cloud` | CloudAgent | Cloud | dynamic | N/A |

### 3. LM Studio Fallback Logic

```
IF LM Studio required AND LM Studio unavailable
  THEN check: is LM Studio online? is correct model loaded?
  IF NO → fallback to Ollama or cloud
  IF YES → route to LM Studio
```

### 4. Ollama Hot-Swap Logic

```
IF Ollama required AND model not loaded
  THEN pull model dynamically from Ollama registry
  THEN proceed with inference
```

### 5. Cloud Escalation

```
IF local models exhausted OR user explicitly requests cloud
  THEN route to CloudAgent
  THEN map intent → cloud model from routing table
```

---

## 📦 **Response Format**

All responses are structured JSON:

```json
{
  "agent": "ReasoningAgent",
  "model": "phi-4-reasoning-plus",
  "intent": "reasoning_heavy",
  "runtime": "lmstudio",
  "content": "...",
  "tokens": {
    "input": 1024,
    "output": 512
  },
  "latency_ms": your-lmstudio-port,
  "cached": false
}
```

---

## 🐳 **Docker Services**

All services run in Docker containers except LM Studio (manual GUI/CLI).

### docker-compose.yml Structure

> **⚠️ Port Configuration:** Use environment variables from `.env` for all port mappings (see `.env.example`).

```yaml
version: "3.9"
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "${APLUS_OLLAMA_PORT:-your-ollama-port}:your-ollama-port"
    volumes:
      - ollama_models:/root/.ollama
    environment:
      - OLLAMA_HOST=0.0.0.0

  xtts:
    image: ghcr.io/coqui-ai/xtts:latest
    ports:
      - "${APLUS_XTTS_PORT:-your-xtts-port}:5000"
    volumes:
      - xtts_data:/data

  onnx_runtime:
    image: mcr.microsoft.com/onnxruntime/server:latest
    ports:
      - "${APLUS_ONNX_PORT:-your-onnx-port}:your-onnx-port"
    volumes:
      - onnx_models:/models

  chromadb:
    image: chromadb/chromadb:latest
    ports:
      - "${APLUS_CHROMADB_PORT:-your-chromadb-port}:your-chromadb-port"
    volumes:
      - chromadb_data:/data
```

---

## 📂 **Project Structure**

```
tw-localllm-orchestrator/
├── src/
│   ├── server.js                    # Express.js entry point
│   ├── config/
│   │   ├── modelRegistry.json       # Model definitions
│   │   ├── routingTable.json        # Intent → Agent mapping
│   │   ├── agentProfiles.json       # Agent configurations
│   │   └── .env.example             # Environment template
│   ├── routes/
│   │   ├── chat.js
│   │   ├── rag.js
│   │   ├── stt.js
│   │   ├── tts.js
│   │   ├── image.js
│   │   ├── code.js
│   │   ├── vision.js
│   │   ├── cloud.js
│   │   ├── health.js
│   │   └── models.js
│   ├── agents/
│   │   ├── entryAgent.js            # Intent classifier
│   │   ├── reasoningAgent.js
│   │   ├── statsAgent.js
│   │   ├── ragAgent.js
│   │   ├── codingAgent.js
│   │   ├── mathAgent.js
│   │   ├── imageAgentHigh.js
│   │   ├── imageAgentLow.js
│   │   ├── speechAgent.js
│   │   ├── ttSAgent.js
│   │   ├── visionAgent.js
│   │   └── cloudAgent.js
│   ├── models/
│   │   ├── ollama.js                # Ollama client
│   │   ├── lmstudio.js              # LM Studio client
│   │   ├── xtts.js                  # XTTS client
│   │   └── onnx.js                  # ONNX client
│   ├── cloud/
│   │   ├── azure.js                 # Azure OpenAI client
│   │   └── anthropic.js             # Anthropic API client
│   ├── tools/
│   │   ├── rag.js                   # RAG/ChromaDB integration
│   │   ├── health.js                # Health check aggregator
│   │   └── logger.js                # Structured logging
│   └── middleware/
│       ├── auth.js                  # API key validation
│       ├── rateLimit.js             # Rate limiting
│       └── errorHandler.js          # Error handling
├── docker-compose.yml
├── docker-compose.ollama.yml
├── docker-compose.xtts.yml
├── docker-compose.onnx.yml
├── docker-compose.chromadb.yml
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── APLUS_SPEC.md (this file)
```

---

## 🚀 **Key Design Principles**

1. **Zero Cloud Dependency by Default** — all inference runs locally
2. **LM Studio Manual Override** — heavy models require deliberate user action
3. **Ollama Hot-Swap** — models can be pulled/switched at runtime
4. **Single Entry Point** — all clients speak to orchestrator; backend topology is invisible
5. **Graceful Fallback** — if primary runtime unavailable, escalate intelligently
6. **Structured JSON Responses** — consistent schema regardless of backend
7. **Environment-Driven Configuration** — no hardcoded endpoints or credentials
8. **Cost Tracking Ready** — schema includes cost fields for future billing integration

---

## ✅ **Cost Model (Future)**

Currently:
- Local models (LM Studio, Ollama, XTTS, ONNX, ChromaDB) = **$0**
- Cloud models (Azure + Anthropic) = **tracked but not billed yet**

When cost tracking is needed:
1. Log each cloud request with model, tokens, and cost
2. Aggregate daily/monthly costs per agent
3. Display cost breakdown in APlus Control Plane UI
4. Enforce budget limits per agent (optional)

---

## 📝 **Notes**

- **LM Studio is manual**: Users must open the GUI or CLI and load models explicitly
- **Ollama is automatic**: Models are pulled on-demand and hot-swapped seamlessly
- **Tailscale mesh**: All local endpoints are private; no public internet exposure
- **GGUF quantization**: Q4_K_M is the sweet spot for VRAM/accuracy on consumer GPUs (12GB+)
- **API versioning**: All endpoints use `/v1/` prefix for future compatibility
