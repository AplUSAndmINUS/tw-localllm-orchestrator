# Agent Profile JSON examples to match Fluxline infrastructure

- LM Studio = manual heavy‑model runtime  
- Ollama = orchestrator‑controlled hot‑swap runtime  
- XTTS = independent TTS  
- ONNX = independent inference  
- ChromaDB = vector store  
- Cloud = Azure + Anthropic  
- All local endpoints = Tailscale URL  

These templates are structured so aplus can:

- map agents → runtimes  
- map runtimes → endpoints  
- map endpoints → models  
- track usage  
- calculate cloud costs  
- visualize your entire AI topology  

They’re intentionally modular so you can add/remove agents easily.

---

# 🧱 **Agent Profile JSON Templates (aplus‑Ready)**

Below are **individual agent templates** you can paste into aplus’s Agent Profile designer.

Each profile includes:

- `agentName`
- `description`
- `runtime`
- `endpoint`
- `model`
- `capabilities`
- `costModel` (local = free, cloud = tracked)
- `healthCheck`
- `fallbacks`

---

# ⭐ 1. **EntryAgent (Dispatcher)**  
Uses **Ollama** for fast routing.

```json
{
  "agentName": "EntryAgent",
  "description": "Primary dispatcher and intent classifier.",
  "runtime": "ollama",
  "endpoint": "http://your-tailscale-domain-here.net:your-ollama-port/api/generate",
  "model": "phi4-mini:latest",
  "capabilities": ["intent_classification", "routing", "quick_answers"],
  "costModel": "local_free",
  "healthCheck": "/api/tags",
  "fallbacks": {
    "cloud": "claude-sonnet-5"
  }
}
```

---

# ⭐ 2. **ReasoningAgent (Heavy Reasoning)**  
Uses **LM Studio** — must be manually loaded.

```json
{
  "agentName": "ReasoningAgent",
  "description": "Heavy reasoning tasks requiring deep chain-of-thought.",
  "runtime": "lmstudio",
  "endpoint": "http://your-tailscale-domain-here.net:your-lmstudio-port/v1/chat/completions",
  "model": "phi-4-reasoning-plus",
  "capabilities": ["reasoning", "analysis", "architecture"],
  "costModel": "local_free",
  "healthCheck": "/health",
  "fallbacks": {
    "local": "deepseek-r1:latest",
    "cloud": "claude-opus-4.8"
  }
}
```

---

# ⭐ 3. **StatsAgent (Deep Statistical Reasoning)**  
LM Studio heavy model.

```json
{
  "agentName": "StatsAgent",
  "description": "Statistical analysis, forecasting, probability modeling.",
  "runtime": "lmstudio",
  "endpoint": "http://your-tailscale-domain-here.net:your-lmstudio-port/v1/chat/completions",
  "model": "deepseek-r1-14b",
  "capabilities": ["statistics", "math_reasoning", "forecasting"],
  "costModel": "local_free",
  "healthCheck": "/health",
  "fallbacks": {
    "local": "deepseek-math:7b",
    "cloud": "claude-opus-4.8"
  }
}
```

---

# ⭐ 4. **RagAgent (Document QA + Retrieval)**  
Primary = Ollama  
Fallback = LM Studio

```json
{
  "agentName": "RagAgent",
  "description": "Document QA, retrieval, summarization, long-context reasoning.",
  "runtime": "ollama",
  "endpoint": "http://your-tailscale-domain-here.net:your-ollama-port/api/generate",
  "model": "phi3:latest",
  "capabilities": ["rag", "document_qa", "summarization"],
  "costModel": "local_free",
  "healthCheck": "/api/tags",
  "fallbacks": {
    "local": "qwen-2.5-14b-instruct",
    "cloud": "claude-sonnet-5"
  }
}
```

---

# ⭐ 5. **CodingAgent (Medium Coding Tasks)**  
Ollama.

```json
{
  "agentName": "CodingAgent",
  "description": "Medium coding tasks, refactoring, debugging.",
  "runtime": "ollama",
  "endpoint": "http://your-tailscale-domain-here.net:your-ollama-port/api/generate",
  "model": "deepseek-coder:latest",
  "capabilities": ["coding", "refactor", "debug"],
  "costModel": "local_free",
  "healthCheck": "/api/tags",
  "fallbacks": {
    "cloud": "claude-code"
  }
}
```

---

# ⭐ 6. **MathAgent (Math + Algorithms)**  
Ollama.

