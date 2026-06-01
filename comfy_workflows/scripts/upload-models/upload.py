import os
from huggingface_hub import HfApi

# --- CONFIGURATION ---
TOKEN = "***REMOVED***"
REPO_ID = "Mad-Pony-Interactive/cubric-studio"
# Enable faster Rust-based uploader for better bandwidth utilization
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
os.environ["HF_TOKEN"] = TOKEN
# ---------------------

def upload():
    mode = input("Upload [f]older or [s]ingle file? (f/s): ").strip().lower()

    api = HfApi()
    hf_transfer = os.environ.get("HF_HUB_ENABLE_HF_TRANSFER", "not set")
    print(f"HF_HUB_ENABLE_HF_TRANSFER: {hf_transfer}")

    if mode == "s":
        file_path = input("Enter the full path of the file to upload: ").strip('"')
        if not os.path.isfile(file_path):
            print("Error: That is not a valid file path.")
            return

        path_in_repo = input("Path in repo (blank = filename at root): ").strip('"') or os.path.basename(file_path)

        print(f"Starting upload of {file_path} to {REPO_ID}:{path_in_repo}...")
        try:
            api.upload_file(
                path_or_fileobj=file_path,
                path_in_repo=path_in_repo,
                repo_id=REPO_ID,
                repo_type="model",
            )
            print("Upload successful!")
        except Exception as e:
            print(f"An error occurred: {e}")
        return

    folder_path = input("Enter the full path of the folder to upload: ").strip('"')
    if not os.path.isdir(folder_path):
        print("Error: That is not a valid folder path.")
        return

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