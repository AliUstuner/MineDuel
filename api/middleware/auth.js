import { supabaseAdmin } from '../config/supabase.js';

export async function verifyToken(req) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }

        const token = authHeader.split(' ')[1];

        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return null;
        }

        return user;
    } catch (error) {
        console.error('Token verification error:', error);
        return null;
    }
}

export function requireAuth(handler) {
    return async (req, res) => {
        const user = await verifyToken(req);
        
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        req.user = user;
        return handler(req, res);
    };
}
