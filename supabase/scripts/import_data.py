"""
Game Boy Catalog Importer
Reads the 5 source CSVs, cleans them, and bulk-upserts into Supabase.

Usage:
  1. Copy .env.example to .env and fill in SUPABASE_URL + SUPABASE_SERVICE_KEY
  2. pip install -r requirements.txt
  3. python import_data.py
"""

import os
import sys
import pandas as pd
import requests
import json
from pathlib import Path
from dotenv import load_dotenv

# ─── Configuration ────────────────────────────────────────────

# Path to the catalog root (parent of collection-tracker/)
CATALOG_ROOT = Path(__file__).resolve().parents[3]

# Source CSV files to import
CSV_FILES = {
    "games": [
        ("01_gameboy_dmg_COMPLETE.csv", "GB"),
        ("02a_gameboy_color_BLACK_cartridge.csv", "GBC"),
        ("02b_gameboy_color_CLEAR_cartridge.csv", "GBC"),
        ("03_gameboy_advance_COMPLETE.csv", "GBA"),
    ],
    "bootlegs": [
        ("05_bootleg_unlicensed_catalog.csv", "Bootleg"),
    ],
}

# These IDs are region/section headers, not real games
SKIP_IDS = {"GBA-0001", "GBA-0002", "GBA-0003"}

BATCH_SIZE = 500  # Supabase REST API batch insert size

# ─── Database columns ─────────────────────────────────────────

GAMES_COLUMNS = [
    "id", "title_en", "title_original", "title_romanji", "platform",
    "cartridge_type", "release_year", "release_jp", "release_na",
    "release_eu", "release_au", "regions", "developer", "publisher",
    "genre", "languages", "notes",
]

BOOTLEGS_COLUMNS = [
    "id", "title_en", "title_original", "title_romanji", "platform",
    "release_year", "developer", "publisher", "origin_country",
    "type", "base_game", "original_game", "genre", "notes",
]


def load_csv(filepath: Path) -> pd.DataFrame:
    """Load a CSV file with BOM handling and whitespace cleanup."""
    print(f"  Reading: {filepath.name} ({filepath.stat().st_size:,} bytes)")
    df = pd.read_csv(filepath, encoding="utf-8-sig", dtype=str, keep_default_na=False)

    # Strip whitespace from all string columns
    for col in df.columns:
        df[col] = df[col].str.strip()
        # Replace empty strings with None (becomes SQL NULL)
        df[col] = df[col].replace({"": None, "nan": None, "NaN": None, "None": None})

    print(f"    → {len(df)} rows, {len(df.columns)} columns")
    return df


def clean_games(df: pd.DataFrame) -> pd.DataFrame:
    """Clean and validate the games dataframe."""
    # Filter out region header rows
    before = len(df)
    df = df[~df["id"].isin(SKIP_IDS)]
    skipped = before - len(df)
    if skipped:
        print(f"    → Skipped {skipped} non-game rows: {SKIP_IDS}")

    # Ensure we only keep known columns (in order)
    df = df[[c for c in GAMES_COLUMNS if c in df.columns]]

    # Convert NaN to None
    df = df.where(pd.notnull(df), None)

    return df


def clean_bootlegs(df: pd.DataFrame) -> pd.DataFrame:
    """Clean and validate the bootlegs dataframe."""
    df = df[[c for c in BOOTLEGS_COLUMNS if c in df.columns]]
    df = df.where(pd.notnull(df), None)
    return df


def upsert_batch(supabase_url: str, service_key: str, table: str, records: list[dict]):
    """Upsert a batch of records into Supabase via REST API."""
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    url = f"{supabase_url}/rest/v1/{table}"

    # Clean records: ensure no NaN values
    clean_records = []
    for r in records:
        clean_r = {}
        for k, v in r.items():
            if v is None or (isinstance(v, float) and pd.isna(v)):
                clean_r[k] = None
            else:
                clean_r[k] = v
        clean_records.append(clean_r)

    try:
        resp = requests.post(url, headers=headers, json=clean_records, timeout=60)
        if resp.status_code not in (200, 201):
            print(f"    ⚠ Batch insert error ({resp.status_code}): {resp.text[:300]}")
            return False
        return True
    except requests.exceptions.RequestException as e:
        print(f"    ⚠ Request failed: {e}")
        return False


def main():
    load_dotenv(CATALOG_ROOT / "collection-tracker" / "supabase" / "scripts" / ".env")

    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_KEY")

    if not supabase_url or not service_key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env file.")
        print("Create collection-tracker/supabase/scripts/.env with:")
        print("  SUPABASE_URL=https://<project>.supabase.co")
        print("  SUPABASE_SERVICE_KEY=<service_role key>")
        sys.exit(1)

    print("=" * 60)
    print("Game Boy Catalog Importer")
    print("=" * 60)
    print(f"Supabase URL: {supabase_url}")
    print(f"Catalog root: {CATALOG_ROOT}")
    print()

    # ─── Import licensed games ─────────────────────────────────
    total_games = 0
    print("─ Importing licensed games ─")

    for filename, platform in CSV_FILES["games"]:
        filepath = CATALOG_ROOT / filename
        if not filepath.exists():
            print(f"  ⚠ Missing: {filename} — skipping")
            continue

        df = load_csv(filepath)
        df = clean_games(df)

        # Convert to list of dicts
        records = df.to_dict(orient="records")

        # Insert in batches
        batches = [records[i:i + BATCH_SIZE] for i in range(0, len(records), BATCH_SIZE)]
        ok = 0
        for i, batch in enumerate(batches):
            if upsert_batch(supabase_url, service_key, "games", batch):
                ok += 1

        print(f"    ✓ Inserted {len(records)} rows ({ok}/{len(batches)} batches)")
        total_games += len(records)

    print(f"  Total games imported: {total_games}")

    # ─── Import bootlegs ───────────────────────────────────────
    total_bootlegs = 0
    print("─ Importing bootlegs ─")

    for filename, platform in CSV_FILES["bootlegs"]:
        filepath = CATALOG_ROOT / filename
        if not filepath.exists():
            print(f"  ⚠ Missing: {filename} — skipping")
            continue

        df = load_csv(filepath)
        df = clean_bootlegs(df)

        records = df.to_dict(orient="records")
        batches = [records[i:i + BATCH_SIZE] for i in range(0, len(records), BATCH_SIZE)]
        ok = 0
        for i, batch in enumerate(batches):
            if upsert_batch(supabase_url, service_key, "bootlegs", batch):
                ok += 1

        print(f"    ✓ Inserted {len(records)} rows ({ok}/{len(batches)} batches)")
        total_bootlegs += len(records)

    print(f"  Total bootlegs imported: {total_bootlegs}")

    # ─── Summary ───────────────────────────────────────────────
    print()
    print("=" * 60)
    print(f"Import complete: {total_games} games + {total_bootlegs} bootlegs")
    print(f"Expected:         3,647 licensed + 136 bootlegs")
    print("=" * 60)
    print()
    print("Next steps:")
    print("  1. Verify row counts in Supabase Table Editor")
    print("  2. Test search: SELECT * FROM search_games('zelda');")
    print("  3. Set up the Telegram bot and web app")


if __name__ == "__main__":
    main()
