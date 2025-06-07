import { useState } from 'react'
import {
  Container,
  Box,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Button,
  CircularProgress,
  Paper,
  Alert,
  IconButton,
  FormControl,
  FormLabel,
  Snackbar,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Modal,
  Link,
} from '@mui/material'
import { ContentCopy, ExpandMore, Help, GitHub } from '@mui/icons-material'
import { inject } from '@vercel/analytics';

inject();

interface StateResponse {
  status: number
  url: string
  contents?: string
  timestamp?: string
  warning?: string
  sequenceNumber?: number
  error?: string
}

export function App() {
  const [period, setPeriod] = useState('minute')
  const [timestamp, setTimestamp] = useState(() => {
    const now = new Date()
    // Subtract 1 minute from current time to avoid edge cases
    now.setMinutes(now.getMinutes() - 1)
    return now.toISOString().slice(0, -5) + 'Z'
  })
  const defaultReplicationUrl = import.meta.env.VITE_DEFAULT_REPLICATION_URL
  const [replicationUrl, setReplicationUrl] = useState(defaultReplicationUrl || '')
  const [userEnteredUrl, setUserEnteredUrl] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<StateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error'
  }>({
    open: false,
    message: '',
    severity: 'success',
  })
  const [likeOsm, setLikeOsm] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)

  const handleHelpOpen = () => setHelpOpen(true)
  const handleHelpClose = () => setHelpOpen(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/find-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp,
          period,
          replicationUrl: replicationUrl || undefined,
          fetchContent: true,
          likeOsm,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to find state file')

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSetCurrentTime = () => {
    const now = new Date()
    setTimestamp(now.toISOString().slice(0, -5) + 'Z')
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setSnackbar({
        open: true,
        message: 'Copied to clipboard!',
        severity: 'success',
      })
    } catch (err) {
      console.error('Failed to copy:', err)
      setSnackbar({
        open: true,
        message: 'Failed to copy to clipboard',
        severity: 'error',
      })
    }
  }

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }))
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          OSM Diff State Finder
        </Typography>

        <form onSubmit={handleSubmit}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
              <FormControl component="fieldset" sx={{ flex: 1 }}>
                <FormLabel component="legend">Period</FormLabel>
                <RadioGroup
                  row
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <FormControlLabel
                    value="minute"
                    control={<Radio />}
                    label="Minute"
                  />
                  <FormControlLabel
                    value="hour"
                    control={<Radio />}
                    label="Hour"
                  />
                  <FormControlLabel
                    value="day"
                    control={<Radio />}
                    label="Day"
                  />
                </RadioGroup>
              </FormControl>
              <IconButton
                onClick={handleHelpOpen}
                color="primary"
                size="small"
                aria-label="Help"
                sx={{ mt: 3 }}
              >
                <Help />
              </IconButton>
            </Box>

            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                label="Timestamp (ISO 8601), UTC"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                placeholder="YYYY-MM-DDTHH:mm:ssZ"
                required
                sx={{ mb: 1 }}
              />
              <Button
                variant="outlined"
                onClick={handleSetCurrentTime}
                sx={{ mt: 1 }}
              >
                Set Current Time
              </Button>
            </Box>

            <TextField
              fullWidth
              label="Replication URL"
              value={replicationUrl === defaultReplicationUrl ? '' : replicationUrl}
              onChange={(e) => {
                const newValue = e.target.value
                setReplicationUrl(newValue || defaultReplicationUrl)
                setUserEnteredUrl(!!newValue)
              }}
              placeholder={defaultReplicationUrl || "https://planet.openstreetmap.org/replication/"}
              helperText="Enter replication URL"
              sx={{ mb: 3 }}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                sx: {
                  '& input': {
                    bgcolor: 'grey.50',
                  },
                  '&:not(:focus-within) input': {
                    color: 'text.secondary',
                  }
                }
              }}
            />
            {replicationUrl && userEnteredUrl && (
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Switch
                  checked={likeOsm}
                  onChange={(e) => setLikeOsm(e.target.checked)}
                  color="primary"
                  inputProps={{ 'aria-label': 'OSM-like structure' }}
                />
                <Typography variant="body2" sx={{ ml: 1 }}>
                  {likeOsm
                    ? 'OSM Like (e.g. planet.osm.org)'
                    : 'Not OSM Like. Do not add period to URL (e.g. for geofabrik)'}
                </Typography>
              </Box>
            )}

            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              fullWidth
            >
              {loading ? <CircularProgress size={24} /> : 'Find State File'}
            </Button>
          </Paper>
        </form>

        {error && (
          <Alert severity="error" sx={{ mt: 3 }}>
            {error}
          </Alert>
        )}

        {result && (
          <Paper sx={{ mt: 3, p: 3 }}>
            {/* Show all information in a concise format first */}
            <Typography variant="h4" gutterBottom>
              State File Information
            </Typography>

            {result.warning && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {result.warning}
              </Alert>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <Typography variant="body2" color="textSecondary" sx={{ minWidth: 100, mt: 0.5 }}>
                  URL:
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
                  <Typography
                    component="span"
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: 'monospace',
                      bgcolor: 'grey.100',
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      fontSize: '0.875rem',
                      overflow: 'hidden',
                      overflowWrap: 'break-word',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}
                  >
                    {result.url}
                  </Typography>
                  <IconButton
                    onClick={() => copyToClipboard(result.url)}
                    color="primary"
                    size="small"
                    sx={{ ml: 1, flexShrink: 0 }}
                  >
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
              {result.timestamp && (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2" color="textSecondary" sx={{ minWidth: 100 }}>
                    Timestamp:
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {result.timestamp}
                  </Typography>
                </Box>
              )}
              {result.sequenceNumber && (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2" color="textSecondary" sx={{ minWidth: 100 }}>
                    Sequence:
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {result.sequenceNumber}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Contents in a collapsible section */}
            {result.contents && (
              <Accordion sx={{ mt: 2 }}>
                <AccordionSummary
                  expandIcon={<ExpandMore />}
                  sx={{
                    border: 1,
                    borderColor: 'info.main',
                    borderRadius: '4px',
                    color: 'info.main',
                    '&:hover': {
                      borderColor: 'info.dark',
                      color: 'info.dark',
                      bgcolor: 'info.lighter'
                    },
                    '& .MuiSvgIcon-root': {
                      color: 'inherit',
                      transition: 'transform 0s'
                    }
                  }}
                >
                  <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                    State File Contents
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography
                    component="pre"
                    sx={{
                      overflowX: 'auto',
                      bgcolor: 'grey.100',
                      p: 1,
                      borderRadius: 1,
                      m: 0,
                      fontFamily: 'monospace',
                      fontSize: '0.875rem'
                    }}
                  >
                    {result.contents}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            )}
          </Paper>
        )}

        <Snackbar
          open={snackbar.open}
          autoHideDuration={3000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={handleCloseSnackbar}
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>

        <Modal
          open={helpOpen}
          onClose={handleHelpClose}
          aria-labelledby="help-modal-title"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2
          }}
        >
          <Paper sx={{ maxWidth: 600, maxHeight: '90vh', overflow: 'auto', p: 3 }}>
            <Typography id="help-modal-title" variant="h5" component="h2" gutterBottom>
              About OSM Diff State Finder
            </Typography>
            <Typography variant="body1" paragraph>
              This web service helps you locate OpenStreetMap replication state files by timestamp.
              It's useful for setting up replication or finding historical OSM data.
            </Typography>
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
              How to use:
            </Typography>
            <Typography component="div" variant="body2">
              <ol>
                <li>Select the replication period (minute/hour/day)</li>
                <li>Enter a timestamp in ISO 8601 format (UTC)</li>
                <li>Optionally specify a custom replication URL</li>
                <li>If using a custom URL, specify if it follows OSM-like structure:
                  <ul>
                    <li>Enable "OSM Like" for planet.osm.org style URLs</li>
                    <li>Disable for other sources (e.g., geofabrik)</li>
                  </ul>
                </li>
              </ol>
            </Typography>
            <Button variant="outlined" onClick={handleHelpClose} sx={{ mt: 2 }}>Close</Button>
          </Paper>
        </Modal>

        <Box
          component="footer"
          sx={{
            mt: 4,
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GitHub fontSize="small" />
            <Link
              href="https://github.com/Andygol/osm-diff-state-svc"
              target="_blank"
              rel="noopener"
              underline="hover"
              color="inherit"
            >
              View repo on GitHub
            </Link>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Created by{' '}
            <Link
              href="https://github.com/Andygol"
              target="_blank"
              rel="noopener"
              underline="hover"
            >
              Andrii Holovin
            </Link>
          </Typography>
        </Box>
      </Box>
    </Container>
  )
}
