const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.text({ type: 'application/xml' }));
app.use(express.text({ type: 'text/xml' }));

// Badi API kredencijali
const BADI_API_KEY = 'production.9ce7d0e4-f715-4f30-84f7-640fa3ff5218';
const BADI_API_SECRET = '201c7739-5bac-4f2b-b415-e0970fe7df3f';
const BADI_CLIENT_ID = '40f7725e-7ff0-49da-a5f4-530e30084783';
const BADI_URL = 'https://api.production.badi.rs/v2/fiscalization/receipts';

// Basic Auth header za Badi
const badiAuth = Buffer.from(`${BADI_API_KEY}:${BADI_API_SECRET}`).toString('base64');

// Mapiranje nacina placanja OPERA -> Badi
function mapPaymentMethod(currency, amount) {
  return { cash: parseFloat(amount) || 0 };
}

// Mapiranje poreske oznake
function mapTaxLabel(taxRate) {
  const rate = parseFloat(taxRate);
  if (rate === 20) return 'Đ';
  if (rate === 10) return 'E';
  if (rate === 0) return 'G';
  return 'Đ'; // default za Srbiju
}

// Glavna ruta - prima OFIS payload od OPERA Cloud
app.post('/fiscalization/receipts', async (req, res) => {
  console.log('=== OPERA Cloud request primljen ===');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  try {
    const data = req.body;

    // Izvuci podatke iz OFIS payloada
    const amount = parseFloat(data.AMOUNT || data.amount || data.TRX_AMOUNT || 0);
    const transactionCode = data.TRANSACTION_CODE || data.transactionCode || '1000';
    const quantity = parseFloat(data.QUANTITY || data.quantity || 1);
    const taxRate = data.TAX_ELEMENTS || data.taxRate || '20%';
    const taxLabel = mapTaxLabel(taxRate.replace('%', ''));

    // Kreiraj Badi JSON
    const badiPayload = {
      invoiceType: 'normal',
      transactionType: 'sale',
      payments: mapPaymentMethod(data.CURRENCY_CODE, amount),
      items: [
        {
          sku: parseInt(transactionCode) || 1000,
          quantity: quantity,
          unitPrice: amount / quantity,
          taxRateLabel: taxLabel
        }
      ],
      receiptDelivery: {
        a4Printer: false,
        pdf: true
      },
      clientId: BADI_CLIENT_ID
    };

    console.log('=== Saljem Badi-ju ===');
    console.log(JSON.stringify(badiPayload, null, 2));

    // Posalji Badi-ju
    const badiResponse = await axios.post(BADI_URL, badiPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${badiAuth}`
      }
    });

    console.log('=== Badi odgovor ===');
    console.log(JSON.stringify(badiResponse.data, null, 2));

    // Vrati OPERA Cloud uspesан odgovor
    res.status(200).json({
      success: true,
      fiscalNumber: badiResponse.data.invoiceNumber,
      fiscalDateTime: badiResponse.data.sdcDateTime,
      verificationUrl: badiResponse.data.verificationUrl,
      badiResponse: badiResponse.data
    });

  } catch (error) {
    console.error('Greska:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'OPERA-Badi Middleware radi!', version: '1.0.0' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Middleware pokrenut na portu ${PORT}`);
});
