"""Make the package importable from a plain `pytest` in a fresh clone."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
