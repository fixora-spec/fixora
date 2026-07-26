export type BrandLogoVariant = "auto" | "light" | "dark";

export type BrandLogoSize = "sm" | "md" | "lg" | "xl";

export type BrandLogoProps = Readonly<{
  variant?: BrandLogoVariant;
  size?: BrandLogoSize;
  alt?: string;
  loading?: "eager" | "lazy";
  className?: string;
  imageClassName?: string;
}>;