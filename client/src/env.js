// True when built as a claude.ai artifact (vite --mode artifact): identity and
// storage come from the artifact runtime instead of the Express server.
export const EMBEDDED = import.meta.env.MODE === 'artifact';
