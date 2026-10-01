import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline font-extrabold tracking-tight", className)}>
      Mombongo
    </span>
  );
}

export function BrandMarkImage({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/wordmark.png"
      alt="Mombongo"
      width={768}
      height={512}
      className={cn("h-16 w-auto object-contain object-left", className)}
      priority={priority}
    />
  );
}

export function BrandLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/logo.png"
      alt="Mombongo — Facturez, gérez, développez"
      width={1536}
      height={1024}
      className={cn("h-auto w-full object-contain", className)}
      priority={priority}
    />
  );
}
