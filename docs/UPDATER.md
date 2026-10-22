# Updating from the admin (Docker Compose)

Albm can show an **Update to vX.Y.Z** button in the admin menu bar. It does not touch Docker itself: it asks a small
host-side service (`deploy/updater/albm-updater.py`, Python 3 standard library only) which does the work.

What the updater does, in order: pulls `IMAGE:X.Y.Z`, backs up the database (`/data/pre-update-<ts>.db`, last 3 kept), swaps
the tag on the one `image:` line of `compose.yaml` (the old file is kept as `compose.yaml.bak-<old>`), restarts the service
and waits for it to be healthy. If it never gets healthy it restores `compose.yaml` and starts the old version again.

It only accepts a plain `x.y.z`, only acts on one compose project, service and image, needs the bearer token, and listens on
the docker0 gateway (`172.17.0.1` by default), which is not reachable from the internet. Albm decides the version (the
latest GitHub release), never the browser.

## Install (per instance)

```bash
install -d /opt/albm-updater /etc/albm-updater
install -m 755 deploy/updater/albm-updater.py /opt/albm-updater/
install -m 644 deploy/updater/albm-updater@.service /etc/systemd/system/
TOKEN=$(openssl rand -hex 32)
cat > /etc/albm-updater/prod.env <<EOF2
UPDATER_TOKEN=$TOKEN
COMPOSE_DIR=/opt/albm
SERVICE=albm
IMAGE=ghcr.io/kristian-buriasco/albm
LISTEN_PORT=9201
EOF2
chmod 600 /etc/albm-updater/prod.env
systemctl daemon-reload && systemctl enable --now albm-updater@prod
```

Use a different name and `LISTEN_PORT` for each instance (`staging` 9202, and so on). If a firewall blocks containers
from reaching the host, allow the port from the docker bridge, for example
`ufw allow from 172.16.0.0/12 to 172.17.0.1 port 9201 proto tcp`.

Then give the Albm container the same token and a route to the host in its `compose.yaml`, remove `DISABLE_UPDATE_CHECK`,
and recreate it:

```yaml
    environment:
      UPDATER_URL: http://172.17.0.1:9201
      UPDATER_TOKEN: <the token>   # or put it in .env
```

Limits: an update that adds a database migration cannot be rolled back by the updater (the code goes back, the schema
does not); restore `/data/pre-update-*.db` if a new version misbehaves after a migration. Check
`deploy/updater/test_updater.py` with `python3 deploy/updater/test_updater.py`.
