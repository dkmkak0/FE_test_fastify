// src/models/view_history.js
export default {
    async addView(db, userId, bookId) {
        try {
            const result = await db.query(
                'INSERT INTO view_history (user_id, book_id, viewed_at) VALUES ($1, $2, NOW()) RETURNING *',
                [userId, bookId]
            );
            return result?.rows[0] ?? null;
        } catch (error) {
            console.log('Error in addview: ', error);
            throw error;
        } 
    },

    async getViewHistory(db, userId, limit = 10){
        try {
            const query = `
            SELECT
                vh.book_id,
                b.title,
                b.author,
                b.image_url,
                TO_CHAR(vh.viewed_at, 'YYYY-MM-DD HH24:MI:SS') as viewed_at
            FROM view_history vh
            JOIN books b ON vh.book_id = b.id
            WHERE vh.user_id = $1
            ORDER BY vh.viewed_at DESC
            LIMIT $2
            `;
            const result = await db.query(query, [userId, limit]);
            return result?.rows ?? [];
        } catch (error) {
            console.error('Error in getViewHistory: ',error);
            throw error;
        }
    }
}