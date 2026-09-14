import Link from "next/link";

import { auth } from "@/auth";
import { Logo } from "@/components/logo";
import { Button } from "@shedflow/ui/components";

export default async function Home() {
  const session = await auth();

  return (
    <div className="min-h-svh bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-3">
          {session ? (
            <Button asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-sm font-medium text-primary">Scheduling for people who get paid</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Easy scheduling ahead, with payments built in.
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Publish event types, share a booking page, and take free or paid sessions — without the back-and-forth emails.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href={session ? "/dashboard" : "/register"}>
                {session ? "Open dashboard" : "Sign up for free"}
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-2xl border bg-[#f4f5f7] p-4 shadow-sm">
          <div className="overflow-hidden rounded-xl border bg-background shadow-lg">
            <div className="grid md:grid-cols-[200px_1fr]">
              <div className="border-b p-5 md:border-r md:border-b-0">
                <p className="text-xs text-muted-foreground">Alex Rivera</p>
                <p className="mt-2 text-lg font-semibold">30 Minute Meeting</p>
                <p className="mt-4 text-sm text-muted-foreground">30 min · Google Meet</p>
              </div>
              <div className="p-5">
                <p className="mb-3 text-sm font-semibold">Select a Date & Time</p>
                <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                  {"SMTWTFS".split("").map((day, index) => (
                    <span key={`${day}-${index}`}>{day}</span>
                  ))}
                  {Array.from({ length: 28 }).map((_, index) => (
                    <span
                      key={index}
                      className={`flex aspect-square items-center justify-center rounded-full ${
                        index === 16
                          ? "bg-primary text-primary-foreground"
                          : index > 10 && index < 22
                            ? "hover:bg-primary/10"
                            : "opacity-40"
                      }`}
                    >
                      {index + 1}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
