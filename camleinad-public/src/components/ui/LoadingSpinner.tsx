import { LoaderCircle } from 'lucide-react';

export default function LoadingSpinner() {
    return <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />;
}