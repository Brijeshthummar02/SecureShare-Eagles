import crypto from 'crypto';

const generateApiToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const hashApiToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const verifyApiToken = (token, hashedToken) => {
  const hashedInput = hashApiToken(token);
  return hashedInput === hashedToken;
};

export default {
  generateApiToken,
  hashApiToken,
  verifyApiToken
};
