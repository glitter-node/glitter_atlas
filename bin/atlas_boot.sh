#!/bin/bash
set -euo pipefail

systemctl start uvi.atlas-minio.service
sleep 2
systemctl start uvi.atlas-glitterk_api.service
systemctl start uvi.atlas-glitterk.service
systemctl start uvi.atlas-glitterk_worker.service
