export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#4f46e5" />
      <rect x="7" y="17" width="4" height="8" rx="1.5" fill="#fff" />
      <rect x="14" y="12" width="4" height="13" rx="1.5" fill="#fff" />
      <rect x="21" y="7" width="4" height="18" rx="1.5" fill="#fbbf24" />
    </svg>
  );
}
