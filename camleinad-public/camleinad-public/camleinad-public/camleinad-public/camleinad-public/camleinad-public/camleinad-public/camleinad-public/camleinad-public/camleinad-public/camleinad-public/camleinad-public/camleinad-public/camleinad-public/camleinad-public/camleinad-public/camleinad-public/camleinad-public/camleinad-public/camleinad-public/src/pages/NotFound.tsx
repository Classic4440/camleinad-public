import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center text-center px-4">
      <div>
        <div>
          <p className="page-title mb-4">404</p>
          <h1 className="text-2xl font-bold text-white mb-3">Page Not Found</h1>
          <p className="text-[#72727E] mb-8">This page doesn’t exist or has moved.</p>
          <Link
            to="/"
            className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm transition-all duration-200"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
