import pandas as pd
from pathlib import Path

# CSV files wala folder
folder_path = Path(r"D:\Fin\Prod\chartreplay\data")

for file in folder_path.glob("*.csv"):
    try:
        df = pd.read_csv(file)

        if "time" in df.columns:
            df.rename(columns={"time": "datetime"}, inplace=True)
            df.to_csv(file, index=False)
            print(f"Updated: {file.name}")
        else:
            print(f"Skipped (time column not found): {file.name}")

    except Exception as e:
        print(f"Error in {file.name}: {e}")

print("Done!")