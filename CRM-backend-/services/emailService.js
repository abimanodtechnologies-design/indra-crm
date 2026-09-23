const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.hostinger.com",
  port: Number(process.env.EMAIL_PORT || 465),
  secure: String(process.env.EMAIL_SECURE || "true") === "true",
  family: 4,
  connectionTimeout: Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS || 10000),
  greetingTimeout: Number(process.env.EMAIL_GREETING_TIMEOUT_MS || 10000),
  socketTimeout: Number(process.env.EMAIL_SOCKET_TIMEOUT_MS || 20000),
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendMail = transporter.sendMail.bind(transporter);
transporter.sendMail = (...args) => {
  if (process.env.EMAIL_ENABLED !== 'true') {
    const error = new Error('Email sending is disabled for local deployment.');
    const callback = args[args.length - 1];
    if (typeof callback === 'function') { callback(error); return; }
    return Promise.reject(error);
  }
  return sendMail(...args);
};
// Only the requested digest can bypass the general outbound-email switch.
transporter.sendFollowupDigest = options => {
 if(process.env.DAILY_FOLLOWUP_EMAIL_ENABLED!=='true')return Promise.reject(new Error('Daily follow-up email is disabled'));
 return sendMail(options);
};
module.exports = transporter;
