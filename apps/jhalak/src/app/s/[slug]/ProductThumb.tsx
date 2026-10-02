/**
 * Product image with a graceful fallback: when there is no image (owner has no
 * photo and generation was skipped/failed), render a branded gradient tile with
 * the product name instead of a broken <img>. No "use client" so it renders in
 * both server (home) and client (ProductsBrowser) trees.
 */
export default function ProductThumb({
  src,
  title,
  className = "",
}: {
  src?: string;
  title: string;
  className?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={title} className={`object-cover ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 ${className}`}>
      <span className="px-3 text-center text-sm font-semibold text-stone-500 line-clamp-3">{title}</span>
    </div>
  );
}
