import https from "https";
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { findStateFile } from '../src/utils/osm-diff.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, '../dist');

// Parse JSON bodies
app.use(express.json());
app.use(cors());

// API endpoints to find state file
const handleFindState = async (req, res) => {
    try {
        // For GET requests, parameters come from query string
        const params = req.method === 'GET' ? req.query : req.body;
        const { period, timestamp, replicationUrl, fetchContent = false, likeOsm = true } = params;

        if (!period || !timestamp) {
            return res.status(400)
                .setHeader('Content-Type', 'application/json')
                .send(JSON.stringify({
                    status: 400,
                    error: 'Missing required parameters: period and timestamp are required'
                }, null, 2) + '\n');
        }

        // Convert likeOsm to boolean, handling both string and boolean inputs
        const likeOsmBool = typeof likeOsm === 'string' ? likeOsm !== 'false' : Boolean(likeOsm);
        const result = await findStateFile(period, timestamp, replicationUrl, likeOsmBool);

        if (!fetchContent) {
            const response = {
                status: result.error ? 404 : 200,
                url: result.url,
                timestamp: result.timestamp,
                sequenceNumber: result.sequenceNumber
            };

            if (result.error) {
                response.error = result.error;
            }
            if (result.warning) {
                response.warning = result.warning;
            }

            res.status(response.status)
                .setHeader('Content-Type', 'application/json')
                .send(JSON.stringify(response, null, 2) + '\n');
            return;
        }

        // Fetch the state file contents
        try {
            const stateContent = await new Promise((resolve, reject) => {
                const fetchWithRedirect = (url, redirectCount = 0) => {
                    if (redirectCount > 5) {
                        reject(new Error('Too many redirects'));
                        return;
                    }

                    console.log(`Fetching ${url}...`);
                    const req = https.get(url, (res) => {
                        if (res.statusCode === 301 || res.statusCode === 302) {
                            const location = res.headers.location;
                            console.log(`Redirecting to ${location}`);
                            fetchWithRedirect(location, redirectCount + 1);
                            return;
                        }

                        if (res.statusCode !== 200) {
                            reject(new Error(`Failed to fetch state file: ${res.statusCode}`));
                            return;
                        }

                        const contentLength = parseInt(res.headers['content-length'], 10);
                        let data = '';

                        res.on('data', chunk => {
                            data += chunk;
                            if (contentLength) {
                                const progress = Math.round((data.length / contentLength) * 100);
                                console.log(`Downloading state file: ${progress}%`);
                        }
                    });

                    res.on('end', () => resolve(data));
                });

                req.setTimeout(10000); // 10 second timeout
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timed out'));
                });
            };

            fetchWithRedirect(result.url);
        });

        result.contents = stateContent;
        // Extract sequence number from state file contents
        const seqMatch = stateContent.match(/sequenceNumber=(\d+)/);
        if (seqMatch) {
            result.sequenceNumber = parseInt(seqMatch[1], 10);
        }
    } catch (err) {
        console.warn('Failed to fetch state file contents:', err);
        // If we can't get from contents, try to extract from URL
        const urlMatch = result.url.match(/\/(\d{3})\/(\d{3})\/(\d{3})\.state\.txt$/);
        if (urlMatch) {
            result.sequenceNumber = parseInt(urlMatch[1] + urlMatch[2] + urlMatch[3], 10);
        }
    }

    res.setHeader('Content-Type', 'application/json');
    // Sort the keys to have a consistent order with status, url, and sequenceNumber near the top
    const response = {
        status: 200,
        url: result.url,
        sequenceNumber: result.sequenceNumber,
        timestamp: result.timestamp
    };
    if (result.warning) {
        response.warning = result.warning;
    }
    if (result.contents) {
        response.contents = result.contents;
    }
    res.send(JSON.stringify(response, null, 2) + '\n');
} catch (error) {
        console.error('Error processing request:', error);
        // Special handling for future timestamp errors
        if (error.message.includes('State file not found: the requested time')) {
            return res.status(404)
                .setHeader('Content-Type', 'application/json')
                .send(JSON.stringify({
                    status: 404,
                    error: error.message
                }, null, 2) + '\n');
        }
        const status = error.message.includes('Invalid') ? 400 : 500;
        res.status(status)
            .setHeader('Content-Type', 'application/json')
            .send(JSON.stringify({
                status: status,
                error: error.message
            }, null, 2) + '\n');
    }
};

// Support both POST and GET methods
app.post('/api/find-state', handleFindState);
app.get('/api/find-state', handleFindState);

// Health check endpoint - support both GET and POST
app.route('/health')
    .get((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({
            status: 200,
            message: 'OK'
        }, null, 2) + '\n');
    })
    .post((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({
            status: 200,
            message: 'OK'
        }, null, 2) + '\n');
    });

if (process.env.NODE_ENV === 'production') {
    if (!existsSync(DIST_DIR)) {
        console.error('Error: Production build not found. Run npm run build first.');
        process.exit(1);
    }
    app.use(express.static(DIST_DIR));

  // Fallback for SPA routing in production
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (req.path === '/health') return next(); // <-- додано, щоб не перехоплювати /health
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  // In development, redirect root to frontend dev server
  app.get('/', (req, res) => {
    res.redirect('http://localhost:5173');
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500)
    .setHeader('Content-Type', 'application/json')
    .send(JSON.stringify({
        status: 500,
        error: 'Something broke!'
    }, null, 2) + '\n');
});

// Start server only if this file is run directly
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
