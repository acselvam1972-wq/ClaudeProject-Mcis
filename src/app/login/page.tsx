import { Logo } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-sidebar p-12 text-sidebar-ink lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <Logo className="h-8 w-8" /> SteelTrack
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight text-white">
            Structural steel progress,
            <br />
            from shop to final inspection.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed">
            Track every piece mark through fabrication, painting, dispatch, erection, bolting and QC sign-off, with
            tonnage-weighted progress, S-curves and full audit trail.
          </p>
        </div>
        <p className="text-xs opacity-60">Process plant construction · Structural package</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-ink-2">Use your project account credentials.</p>
          <LoginForm next={next ?? "/"} />
        </div>
      </div>
    </div>
  );
}
