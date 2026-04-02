#!/bin/bash
set +e

systemctl stop uvi.atlas-glitterk_worker.service
systemctl stop uvi.atlas-glitterk.service
systemctl stop uvi.atlas-glitterk_api.service
systemctl stop uvi.atlas-minio.service
