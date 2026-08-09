interface BrandLogoProps {
  className?: string
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      className={className}
      src="/logo.svg"
      alt=""
      aria-hidden="true"
      width="52"
      height="52"
    />
  )
}
