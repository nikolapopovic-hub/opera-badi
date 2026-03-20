const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json({ limit: '10mb' }));

const BADI_API_KEY = 'production.9ce7d0e4-f715-4f30-84f7-640fa3ff5218';
const BADI_API_SECRET = '201c7739-5bac-4f2b-b415-e0970fe7df3f';
const BADI_CLIENT_ID = '40f7725e-7ff0-49da-a5f4-530e30084783';
const BADI_URL = 'https://api.production.badi.rs/v2/fiscalization/receipts';
const badiAuth = Buffer.from(`${BADI_API_KEY}:${BADI_API_SECRET}`).toString('base64');

function getField(arr, name) {
  if (!Array.isArray(arr)) return null;
  const el = arr.find(e => e && e.DataElement === name);
  return el ? el.NewValue : null;
}

function mapTaxLabel(rate) {
  const r = parseFloat(rate);
  if (r >= 20) return 'Đ';
  if (r >= 10) return 'E';
  if (r === 0) return 'G';
  return 'Đ';
}

function findDetails(obj, depth) {
  if (depth > 10 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findDetails(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'Detail') {
      const val = obj[key];
      const arr = Array.isArray(val) ? val : [val];
      if (arr.length > 0 && arr[0] && arr[0].DataElement) return arr;
    }
    const found = findDetails(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

app.post('/fiscalization/receipts', async (req, res) => {
  console.log('=== REQUEST PRIMLJEN ===');
  console.log('TOP KEYS:', Object.keys(req.body || {}));

  try {
    const body = req.body;
    const dataElements = findDetails(body, 0) || [];
    console.log('DataElements:', dataElements.length);
    if (dataElements.length > 0) console.log('Primer:', JSON.stringify(dataElements[0]));

    const amount = parseFloat(getField(dataElements, 'AMOUNT') || getField(dataElements, 'TRX AMOUNT') || 0);
    const quantity = parseFloat(getField(dataElements, 'QUANTITY') || 1);
    const transactionCode = getField(dataElements, 'TRANSACTION CODE') || '1000';
    const taxRate = (getField(dataElements, 'TAX2 RATE') || '20').replace('%', '').trim();
    const taxLabel = mapTaxLabel(taxRate);
    const unitPrice = quantity > 0 ? amount / quantity : amount;

    console.log(`Amount: ${amount}, Qty: ${quantity}, Tax: ${taxRate}%, Label: ${taxLabel}`);

    const badiPayload = {
      invoiceType: 'normal',
      transactionType: 'sale',
      payments: { cash: amount },
      items: [{
        sku: parseInt(transactionCode) || 1000,
        quantity: quantity,
        unitPrice: unitPrice,
        taxRateLabel: taxLabel
      }],
      receiptDelivery: { a4Printer: false, pdf: true },
      clientId: BADI_CLIENT_ID
    };

    console.log('=== SALJEM BADI ===');
    console.log(JSON.stringify(badiPayload, null, 2));

    const badiResponse = await axios.post(BADI_URL, badiPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${badiAuth}`
      },
      timeout: 30000
    });

    console.log('=== BADI ODGOVOR ===');
    console.log(JSON.stringify(badiResponse.data, null, 2));

    res.status(200).json({
      success: true,
      fiscalNumber: badiResponse.data.invoiceNumber,
      fiscalDateTime: badiResponse.data.sdcDateTime,
      verificationUrl: badiResponse.data.verificationUrl
    });

  } catch (error) {
    console.error('GRESKA:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'OPERA-Badi Middleware v3.0 radi!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Middleware pokrenut na portu ${PORT}`));
