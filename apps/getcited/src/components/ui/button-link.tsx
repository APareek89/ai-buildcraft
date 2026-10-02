import Link from "next/link";
import { type VariantProps } from "class-variance-authority";
import { buttonVariants } from "./button";
import { cn } from "@/lib/utils";

/**
 * A Next.js Link styled as a Button. Base UI's Button uses a `render` prop rather
 * than Radix's `asChild`, so this is the simplest way to render button-styled links.
 */
export function ButtonLink({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
