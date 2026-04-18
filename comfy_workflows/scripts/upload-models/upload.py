import os
from huggingface_hub import HfApi

# --- CONFIGURATION ---
TOKEN = "***REMOVED***" 
REPO_ID = "CubricStudio/app-models"
# ---------------------

def upload():
    # Ask for folder path
    folder_path = input("Enter the full path of the folder to upload: ").strip('"')
    
    if not os.path.isdir(folder_path):
        print("Error: That is not a valid folder path.")
        return

    api = HfApi()
    print(f"Starting upload to {REPO_ID}...")
    
    try:
        api.upload_folder(
            folder_path=folder_path,
            repo_id=REPO_ID,
            token=TOKEN,
            repo_type="model",
            num_threads=3  # <--- (Default is usually 5-8)
        )
        print("Upload successful!")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    upload()
    input("Press Enter to close...")