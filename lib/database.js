import { sql } from '@vercel/postgres';

// Direct SQL query helper
export async function query(text, params = []) {
    try {
        const result = await sql.query(text, params);
        return result;
    } catch (error) {
        console.error('Database error:', error);
        throw error;
    }
}

export { sql };
