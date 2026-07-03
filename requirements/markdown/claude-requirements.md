# 🧱 **aplus AI Orchestration — Updated Requirements (Hybrid LM Studio + Ollama + XTTS + ONNX)**  
*A single conversational entry point → orchestrator → agents → local/cloud models → tools.*

---

## 🌐 **High‑Level System Flow (Updated)**

```mermaid
flowchart TD

    %% Entry
    A[aplus Control Plane UI\nSingle Chat Interface] --> B[Express.js Orchestrator]

    %% Dispatcher
    B --> C[phi-4-mini-reasoning (Ollama)\nEntry Model / Intent Classifier]

    %% Intent Routing
    C -->|reasoning_heavy| D[ReasoningAgent\nPhi-4 Reasoning Plus (LM Studio, manual)]
    C -->|stats| E[StatsAgent\nDeepSeek R1 14B (LM Studio, manual)]
    C -->|rag| F[RagAgent\nPhi-3-Mini-128k (Ollama) or Qwen 2.5 14B (LM Studio)]
    C -->|coding| G[CodingAgent\nDeepSeek Coder v2 Lite (Ollama)]
    C -->|math| H[MathAgent\nDeepSeek Math 7B (Ollama)]
    C -->|image_high| I[ImageAgentHigh\nLlama 3.1 8B (Ollama)]
    C -->|image_low| J[ImageAgentLow\nDolphin Nemo 12B (Ollama)]
    C -->|speech_to_text| K[SpeechAgent\nWhisper Large v3 Turbo (Ollama)]
    C -->|text_to_speech| L[TTSAgent\nXTTS (local)]
    C -->|vision| M[VisionAgent\nPhi-4 Reasoning Plus Vision (LM Studio, manual)]
    C -->|cloud| N[CloudAgent]

    %% Cloud Routing
    N -->|heavy_reasoning| O[Claude Opus 4.8 (Azure)]
    N -->|fallback_reasoning| P[Phi-4 Reasoning (Azure)]
    N -->|design| Q[Claude Design (Anthropic)]
    N -->|cowork| R[Claude Cowork (Anthropic)]
    N -->|major_code| S[Claude Code (Anthropic)]
    N -->|creative| T[Fable 5 (Anthropic)]
    N -->|mid_reasoning| U[Claude Sonnet 5 (Anthropic API)]

    %% Tools
    F --> V[ChromaDB\nVector Store]
    K --> W[Audio Input]
    L --> X[Audio Output]
    I --> Y[Image Output]
    J --> Y
```

---

# 🧭 **System Components (Updated)**

## **Entry Model**
| Component | Runtime | Model | Purpose |
|----------|----------|--------|---------|
| EntryAgent | Ollama | phi‑4‑mini‑reasoning | Intent classification, routing, quick answers |

---

## **Local Agents (Updated Runtime Mapping)**

| Agent | Runtime | Model | Purpose |
|-------|----------|--------|---------|
| ReasoningAgent | **LM Studio (manual)** | Phi‑4 Reasoning Plus | Heavy reasoning |
| StatsAgent | **LM Studio (manual)** | DeepSeek R1 14B | Statistical analysis |
| RagAgent | Ollama / LM Studio | Phi‑3‑Mini‑128k / Qwen 2.5 14B | RAG + document QA |
| CodingAgent | Ollama | DeepSeek Coder v2 Lite | Medium coding tasks |
| MathAgent | Ollama | DeepSeek Math 7B | Math-heavy workflows |
| ImageAgentHigh | Ollama | Llama 3.1 8B | High-quality image generation |
| ImageAgentLow | Ollama | Dolphin Nemo 12B | Fast drafts |
| SpeechAgent | Ollama | Whisper Large v3 Turbo | STT |
| TTSAgent | XTTS | XTTS | TTS |
| VisionAgent | **LM Studio (manual)** | Phi‑4 Reasoning Plus Vision | Image understanding |

---

