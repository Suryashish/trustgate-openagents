# TrustGate backend — Phase 12 production image.
#
# Bundles the AXL Linux ELF, the Python API, the Phase-4 workers, and the
# on-disk registry cache into a single container. Runs the entire stack
# (3 AXL nodes + 2 workers + Flask API) inside one Railway service.
#
# Frontend deploys separately to Vercel — `NEXT_PUBLIC_API_URL` on Vercel
# points at this container's public URL.
#
# Build:  docker build -t trustgate-api .
# Run:    docker run -p 8000:8000 --rm trustgate-api
# Health: curl http://127.0.0.1:8000/api/health

FROM python:3.11-slim AS runtime

# OS deps: openssl for AXL key generation, ca-certificates for HTTPS RPC,
# curl for the readiness probes, procps for pgrep used by run-prod.sh.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        openssl \
        procps \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) Python deps first so Docker can cache the layer when only app code changes.
COPY app/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
 && pip install --no-cache-dir gunicorn

# 2) AXL binary + scripts. start_axl_nodes.sh resolves the binary as
#    `$(dirname $0)/../AXL`, so AXL must be a sibling of scripts/.
COPY AXL /app/AXL
COPY scripts /app/scripts
RUN chmod +x /app/AXL/node /app/scripts/*.sh

# 3) Application code + bundled card cache. Bundling means cold starts are
#    instant — no 10-minute registry rescan against a public RPC. Updates
#    require a redeploy; that's acceptable for a hackathon demo.
COPY app /app/app

# AXL nodes write their TLS keys + state under $HOME/axl-test (see
# start_axl_nodes.sh). Pointing HOME at /data lets a Railway volume mount
# at /data persist those keys across deploys, so n2/n3 keep stable
# pubkeys instead of regenerating on every container restart.
ENV HOME=/data

# Exposed port — Railway maps it to a public HTTPS hostname automatically.
EXPOSE 8000
ENV PORT=8000 \
    PYTHONPATH=/app/app \
    PYTHONUNBUFFERED=1 \
    TRUSTGATE_CACHE_DIR=/app/app/.cache

# /data is the conventional Railway volume mount point. We pre-create it so
# unmounted runs (e.g. local `docker run`) still work; mounted runs reuse
# the existing files.
RUN mkdir -p /data

CMD ["bash", "/app/scripts/run-prod.sh"]
