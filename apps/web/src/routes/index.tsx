import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <main className="flex flex-col gap-2 p-6 text-sm">
      <h1 className="font-medium">refhaven</h1>
      <p>A reference library you can view as a gallery or a canvas.</p>
      <Link to="/library" className="underline">
        Open your library
      </Link>
    </main>
  );
}
