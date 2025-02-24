import nodemailer from 'nodemailer';
import { User } from '@shared/schema';
import cryptoRandomString from 'crypto-random-string';

// Email configurations
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export async function generateToken(length = 32): Promise<string> {
  return cryptoRandomString({ length, type: 'url-safe' });
}

export async function sendVerificationEmail(user: User, token: string) {
  const verificationLink = `${process.env.APP_URL}/verify-email?token=${token}`;
  
  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@unicommute.com',
    to: user.email,
    subject: 'Verify your UniCommute account',
    html: `
      <h1>Welcome to UniCommute!</h1>
      <p>Please click the link below to verify your email address:</p>
      <a href="${verificationLink}">${verificationLink}</a>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't create an account with us, please ignore this email.</p>
    `
  };

  return transporter.sendMail(mailOptions);
}

export async function sendPasswordResetEmail(user: User, token: string) {
  const resetLink = `${process.env.APP_URL}/reset-password?token=${token}`;
  
  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@unicommute.com',
    to: user.email,
    subject: 'Reset your UniCommute password',
    html: `
      <h1>Password Reset Request</h1>
      <p>You requested to reset your password. Click the link below to create a new password:</p>
      <a href="${resetLink}">${resetLink}</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request a password reset, please ignore this email.</p>
    `
  };

  return transporter.sendMail(mailOptions);
}
