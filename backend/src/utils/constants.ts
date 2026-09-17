// ---------------------------------------------------------------------------
// Mac absolute time → JavaScript Date
//
// iMessage stores timestamps as nanoseconds since 2001-01-01 00:00:00 UTC
// (macOS 10.13+). The value exceeds Number.MAX_SAFE_INTEGER (~9e15), so we
// use BigInt arithmetic and convert to milliseconds before calling new Date().
// ---------------------------------------------------------------------------
export const MAC_EPOCH_OFFSET_MS = 978_307_200_000n // ms between Unix and Mac epochs
