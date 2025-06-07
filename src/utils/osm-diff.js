import https from 'https';

export const VALID_PERIODS = ['day', 'hour', 'minute'];
export const DEFAULT_URL = 'https://planet.osm.org/replication/';

async function fetchStateParam(url, param, retries = 3, delay = 1000) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            console.log(`Fetching ${url} (attempt ${attempt + 1}/${retries})...`);
            const content = await new Promise((resolve, reject) => {
                const fetchWithRedirects = (url, maxRedirects = 5) => {
                    if (maxRedirects === 0) {
                        reject(new Error('Too many redirects'));
                        return;
                    }

                    const req = https.get(url, res => {
                        if (res.statusCode === 301 || res.statusCode === 302) {
                            const redirectUrl = new URL(res.headers.location, url).toString();
                            fetchWithRedirects(redirectUrl, maxRedirects - 1);
                            return;
                        }

                        if (res.statusCode === 429) { // Rate limit
                            const retryAfter = parseInt(res.headers['retry-after']) || delay;
                            setTimeout(() => fetchWithRedirects(url, maxRedirects), retryAfter * 1000);
                            return;
                        }

                        if (res.statusCode !== 200) {
                            reject(new Error(`HTTP ${res.statusCode}`));
                            return;
                        }

                        const chunks = [];
                        res.on('data', chunk => chunks.push(chunk));
                        res.on('end', () => {
                            const data = Buffer.concat(chunks).toString();
                            resolve(data);
                        });
                    });

                    req.setTimeout(5000);  // 5 second timeout
                    req.on('error', reject);
                    req.on('timeout', () => {
                        req.destroy();
                        reject(new Error('Request timed out'));
                    });
                };

                fetchWithRedirects(url);
            });

            const match = content.match(new RegExp(`^${param}=(.*)$`, 'm'));
            if (!match) {
                console.warn(`Parameter ${param} not found in response from ${url}`);
                return null;
            }

            let value = match[1]
                .replace(/\\:/g, ':')
                .replace(/\r?\n$/, '')
                .trim();

            if (param === 'timestamp' && !value.endsWith('Z')) {
                value = `${value}Z`;
            }

            return value;
        } catch (error) {
            lastError = error;
            console.warn(`Attempt ${attempt + 1} failed for ${url}:`, error.message);
            if (attempt < retries - 1) {
                const waitTime = delay * Math.pow(2, attempt);
                console.log(`Waiting ${waitTime}ms before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            console.error(`All ${retries} attempts failed for ${url}:`, lastError?.message);
            return null;
        }
    }
}

function getStateUrl(baseUrl, period, seq, likeOsm = true) {
    const padded = seq.toString().padStart(9, '0');
    let url = baseUrl.replace(/\/$/, '');

    // Add period only for OSM-like structure
    if (likeOsm) {
        url += `/${period}`;
    }
    url += `/${padded.slice(0,3)}/${padded.slice(3,6)}/${padded.slice(6)}.state.txt`;
    return url;
}

export async function findStateFile(period, timestamp, baseUrl = DEFAULT_URL, likeOsm = true) {
    if (!VALID_PERIODS.includes(period)) {
        throw new Error(`Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`);
    }

    const targetDate = new Date(timestamp);
    if (isNaN(targetDate.getTime())) {
        throw new Error('Invalid timestamp format');
    }

    const targetEpoch = Math.floor(targetDate.getTime() / 1000);

    // Get current state with retries
    let currentUrl = baseUrl.replace(/\/$/, '');
    if (likeOsm) {
        currentUrl += `/${period}`;
    }
    currentUrl += '/state.txt';
    const latestSeq = await fetchStateParam(currentUrl, 'sequenceNumber', 5);
    const currentTs = await fetchStateParam(currentUrl, 'timestamp', 5);

    if (!latestSeq || !currentTs) {
        throw new Error('Failed to get current state');
    }

    // Ensure both timestamps are in UTC and normalized
    const currentTsUTC = currentTs.endsWith('Z') ? currentTs : `${currentTs}Z`;
    const currentEpoch = Math.floor(new Date(currentTsUTC).getTime() / 1000);

    // First normalize current timestamp based on period
    const currentPeriodStart = new Date(currentTsUTC);
    if (period === 'hour') {
        currentPeriodStart.setMinutes(0, 0, 0);
    } else if (period === 'day') {
        currentPeriodStart.setHours(0, 0, 0, 0);
    }
    const periodStartEpoch = Math.floor(currentPeriodStart.getTime() / 1000);

    // Check if timestamp is in the future compared to the latest state
    if (targetEpoch > currentEpoch) {
        console.log(`Target timestamp ${timestamp} (${targetEpoch}) is in the future compared to latest state ${currentTs} (${currentEpoch})`);
        const timeDiff = targetEpoch - currentEpoch;
        // Return latest available state with warning
        return {
            url: getStateUrl(baseUrl, period, parseInt(latestSeq), likeOsm),
            timestamp: currentTs,
            sequenceNumber: parseInt(latestSeq),
            error: `State file not found: the requested time ${timestamp} is ${Math.floor(timeDiff / 60)} minutes and ${timeDiff % 60} seconds ahead of the latest available state (${currentTs})`,
            warning: `Using latest available state file (${currentTs})`
        };
    }

    // For minute diffs near current time, be more precise
    if (period === 'minute') {
        const timeDiff = currentEpoch - targetEpoch;

        // If within last 2 minutes
        if (timeDiff <= 120) {
            // Try to find most recent state file before requested time
            const states = [];
            for (let seq = parseInt(latestSeq); seq >= Math.max(0, parseInt(latestSeq) - 5); seq--) {
                const stateUrl = getStateUrl(baseUrl, period, seq, likeOsm);
                const stateTs = await fetchStateParam(stateUrl, 'timestamp', 2);
                if (!stateTs) continue;

                const stateEpoch = Math.floor(new Date(stateTs).getTime() / 1000);
                const stateDiff = targetEpoch - stateEpoch;

                // Found a state before or at target time
                if (stateDiff >= 0) {
                    return {
                        url: getStateUrl(baseUrl, period, seq, likeOsm),
                        timestamp: stateTs,
                        sequenceNumber: seq,
                        warning: stateTs !== currentTs ?
                            `Found state file at ${stateTs}` :
                            `Using latest available state (${currentTs})`
                    };
                }

                states.push({ seq, ts: stateTs, diff: stateDiff });
            }

            // If we didn't find an older state, use latest
            return {
                url: getStateUrl(baseUrl, period, parseInt(latestSeq), likeOsm),
                timestamp: currentTs,
                sequenceNumber: parseInt(latestSeq),
                warning: `Requested time is very recent. Using latest available state (${currentTs})`
            };
        }
    }

    // For hour/day diffs, if within current period use latest state
    if (period !== 'minute' && targetEpoch >= periodStartEpoch) {
        return {
            url: getStateUrl(baseUrl, period, parseInt(latestSeq), likeOsm),
            timestamp: currentTs,
            sequenceNumber: parseInt(latestSeq),
            warning: `Requested time is in the current ${period}. Using latest available state (${currentTs})`
        };
    }

    // --- Binary search for the sequence file using the library function ---
    let divider;
    switch (period) {
        case 'day':
            divider = 86400;
            break;
        case 'hour':
            divider = 3600;
            break;
        case 'minute':
            divider = 60;
            break;
        default:
            divider = 1;
    }
    const target_sequence_number = Math.floor(parseInt(latestSeq) - (currentEpoch - targetEpoch) / divider - 1);
    let low = Math.max(0, target_sequence_number);
    let high = parseInt(latestSeq);
    let bestSeq = -1;
    let bestTs = null;
    let bestDiff = Infinity;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midUrl = getStateUrl(baseUrl, period, mid, likeOsm);
        const delay = Math.min(1000 * Math.pow(2, consecutiveErrors), 5000);
        let midTs = await fetchStateParam(midUrl, 'timestamp', 3, delay);

        if (!midTs) {
            consecutiveErrors++;
            if (consecutiveErrors >= maxConsecutiveErrors) {
                console.warn(`Too many consecutive errors, falling back to last known good state`);
                break;
            }
            const delta = Math.max(1, Math.floor((high - low) / 4));
            high = mid - delta;
            continue;
        }
        consecutiveErrors = 0;

        midTs = midTs.endsWith('Z') ? midTs : `${midTs}Z`;
        const midEpoch = Math.floor(new Date(midTs).getTime() / 1000);
        const timeDiff = targetEpoch - midEpoch;

        // Update best match if this state is earlier than target and closer than previous best
        if (timeDiff >= 0 && timeDiff < bestDiff) {
            bestSeq = mid;
            bestTs = midTs;
            bestDiff = timeDiff;
        }

        // Binary search - if current state is before target, look in upper half
        if (timeDiff === 0) {
            // Exact match, we are done
            bestSeq = mid;
            bestTs = midTs;
            break;
        } else if (timeDiff > 0) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (bestSeq === -1) {
        throw new Error(`No suitable state file found for ${timestamp}`);
    }

    return {
        url: getStateUrl(baseUrl, period, bestSeq, likeOsm),
        timestamp: bestTs,
        sequenceNumber: bestSeq
    };
}
