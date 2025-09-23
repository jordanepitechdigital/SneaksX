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
  Button,
  Hr,
  Row,
  Column,
  Img,
} from '@react-email/components'
import type { ShipmentTrackingData } from '../EmailService'

interface ShipmentTrackingEmailProps extends ShipmentTrackingData {}

export const ShipmentTrackingEmail = ({
  orderNumber,
  customerName,
  trackingNumber,
  carrier,
  trackingUrl,
  estimatedDelivery,
  items,
}: ShipmentTrackingEmailProps) => {
  const previewText = `Your order ${orderNumber} has shipped!`

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

          {/* Shipment Notification */}
          <Section style={section}>
            <Heading style={h2}>Your Order Has Shipped! 📦</Heading>
            <Text style={text}>
              Hi {customerName},
            </Text>
            <Text style={text}>
              Great news! Your order <strong>{orderNumber}</strong> has been shipped and is on its way to you.
              You can track your package using the information below.
            </Text>
          </Section>

          {/* Tracking Details */}
          <Section style={trackingDetails}>
            <Row>
              <Column style={trackingInfo}>
                <Text style={label}>Tracking Number</Text>
                <Text style={value}>{trackingNumber}</Text>
              </Column>
              <Column style={trackingInfo}>
                <Text style={label}>Carrier</Text>
                <Text style={value}>{carrier}</Text>
              </Column>
            </Row>
            <Row>
              <Column>
                <Text style={label}>Estimated Delivery</Text>
                <Text style={value}>{estimatedDelivery}</Text>
              </Column>
            </Row>
            <Section style={buttonContainer}>
              <Button href={trackingUrl} style={trackButton}>
                Track Your Package
              </Button>
            </Section>
          </Section>

          <Hr style={hr} />

          {/* Shipped Items */}
          <Section style={section}>
            <Heading style={h3}>Items in This Shipment</Heading>
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
                  <Text style={itemDetails}>Quantity: {item.quantity}</Text>
                </Column>
              </Row>
            ))}
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions about your shipment? Reply to this email or contact our support team.
            </Text>
            <Text style={footerText}>
              Thank you for choosing SneaksX!
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

const trackingDetails = {
  padding: '24px',
  backgroundColor: '#f8f9fa',
}

const trackingInfo = {
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

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '24px 0 0',
}

const trackButton = {
  backgroundColor: '#000000',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  padding: '16px 32px',
  textDecoration: 'none',
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

export default ShipmentTrackingEmail