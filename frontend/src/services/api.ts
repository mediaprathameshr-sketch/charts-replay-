import type { ParseResult } from '../types';

/**
 * Thin wrapper around the backend API. The app works even if the backend
 * is unreachable — App.tsx falls back to the client-side parser in
 * utils/csv.ts — but routing large files through the backend keeps CSV
 * parsing off the UI thread.
 */

const BASE_URL = '/api';

export async function uploadCsv(file: File): Promise<ParseResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE_URL}/upload-csv`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let detail = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore body parse failure */
    }
    throw new Error(detail);
  }

  return res.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}
