export const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.API_BEARER_TOKEN;

    if (!expectedToken) {
        console.warn('Authentication skipped: API_BEARER_TOKEN is not configured in environment variables.');
        return next();
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];

    if (token !== expectedToken) {
        return res.status(403).json({ error: 'Forbidden: Invalid API token' });
    }

    next();
};
