const { customAlphabet } = require('nanoid');

// URL-safe, 32-char voter tokens
const generateVoterToken = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  32
);

// Short slug for election URLs (e.g. /vote/abc123xy)
const generateSlug = customAlphabet(
  'abcdefghijklmnopqrstuvwxyz0123456789',
  10
);

module.exports = { generateVoterToken, generateSlug };
