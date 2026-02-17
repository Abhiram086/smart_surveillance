# 🛰️ Smart Surveillance System (YOLOv8 + FastAPI + React)

AI-powered real-time surveillance system capable of monitoring live cameras and detecting suspicious activities.

Works on **Windows, Linux and MacOS**
Supports **CPU and NVIDIA GPU automatically**

---

## ✨ Features

* 👤 Person detection using YOLOv8
* 🏃 Running / abnormal behavior detection
* 🚧 Metro line crossing detection
* 🔒 Restricted zone monitoring
* 📷 Live webcam streaming inside browser
* 🌐 Full web dashboard (React UI)
* ⚡ Automatic GPU usage if CUDA available
* 📦 Automatic model download (no manual setup)

---

## 🧠 System Architecture

```
Camera → Scenario → Detector → Stream → Browser UI
```

Backend:

> FastAPI + OpenCV + Ultralytics YOLO

Frontend:

> React + Vite + TypeScript

Streaming:

> MJPEG HTTP stream (no plugins required)

---

# 🚀 Installation Guide

---

## 1️⃣ Clone Repository

```bash
git clone https://github.com/Abhiram086/smart_surveillance.git
cd smart_surveillance
```

---

## 2️⃣ Create Virtual Environment

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

## 4️⃣ Install Frontend (Web Dashboard)

You must have **Node.js 18+**

Check:

```bash
node -v
```

Then install UI:

```bash
cd frontend
npm install
```

(or pnpm install)

---

# ▶️ Running the System

You need **2 terminals**

---

## Terminal 1 — Start Backend

From project root:

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

# 🎯 Running Individual Scenarios (CLI mode)

You can also run detectors without UI.

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

1. Place video inside:

```
videos/
```

2. Edit config file:

Example:

```json
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

The program automatically detects GPU:

```
CUDA available → uses GPU
No CUDA → uses CPU
```

No extra configuration needed.

---

# 📁 Project Structure

```
smart_surveillance/
│
├── backend/          FastAPI API + streaming
├── core/             Detection engines
├── scenarios/        Scenario logic
├── config/           JSON configurations
├── frontend/         React dashboard
├── videos/           Sample videos
├── main.py           CLI dispatcher
└── requirements.txt
```

---

# 🧪 Tested Platforms

| OS            | Status |
| ------------- | ------ |
| Windows 10/11 | ✅      |
| Ubuntu / Arch | ✅      |
| MacOS         | ✅      |
| NVIDIA GPU    | ✅      |
| CPU only      | ✅      |

---

# ⚠️ Known Limitations (WIP)

* Multi-camera management coming soon
* Admin/User authentication pending
* Config drawing tools not yet added

---

# 🛠️ Troubleshooting

### Webcam not opening

Close apps using camera (Zoom, Teams, browser tabs)

### Port already in use

Change port:

```
uvicorn app:app --reload --port 8001
```

### Model downloads every run

Ensure internet available first run

---

# 📜 License

Educational / Mini Project

---

# 👨‍💻 Author

Abhiram S
