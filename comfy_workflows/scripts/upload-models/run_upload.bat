@echo off
pip show huggingface_hub >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing Hugging Face library with hf_transfer...
    pip install -U "huggingface_hub[cli,hf_transfer]"
) else (
    pip show hf-transfer >nul 2>&1
    if %errorlevel% neq 0 (
        echo Installing hf_transfer for faster uploads...
        pip install hf-transfer
    )
)

python upload.py
pause