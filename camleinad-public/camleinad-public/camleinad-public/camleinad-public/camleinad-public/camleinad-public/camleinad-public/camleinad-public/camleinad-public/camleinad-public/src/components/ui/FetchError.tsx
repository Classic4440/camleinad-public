interface FetchErrorProps {
    message: string;
    onRetry: () => void;
}

export default function FetchError({ message, onRetry }: FetchErrorProps) {
    return (
        <div role="alert" className="py-12 text-center">
            <p className="text-[#A8A8B3] mb-4">{message}</p>
            <button type="button" onClick={onRetry} className="text-sm text-violet-300 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">
                Retry
            </button>
        </div>
    );
}