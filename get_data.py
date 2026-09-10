import os
import shutil

source_folder = r"C:\Users\prana\AppData\Roaming\MetaQuotes\Terminal\9B101088254A9C260A9790D5079A7B11\MQL5\Files"
destination_folder = r"D:\Fin\Prod\chartreplay\data"

# Set to True to delete all existing CSV files in destination first
delete_existing = True

os.makedirs(destination_folder, exist_ok=True)

# Delete existing CSV files in destination
if delete_existing:
    for file in os.listdir(destination_folder):
        if file.lower().endswith(".csv"):
            file_path = os.path.join(destination_folder, file)
            os.remove(file_path)
            print(f"Deleted: {file}")

# Copy CSV files from source to destination
for file in os.listdir(source_folder):
    if file.lower().endswith(".csv"):
        source_file = os.path.join(source_folder, file)
        destination_file = os.path.join(destination_folder, file)

        shutil.copy2(source_file, destination_file)
        print(f"Copied: {file}")

print("Done!")