// Number of people playing right now, or null when we don't have a real number.
// Phase 6 will wire this to Supabase presence; until then it stays null and the
// counter is hidden. Never show a made-up number.
export const useLiveCount = (): number | null => null;
