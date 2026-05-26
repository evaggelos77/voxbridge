# Troubleshooting (γρήγορα)

## 1) Certbot αποτυγχάνει
Συνήθως φταίει το DNS propagation. Έλεγξε:
```bash
dig +short intervoxai.com A
dig +short www.intervoxai.com A
```
Πρέπει να επιστρέφει `185.25.22.148`.

Μετά τρέξε ξανά:
```bash
sudo certbot --nginx -d intervoxai.com -d www.intervoxai.com
```

## 2) 502 Bad Gateway
Δες αν τρέχει το service:
```bash
sudo systemctl status voxbridge --no-pager
sudo journalctl -u voxbridge -n 200 --no-pager
curl -s http://127.0.0.1:8000/health
```

## 3) WebSockets
Το nginx config έχει `location /ws/` με Upgrade headers.
Αν δεν συνδέεται, έλεγξε:
- ότι το site είναι σε HTTPS
- ότι το browser κάνει `wss://intervoxai.com/ws/<room>`
