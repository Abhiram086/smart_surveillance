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

# 🧰 Requirements

Install the following software:

| Software   | Version |
|------------|---------|
| Python     | 3.10+   |
| Node.js    | 18+     |
| PostgreSQL | 14+     |
| Git        | Latest  |

Optional:

| Hardware   | Support  |
|------------|----------|
| NVIDIA GPU | CUDA 11+ |

---

# 🚀 Installation Guide

## 1️⃣ Clone Repository

```bash
git clone https://github.com/Abhiram086/smart_surveillance.git
cd smart_surveillance
```

---

# 🐍 Backend Setup

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

# 🗄️ Database Setup (PostgreSQL)

The system uses **PostgreSQL for user authentication**.

---

## 1️⃣ Install PostgreSQL

Download:  
[https://www.postgresql.org/download/](https://www.postgresql.org/download/)

During installation remember the password for:
```
postgres
```

---

## 2️⃣ Create Database

Open terminal or command prompt:
```bash
psql -U postgres
```

Run the following:
```sql
CREATE DATABASE surveillance;
CREATE USER surveillance_user WITH PASSWORD 'surveillance_pass';
GRANT ALL PRIVILEGES ON DATABASE surveillance TO surveillance_user;
```

Connect to the database:
```sql
\c surveillance
```

Grant schema permissions:
```sql
GRANT ALL ON SCHEMA public TO surveillance_user;
ALTER SCHEMA public OWNER TO surveillance_user;
```

Exit:
```sql
\q
```

---

## 3️⃣ Configure Environment Variables

Create file:
```
backend/.env
```

Add:
```
DATABASE_URL=postgresql://surveillance_user:surveillance_pass@localhost:5432/surveillance
```

---

## 4️⃣ Initialize Database Tables

From backend folder:
```bash
cd backend
python -m db.init_db
```

This creates the table:
```
users
```

Schema:
```
users
├── id           SERIAL PRIMARY KEY
├── username     TEXT UNIQUE
├── password_hash TEXT
├── role         TEXT
└── created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

---

# 🌐 Frontend Setup

## 5️⃣ Install Frontend Dependencies

```bash
cd frontend
npm install
```

(or)

```bash
pnpm install
```

---

# ▶️ Running The System

You need **two terminals**.

---

## Terminal 1 — Start Backend

```bash
cd backend
uvicorn app:app --reload --port 8000
```

Backend runs at:
```
http://127.0.0.1:8000
```

---

## Terminal 2 — Start Web Dashboard

```bash
cd frontend
npm run dev
```

Open browser:
```
http://localhost:5173
```

You should now see the surveillance dashboard 🎥

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

You can run detectors via CLI.

### Line Crossing
```bash
python main.py config/metro_line.json
```

### Restricted Zone
```bash
python main.py config/restricted_zone.json
```

### Behavior Detection
```bash
python main.py config/behavior.json
```

Press **Q** to exit window.

---

# 📹 Using Your Own Video

Place videos inside:
```
videos/
```

Edit config file. Example:
```
"video": "videos/myvideo.mp4"
```

---

# 🖥️ Using Webcam

Use:
```
"video": 0
```

Example:
```json
{
  "scenario": "BEHAVIOR",
  "video": 0
}
```

---

# ⚙️ GPU Support

The system automatically detects CUDA.

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
├── db/               Database initialization
├── main.py           CLI detection runner
└── requirements.txt
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

- Multi-camera support coming soon
- Config drawing UI not implemented
- Alert notifications not implemented

---

# 🛠️ Troubleshooting

## Webcam not opening
Close applications using camera:
```
Zoom
Teams
Browser tabs
```

---

## Port already in use
Change backend port:
```bash
uvicorn app:app --reload --port 8001
```

---

## Model downloads every run
Ensure internet connection on first run.

---

# 📜 License

Educational Mini Project

---

# 👨‍💻 Author

Abhiram S
