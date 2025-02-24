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
  },
  // Add debug logging
  logger: true,
  debug: true
});

// Verify transporter connection on startup
transporter.verify(function(error, success) {
  if (error) {
    console.error('SMTP Connection Error:', error);
  } else {
    console.log('SMTP Server is ready to send messages');
  }
});

export async function generateToken(length = 32): Promise<string> {
  return cryptoRandomString({ length, type: 'url-safe' });
}

export async function generateOTP(length = 6): Promise<string> {
  return cryptoRandomString({ length, type: 'numeric' });
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

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
}

export async function sendVerificationOTP(user: User, otp: string) {
  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@unicommute.com',
    to: user.email,
    subject: 'Verify your UniCommute account',
    html: `
      <h1>Welcome to UniCommute!</h1>
      <p>Your verification code is:</p>
      <h2 style="font-size: 24px; padding: 10px; background: #f5f5f5; text-align: center; letter-spacing: 5px;">${otp}</h2>
      <p>This code will expire in 15 minutes.</p>
      <p>If you didn't create an account with us, please ignore this email.</p>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Verification OTP email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending verification OTP:', error);
    throw error;
  }
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

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
}

export async function sendPasswordResetOTP(user: User, otp: string) {
  console.log('Attempting to send password reset OTP to:', user.email);

  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@unicommute.com',
    to: user.email,
    subject: 'Reset your UniCommute password',
    html: `
      <h1>Password Reset Request</h1>
      <p>Your password reset code is:</p>
      <h2 style="font-size: 24px; padding: 10px; background: #f5f5f5; text-align: center; letter-spacing: 5px;">${otp}</h2>
      <p>This code will expire in 15 minutes.</p>
      <p>If you didn't request a password reset, please ignore this email.</p>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset OTP email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending password reset OTP:', error);
    throw error;
  }
}