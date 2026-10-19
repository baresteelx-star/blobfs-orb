#!/usr/bin/env python3
"""Run the BlobFS reference from a repository checkout.

The implementation is the ``orb`` package in ``src/orb``. This file stays at
the repository root so ``python orb.py verify|info FILE.orb`` keeps working.
Importing ``orb`` from a checkout loads that package. An installed copy uses
the ``orb`` command from ``pyproject.toml`` instead.
"""
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

if __name__ == "__main__":
    sys.exit(importlib.import_module("orb").main(sys.argv))

# Imported as ``orb`` because the checkout root is on sys.path. Drop this
# module and load the package so the caller receives src/orb.
del sys.modules[__name__]
sys.modules[__name__] = importlib.import_module("orb")
