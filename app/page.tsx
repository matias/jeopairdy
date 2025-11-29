'use client';

import Link from 'next/link';
import { AuthHeader } from '@/components/AuthHeader';
import { JeopardyTitle } from '@/components/JeopardyTitle';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-blue-900">
      <AuthHeader />
      <JeopardyTitle className="mb-8" />
      <div className="flex flex-col gap-4">
        <Link
          href="/create"
          className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        >
          Host Game
        </Link>
        <Link
          href="/join"
          className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        >
          Join Game
        </Link>
      </div>
    </main>
  );
}
