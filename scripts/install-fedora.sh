#!/usr/bin/env bash
set -euo pipefail
# PostgreSQL 17 existant est conservé. Aucun cluster n'est migré ou démarré.
sudo dnf install -y gcc gcc-c++ postgresql18 postgresql18-server
/usr/pgsql-18/bin/psql --version
gcc --version
