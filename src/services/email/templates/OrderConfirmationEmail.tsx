import React from 'react'
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
  Row,
  Column,
  Img,
} from '@react-email/components'
import type { OrderConfirmationData } from '../EmailService'

interface OrderConfirmationEmailProps extends OrderConfirmationData {}

export const OrderConfirmationEmail = ({
  orderNumber,
  customerName,
  customerEmail,
  orderDate,
  items,
  subtotal,
  shipping,
  tax,
  total,
  shippingAddress,
  estimatedDelivery,
}: OrderConfirmationEmailProps) => {
  const previewText = `Your order ${orderNumber} has been confirmed`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={h1}>SneaksX</Heading>
            <Text style={tagline}>Premium Sneakers & Streetwear</Text>
          </Section>

          {/* Order Confirmation */}
          <Section style={section}>
            <Heading style={h2}>Order Confirmed! 🎉</Heading>
            <Text style={text}>
              Hi {customerName},
            </Text>
            <Text style={text}>
              Thank you for your order! We've received your order and we're getting it ready.
              You'll receive a shipping confirmation email with tracking information once your order has shipped.
            </Text>
          </Section>

          {/* Order Details */}
          <Section style={orderDetails}>
            <Row>
              <Column style={orderInfo}>
                <Text style={label}>Order Number</Text>
                <Text style={value}>{orderNumber}</Text>
              </Column>
              <Column style={orderInfo}>
                <Text style={label}>Order Date</Text>
                <Text style={value}>{new Date(orderDate).toLocaleDateString()}</Text>
              </Column>
            </Row>
            {estimatedDelivery && (
              <Row>
                <Column>
                  <Text style={label}>Estimated Delivery</Text>
                  <Text style={value}>{estimatedDelivery}</Text>
                </Column>
              </Row>
            )}
          </Section>

          <Hr style={hr} />

          {/* Order Items */}
          <Section style={section}>
            <Heading style={h3}>Order Items</Heading>
            {items.map((item, index) => (
              <Row key={index} style={itemRow}>
                <Column style={itemImageColumn}>
                  <Img
                    src={item.image}
                    alt={item.name}
                    width="80"
                    height="80"
                    style={itemImage}
                  />
                </Column>
                <Column style={itemDetailsColumn}>
                  <Text style={itemName}>{item.brand} {item.name}</Text>
                  <Text style={itemDetails}>Size: {item.size}</Text>
                  <Text style={itemDetails}>Quantity: {item.quantity}</Text>
                </Column>
                <Column style={itemPriceColumn}>
                  <Text style={itemPrice}>€{item.price.toFixed(2)}</Text>
                </Column>
              </Row>
            ))}
          </Section>

          <Hr style={hr} />

          {/* Order Summary */}
          <Section style={section}>
            <Heading style={h3}>Order Summary</Heading>
            <Row style={summaryRow}>
              <Column>
                <Text style={summaryLabel}>Subtotal</Text>
              </Column>
              <Column style={rightAlign}>
                <Text style={summaryValue}>€{subtotal.toFixed(2)}</Text>
              </Column>
            </Row>
            <Row style={summaryRow}>
              <Column>
                <Text style={summaryLabel}>Shipping</Text>
              </Column>
              <Column style={rightAlign}>
                <Text style={summaryValue}>€{shipping.toFixed(2)}</Text>
              </Column>
            </Row>
            <Row style={summaryRow}>
              <Column>
                <Text style={summaryLabel}>Tax</Text>
              </Column>
              <Column style={rightAlign}>
                <Text style={summaryValue}>€{tax.toFixed(2)}</Text>
              </Column>
            </Row>
            <Hr style={hr} />
            <Row style={summaryRow}>
              <Column>
                <Text style={totalLabel}>Total</Text>
              </Column>
              <Column style={rightAlign}>
                <Text style={totalValue}>€{total.toFixed(2)}</Text>
              </Column>
            </Row>
          </Section>

          {/* Shipping Address */}
          {shippingAddress && (
            <>
              <Hr style={hr} />
              <Section style={section}>
                <Heading style={h3}>Shipping Address</Heading>
                <Text style={address}>
                  {shippingAddress.name}<br />
                  {shippingAddress.address}<br />
                  {shippingAddress.city}, {shippingAddress.postalCode}<br />
                  {shippingAddress.country}
                </Text>
              </Section>
            </>
          )}

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions about your order? Reply to this email or contact our support team.
            </Text>
            <Text style={footerText}>
              Thank you for shopping with SneaksX!
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Styles
const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  maxWidth: '600px',
}

const header = {
  textAlign: 'center' as const,
  padding: '32px 0',
  backgroundColor: '#000000',
  color: '#ffffff',
}

const h1 = {
  color: '#ffffff',
  fontSize: '32px',
  fontWeight: 'bold',
  margin: '0 0 8px',
  textAlign: 'center' as const,
}

const tagline = {
  color: '#cccccc',
  fontSize: '14px',
  margin: '0',
  textAlign: 'center' as const,
}

const section = {
  padding: '24px',
}

const h2 = {
  color: '#000000',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0 0 16px',
}

const h3 = {
  color: '#000000',
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0 0 16px',
}

const text = {
  color: '#333333',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px',
}

const orderDetails = {
  padding: '24px',
  backgroundColor: '#f8f9fa',
}

const orderInfo = {
  width: '50%',
}

const label = {
  color: '#666666',
  fontSize: '14px',
  fontWeight: 'bold',
  margin: '0 0 4px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
}

const value = {
  color: '#000000',
  fontSize: '16px',
  margin: '0 0 16px',
}

const itemRow = {
  padding: '16px 0',
  borderBottom: '1px solid #eeeeee',
}

const itemImageColumn = {
  width: '80px',
  paddingRight: '16px',
}

const itemImage = {
  borderRadius: '8px',
  objectFit: 'cover' as const,
}

const itemDetailsColumn = {
  paddingRight: '16px',
}

const itemPriceColumn = {
  width: '80px',
  textAlign: 'right' as const,
}

const itemName = {
  color: '#000000',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '0 0 4px',
}

const itemDetails = {
  color: '#666666',
  fontSize: '14px',
  margin: '0 0 4px',
}

const itemPrice = {
  color: '#000000',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '0',
}

const summaryRow = {
  padding: '8px 0',
}

const summaryLabel = {
  color: '#333333',
  fontSize: '16px',
  margin: '0',
}

const summaryValue = {
  color: '#333333',
  fontSize: '16px',
  margin: '0',
}

const totalLabel = {
  color: '#000000',
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0',
}

const totalValue = {
  color: '#000000',
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0',
}

const rightAlign = {
  textAlign: 'right' as const,
}

const address = {
  color: '#333333',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0',
}

const hr = {
  borderColor: '#eeeeee',
  margin: '24px 0',
}

const footer = {
  padding: '24px',
  textAlign: 'center' as const,
  backgroundColor: '#f8f9fa',
}

const footerText = {
  color: '#666666',
  fontSize: '14px',
  margin: '0 0 8px',
}

export default OrderConfirmationEmail