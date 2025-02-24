import nodemailer from 'nodemailer';
import { User } from '@shared/schema';
import cryptoRandomString from 'crypto-random-string';

// Email configurations with validation
const smtpConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
};

console.log('Initializing SMTP configuration with host:', smtpConfig.host, 'port:', smtpConfig.port);

// Create transporter with error handling
const createTransporter = () => {
  try {
    const transporter = nodemailer.createTransport(smtpConfig);
    console.log('SMTP Transporter created successfully');
    return transporter;
  } catch (error) {
    console.error('Failed to create SMTP transporter:', error);
    throw new Error('Email service configuration failed');
  }
};

const transporter = createTransporter();

// Verify transporter connection
transporter.verify()
  .then(() => console.log('SMTP connection verified successfully'))
  .catch(error => console.error('SMTP connection verification failed:', error));

export async function generateToken(length = 32): Promise<string> {
  const token = await cryptoRandomString({ length, type: 'url-safe' });
  console.log('Generated verification token');
  return token;
}

export async function generateOTP(length = 6): Promise<string> {
  const otp = await cryptoRandomString({ length, type: 'numeric' });
  console.log('Generated OTP');
  return otp;
}

async function sendMail(options: nodemailer.SendMailOptions): Promise<void> {
  try {
    console.log('Attempting to send email to:', options.to);
    const info = await transporter.sendMail(options);
    console.log('Email sent successfully. MessageId:', info.messageId);
  } catch (error) {
    console.error('Failed to send email:', error);
    throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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

  await sendMail(mailOptions);
}

export async function sendVerificationOTP(user: User, otp: string) {
  console.log('Preparing to send verification OTP to:', user.email);

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

  await sendMail(mailOptions);
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

  await sendMail(mailOptions);
}

export async function sendPasswordResetOTP(user: User, otp: string) {
  console.log('Preparing to send password reset OTP to:', user.email);

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

  await sendMail(mailOptions);
}