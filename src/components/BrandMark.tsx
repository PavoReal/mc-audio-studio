export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-mark" aria-label="Minecraft Sound Studio">
      <span className="brand-icon" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      {!compact && <span>Sound Studio</span>}
    </div>
  );
}
