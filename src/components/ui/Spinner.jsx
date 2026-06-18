export default function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-12 w-12' };
  return (
    <div
      className={`${sizes[size]} animate-spin-slow rounded-full border-[3px] border-bodega/20 border-t-bodega ${className}`}
      role="status"
      aria-label="Cargando"
    />
  );
}
