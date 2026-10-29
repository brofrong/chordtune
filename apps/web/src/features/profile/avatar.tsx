import { cn } from "@/lib/utils";

export function Avatar({
  name,
  image,
  className,
}: {
  name: string;
  image: string | null | undefined;
  className?: string;
}) {
  if (image) {
    // Provider avatars come from many hosts; next/image would need each one configured.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        className={cn("rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-full bg-surface-2 font-semibold text-muted-foreground",
        className,
      )}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
