/**
 * Extract a human-readable error message from an Axios error.
 * Usage: catch (err) { setError(getApiError(err, 'Fallback message')) }
 */
export function getApiError(err, fallback = 'Something went wrong. Please try again.') {
  return err.response?.data?.error || fallback;
}
