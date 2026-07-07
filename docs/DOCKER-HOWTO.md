# Docker How-To Guide for the APlus Orchestrator

This guide is written for someone who has never used Docker before. By the end, you will know how to start and manage all the services that the APlus Orchestrator depends on.

---

## 1. What is Docker?

Docker packages software into **containers** -- self-contained boxes that include everything a program needs to run: the code, its dependencies, configuration, and even a mini operating system. Think of a shipping container on a cargo ship: it does not matter what is inside, it is the same standard box everywhere, and it can be moved from one ship (or computer) to another without repacking.

**Docker Compose** takes this a step further. Instead of starting containers one at a time, you write a single file (`docker-compose.yml`) that describes all the services your project needs, and Docker Compose starts them all together with one command.

A few terms you will see often:

- **Image** -- A read-only template, like a recipe. It describes *how* to build a container but does not run anything on its own. For example, `ollama/ollama:latest` is an image.
- **Container** -- A running instance of an image, like the dish you cooked from the recipe. You can start, stop, and delete containers without affecting the image.
- **Volume** -- Persistent storage that lives outside the container. When a container is deleted and recreated, data inside the container is lost, but data in a volume survives. This is how your downloaded AI models and databases stick around between restarts.

---

## 2. Installing Docker on Windows

### Step 1: Install Docker Desktop

Download and install Docker Desktop for Windows from the official documentation:

**https://docs.docker.com/desktop/setup/install/windows-install/**

During installation, Docker Desktop will ask you to enable **WSL 2** (Windows Subsystem for Linux 2). This is a lightweight Linux layer that Windows 11 uses to run containers efficiently. Follow the prompts to enable it -- the installer handles most of the setup for you.

After installation, restart your computer if prompted.

### Step 2: Start Docker Desktop

Open **Docker Desktop** from the Start menu. It runs in the background (you will see a whale icon in your system tray near the clock). Docker Desktop must be running whenever you want to use Docker commands.

### Step 3: Verify the Installation

Open a terminal (PowerShell or Command Prompt) and run:

```powershell
docker --version
```

You should see something like `Docker version 27.x.x, build ...`.

Then verify Docker Compose is available:

```powershell
docker compose version
```

You should see something like `Docker Compose version v2.x.x`. If both commands work, you are ready to go.

---

## 3. Basic Docker Commands Cheat Sheet

Here are the commands you will use most often. Run all of these from the `docker` folder inside the project:

```powershell
cd C:\Users\teren\source\repos\tw-localllm-orchestrator\docker
```

| Command | What It Does |
|---|---|
| `docker compose up -d` | Start all services in the background (`-d` means "detached") |
| `docker compose down` | Stop and remove all running containers |
| `docker compose ps` | Show which containers are running and their status |
| `docker compose logs ollama` | Show the log output for a specific service (replace `ollama` with any service name) |
| `docker compose logs -f ollama` | Follow the logs in real time (press `Ctrl+C` to stop watching) |
| `docker compose restart ollama` | Restart a single service without touching the others |
| `docker compose pull` | Download the latest versions of all images |
| `docker compose stop` | Stop containers without removing them (faster to start again later) |
| `docker compose start` | Start previously stopped containers |

---

## 4. Using Docker with This Project

### What services are defined?

The main `docker-compose.yml` (in the `docker` folder) defines four services:

| Service | Container Name | Image | Default Port | What It Does |
|---|---|---|---|---|
| **ollama** | `aplus-ollama` | `ollama/ollama:latest` | 11434 | Runs local LLMs (like phi4-mini) |
| **xtts** | `aplus-xtts` | `ghcr.io/coqui-ai/xtts-streaming-server:latest-cuda121` | 5002 | Text-to-speech synthesis (GPU) |
| **onnx-runtime** | `aplus-onnx` | `ghcr.io/huggingface/text-embeddings-inference:cpu-1.9` | 8001 | Text embedding server |
| **chromadb** | `aplus-chromadb` | `chromadb/chroma:latest` | 8000 | Vector database for embeddings |

**Important:** LM Studio runs **outside** Docker. It is a regular desktop application that you install and run on Windows like any other program. Docker only manages the four services listed above.

### Starting everything

Open a terminal and navigate to the `docker` folder:

```powershell
cd C:\Users\teren\source\repos\tw-localllm-orchestrator\docker
```

Then start all four services:

```powershell
docker compose up -d
```

The first time you run this, Docker will download the images (this can take a while depending on your internet speed). After that, subsequent starts are much faster because the images are cached locally.

### Starting only specific services

You do not have to start everything. If you only need Ollama and ChromaDB, for example:

```powershell
docker compose up -d ollama chromadb
```

### Checking if services are running

