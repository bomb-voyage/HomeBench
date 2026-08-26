import { createFileRoute, Link } from "@tanstack/react-router";
import { Hammer, Ruler, ClipboardList, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Homebench — Plan DIY home projects room by room" },
      {
        name: "description",
        content:
          "Map your home's rooms and measurements, keep a running DIY project list, and track the tools you own — all in one dashboard.",
      },
      { property: "og:title", content: "Homebench — Plan DIY home projects room by room" },
      {
        property: "og:description",
        content:
          "Map your home's rooms and measurements, keep a DIY project list, and track the tools you own.",
      },
    ],
  }),
  component: Landing,
});

const STEPS = [
  {
    icon: Ruler,
    title: "Map your home",
    body: "Start with your address — we pull the public property record where we can — then add each room with its real measurements.",
  },
  {
    icon: ClipboardList,
    title: "Line up projects",
    body: "Keep every improvement you're considering in one list, with cost and labor estimates and its impact to your homes value.",
  },
  {
    icon: Wrench,
    title: "Know your tools",
    body: "Track what's in your toolbox to estimate how long each project will take, and if there's a tool worth adding based on your projects.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded bg-primary text-primary-foreground">
              <Hammer className="size-4" />
            </span>
            <span className="font-display text-xl font-bold tracking-tight">Homebench</span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 pt-20 pb-16">
        <p className="label-caps">For homeowners who do the work themselves</p>
        <h1 className="mt-4 max-w-2xl text-5xl leading-[1.05] font-extrabold sm:text-6xl">
          Your house. Your projects. One dashboard
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Homebench starts with the one thing every estimate depends on: an accurate picture of your
          home. Room dimensions, property details, and the tools already in your bench.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title}>
              <div className="flex items-center gap-3">
                <step.icon className="size-5 text-primary" />
                <span className="stat-figure text-sm text-muted-foreground">
                  0{index + 1}
                </span>
              </div>
              <h2 className="mt-4 text-xl font-bold">{step.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-2xl font-bold">Coming next</h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Cost and labor-hour estimates per project, the value each project adds to your home, and
          tool recommendations with the hours they'd save you. Those build directly on the home
          profile you set up today.
        </p>
      </section>

      <footer className="border-t border-border py-8">
        <p className="mx-auto max-w-5xl px-4 text-sm text-muted-foreground">
          Homebench — a DIY dashboard for homeowners.
        </p>
      </footer>
    </div>
  );
}
