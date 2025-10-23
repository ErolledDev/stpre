const serverless = require('serverless-http');
const express = require("express");
const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27',
  appInfo: {
    name: "stripe-samples/checkout-single-subscription",
    version: "0.0.1",
    url: "https://github.com/stripe-samples/checkout-single-subscription"
  }
});

const app = express();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

app.use(express.urlencoded({ extended: true }));
app.use(
  express.json({
    verify: function (req, res, buf) {
      if (req.originalUrl.includes("/webhook")) {
        req.rawBody = buf.toString();
      }
    },
  })
);

app.get("/api/config", (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    basicPrice: process.env.BASIC_PRICE_ID,
    proPrice: process.env.PRO_PRICE_ID,
  });
});

app.get("/api/checkout-session", async (req, res) => {
  const { sessionId } = req.query;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  res.json(session);
});

app.post("/api/create-checkout-session", async (req, res) => {
  const domainURL = process.env.DOMAIN || process.env.URL;
  const { priceId, userId } = req.body;

  if (!userId) {
    res.status(400);
    return res.json({
      error: {
        message: 'User ID is required',
      }
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId: userId,
      },
      success_url: `${domainURL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${domainURL}/canceled.html`,
    });

    return res.json({ url: session.url });
  } catch (e) {
    res.status(400);
    return res.json({
      error: {
        message: e.message,
      }
    });
  }
});

app.post('/api/customer-portal', async (req, res) => {
  const { sessionId } = req.body;
  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

  const returnUrl = process.env.DOMAIN || process.env.URL;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: checkoutSession.customer,
    return_url: returnUrl,
  });

  res.json({ url: portalSession.url });
});

app.post("/api/webhook", async (req, res) => {
  let data;
  let eventType;

  if (process.env.STRIPE_WEBHOOK_SECRET) {
    let event;
    let signature = req.headers["stripe-signature"];

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;
  } else {
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === "checkout.session.completed") {
    console.log(`🔔  Payment received!`);

    const session = data.object;
    const userId = session.metadata?.userId;

    if (userId) {
      try {
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
          isPremium: true,
          premiumExpiryDate: null,
          subscriptionType: 'stripe',
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`✅ User ${userId} upgraded to premium`);
      } catch (error) {
        console.error(`❌ Error updating user ${userId}:`, error);
      }
    }
  }

  if (eventType === "customer.subscription.deleted") {
    console.log(`🔔  Subscription canceled!`);

    const subscription = data.object;
    const customerId = subscription.customer;

    try {
      const usersSnapshot = await db.collection('users')
        .where('stripeCustomerId', '==', customerId)
        .limit(1)
        .get();

      if (!usersSnapshot.empty) {
        const userDoc = usersSnapshot.docs[0];
        await userDoc.ref.update({
          isPremium: false,
          premiumExpiryDate: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`✅ User premium status revoked for customer ${customerId}`);
      }
    } catch (error) {
      console.error(`❌ Error revoking premium:`, error);
    }
  }

  res.sendStatus(200);
});

module.exports.handler = serverless(app);
