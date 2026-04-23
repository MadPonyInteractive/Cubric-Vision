import os
from huggingface_hub import HfApi

# --- CONFIGURATION ---
TOKEN = "***REMOVED***"
REPO_ID = "CubricStudio/app-models"
# Enable faster Rust-based uploader for better bandwidth utilization
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
os.environ["HF_TOKEN"] = TOKEN
# ---------------------

def upload():
    # Ask for folder path
    folder_path = input("Enter the full path of the folder to upload: ").strip('"')

    if not os.path.isdir(folder_path):
        print("Error: That is not a valid folder path.")
        return

    api = HfApi()
    hf_transfer = os.environ.get("HF_HUB_ENABLE_HF_TRANSFER", "not set")
    print(f"HF_HUB_ENABLE_HF_TRANSFER: {hf_transfer}")
    print(f"Starting upload to {REPO_ID}...")

    try:
        api.upload_large_folder(
            folder_path=folder_path,
            repo_id=REPO_ID,
            repo_type="model",
            num_workers=2
        )
        print("Upload successful!")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    upload()
    input("Press Enter to close...")