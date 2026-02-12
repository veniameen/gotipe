package billing

import (
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/checkout/session"
	"github.com/stripe/stripe-go/v81/customer"
	"github.com/stripe/stripe-go/v81/subscription"
)

type StripeClient struct {
	secretKey string
}

func NewStripeClient(secretKey string) *StripeClient {
	stripe.Key = secretKey
	return &StripeClient{secretKey: secretKey}
}

// CreateCustomer creates Stripe customer for a user
func (c *StripeClient) CreateCustomer(email, name string) (*stripe.Customer, error) {
	params := &stripe.CustomerParams{
		Email: stripe.String(email),
		Name:  stripe.String(name),
	}
	return customer.New(params)
}

// CreateSubscription creates subscription for a customer
// IMPORTANT: Call OUTSIDE DB transaction
func (c *StripeClient) CreateSubscription(customerID, priceID string) (*stripe.Subscription, error) {
	params := &stripe.SubscriptionParams{
		Customer: stripe.String(customerID),
		Items: []*stripe.SubscriptionItemsParams{
			{Price: stripe.String(priceID)},
		},
	}
	return subscription.New(params)
}

// CancelSubscription cancels at period end
// IMPORTANT: Call OUTSIDE DB transaction
func (c *StripeClient) CancelSubscription(subscriptionID string) (*stripe.Subscription, error) {
	params := &stripe.SubscriptionParams{
		CancelAtPeriodEnd: stripe.Bool(true),
	}
	return subscription.Update(subscriptionID, params)
}

// CreateCheckoutSession creates hosted checkout page
func (c *StripeClient) CreateCheckoutSession(customerID, priceID, successURL, cancelURL string) (*stripe.CheckoutSession, error) {
	params := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customerID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(priceID),
				Quantity: stripe.Int64(1),
			},
		},
		SuccessURL: stripe.String(successURL),
		CancelURL:  stripe.String(cancelURL),
	}
	return session.New(params)
}
