# Smart Surveillance System (YOLOv8)

Cross-platform AI surveillance project (Linux + Windows)

Features:
- Line crossing detection
- Restricted zone monitoring
- Behavior (running) detection
- Automatic GPU usage if available
- Automatic YOLO model download

------------------------------------

## 1. Clone repository
git clone https://github.com/Abhiram086/smart_surveillance.git
cd smart_surveillance

------------------------------------

## 2. Create virtual environment

Windows:
python -m venv venv
venv\Scripts\activate

Linux / Mac:
python -m venv venv
source venv/bin/activate

------------------------------------

## 3. Install dependencies

pip install -r requirements.txt

(First run will automatically download YOLO model ~6MB)

------------------------------------

## 4. Run project

Line crossing:
python main.py config/metro_line.json

Restricted zone:
python main.py config/restricted_zone.json

Behavior detection:
python main.py config/behavior.json

------------------------------------

## 5. Using your own video

Place video inside `videos/` folder  
Then edit the path inside the config file.

------------------------------------

Press Q to quit window
