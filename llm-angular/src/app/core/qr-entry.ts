const QR_ENTRY_KEY = 'g2eEntry';

/** Remember that this tab opened from the printed QR (/q). */
export function rememberQrEntry(): void {
  try {
    sessionStorage.setItem(QR_ENTRY_KEY, 'qr');
  } catch {
    /* private mode */
  }
}

/** Sent with each search so the report can list QR-card queries. */
export function currentSearchEntry(): 'qr' | undefined {
  try {
    return sessionStorage.getItem(QR_ENTRY_KEY) === 'qr' ? 'qr' : undefined;
  } catch {
    return undefined;
  }
}
