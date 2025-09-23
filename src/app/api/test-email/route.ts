import { NextRequest, NextResponse } from 'next/server'
import EmailService from '@/services/email/EmailService'

export async function POST(request: NextRequest) {
  try {
    const { type, email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email address is required' },
        { status: 400 }
      )
    }

    let result = false

    switch (type) {
      case 'connection':
        result = await EmailService.testEmailConnection()
        break

      case 'order_confirmation':
        result = await EmailService.sendOrderConfirmation({
          orderNumber: `TEST-${Date.now()}`,
          customerName: 'Test Customer',
          customerEmail: email,
          orderDate: new Date().toISOString(),
          items: [
            {
              name: 'Air Jordan 1 High',
              brand: 'Nike',
              size: '42',
              quantity: 1,
              price: 180.00,
              image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=400&fit=crop&crop=center'
            },
            {
              name: 'Dunk Low',
              brand: 'Nike',
              size: '43',
              quantity: 2,
              price: 120.00,
              image: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&h=400&fit=crop&crop=center'
            }
          ],
          subtotal: 420.00,
          shipping: 9.99,
          tax: 88.20,
          total: 518.19,
          shippingAddress: {
            name: 'Test Customer',
            address: '123 Test Street',
            city: 'Paris',
            postalCode: '75001',
            country: 'France'
          },
          estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()
        })
        break

      case 'shipment_tracking':
        result = await EmailService.sendShipmentTracking({
          orderNumber: `TEST-${Date.now()}`,
          customerName: email, // Using email as name for simplicity
          trackingNumber: 'TN123456789FR',
          carrier: 'Chronopost',
          trackingUrl: 'https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=TN123456789FR',
          estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString(),
          items: [
            {
              name: 'Air Jordan 1 High',
              brand: 'Nike',
              quantity: 1,
              image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=400&fit=crop&crop=center'
            }
          ]
        })
        break

      case 'password_reset':
        result = await EmailService.sendPasswordReset(email, {
          userName: 'Test User',
          resetUrl: 'https://sneaksx.com/reset-password?token=test123',
          expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString()
        })
        break

      default:
        return NextResponse.json(
          { error: 'Invalid email type. Use: connection, order_confirmation, shipment_tracking, or password_reset' },
          { status: 400 }
        )
    }

    if (result) {
      return NextResponse.json({
        success: true,
        message: `${type} email sent successfully to ${email}`
      })
    } else {
      return NextResponse.json(
        { error: `Failed to send ${type} email` },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error in test email endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Email testing endpoint',
    usage: {
      method: 'POST',
      body: {
        type: 'connection | order_confirmation | shipment_tracking | password_reset',
        email: 'recipient@example.com'
      }
    },
    examples: [
      {
        description: 'Test email connection',
        body: { type: 'connection', email: 'test@example.com' }
      },
      {
        description: 'Test order confirmation email',
        body: { type: 'order_confirmation', email: 'customer@example.com' }
      },
      {
        description: 'Test shipment tracking email',
        body: { type: 'shipment_tracking', email: 'customer@example.com' }
      },
      {
        description: 'Test password reset email',
        body: { type: 'password_reset', email: 'user@example.com' }
      }
    ]
  })
}