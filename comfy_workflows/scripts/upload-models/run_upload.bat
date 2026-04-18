@echo off
pip show huggingface_hub >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing Hugging Face library...
    pip install -U "huggingface_hub[cli]"
)

python upload.py
pause