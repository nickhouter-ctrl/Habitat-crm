"""Launch against the installed/pinned Hermes runtime without changing its packages."""
import sys
import runpy
sys.path.insert(0, '/home/hermes/.hermes/hermes-agent')
import hermes_bootstrap  # noqa: F401
runpy.run_path('/home/hermes/habitat/server.py', run_name='__main__')
