/**
 * Test JWT Authentication for WebSocket
 * 
 * Usage:
 *   node test-jwt-auth.js generate <userId> [sessionId]
 *   node test-jwt-auth.js verify <token>
 */

import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function generateJWT(userId, sessionId, expiresInSeconds = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    ...(sessionId && { sessionId }),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const message = `${headerB64}.${payloadB64}`;
  
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(message).digest('base64url');
  return `${message}.${signature}`;
}

function verifyJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, reason: 'Invalid format (expected 3 parts)' };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify signature
    const message = `${headerB64}.${payloadB64}`;
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(message).digest('base64url');

    if (signatureB64 !== expectedSignature) {
      return { valid: false, reason: 'Invalid signature' };
    }

    // Decode payload
    const payloadJson = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: 'Token expired', payload };
    }

    // Check sub
    if (!payload.sub) {
      return { valid: false, reason: 'Missing sub claim', payload };
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

// CLI
const command = process.argv[2];

if (command === 'generate') {
  const userId = process.argv[3];
  const sessionId = process.argv[4];
  const expiresIn = parseInt(process.argv[5] || '3600', 10);

  if (!userId) {
    console.error('Usage: node test-jwt-auth.js generate <userId> [sessionId] [expiresInSeconds]');
    process.exit(1);
  }

  const token = generateJWT(userId, sessionId, expiresIn);
  
  console.log('\n✅ JWT Token Generated\n');
  console.log('Token:', token);
  console.log('\nPayload:');
  console.log(JSON.stringify({
    sub: userId,
    ...(sessionId && { sessionId }),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresIn
  }, null, 2));
  console.log('\nWebSocket URL:');
  console.log(`ws://localhost:3000/ws?token=${token}`);
  console.log('\nOr with header:');
  console.log(`Sec-WebSocket-Protocol: ${token}`);
  console.log('');

} else if (command === 'verify') {
  const token = process.argv[3];

  if (!token) {
    console.error('Usage: node test-jwt-auth.js verify <token>');
    process.exit(1);
  }

  const result = verifyJWT(token);
  
  if (result.valid) {
    console.log('\n✅ Token Valid\n');
    console.log('Payload:');
    console.log(JSON.stringify(result.payload, null, 2));
    console.log('');
  } else {
    console.log('\n❌ Token Invalid\n');
    console.log('Reason:', result.reason);
    if (result.payload) {
      console.log('Payload:');
      console.log(JSON.stringify(result.payload, null, 2));
    }
    console.log('');
    process.exit(1);
  }

} else {
  console.log(`
WebSocket JWT Authentication Test Utility

Usage:
  node test-jwt-auth.js generate <userId> [sessionId] [expiresInSeconds]
  node test-jwt-auth.js verify <token>

Examples:
  # Generate token for user-123
  node test-jwt-auth.js generate user-123

  # Generate token with session
  node test-jwt-auth.js generate user-123 session-abc

  # Generate token with custom expiry (1 hour)
  node test-jwt-auth.js generate user-123 session-abc 3600

  # Verify token
  node test-jwt-auth.js verify eyJhbGc...

Environment:
  JWT_SECRET=${JWT_SECRET}
  `);
  process.exit(1);
}
