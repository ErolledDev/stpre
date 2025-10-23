# Stripe + Firebase Premium Subscription Setup

This project integrates Stripe subscriptions with Firebase Firestore to automatically upgrade users to premium status when they complete a payment.

## Setup Instructions

### 1. Stripe Configuration

1. Go to your [Stripe Dashboard](https://dashboard.stripe.com/)
2. Get your **Secret Key** from the [API Keys page](https://dashboard.stripe.com/apikeys)
3. Create two subscription products:
   - Go to **Products** > **Add Product**
   - Create a "Starter" plan ($12/month)
   - Create a "Professional" plan ($18/month)
   - Copy the **Price ID** for each product

4. Set up a webhook endpoint:
   - Go to **Developers** > **Webhooks**
   - Click **Add endpoint**
   - URL: `https://yourdomain.com/webhook` (or use ngrok for local testing: `https://your-ngrok-url/webhook`)
   - Select events to listen to:
     - `checkout.session.completed`
     - `customer.subscription.deleted`
   - Copy the **Webhook Secret**

### 2. Firebase Configuration

1. Go to your [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `dotkol`
3. Go to **Project Settings** > **Service Accounts**
4. Click **Generate New Private Key**
5. Save the JSON file and extract:
   - `project_id`
   - `client_email`
   - `private_key`

### 3. Environment Variables

Update the `.env` file in the project root with your credentials:

```env
STRIPE_PUBLISHABLE_KEY=pk_test_51SHiFQRubG3kTjR8PMTlm2mSaJ2T4koNWoCckma6aE7tcOYdTWGITJmbiWBQAEP8YcGyxVi33md2RhCLU1rH7Wc300QXWwGnUS
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

BASIC_PRICE_ID=price_YOUR_BASIC_PRICE_ID
PRO_PRICE_ID=price_YOUR_PRO_PRICE_ID

STATIC_DIR=../../client
DOMAIN=http://localhost:4242

FIREBASE_PROJECT_ID=dotkol
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@dotkol.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

**Important:** Replace the placeholder values with your actual credentials.

### 4. Install Dependencies

```bash
cd server/node
npm install
```

### 5. Run the Server

```bash
npm start
```

The server will run on `http://localhost:4242`

### 6. Testing Locally with Stripe Webhooks

To test webhooks locally, use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

1. Install Stripe CLI
2. Login: `stripe login`
3. Forward webhooks: `stripe listen --forward-to localhost:4242/webhook`
4. Copy the webhook signing secret and update your `.env` file

## How It Works

1. **User Authentication:** The frontend uses Firebase Authentication to identify the logged-in user
2. **Checkout Session:** When a user selects a plan, their Firebase User ID is included in the Stripe checkout session metadata
3. **Payment Success:** When payment is completed, Stripe sends a `checkout.session.completed` webhook event
4. **Firebase Update:** The webhook handler updates the user's Firestore document:
   - Sets `isPremium: true`
   - Stores Stripe customer and subscription IDs
   - Updates timestamp

5. **Subscription Cancellation:** When a subscription is canceled, the webhook receives `customer.subscription.deleted` and sets `isPremium: false`

## Firestore User Document Structure

After successful payment, the user document will have these fields:

```javascript
{
  isPremium: true,
  subscriptionType: 'stripe',
  stripeCustomerId: 'cus_xxxxx',
  stripeSubscriptionId: 'sub_xxxxx',
  premiumExpiryDate: null, // or timestamp when cancelled
  updatedAt: Timestamp
}
```

## Security Notes

- Never commit your `.env` file to version control
- Keep your Stripe Secret Key and Firebase credentials secure
- Use webhook signatures to verify Stripe events in production
- Ensure your Firebase Security Rules properly restrict premium features

## Testing with Stripe Test Cards

Use these test card numbers:
- Success: `4242 4242 4242 4242`
- Requires Authentication: `4000 0025 0000 3155`
- Declined: `4000 0000 0000 9995`

Use any future expiry date and any CVC.
