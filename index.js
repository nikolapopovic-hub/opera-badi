const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'application/xml', limit: '10mb' }));
app.use(express.text({ type: 'text/xml', limit: '10mb' }));

// Badi API kredencijali
const BADI_API_KEY = 'production.9ce7d0e4-f715-4f30-84f7-640fa3ff5218';
const BADI_API_SECRET = '201c7739-5bac-4f2b-b415-e0970fe7df3f';
const BADI_CLIENT_ID = '40f7725e-7ff0-49da-a5f4-530e30084783';
const BADI_URL = 'https://api.production.badi.rs/v2/fiscalization/receipts';

// Basic Auth header za Badi - base64(key:secret)
const badiAuth = Buffer.from(`${BADI_API_KEY}:${BADI_API_SECRET}`).toString('base64');

// Pomocna funkcija - izvuci vrednost iz DataElement array-a
function getField(dataElements, fieldName) {
  if (!Array.isArray(dataElements)) return null;
  const el = dataElements.find(e => e.DataElement === fieldName);
  return el ? el.NewValue : null;
}

// Mapiranje poreske oznake za Srbiju
function mapTaxLabel(taxRate) {
  const rate = parseFloat(taxRate);
  if (rate >= 20) return 'Đ';
  if (rate >= 10) return 'E';
  if (rate === 0) return 'G';
  return 'Đ';
}

// Glavna ruta - prima OFIS payload od OPERA Cloud
app.post('/fiscalization/receipts', async (req, res) => {
  console.log('=== OPERA Cloud request primljen ===');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  try {
    const body = req.body;

    // Navigiraj kroz OFIS JSON strukturu
    let dataElements = [];
    try {
      // Pokusaj sve moguce putanje
      const payload = body?.FiscalIntegrationPayload || body;
      const events = payload?.BusinessEvents?.BusinessEvent || payload?.BusinessEvent;
      const eventsArray = Array.isArray(events) ? events : [events];
      
      // Uzmi poslednji event (najnoviji)
      const event = eventsArray[eventsArray.length - 1];
      const details = event?.BusinessEvent?.Details?.Detail || 
                      event?.Details?.Detail || 
                      event?.DataElements?.DataElement || [];
      
      dataElements = Array.isArray(details) ? details : [details];
      console.log('DataElements pronadjeni:', dataElements.length);
      console.log('Prvi element:', JSON.stringify(dataElements[0]));
    } catch(e) {
      console.log('Greska pri parsiranju:', e.message);
      dataElements = [];
    }

    console.log('DataElements pronadjeni:', dataElements.length);

    // Izvuci vrednosti
    const amount = parseFloat(getField(dataElements, 'AMOUNT') || getField(dataElements, 'TRX AMOUNT') || 0);
    const quantity = parseFloat(getField(dataElements, 'QUANTITY') || 1);
    const transactionCode = getField(dataElements, 'TRANSACTION CODE') || '1000';
    const taxRate = (getField(dataElements, 'TAX2 RATE') || getField(dataElements, 'TAX ELEMENTS') || '20').replace('%', '').trim();
    const taxLabel = mapTaxLabel(taxRate);
    const unitPrice = quantity > 0 ? amount / quantity : amount;

    console.log(`Amount: ${amount}, Qty: ${quantity}, TrxCode: ${transactionCode}, Tax: ${taxRate}%`);

    // Kreiraj Badi JSON
    const badiPayload = {
      invoiceType: 'normal',
      transactionType: 'sale',
      payments: {
        cash: amount
      },
      items: [
        {
          sku: parseInt(transactionCode) || 1000,
          quantity: quantity,
          unitPrice: unitPrice,
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
      },
      timeout: 30000
    });

    console.log('=== Badi odgovor ===');
    console.log(JSON.stringify(badiResponse.data, null, 2));

    // Vrati OPERA Cloud uspešan odgovor
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
  res.json({ status: 'OPERA-Badi Middleware radi!', version: '2.0.0' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Middleware pokrenut na portu ${PORT}`);
});
