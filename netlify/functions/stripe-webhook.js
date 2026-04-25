const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async function(event) {
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;

    const customerName = session.metadata?.customerName || '';
    const email        = session.customer_email || '';
    const orderRef     = session.metadata?.orderRef || '';
    const orderId      = session.id;
    const amountPaid   = (session.amount_total / 100).toFixed(2);

    // Parse orderRef back into fields
    // Format: color:Ivory|names:Ahmed,Sara|syms:Mat1:moon|thread:Gold|phone:...|addr:...|occ:...|notes:...
    const parseField = (key) => {
      const match = orderRef.match(new RegExp(`${key}:([^|]+)`));
      return match ? match[1] : '';
    };

    const color   = parseField('color');
    const names   = parseField('names');
    const syms    = parseField('syms');
    const thread  = parseField('thread');
    const phone   = parseField('phone');
    const address = parseField('addr');
    const occasion= parseField('occ');
    const notes   = parseField('notes');

    // Send to Airtable
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Orders`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            'Order ID':            orderId,
            'Customer Name':       customerName,
            'Email':               email,
            'Color':               color,
            'Name Customization':  names,
            'Symbol':              syms,
            'Thread Color':        thread,
            'Phone':               phone,
            'Address':             address,
            'Occasion':            occasion,
            'Notes':               notes,
            'Amount Paid':         parseFloat(amountPaid),
            'Status':              'Pending',
          }
        })
      }
    );

    if (!airtableRes.ok) {
      const errText = await airtableRes.text();
      console.error('Airtable error:', errText);
      return { statusCode: 500, body: 'Airtable write failed' };
    }

    console.log('Order logged to Airtable:', orderId);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
