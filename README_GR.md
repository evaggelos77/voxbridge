# VoxBridge – Production Bundle (Ubuntu 24.04)

Αυτό το ZIP περιέχει **ΟΛΟ** το πακέτο:
- τον κώδικα του VoxBridge (φάκελος `app/`)
- έτοιμο `install.sh` που κάνει deploy, service, nginx reverse proxy, SSL (Let's Encrypt), firewall

## Προϋποθέσεις
1) Έχεις βάλει DNS:
- A `intervoxai.com` → `185.25.22.148`
- A `www.intervoxai.com` → `185.25.22.148`

2) Έχεις SSH πρόσβαση ως root (ή user με sudo) στο VPS.

## Εγκατάσταση (copy/paste)
Από τον υπολογιστή σου:
```bash
scp voxbridge_production_bundle.zip root@185.25.22.148:/tmp/
ssh root@185.25.22.148
```

Στο VPS:
```bash
cd /tmp
unzip -o voxbridge_production_bundle.zip -d voxbridge_bundle
cd voxbridge_bundle
sudo bash install.sh
```

Το script θα σε ρωτήσει:
- domain(s)
- email για Let's Encrypt
- `OPENAI_API_KEY`
- `PUBLIC_BASE_URL` (βάλε `https://intervoxai.com`)

## Τελικό URL
- https://intervoxai.com/app

## Maintenance
Logs:
```bash
sudo journalctl -u voxbridge -f
```

Restart:
```bash
sudo systemctl restart voxbridge
```

Status:
```bash
sudo systemctl status voxbridge --no-pager
```

SSL renew test:
```bash
sudo certbot renew --dry-run
```

## Σημαντικό (Security)
Ο φάκελος `web_media/` περιέχει `users.sqlite3` και `history.json`.
Το nginx config μέσα στο bundle επιτρέπει **μόνο** `.mp3` μέσα από `/media/` για να μη διαρρεύσουν ευαίσθητα αρχεία.
