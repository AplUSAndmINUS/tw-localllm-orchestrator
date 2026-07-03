# Docker Compose examples and updates

- **LM Studio runs manually** (no Docker)
- **Ollama runs in Docker** (hot‑swap engine)
- **XTTS runs in Docker**
- **ONNX Runtime runs in Docker**
- **ChromaDB runs in Docker**
- All containers reachable via **Tailscale URL**  
  `your-tailscale-domain-here.net`

---

# 🧱 **docker-compose.yml (Full Multi‑Service Orchestration)**  
You can split this into multiple files if you prefer, but this single Compose file is clean and manageable.

```yaml
version: "3.9"

services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    restart: unless-stopped
    ports:
      - "your-ollama-port:your-ollama-port"
    volumes:
      - ollama_models:/root/.ollama
    environment:
      - OLLAMA_HOST=0.0.0.0
    networks:
      - aplus

  xtts:
    image: ghcr.io/coqui-ai/xtts:latest
    container_name: xtts
    restart: unless-stopped
    ports:
      - "5000:5000"
    volumes:
      - xtts_data:/data
    networks:
      - aplus

  onnx_runtime:
    image: mcr.microsoft.com/onnxruntime/server:latest
    container_name: onnx_runtime
    restart: unless-stopped
    ports:
      - "8014:your-onnx-port"
    volumes:
      - onnx_models:/models
    networks:
      - aplus

  chromadb:
    image: chromadb/chromadb:latest
    container_name: chromadb
    restart: unless-stopped
    ports:
      - "8013:your-chromadb-port"
    volumes:
      - chromadb_data:/data
    networks:
      - aplus

volumes:
  ollama_models:
  xtts_data:
  onnx_models:
  chromadb_data:

networks:
  aplus:
    driver: bridge
```

---

# 🧩 **Service Breakdown**

## 🐋 **Ollama (Hot‑Swap LLM Runtime)**
- Runs all dynamically loaded models  
- Orchestrator can:
  - pull models  
  - unload models  
  - switch models  
  - check loaded models  
- Perfect for:
  - phi‑4‑mini  
  - phi‑3‑mini  
  - llama‑3.1  
  - dolphin‑nemo  
  - deepseek‑coder  
  - whisper  
  - etc.

## 🔊 **XTTS (Local TTS)**
- Independent CPU‑based TTS  
- No GPU conflict  
- Always available

## ⚙️ **ONNX Runtime**
- Lightweight inference  
- CPU‑based  
- Perfect for:
  - small models  
  - embeddings  
  - fallback inference

## 📚 **ChromaDB**
- Vector store  
- Stores embeddings for:
  - RCF book  
  - APlus docs  
  - TRI podcast notes  
  - System architecture  
- Accessible via orchestrator

## 🧠 **LM Studio (Manual Heavy‑Model Runtime)**
- **Not in Docker**  
- Must be manually opened  
- Must manually load:
  - Phi‑4 Reasoning Plus  
  - DeepSeek R1  
  - Qwen 2.5 14B  
  - Phi‑4 Vision  
- Orchestrator detects LM Studio availability  
- Falls back to Ollama or cloud if LM Studio is offline or wrong model is loaded

---

# 🌐 **Networking Notes**
All containers are reachable via your Tailscale mesh hostname. Configure these in `.env` (see `.env.example`):

**Environment Variables:**
```bash
APLUS_TAILSCALE_HOST=your-device.tail5c19eb.ts.net
APLUS_OLLAMA_PORT=your-ollama-port
APLUS_LMSTUDIO_PORT=your-lmstudio-port
APLUS_XTTS_PORT=your-xtts-port
APLUS_ONNX_PORT=your-onnx-port
APLUS_CHROMADB_PORT=your-chromadb-port
```

**Example URLs:**
```
http://${APLUS_TAILSCALE_HOST}:${APLUS_OLLAMA_PORT}
http://${APLUS_TAILSCALE_HOST}:${APLUS_LMSTUDIO_PORT}
http://${APLUS_TAILSCALE_HOST}:${APLUS_XTTS_PORT}
http://${APLUS_TAILSCALE_HOST}:${APLUS_ONNX_PORT}
http://${APLUS_TAILSCALE_HOST}:${APLUS_CHROMADB_PORT}
```

Your orchestrator will use these URLs and environment variables.

---

# 🧠 **Why this Compose setup is correct**
### ✔ LM Studio stays manual  
You avoid GPU crashes and manual model switching issues.

### ✔ Ollama handles all dynamic loading  
Your orchestrator can hot‑swap models automatically.

### ✔ XTTS, ONNX, ChromaDB run independently  
No GPU conflict  
No LM Studio conflict  
No Ollama conflict

### ✔ Containers can be started/stopped on demand  
You can run:
- only Ollama  
- only XTTS  
- only ChromaDB  
- only ONNX  
- or all of them together

### ✔ Perfect for your orchestrator  
Claude Code will generate:
- health checks  
- runtime selection  
- fallback logic  
- hot‑swap logic  
- cloud escalation  
- LM Studio detection

---

# ⭐ If you want next:
I can generate:

### ✔ `docker-compose.override.yml`  
(For dev vs prod)

### ✔ Individual Compose files  
- `docker-compose.ollama.yml`  
- `docker-compose.xtts.yml`  
- `docker-compose.onnx.yml`  
- `docker-compose.chromadb.yml`

### ✔ Orchestrator scaffolding (`server.js`)  
### ✔ Agent scaffolding (`/agents/*.js`)  
### ✔ Model clients (`/models/*.js`)  
### ✔ Cloud clients (`/cloud/*.js`)  
### ✔ README.md for your GitHub repo  

Just tell me what you want next.