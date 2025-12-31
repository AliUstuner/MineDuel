import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'mineduel-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

// Hash password
export async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

// Compare password
export async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

// Generate JWT token
export function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Verify JWT token
export function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded;
    } catch (error) {
        return null;
    }
}

// Extract token from request
export function getTokenFromRequest(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    return null;
}

// Auth middleware helper
export async function authenticateRequest(req) {
    const token = getTokenFromRequest(req);
    if (!token) return null;
    
    const decoded = verifyToken(token);
    if (!decoded) return null;
    
    return decoded.userId;
}
