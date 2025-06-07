import app from './server.js';

// Export as Vercel serverless handler
export default (req, res) => app(req, res);
