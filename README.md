# OPERA Cloud - Badi Fiscal Middleware

Middleware servis koji prima OFIS Generic JSON od OPERA Cloud i šalje ga Badi fiskalnom API-ju.

## Arhitektura

```
OPERA Cloud (OFIS) --> Middleware --> Badi API --> Fiskalni račun
```

## Deployment na Render.com (besplatno)

1. Idi na https://render.com i registruj se
2. Klikni "New Web Service"
3. Uploaduj ove fajlove ili poveži GitHub repo
4. Render automatski detektuje Node.js
5. Start command: node index.js
6. Dobićeš URL npr: https://opera-badi-middleware.onrender.com

## Konfiguracija u OPERA Cloud

U OFIS Cloud Configuration > Delivery > End Point Url unesi:
https://tvoj-middleware-url.onrender.com/fiscalization/receipts

## Badi kredencijali (već ugrađeni u index.js)
- API Key: production.9ce7d0e4-f715-4f30-84f7-640fa3ff5218
- Client ID: 40f7725e-7ff0-49da-a5f4-530e30084783
