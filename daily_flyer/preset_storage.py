"""Shared storage selection for both year-two explorers."""
import os
from pathlib import Path


def preset_db(sport):
    explicit = os.environ.get(f"{sport.upper()}_PRESET_DB")
    if explicit:
        return Path(explicit)
    if sport == "baseball" and os.environ.get("QB_PRESET_DB"):
        return Path(os.environ["QB_PRESET_DB"]).with_name("baseball_presets.sqlite3")
    directory = os.environ.get("YEAR_TWO_DATA_DIR")
    if directory:
        return Path(directory) / f"{sport}_presets.sqlite3"
    # A directory alone is not evidence of a disk. Only use an actual mount.
    if os.path.ismount("/var/data"):
        return Path("/var/data") / f"{sport}_presets.sqlite3"
    return Path(__file__).resolve().parents[1] / "instance" / f"{sport}_presets.sqlite3"


def storage_info(sport):
    path = preset_db(sport)
    mounted = any(os.path.ismount(parent) for parent in path.parents if parent != Path("/"))
    configured = bool(os.environ.get(f"{sport.upper()}_PRESET_DB") or os.environ.get("YEAR_TWO_DATA_DIR") or (sport == "baseball" and os.environ.get("QB_PRESET_DB"))) or mounted
    message = ("Shared presets use an attached filesystem. Keep its persistent disk attached across deployments."
               if mounted else "Shared presets use a configured path. It survives deployment only if that path is on a persistent disk."
               if configured else "Shared presets use temporary server storage and can be lost on deployment. Attach a persistent disk at /var/data for automatic durable storage.")
    return dict(configured=configured, mounted=mounted, message=message + " This browser also keeps recovery copies of saved presets and your draft when browser storage is available.")