```powershell
docker compose ps
```

You will see a table showing each container, its status (e.g., `running` or `exited`), and the port mappings.

### Viewing logs when something goes wrong

If a service is not behaving as expected, check its logs:

```powershell
docker compose logs ollama
```

To watch the logs update in real time (useful while debugging):

```powershell
docker compose logs -f ollama
```

Press `Ctrl+C` to stop watching.

### Stopping everything

```powershell
docker compose down
```

This stops and removes the containers but **keeps your data volumes** (your downloaded models, database data, etc.). The next time you run `docker compose up -d`, everything picks up where it left off.

---

## 5. Running Individual Services

In addition to the main `docker-compose.yml`, the project includes separate compose files for each service in the `docker` folder:

| File | Service |
|---|---|
| `docker-compose.ollama.yml` | Ollama only |
| `docker-compose.xtts.yml` | XTTS only |
| `docker-compose.onnx.yml` | ONNX Runtime only |
| `docker-compose.chromadb.yml` | ChromaDB only |

These are useful if you want to run just one service in isolation, without starting the shared network or the other services.

To use a specific compose file, pass it with the `-f` flag:

```powershell
docker compose -f docker-compose.ollama.yml up -d
```

To stop it:

```powershell
docker compose -f docker-compose.ollama.yml down
```

Everything else works the same way -- just add `-f <filename>` before the command (`up`, `down`, `ps`, `logs`, etc.).

---

## 6. Managing Ollama Models in Docker

When Ollama runs inside Docker, its models are stored in a Docker volume (`ollama_models`), not on your regular file system. You manage models by running commands inside the container.

### Pulling (downloading) a model

```powershell
docker exec aplus-ollama ollama pull phi4-mini:latest
```

Replace `phi4-mini:latest` with whatever model you want. This downloads the model into the Docker volume.

### Listing installed models

```powershell
docker exec aplus-ollama ollama list
```

### Running a quick test

```powershell
docker exec aplus-ollama ollama run phi4-mini:latest "Hello, are you working?"
```

### Do models survive restarts?

Yes. The models are stored in a Docker **volume**, not inside the container itself. You can stop and restart the container (`docker compose down` then `docker compose up -d`) and your models will still be there. The only way to lose them is if you explicitly delete the volume (see the Troubleshooting section below).

---

## 7. Troubleshooting

### "Cannot connect to the Docker daemon"

This means Docker Desktop is not running. Open **Docker Desktop** from the Start menu and wait for the whale icon to appear in the system tray. Then try your command again.

### Port conflicts ("port is already allocated")

This happens when another application on your computer is already using the same port. For example, if you have Ollama installed natively *and* try to run it in Docker, both want port 11434.

**Fix:** Either stop the other application, or change the port by setting environment variables before starting Docker Compose. Create a `.env` file in the `docker` folder (copy it from `.env.example` in the project root) and change the port values:

```
APLUS_OLLAMA_PORT=11435
APLUS_CHROMADB_PORT=8010
```

Then restart the services:

```powershell
docker compose down
docker compose up -d
```

### GPU passthrough issues

The Ollama service in `docker-compose.yml` is configured to request GPU access. If you do not have an NVIDIA GPU, or if your GPU drivers are not set up for Docker, you may see errors when starting the Ollama container.

**Fix for CPU-only mode:** Edit `docker\docker-compose.yml` (or `docker\docker-compose.ollama.yml`) and remove the `deploy` section from the `ollama` service:

```yaml
    # Remove or comment out these lines:
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - capabilities: [gpu]
```

Then restart:

```powershell
docker compose down
docker compose up -d ollama
```

Ollama will run on CPU. It will be slower than GPU mode but will work.

### A container will not start

Check the logs for that specific service:

```powershell
docker compose logs ollama
```

Common causes:
- The image failed to download (network issue) -- try `docker compose pull` and then `docker compose up -d` again.
- A required file or directory is missing -- the logs will usually say what is wrong.

### How to reset everything (nuclear option)

If things are really broken and you want to start completely fresh:

```powershell
docker compose down -v
```

**Warning:** The `-v` flag deletes all **data volumes**. This means your downloaded Ollama models, ChromaDB data, XTTS data, and ONNX models will all be permanently deleted. You will need to re-download everything. Only use this as a last resort.

After that, start fresh:

```powershell
docker compose up -d
```

---

## Quick Reference

Here is the typical workflow you will follow day to day:

```powershell
# Navigate to the docker folder
cd C:\Users\teren\source\repos\tw-localllm-orchestrator\docker

# Start all services
docker compose up -d

# Check that everything is running
docker compose ps

# When you are done for the day, stop everything
docker compose down
```

That is it. Docker handles the rest.