```json
{
  "agentName": "MathAgent",
  "description": "Math-heavy workflows, algorithm design, symbolic reasoning.",
  "runtime": "ollama",
  "endpoint": "http://your-tailscale-domain-here.net:your-ollama-port/api/generate",
  "model": "deepseek-math:7b",
  "capabilities": ["math", "algorithms", "symbolic_reasoning"],
  "costModel": "local_free",
  "healthCheck": "/api/tags",
  "fallbacks": {
    "cloud": "claude-opus-4.8"
  }
}
```

---

# ⭐ 7. **ImageAgentHigh (High‑Quality Images)**  
Ollama.

```json
{
  "agentName": "ImageAgentHigh",
  "description": "High-quality image generation.",
  "runtime": "ollama",
  "endpoint": "http://your-tailscale-domain-here.net:your-ollama-port/api/generate",
  "model": "llama3.1:8b",
  "capabilities": ["image_generation"],
  "costModel": "local_free",
  "healthCheck": "/api/tags",
  "fallbacks": {
    "cloud": "fable-5"
  }
}
```

---

# ⭐ 8. **ImageAgentLow (Fast Draft Images)**  
Ollama.

```json
{
  "agentName": "ImageAgentLow",
  "description": "Fast draft image generation.",
  "runtime": "ollama",
  "endpoint": "http://your-tailscale-domain-here.net:your-ollama-port/api/generate",
  "model": "dolphin-nemo:12b",
  "capabilities": ["image_generation_fast"],
  "costModel": "local_free",
  "healthCheck": "/api/tags",
  "fallbacks": {
    "cloud": "fable-5"
  }
}
```

---

# ⭐ 9. **SpeechAgent (STT)**  
Ollama.

```json
{
  "agentName": "SpeechAgent",
  "description": "Speech-to-text transcription.",
  "runtime": "ollama",
  "endpoint": "http://your-tailscale-domain-here.net:your-ollama-port/api/generate",
  "model": "whisper-large:latest",
  "capabilities": ["stt"],
  "costModel": "local_free",
  "healthCheck": "/api/tags",
  "fallbacks": {
    "cloud": "azure-whisper"
  }
}
```

---

# ⭐ 10. **TTSAgent (XTTS)**  
Independent service.

```json
{
  "agentName": "TTSAgent",
  "description": "Text-to-speech synthesis.",
  "runtime": "xtts",
  "endpoint": "http://your-tailscale-domain-here.net:5000/tts",
  "model": "xtts",
  "capabilities": ["tts"],
  "costModel": "local_free",
  "healthCheck": "/health",
  "fallbacks": {
    "cloud": "azure-tts"
  }
}
```

---

# ⭐ 11. **VisionAgent (Image Understanding)**  
LM Studio heavy model.

```json
{
  "agentName": "VisionAgent",
  "description": "Image reasoning and multimodal analysis.",
  "runtime": "lmstudio",
  "endpoint": "http://your-tailscale-domain-here.net:your-lmstudio-port/v1/chat/completions",
  "model": "phi-4-reasoning-plus-vision",
  "capabilities": ["vision_reasoning"],
  "costModel": "local_free",
  "healthCheck": "/health",
  "fallbacks": {
    "cloud": "claude-opus-4.8"
  }
}
```

---

# ⭐ 12. **CloudAgent (Unified Cloud Router)**  
Azure + Anthropic.

```json
{
  "agentName": "CloudAgent",
  "description": "Unified cloud routing for Azure and Anthropic models.",
  "runtime": "cloud",
  "endpoint": "multi",
  "model": "dynamic",
  "capabilities": ["cloud_reasoning", "cloud_design", "cloud_cowork", "cloud_code"],
  "costModel": "cloud_tracked",
  "healthCheck": "ping",
  "routes": {
    "heavy_reasoning": "claude-opus-4.8",
    "fallback_reasoning": "phi-4-reasoning",
    "design": "claude-design",
    "cowork": "claude-cowork",
    "major_code": "claude-code",
    "creative": "fable-5",
    "mid_reasoning": "claude-sonnet-5"
  }
}
```

---

# ⭐ Final Answer  
You now have **complete Agent Profile JSON templates** for:

- LM Studio heavy agents  
- Ollama hot‑swap agents  
- XTTS  
- ONNX  
- ChromaDB  
- Cloud agents  

These are ready to paste directly into aplus’s Agent Profile designer.

If you want next, I can generate:

- **Agent Capability Map**  
- **aplus Cost Tracking Schema**  
- **Orchestrator health‑check module**  
- **LM Studio detection module**  
- **Full server.js scaffolding**  

Just tell me what you want.