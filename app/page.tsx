'use client';

import Link from 'next/link';
import { AuthHeader } from '@/components/AuthHeader';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <AuthHeader />
      <h1 className="text-7xl text-black font-gyparody mb-8">Jeopairdy!</h1>
      <div className="flex flex-col gap-4">
        <Link
          href="/create"
          className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Host Game
        </Link>
        <Link
          href="/join"
          className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Join Game
        </Link>
      </div>
    </main>
  );
}
