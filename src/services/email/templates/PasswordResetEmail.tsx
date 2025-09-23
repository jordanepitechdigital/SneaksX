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
} from '@react-email/components'
import type { PasswordResetData } from '../EmailService'

interface PasswordResetEmailProps extends PasswordResetData {}

export const PasswordResetEmail = ({
  userName,
  resetUrl,
  expirationTime,
}: PasswordResetEmailProps) => {
  const previewText = `Reset your SneaksX password`

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

          {/* Password Reset */}
          <Section style={section}>
            <Heading style={h2}>Reset Your Password</Heading>
            <Text style={text}>
              Hi {userName},
            </Text>
            <Text style={text}>
              We received a request to reset your password for your SneaksX account.
              Click the button below to create a new password.
            </Text>

            <Section style={buttonContainer}>
              <Button href={resetUrl} style={resetButton}>
                Reset Password
              </Button>
            </Section>

            <Text style={text}>
              This link will expire on {expirationTime}. If you didn't request this password reset,
              you can safely ignore this email.
            </Text>

            <Text style={text}>
              For security reasons, this link can only be used once and will expire in 24 hours.
            </Text>
          </Section>

          <Hr style={hr} />

          {/* Security Notice */}
          <Section style={securitySection}>
            <Heading style={h3}>Security Notice</Heading>
            <Text style={securityText}>
              • This password reset was requested from your account
            </Text>
            <Text style={securityText}>
              • If you didn't request this, please ignore this email
            </Text>
            <Text style={securityText}>
              • Never share your password or reset links with anyone
            </Text>
            <Text style={securityText}>
              • Contact support if you have security concerns
            </Text>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              If you're having trouble with the button above, copy and paste the URL below into your web browser:
            </Text>
            <Text style={urlText}>
              {resetUrl}
            </Text>
            <Text style={footerText}>
              Need help? Contact our support team by replying to this email.
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

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const resetButton = {
  backgroundColor: '#000000',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  padding: '16px 32px',
  textDecoration: 'none',
}

const securitySection = {
  padding: '24px',
  backgroundColor: '#fff8dc',
  border: '1px solid #ffd700',
  borderRadius: '8px',
}

const securityText = {
  color: '#333333',
  fontSize: '14px',
  margin: '0 0 8px',
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

const urlText = {
  color: '#0066cc',
  fontSize: '12px',
  wordBreak: 'break-all' as const,
  margin: '16px 0',
  padding: '12px',
  backgroundColor: '#f0f0f0',
  borderRadius: '4px',
}

export default PasswordResetEmail