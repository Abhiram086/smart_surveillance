# 🛰️ Smart Surveillance System (YOLOv8 + FastAPI + React)
AI-powered real-time surveillance system capable of monitoring live cameras and detecting suspicious activities.

Supports **Windows, Linux and MacOS**  
Automatically uses **CPU or NVIDIA GPU (CUDA)**.

---

# ✨ Features

- 👤 Person detection using **YOLOv8**
- 🏃 Running / abnormal behavior detection
- 🚧 Metro line crossing detection
- 🔒 Restricted zone monitoring
- 📷 Live webcam streaming inside browser
- 🌐 Full web dashboard (React UI)
- 👥 User authentication (Admin / Viewer)
- ⚡ Automatic GPU usage if CUDA available
- 📦 Automatic model download (no manual setup)
- 🐳 One-command Docker setup (no manual installs)

---

# 🧠 System Architecture

```
Camera → Scenario → Detector → Stream → Browser UI
```

### Backend
- **FastAPI**
- **OpenCV**
- **Ultralytics YOLOv8**
- **PostgreSQL authentication**

### Frontend
- **React**
- **Vite**
- **TypeScript**
- **Framer Motion UI**

### Streaming
MJPEG HTTP stream (no plugins required)

---

# 🐳 Quick Start (Docker) — Recommended

> No Python, Node.js, or PostgreSQL installation needed.  
> Docker handles everything automatically.

## Requirements

| Software      | Version  |
|---------------|----------|
| Docker        | Latest   |
| Docker Compose | Latest  |
| Git           | Latest   |

Optional:

| Hardware   | Support  |
|------------|----------|
| NVIDIA GPU | CUDA 12+ |

---

## 1️⃣ Install Docker

### Linux (Arch / CachyOS)
```bash
sudo pacman -S docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

### Windows / Mac
Download Docker Desktop: https://www.docker.com/products/docker-desktop

---

## 2️⃣ Clone Repository

```bash
git clone https://github.com/Abhiram086/smart_surveillance.git
cd smart_surveillance
```

---

## 3️⃣ Start Everything

```bash
docker compose up --build
```

That's it. Docker will:
- Download and start PostgreSQL automatically
- Install all Python dependencies
- Build and serve the React frontend
- Wire everything together

First run takes ~5–10 minutes (downloads PyTorch base image).  
Subsequent runs start in seconds.

Open browser: **http://localhost:5173**

---

## 4️⃣ NVIDIA GPU Support (Optional)

### Linux
```bash
sudo pacman -S nvidia-container-toolkit        # Arch / CachyOS
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Then uncomment the GPU block in `docker-compose.yml`:
```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

Rebuild:
```bash
docker compose up --build backend
```

### Windows
Install NVIDIA Container Toolkit via WSL2 — see:  
https://docs.nvidia.com/cuda/wsl-user-guide/index.html

---

## 🔧 Useful Commands

```bash
# Start in background
docker compose up -d

# View logs
docker compose logs -f

# Stop everything
docker compose down

# Rebuild after code changes
docker compose up --build

# Connect to database directly
docker exec -it smss_db psql -U surveillance_user -d surveillance
```

---

## 📹 USB / Webcam Passthrough (Linux)

Find your camera devices:
```bash
ls /dev/video*
```

Uncomment and edit the `devices` block in `docker-compose.yml`:
```yaml
devices:
  - /dev/video0:/dev/video0
```

Rebuild backend:
```bash
docker compose up --build backend
```

---

## 🗄️ Database

PostgreSQL runs inside Docker. Data persists across restarts in a named volume.

To wipe the database and start fresh:
```bash
docker compose down -v
docker compose up
```

---

---

# 🧰 Manual Setup (Without Docker)

<details>
<summary>Click to expand manual setup instructions</summary>

## Requirements

| Software   | Version |
|------------|---------|
| Python     | 3.10+   |
| Node.js    | 18+     |
| PostgreSQL | 14+     |
| Git        | Latest  |

---

## 1️⃣ Clone Repository

```bash
git clone https://github.com/Abhiram086/smart_surveillance.git
cd smart_surveillance
```

---

## 2️⃣ Create Python Virtual Environment

### Windows
```bash
python -m venv venv
venv\Scripts\activate
```

### Linux / Mac
```bash
python -m venv venv
source venv/bin/activate
```

---

## 3️⃣ Install Python Dependencies

```bash
pip install -r requirements.txt
```

On first run the system automatically downloads:
```
YOLOv8n model (~6MB)
```

---

## 4️⃣ Database Setup (PostgreSQL)

Install PostgreSQL: https://www.postgresql.org/download/

Open terminal:
```bash
psql -U postgres
```

Run:
```sql
CREATE DATABASE surveillance;
CREATE USER surveillance_user WITH PASSWORD 'surveillance_pass';
GRANT ALL PRIVILEGES ON DATABASE surveillance TO surveillance_user;
\c surveillance
GRANT ALL ON SCHEMA public TO surveillance_user;
ALTER SCHEMA public OWNER TO surveillance_user;
\q
```

Create `backend/.env`:
```
DATABASE_URL=postgresql://surveillance_user:surveillance_pass@localhost:5432/surveillance
```

Initialize tables:
```bash
cd backend
python -m db.init_db
```

---

## 5️⃣ Install Frontend Dependencies

```bash
cd frontend
npm install
```

---

## 6️⃣ Run the System

**Terminal 1 — Backend:**
```bash
cd backend
uvicorn app:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Open browser: **http://localhost:5173**

</details>

---

# 🔐 Authentication

Users can register directly from the UI.

Roles supported:
```
admin
viewer
```

Credentials are stored securely using **bcrypt hashing** in PostgreSQL.

---

# 🎯 Running Detection Without Web UI

```bash
# Line Crossing
python main.py config/metro_line.json

# Restricted Zone
python main.py config/restricted_zone.json

# Behavior Detection
python main.py config/behavior.json
```

Press **Q** to exit.

---

# 📹 Using Your Own Video

Place videos inside `videos/` and edit the config file:
```json
"video": "videos/myvideo.mp4"
```

---

# 🖥️ Using Webcam

```json
{
  "scenario": "BEHAVIOR",
  "video": 0
}
```

---

# ⚙️ GPU Support

The system automatically detects CUDA:
```
CUDA available → GPU used
No CUDA        → CPU used
```

No configuration required.

---

# 📁 Project Structure

```
smart_surveillance/
│
├── backend/          FastAPI backend + API routes
├── core/             Detection engines
├── scenarios/        Scenario logic
├── config/           Scenario configuration files
├── frontend/         React dashboard
├── videos/           Sample videos
├── main.py           CLI detection runner
├── requirements.txt
├── docker-compose.yml
└── .dockerignore
```

---

# 🧪 Tested Platforms

| OS                  | Status |
|---------------------|--------|
| Windows 10/11       | ✅     |
| Ubuntu / Arch Linux | ✅     |
| MacOS               | ✅     |
| NVIDIA GPU          | ✅     |
| CPU Only            | ✅     |

---

# ⚠️ Known Limitations (WIP)

- Alert notifications not implemented

---

# 🛠️ Troubleshooting

## Webcam not opening
Close applications using camera (Zoom, Teams, browser tabs).

## Port already in use
Change port mapping in `docker-compose.yml`:
```yaml
ports:
  - "5174:80"   # change left side only
```

## GPU not detected in Docker (Linux)
```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

## Database connection error on first start
```bash
docker compose restart backend
```

---

# 📜 License

Educational Mini Project

---

# 👨‍💻 Author

Abhiram S
