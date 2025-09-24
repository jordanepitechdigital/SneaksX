import { Resend } from 'resend'
import { OrderConfirmationEmail } from './templates/OrderConfirmationEmail'
import { ShipmentTrackingEmail } from './templates/ShipmentTrackingEmail'
import { PasswordResetEmail } from './templates/PasswordResetEmail'
import { render } from '@react-email/render'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export interface EmailOptions {
  to: string | string[]
  subject: string
  from?: string
  replyTo?: string
}

export interface OrderConfirmationData {
  orderNumber: string
  customerName: string
  customerEmail: string
  orderDate: string
  items: Array<{
    name: string
    brand: string
    size: string
    quantity: number
    price: number
    image: string
  }>
  subtotal: number
  shipping: number
  tax: number
  total: number
  shippingAddress?: {
    name: string
    address: string
    city: string
    postalCode: string
    country: string
  }
  estimatedDelivery?: string
}

export interface ShipmentTrackingData {
  orderNumber: string
  customerName: string
  trackingNumber: string
  carrier: string
  trackingUrl: string
  estimatedDelivery: string
  items: Array<{
    name: string
    brand: string
    quantity: number
    image: string
  }>
}

export interface PasswordResetData {
  userName: string
  resetUrl: string
  expirationTime: string
}

export class EmailService {
  private static fromEmail = process.env.EMAIL_FROM || 'SneaksX <orders@sneaksx.com>'
  private static replyToEmail = process.env.EMAIL_REPLY_TO || 'support@sneaksx.com'

  static async sendOrderConfirmation(data: OrderConfirmationData): Promise<boolean> {
    try {
      if (!resend) {
        console.warn('Email service not configured - RESEND_API_KEY missing')
        return false
      }

      const emailHtml = render(OrderConfirmationEmail(data))

      const result = await resend.emails.send({
        from: this.fromEmail,
        to: data.customerEmail,
        subject: `Order Confirmation - ${data.orderNumber}`,
        html: emailHtml,
        replyTo: this.replyToEmail,
      })

      if (result.error) {
        console.error('Failed to send order confirmation email:', result.error)
        return false
      }

      console.log('Order confirmation email sent successfully:', result.data?.id)
      return true
    } catch (error) {
      console.error('Error sending order confirmation email:', error)
      return false
    }
  }

  static async sendShipmentTracking(data: ShipmentTrackingData): Promise<boolean> {
    try {
      const emailHtml = render(ShipmentTrackingEmail(data))

      const result = await resend.emails.send({
        from: this.fromEmail,
        to: data.customerName, // This should be email, will fix when we get proper data
        subject: `Your Order ${data.orderNumber} Has Shipped!`,
        html: emailHtml,
        replyTo: this.replyToEmail,
      })

      if (result.error) {
        console.error('Failed to send shipment tracking email:', result.error)
        return false
      }

      console.log('Shipment tracking email sent successfully:', result.data?.id)
      return true
    } catch (error) {
      console.error('Error sending shipment tracking email:', error)
      return false
    }
  }

  static async sendPasswordReset(email: string, data: PasswordResetData): Promise<boolean> {
    try {
      const emailHtml = render(PasswordResetEmail(data))

      const result = await resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: 'Reset Your SneaksX Password',
        html: emailHtml,
        replyTo: this.replyToEmail,
      })

      if (result.error) {
        console.error('Failed to send password reset email:', result.error)
        return false
      }

      console.log('Password reset email sent successfully:', result.data?.id)
      return true
    } catch (error) {
      console.error('Error sending password reset email:', error)
      return false
    }
  }

  static async sendAdminNotification(
    type: 'high_value_order' | 'payment_failed' | 'low_stock',
    data: any
  ): Promise<boolean> {
    try {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@sneaksx.com'

      const subjects = {
        high_value_order: `High Value Order Alert - ${data.orderNumber}`,
        payment_failed: `Payment Failed Alert - ${data.orderNumber}`,
        low_stock: `Low Stock Alert - ${data.productName}`,
      }

      const result = await resend.emails.send({
        from: this.fromEmail,
        to: adminEmail,
        subject: subjects[type],
        html: `
          <h2>Admin Alert: ${type.replace('_', ' ').toUpperCase()}</h2>
          <pre>${JSON.stringify(data, null, 2)}</pre>
        `,
        replyTo: this.replyToEmail,
      })

      if (result.error) {
        console.error('Failed to send admin notification:', result.error)
        return false
      }

      console.log('Admin notification sent successfully:', result.data?.id)
      return true
    } catch (error) {
      console.error('Error sending admin notification:', error)
      return false
    }
  }

  static async sendCustomEmail(options: EmailOptions, htmlContent: string): Promise<boolean> {
    try {
      const result = await resend.emails.send({
        from: options.from || this.fromEmail,
        to: options.to,
        subject: options.subject,
        html: htmlContent,
        replyTo: options.replyTo || this.replyToEmail,
      })

      if (result.error) {
        console.error('Failed to send custom email:', result.error)
        return false
      }

      console.log('Custom email sent successfully:', result.data?.id)
      return true
    } catch (error) {
      console.error('Error sending custom email:', error)
      return false
    }
  }

  static async testEmailConnection(): Promise<boolean> {
    try {
      if (!resend) {
        console.warn('Email service not configured - RESEND_API_KEY missing')
        return false
      }

      const testEmail = process.env.TEST_EMAIL || 'test@example.com'

      const result = await resend.emails.send({
        from: this.fromEmail,
        to: testEmail,
        subject: 'SneaksX Email Service Test',
        html: '<h2>Email service is working correctly!</h2><p>This is a test email from SneaksX.</p>',
        replyTo: this.replyToEmail,
      })

      if (result.error) {
        console.error('Email connection test failed:', result.error)
        return false
      }

      console.log('Email connection test successful:', result.data?.id)
      return true
    } catch (error) {
      console.error('Error testing email connection:', error)
      return false
    }
  }
}

export default EmailService