## **Cloud Agents**
| Agent | Cloud Model | Purpose |
|-------|-------------|---------|
| CloudReasoningAgent | Claude Opus 4.8 | Heavy reasoning |
| CloudFallbackAgent | Phi‑4 Reasoning | Cloud fallback |
| CloudDesignAgent | Claude Design | Branding, UI, creative design |
| CloudCoworkAgent | Claude Cowork | XLSX/PPTX/PDF workflows |
| CloudCodeAgent | Claude Code | Major coding tasks |
| CloudCreativeAgent | Fable 5 | Creative reasoning |
| CloudMidReasoningAgent | Sonnet 5 | Mid-heavy reasoning |

---

## **Tools**
| Tool | Component |
|------|-----------|
| RAG | ChromaDB |
| STT | Whisper Large v3 Turbo |
| TTS | XTTS |
| Image | Llama 3.1 / Dolphin Nemo |
| Vision | Phi‑4 Reasoning Plus Vision |

---

# 🧱 **Claude Code Prompt (Updated for LM Studio + Ollama + Tailscale)**

```text
You are Claude Code. Build a complete Express.js orchestrator for the AI Control Plane.

## GOAL
Create a local-first AI orchestration server that:
- Accepts all requests from the Control Plane UI
- Uses phi-4-mini-reasoning (Ollama) as the entry model for intent classification
- Routes requests to local agents or cloud agents
- Supports model override (user specifies which model to use)
- Supports RAG, STT, TTS, image generation, coding, and cloud escalation
- Automatically hot-swaps local models using Ollama
- Uses LM Studio only when manually opened and correct heavy model is loaded
- Returns structured JSON responses

## LOCAL RUNTIMES
- LM Studio (manual heavy-model runtime)
- Ollama (dynamic hot-swap runtime)
- XTTS (local TTS)
- ONNX Runtime (light inference)
- ChromaDB (vector store)
- All local endpoints use the Tailscale URL: your-tailscale-domain-here.net

## ENDPOINTS
POST /chat
POST /rag
POST /stt
POST /tts
POST /image
POST /code
POST /cloud
POST /vision

## ROUTING LOGIC
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

## CLOUD ROUTING TABLE
- heavy_reasoning → Claude Opus 4.8 (Azure)
- fallback_reasoning → Phi-4 Reasoning (Azure)
- design → Claude Design (Anthropic)
- cowork → Claude Cowork (Anthropic)
- major_code → Claude Code (Anthropic)
- creative → Fable 5 (Anthropic)
- mid_reasoning → Claude Sonnet 5 (Anthropic API)

## HOT-SWAP LOGIC (MANDATORY)
- If LM Studio is offline → use Ollama or cloud
- If LM Studio is online but wrong model is loaded → use Ollama or cloud
- If Ollama does not have the required model → pull it dynamically
- If GPU is saturated → fall back to cloud
- Always prefer LM Studio for heavy models when available

## OUTPUT FORMAT
All responses must be structured JSON:
{
  "agent": "ReasoningAgent",
  "model": "phi-4-reasoning-plus",
  "intent": "reasoning_heavy",
  "content": "...",
  "tokens": { ... },
  "latency_ms": your-lmstudio-port
}

---

**Infrastructure:**

```text
Local System (Ryzen)
│
├── LM Studio (manual heavy models)
│
├── Docker
│   ├── Ollama (hot-swap LLMs)
│   ├── XTTS (TTS)
│   ├── ONNX Runtime (light inference)
│   └── ChromaDB (vector store)
│
└── Express.js Orchestrator (Claude Code)
```

## DELIVERABLES
Generate:
- server.js (Express.js)
- /agents directory (one file per agent)
- /models directory (local model clients)
- /cloud directory (cloud model clients)
- /tools directory (RAG, STT, TTS, image)
- /routes directory (endpoints)
- config/modelRegistry.json
- config/routingTable.json

Build the orchestrator cleanly, modularly, and ready for deployment.
```
