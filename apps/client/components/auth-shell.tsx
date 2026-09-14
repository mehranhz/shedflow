import { Logo } from "@/components/logo";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center bg-[#f4f5f7] px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border bg-background p-8 shadow-sm">
        <Logo className="mb-6 justify-center" />
        <div className="mb-6 flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
