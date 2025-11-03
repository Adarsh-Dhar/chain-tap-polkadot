const express = require('express');
const app = express();
app.use(express.json());

const PHAT_FORWARD_TOKEN = process.env.PHAT_FORWARD_TOKEN;

app.post('/forward-order', async (req, res) => {
  const receivedToken = req.headers['x-forward-token'];
  if (!PHAT_FORWARD_TOKEN || receivedToken !== PHAT_FORWARD_TOKEN) {
    return res.status(401).send('Unauthorized');
  }
  const shopifyOrder = req.body;
  console.log('SUCCESS: Received Order ID:', shopifyOrder?.id);
  return res.status(200).json({ status: 'success', orderId: shopifyOrder?.id });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});


