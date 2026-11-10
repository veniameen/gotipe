package billing

import (
	"context"
	"errors"
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/checkout/session"
	"github.com/stripe/stripe-go/v81/customer"
	"github.com/stripe/stripe-go/v81/subscription"
)

type StripeClient struct {
	secretKey string
}

func NewStripeClient(secretKey string) *StripeClient {
	return &StripeClient{secretKey: secretKey}
}

func (c *StripeClient) GetSubscription(ctx context.Context, id string) (*stripe.Subscription, error) {
	if c.secretKey == "" {
		return nil, errors.New("Stripe is not configured")
	}
	params := &stripe.SubscriptionParams{}
	params.Context = ctx
	return (subscription.Client{B: stripe.GetBackend(stripe.APIBackend), Key: c.secretKey}).Get(id, params)
}

// CreateCustomer creates Stripe customer for a user
func (c *StripeClient) CreateCustomer(ctx context.Context, userID, email, name string) (*stripe.Customer, error) {
	if c.secretKey == "" {
		return nil, errors.New("Stripe is not configured")
	}
	params := &stripe.CustomerParams{
		Email: stripe.String(email),
		Name:  stripe.String(name),
	}
	params.Context = ctx
	params.SetIdempotencyKey("gotipe-customer-" + userID)
	return (customer.Client{B: stripe.GetBackend(stripe.APIBackend), Key: c.secretKey}).New(params)
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
	return (subscription.Client{B: stripe.GetBackend(stripe.APIBackend), Key: c.secretKey}).New(params)
}

// CancelSubscription cancels at period end
// IMPORTANT: Call OUTSIDE DB transaction
func (c *StripeClient) CancelSubscription(ctx context.Context, subscriptionID string) (*stripe.Subscription, error) {
	if c.secretKey == "" {
		return nil, errors.New("Stripe is not configured")
	}
	params := &stripe.SubscriptionParams{
		CancelAtPeriodEnd: stripe.Bool(true),
	}
	params.Context = ctx
	return (subscription.Client{B: stripe.GetBackend(stripe.APIBackend), Key: c.secretKey}).Update(subscriptionID, params)
}

// CreateCheckoutSession creates hosted checkout page
func (c *StripeClient) CreateCheckoutSession(ctx context.Context, customerID, priceID, successURL, cancelURL, key string) (*stripe.CheckoutSession, error) {
	if c.secretKey == "" {
		return nil, errors.New("Stripe is not configured")
	}
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
	params.Context = ctx
	params.SetIdempotencyKey(key)
	return (session.Client{B: stripe.GetBackend(stripe.APIBackend), Key: c.secretKey}).New(params)
}
